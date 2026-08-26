import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

// Standard HTTP methods accepted by fastify's app.inject (light-my-request).
// fastify's own HTTPMethods type is wider (includes QUERY/PROPFIND/etc.) and
// is not assignable to InjectOptions.method, so use a narrow local union.
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// Tests intentionally use the deterministic in-memory adapter. This keeps the
// API contract tests fast while the Prisma schema is validated separately.
console.log("[backend.test] BEFORE delete DATABASE_URL=", JSON.stringify(process.env.DATABASE_URL)?.slice(0,200));
delete process.env.DATABASE_URL;
console.log("[backend.test] AFTER delete DATABASE_URL=", JSON.stringify(process.env.DATABASE_URL));
// NODE_ENV is typed readonly on ProcessEnv in some @types/node versions, so
// assign it via defineProperty to keep the typecheck green. The full data
// descriptor is required because process.env rejects partial descriptors.
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const app = await buildApp({ logger: true });

async function request(method: HttpMethod, url: string, body?: unknown, token?: string) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = response.body;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    // Keep plain-text responses as-is.
  }
  return { response, body: parsed as any };
}

async function register(email: string) {
  const result = await request("POST", "/api/auth/register", {
    email,
    password: "StrongPass123",
    name: email.split("@")[0],
  });
  assert.equal(result.response.statusCode, 201);
  assert.equal(typeof result.body.message, "string");
  const login = await request("POST", "/api/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(login.response.statusCode, 200);
  return login.body.token as string;
}

test.beforeEach(() => resetStore());

test("executes a saved graph and records every node", async () => {
  const token = await register("executor@example.com");
  const created = await request("POST", "/api/workflows", { name: "Smoke workflow" }, token);
  assert.equal(created.response.statusCode, 201, JSON.stringify(created.body));

  await request("PATCH", `/api/workflows/${created.body.id}`, {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { type: "webhook", config: {} } },
      { id: "output", type: "advanced", position: { x: 200, y: 0 }, data: { type: "output", config: {} } },
    ],
    edges: [{ id: "edge", source: "trigger", target: "output" }],
  }, token);

  const execution = await request("POST", "/api/executions/trigger", {
    workflowId: created.body.id,
    input: { accepted: true },
  }, token);
  assert.equal(execution.response.statusCode, 202);

  let details: any;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    details = await request("GET", `/api/executions/${execution.body.id}`, undefined, token);
    if (details.body.status === "SUCCESS") break;
  }
  assert.equal(details.body.status, "SUCCESS");
  assert.equal(details.body.nodes.length, 2);
  assert.deepEqual(details.body.output, { accepted: true });
});

test("signed webhook trigger executes the linked workflow end to end", async () => {
  const token = await register("webhook@example.com");
  const created = await request("POST", "/api/workflows", { name: "Hook workflow" }, token);
  assert.equal(created.response.statusCode, 201);

  await request("PATCH", `/api/workflows/${created.body.id}`, {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { type: "webhook", config: {} } },
      { id: "output", type: "advanced", position: { x: 200, y: 0 }, data: { type: "output", config: {} } },
    ],
    edges: [{ id: "edge", source: "trigger", target: "output" }],
  }, token);

  const hookSecret = "whsec_test_secret_for_e2e";
  const hook = await request("POST", "/api/webhooks", { path: "e2e-hook", workflowId: created.body.id, secret: hookSecret }, token);
  assert.equal(hook.response.statusCode, 201, JSON.stringify(hook.body));
  const { secret } = hook.body;
  const triggerPath = hook.body.path;
  assert.equal(typeof secret, "string");

  const payload = JSON.stringify({ hello: "world" });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const trigger = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: { "content-type": "application/json", "x-webhook-signature": signature },
    payload,
  });
  assert.equal(trigger.statusCode, 202, trigger.body);
  const executionId = JSON.parse(trigger.body).executionId;
  assert.equal(typeof executionId, "string");

  await new Promise((resolve) => setTimeout(resolve, 100));
  const details = await request("GET", `/api/executions/${executionId}`, undefined, token);
  assert.equal(details.body.status, "SUCCESS");
  assert.deepEqual(details.body.output, { hello: "world" });

  const badSignature = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: { "content-type": "application/json", "x-webhook-signature": "deadbeef" },
    payload,
  });
  assert.equal(badSignature.statusCode, 401);
});

