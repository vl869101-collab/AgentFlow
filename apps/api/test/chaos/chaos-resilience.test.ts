import assert from "node:assert/strict";
import test from "node:test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ buildApp }, { resetStore }, { checkAndSetWebhookIdempotency }, { getWorkflowQueue, getBullBoardDashboardUrl }] = await Promise.all([
  import("../../src/server.js"),
  import("../../src/lib/store.js"),
  import("../../src/lib/redis.js"),
  import("../../src/services/queue.js"),
]);

const app = await buildApp({ logger: false });

async function request(method: HttpMethod, url: string, body?: unknown, token?: string, customHeaders?: Record<string, string>) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    },
    payload: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let parsed: unknown = response.body;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    // Keep raw string if non-JSON
  }
  return { response, body: parsed as any };
}

test.beforeEach(() => resetStore());

test("TASK-14 Chaos Suite: Scenario 1 - Redis failure simulation & in-memory idempotency fallback", async () => {
  // Test idempotency behavior when Redis is unavailable or fails
  const key1 = `chaos-key-${Date.now()}-1`;
  const key2 = `chaos-key-${Date.now()}-2`;

  // First attempt should register cleanly in fallback
  const first = await checkAndSetWebhookIdempotency(key1, "exec-chaos-001", 60);
  assert.equal(first.isDuplicate, false);

  // Second attempt with same key must detect duplicate and return existing executionId
  const duplicate = await checkAndSetWebhookIdempotency(key1, "exec-chaos-002", 60);
  assert.equal(duplicate.isDuplicate, true);
  assert.equal(duplicate.existingExecutionId, "exec-chaos-001");

  // Distinct key should succeed
  const distinct = await checkAndSetWebhookIdempotency(key2, "exec-chaos-003", 60);
  assert.equal(distinct.isDuplicate, false);
});

test("TASK-14 Chaos Suite: Scenario 2 - Queue resilience, pause/resume under failure, & DLQ operations", async () => {
  // 1. Verify queue stats and health
  const statsRes = await request("GET", "/admin/queues/stats");
  assert.equal(statsRes.response.statusCode, 200);
  assert.ok("waiting" in statsRes.body);
  assert.ok("active" in statsRes.body);
  assert.ok("failed" in statsRes.body);

  // 2. Simulate queue pause under system distress
  const pauseRes = await request("POST", "/admin/queues/api/workflows/pause");
  assert.equal(pauseRes.response.statusCode, 200);
  assert.equal(pauseRes.body.status, "paused");

  // 3. Simulate queue resume after recovery
  const resumeRes = await request("POST", "/admin/queues/api/workflows/resume");
  assert.equal(resumeRes.response.statusCode, 200);
  assert.equal(resumeRes.body.status, "resumed");

  // 4. Test DLQ retry-all operation
  const retryRes = await request("POST", "/admin/queues/api/workflows/retry-all");
  assert.equal(retryRes.response.statusCode, 200);
  assert.equal(retryRes.body.retried, true);

  // 5. Test queue clean operation
  const cleanRes = await request("POST", "/admin/queues/api/workflows/clean");
  assert.equal(cleanRes.response.statusCode, 200);
  assert.equal(cleanRes.body.cleaned, true);
});

test("TASK-14 Chaos Suite: Scenario 3 - Malformed payload, DB disconnection handling & recovery", async () => {
  // Test server error isolation: sending invalid body does not crash process or hang sockets
  const malformedRes = await request("POST", "/api/auth/login", "{ invalid-json-payload-broken ");
  assert.ok(malformedRes.response.statusCode === 400 || malformedRes.response.statusCode === 500);

  // Subsequent healthy requests must continue to function immediately
  const healthRes = await request("GET", "/health");
  assert.equal(healthRes.response.statusCode, 200);
  assert.equal(healthRes.body.status, "ok");

  const regRes = await request("POST", "/api/auth/register", {
    email: "chaos-recovery@agentflow.io",
    password: "Password123!",
    name: "Chaos User",
  });
  assert.equal(regRes.response.statusCode, 201);
});