test("does not allow cross-organization credential or webhook deletion", async () => {
  const firstToken = await register("owner-a@example.com");
  const secondToken = await register("owner-b@example.com");

  const credential = await request("POST", "/api/credentials", {
    name: "Private key",
    type: "api_key",
    provider: "test",
    data: { value: "secret" },
  }, firstToken);
  const webhook = await request("POST", "/api/webhooks", { path: "private-hook" }, firstToken);

  const credentialDelete = await request("DELETE", `/api/credentials/${credential.body.id}`, undefined, secondToken);
  const webhookDelete = await request("DELETE", `/api/webhooks/${webhook.body.id}`, undefined, secondToken);
  assert.equal(credentialDelete.response.statusCode, 404);
  assert.equal(webhookDelete.response.statusCode, 404);
});

test("returns an actionable error when Stripe is not configured", async () => {
  const token = await register("billing@example.com");
  delete process.env.STRIPE_SECRET_KEY;
  const result = await request("POST", "/api/billing/checkout", { priceId: "price_test" }, token);
  assert.equal(result.response.statusCode, 503);
  assert.equal(result.body.code, "STRIPE_NOT_CONFIGURED");
});

test("issues, rotates, and revokes refresh tokens with reuse protection", async () => {
  const email = "refresh-test@example.com";
  await request("POST", "/api/auth/register", {
    email,
    password: "StrongPass123",
    name: "Refresh User",
  });

  const login = await request("POST", "/api/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(login.response.statusCode, 200);
  assert.equal(typeof login.body.token, "string");
  assert.equal(typeof login.body.refreshToken, "string");

  const initialRefreshToken = login.body.refreshToken;

  // 1. Rotate refresh token successfully
  const refreshed = await request("POST", "/api/auth/refresh", {
    refreshToken: initialRefreshToken,
  });
  assert.equal(refreshed.response.statusCode, 200);
  assert.equal(typeof refreshed.body.token, "string");
  assert.equal(typeof refreshed.body.refreshToken, "string");
  assert.notEqual(refreshed.body.refreshToken, initialRefreshToken);

  const activeRefreshToken = refreshed.body.refreshToken;

  // 2. Re-using the already consumed initialRefreshToken triggers reuse detection (401)
  const reused = await request("POST", "/api/auth/refresh", {
    refreshToken: initialRefreshToken,
  });
  assert.equal(reused.response.statusCode, 401);
  assert.equal(reused.body.code, "INVALID_TOKEN");

  // 3. Because reuse was detected, the previously active token is also invalidated
  const compromised = await request("POST", "/api/auth/refresh", {
    refreshToken: activeRefreshToken,
  });
  assert.equal(compromised.response.statusCode, 401);

  // 4. Logout flow
  const newLogin = await request("POST", "/api/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(newLogin.response.statusCode, 200);
  const logoutToken = newLogin.body.refreshToken;

  const logout = await request("POST", "/api/auth/logout", {
    refreshToken: logoutToken,
  });
  assert.equal(logout.response.statusCode, 204);

  // Attempting to refresh with logged-out token fails
  const afterLogout = await request("POST", "/api/auth/refresh", {
    refreshToken: logoutToken,
  });
  assert.equal(afterLogout.response.statusCode, 401);

  // 5. Test root /auth/refresh and /auth/logout routes
  const login3 = await request("POST", "/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(login3.response.statusCode, 200);

  const refreshRoot = await request("POST", "/auth/refresh", {
    refreshToken: login3.body.refreshToken,
  });
  assert.equal(refreshRoot.response.statusCode, 200);
  assert.ok(refreshRoot.body.token);
  assert.ok(refreshRoot.body.refreshToken);

  const logoutRoot = await request("POST", "/auth/logout", {
    refreshToken: refreshRoot.body.refreshToken,
  });
  assert.equal(logoutRoot.response.statusCode, 204);
});

test("Item 10: BullMQ queue DLQ, retry 3x backoff, concurrency CPU*2, Bull Board routes", async () => {
  const { DEFAULT_JOB_OPTIONS, DEFAULT_DLQ_OPTIONS, sendToDLQ, getQueueMetrics } = await import("../src/services/queue.js");
  assert.equal(DEFAULT_JOB_OPTIONS.attempts, 3);
  assert.equal(DEFAULT_JOB_OPTIONS.backoff?.type, "exponential");
  assert.equal(DEFAULT_JOB_OPTIONS.backoff?.delay, 1000);
  assert.equal(DEFAULT_DLQ_OPTIONS.attempts, 1);

  // Test sendToDLQ
  const dlqResult = await sendToDLQ("test-exec-123", "Simulated fatal error", { custom: "data" });
  assert.equal(typeof dlqResult, "boolean");

  // Test getQueueMetrics
  const metrics = await getQueueMetrics();
  assert.ok(metrics.workflows);
  assert.ok(metrics.dlq);
  assert.equal(typeof metrics.workflows.active, "number");
  assert.equal(typeof metrics.dlq.failed, "number");

  // Test Bull Board JSON stats route
  const statsRes = await app.inject({
    method: "GET",
    url: "/admin/queues/stats",
  });
  assert.equal(statsRes.statusCode, 200);
  const statsBody = JSON.parse(statsRes.body);
  assert.ok(statsBody.queues);
  assert.ok(statsBody.concurrency >= 2);
  assert.ok(statsBody.cpus >= 1);

  // Test Bull Board HTML dashboard
  const dashRes = await app.inject({
    method: "GET",
    url: "/admin/queues",
  });
  assert.equal(dashRes.statusCode, 200);
  assert.ok(dashRes.headers["content-type"]?.includes("text/html"));
  assert.ok(dashRes.body.includes("AgentFlow Queue Dashboard (Bull Board)"));
});

test("Item 11: Webhook HMAC SHA256 verify + 24h idempotency replay + rawBody capture", async () => {
  const token = await register("item11-webhook@example.com");
  const wf = await request("POST", "/api/workflows", { name: "Webhook Flow 11" }, token);
  assert.equal(wf.response.statusCode, 201);

  const hookSecret = "test_hmac_secret_key_1234567890";
  const hook = await request("POST", "/api/webhooks", {
    path: "hmac-idempotency-hook",
    workflowId: wf.body.id,
    secret: hookSecret,
  }, token);
  assert.equal(hook.response.statusCode, 201);
  const { secret, triggerPath } = hook.body;
  assert.equal(secret, hookSecret);

  const payload = JSON.stringify({ event: "order_created", amount: 4900 });
  const validSignature = createHmac("sha256", secret).update(payload).digest("hex");

  // 1. Missing signature -> 401 MISSING_SIGNATURE
  const missingSig = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: { "content-type": "application/json" },
    payload,
  });
  assert.equal(missingSig.statusCode, 401);
  assert.equal(JSON.parse(missingSig.body).code, "MISSING_SIGNATURE");

  // 2. Invalid signature -> 401 INVALID_SIGNATURE
  const invalidSig = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: { "content-type": "application/json", "x-webhook-signature": "bad_sig" },
    payload,
  });
  assert.equal(invalidSig.statusCode, 401);
  assert.equal(JSON.parse(invalidSig.body).code, "INVALID_SIGNATURE");

  // 3. Valid signature -> 202 Accepted with executionId
  const firstTrigger = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": validSignature,
      "x-idempotency-key": "evt_unique_123",
    },
    payload,
  });
  assert.equal(firstTrigger.statusCode, 202);
  const firstExecutionId = JSON.parse(firstTrigger.body).executionId;
  assert.ok(firstExecutionId);

  // 4. Duplicate request with same idempotency key -> 200 OK IDEMPOTENT_REPLAY
  const replayTrigger = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": validSignature,
      "x-idempotency-key": "evt_unique_123",
    },
    payload,
  });
  assert.equal(replayTrigger.statusCode, 200);
  const replayBody = JSON.parse(replayTrigger.body);
  assert.equal(replayBody.duplicate, true);
  assert.equal(replayBody.code, "IDEMPOTENT_REPLAY");
  assert.equal(replayBody.executionId, firstExecutionId);
});

test("Item 12: Workflows CRUD harden cursor pagination + org scoping + search q", async () => {
  const tokenA = await register("item12-orgA@example.com");
  const tokenB = await register("item12-orgB@example.com");

  // 1. Create workflows in Org A
  const wfA1 = await request("POST", "/api/workflows", { name: "Searchable Customer Flow Alpha", description: "Handles onboarding" }, tokenA);
  const wfA2 = await request("POST", "/api/workflows", { name: "Searchable Customer Flow Beta", description: "Handles notifications" }, tokenA);
  const wfA3 = await request("POST", "/api/workflows", { name: "Internal Billing Gamma", description: "Handles invoices" }, tokenA);
  assert.equal(wfA1.response.statusCode, 201);
  assert.equal(wfA2.response.statusCode, 201);
  assert.equal(wfA3.response.statusCode, 201);

  // 2. Org Scoping: Org B cannot access, update or delete Org A's workflow
  const crossGet = await request("GET", `/api/workflows/${wfA1.body.id}`, undefined, tokenB);
  assert.equal(crossGet.response.statusCode, 404);

  const crossPatch = await request("PATCH", `/api/workflows/${wfA1.body.id}`, { name: "Hacked" }, tokenB);
  assert.equal(crossPatch.response.statusCode, 404);

  const crossDelete = await request("DELETE", `/api/workflows/${wfA1.body.id}`, undefined, tokenB);
  assert.equal(crossDelete.response.statusCode, 404);

  // 3. Search `q`: Search with ?q=Customer
  const searchQ = await app.inject({
    method: "GET",
    url: "/api/workflows?q=Customer",
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(searchQ.statusCode, 200);
  const searchItems = JSON.parse(searchQ.body);
  assert.ok(searchItems.length >= 2);
  assert.ok(searchItems.every((item: any) => item.name.includes("Customer") || item.description?.includes("Customer")));
  assert.ok(!searchItems.some((item: any) => item.id === wfA3.body.id));

  // Search by description keyword
  const searchDesc = await app.inject({
    method: "GET",
    url: "/api/workflows?q=invoices",
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(searchDesc.statusCode, 200);
  const descItems = JSON.parse(searchDesc.body);
  assert.equal(descItems.length, 1);
  assert.equal(descItems[0].id, wfA3.body.id);

  // 4. Cursor Pagination: Limit 2 and cursor
  const page1 = await app.inject({
    method: "GET",
    url: "/api/workflows?limit=2",
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(page1.statusCode, 200);
  assert.equal(page1.headers["x-limit"], "2");
  assert.equal(page1.headers["x-has-more"], "true");
  const nextCursor = page1.headers["x-next-cursor"] as string;
  assert.ok(nextCursor);
  const p1Items = JSON.parse(page1.body);
  assert.equal(p1Items.length, 2);

  const page2 = await app.inject({
    method: "GET",
    url: `/api/workflows?cursor=${nextCursor}&limit=2`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(page2.statusCode, 200);
  assert.equal(page2.headers["x-cursor"], nextCursor);
  const p2Items = JSON.parse(page2.body);
  assert.ok(p2Items.length >= 1);
  assert.notEqual(p2Items[0].id, p1Items[0].id);
});

test("Item 13: Executions cursor pagination + filters (workflowId, status, trigger) + traces", async () => {
  const token = await register("item13-exec@example.com");

  // Create workflow
  const wf = await request("POST", "/api/workflows", { name: "Executions Test Flow" }, token);
  assert.equal(wf.response.statusCode, 201);

  await request("PATCH", `/api/workflows/${wf.body.id}`, {
    nodes: [
      { id: "node_1", type: "trigger", position: { x: 0, y: 0 }, data: { type: "webhook", config: {} } },
      { id: "node_2", type: "advanced", position: { x: 200, y: 0 }, data: { type: "output", config: {} } },
    ],
    edges: [{ id: "edge_1", source: "node_1", target: "node_2" }],
  }, token);

  // Trigger 3 executions
  const ex1 = await request("POST", "/api/executions/trigger", { workflowId: wf.body.id, input: { item: 1 }, trigger: "api" }, token);
  const ex2 = await request("POST", "/api/executions/trigger", { workflowId: wf.body.id, input: { item: 2 }, trigger: "manual" }, token);
  const ex3 = await request("POST", "/api/executions/trigger", { workflowId: wf.body.id, input: { item: 3 }, trigger: "api" }, token);
  assert.equal(ex1.response.statusCode, 202);
  assert.equal(ex2.response.statusCode, 202);
  assert.equal(ex3.response.statusCode, 202);

  await new Promise((resolve) => setTimeout(resolve, 150));

  // 1. Filter by workflowId
  const byWf = await app.inject({
    method: "GET",
    url: `/api/executions?workflowId=${wf.body.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(byWf.statusCode, 200);
  const wfExecs = JSON.parse(byWf.body);
  assert.ok(wfExecs.length >= 3);

  // 2. Filter by status
  const byStatus = await app.inject({
    method: "GET",
    url: `/api/executions?status=SUCCESS`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(byStatus.statusCode, 200);
  const statusExecs = JSON.parse(byStatus.body);
  assert.ok(statusExecs.every((e: any) => e.status === "SUCCESS"));

  // 3. Filter by trigger
  const byTrigger = await app.inject({
    method: "GET",
    url: `/api/executions?trigger=manual`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(byTrigger.statusCode, 200);
  const triggerExecs = JSON.parse(byTrigger.body);
  assert.ok(triggerExecs.length >= 1);
  assert.ok(triggerExecs.every((e: any) => e.trigger === "manual"));

  // 4. Cursor Pagination with paginate=true
  const p1 = await app.inject({
    method: "GET",
    url: `/api/executions?limit=2&paginate=true`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(p1.statusCode, 200);
  const p1Body = JSON.parse(p1.body);
  assert.ok(Array.isArray(p1Body.items));
  assert.equal(p1Body.items.length, 2);
  assert.ok(p1Body.nextCursor);
  assert.equal(p1Body.hasMore, true);

  const p2 = await app.inject({
    method: "GET",
    url: `/api/executions?cursor=${p1Body.nextCursor}&limit=2&paginate=true`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(p2.statusCode, 200);
  const p2Body = JSON.parse(p2.body);
  assert.ok(Array.isArray(p2Body.items));
  assert.ok(p2Body.items.length >= 1);

  // 5. Traces endpoint (/api/executions/:id/traces)
  const traceRes = await app.inject({
    method: "GET",
    url: `/api/executions/${ex1.body.id}/traces`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(traceRes.statusCode, 200);
  const traceBody = JSON.parse(traceRes.body);
  assert.equal(traceBody.executionId, ex1.body.id);
  assert.equal(traceBody.status, "SUCCESS");
  assert.ok(Array.isArray(traceBody.traces));
  assert.ok(traceBody.traces.length >= 2);
  assert.ok(traceBody.traces.some((t: any) => t.nodeId === "node_1"));
});

test("Trio 02: P2 TRUST_PROXY + error handler returns VALIDATION_ERROR on malformed JSON and hides stack in prod", async () => {
  // 1. Malformed JSON payload returns 400 VALIDATION_ERROR (not 500 with stack)
  const malformed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    payload: "{ broken-json",
  });
  assert.equal(malformed.statusCode, 400);
  const malformedBody = JSON.parse(malformed.body);
  assert.equal(malformedBody.code, "VALIDATION_ERROR");
  assert.equal(malformedBody.error, "Invalid JSON payload");
  assert.equal(malformedBody.stack, undefined);
});

test("Trio 04: RBAC org isolation strictly blocks requests without valid org context (403) and does not fallback to firstOrg", async () => {
  // 1. User without org context returns 403 ORG_REQUIRED
  const userNoOrg = await prisma.user.create({ data: { email: "noorg@example.com", name: "No Org", passwordHash: "h" } });
  const rawToken = app.jwt.sign({ sub: userNoOrg.id, email: userNoOrg.email });

  const noOrgCreate = await request("POST", "/api/workflows", { name: "Orphan Flow" }, rawToken);
  assert.equal(noOrgCreate.response.statusCode, 403);
  assert.equal(noOrgCreate.body.code, "ORG_REQUIRED");

  // 2. User A in Org A cannot create or access Org B using fabricated x-org-id header (403 FORBIDDEN_ORG or ORG_REQUIRED)
  const userA = await prisma.user.create({ data: { email: "org-iso-a@example.com", name: "User A", passwordHash: "h" } });
  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a", members: { create: { userId: userA.id, role: "OWNER" } } },
  });
  const tokenA = app.jwt.sign({ sub: userA.id, email: userA.email, orgId: orgA.id });

  const userB = await prisma.user.create({ data: { email: "org-iso-b@example.com", name: "User B", passwordHash: "h" } });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: "org-b", members: { create: { userId: userB.id, role: "OWNER" } } },
  });

  const hijackAttempt = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { authorization: `Bearer ${tokenA}`, "x-org-id": orgB.id, "content-type": "application/json" },
    payload: JSON.stringify({ name: "Hijacked Flow" }),
  });
  assert.equal(hijackAttempt.statusCode, 403);
  assert.ok(["FORBIDDEN_ORG", "ORG_REQUIRED"].includes(JSON.parse(hijackAttempt.body).code));

  // 3. Credential creation without org context returns 403 ORG_REQUIRED
  const credNoOrg = await request("POST", "/api/credentials", { name: "test-key", type: "api_key", provider: "openai", data: { apiKey: "sk-123" } }, rawToken);
  assert.equal(credNoOrg.response.statusCode, 403);
  assert.equal(credNoOrg.body.code, "ORG_REQUIRED");

  // 4. Webhook creation without org context returns 403 ORG_REQUIRED
  const hookNoOrg = await request("POST", "/api/webhooks", { path: "hook-test", method: "POST" }, rawToken);
  assert.equal(hookNoOrg.response.statusCode, 403);
  assert.equal(hookNoOrg.body.code, "ORG_REQUIRED");
});

test.after(async () => {
  await app.close();
});

