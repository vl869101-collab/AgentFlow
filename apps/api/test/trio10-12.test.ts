import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import test from "node:test";
import os from "node:os";

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

const [{ buildApp }, { resetStore }, { prisma }, queueService, { resetMemoryIdempotencyStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/services/queue.js"),
  import("../src/lib/redis.js"),
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
    // Keep plain text
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
  const login = await request("POST", "/api/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(login.response.statusCode, 200);
  return login.body.token as string;
}

test.beforeEach(() => {
  resetStore();
  resetMemoryIdempotencyStore();
});

// ═════════════════════════════════════════════════════════════════
// Item 10: BullMQ DLQ, Retry 3x Exp Backoff, Concurrency & Bull Board
// ═════════════════════════════════════════════════════════════════
test("Item 10: BullMQ DLQ configuration, retry 3x backoff and Bull Board dashboard & API", async () => {
  // 1. Verify BullMQ default retry and DLQ options
  assert.equal(queueService.DEFAULT_JOB_OPTIONS.attempts, 3);
  assert.equal(queueService.DEFAULT_JOB_OPTIONS.backoff.type, "exponential");
  assert.equal(queueService.DEFAULT_JOB_OPTIONS.backoff.delay, 1000);
  assert.equal(queueService.DEFAULT_DLQ_OPTIONS.attempts, 1);

  // 2. Concurrency calculation (CPU * 2, min 2)
  const expectedCpus = os.cpus().length || 1;
  const expectedConcurrency = Math.max(2, expectedCpus * 2);

  // 3. Test Bull Board HTML dashboard
  const adminToken = await register("admin-trio10@example.com");
  const htmlRes = await app.inject({
    method: "GET",
    url: "/admin/queues",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(htmlRes.statusCode, 200);
  assert.ok(htmlRes.headers["content-type"]?.includes("text/html"));
  assert.ok(htmlRes.body.includes("AgentFlow Queue Dashboard"));
  assert.ok(htmlRes.body.includes("BullMQ"));
  assert.ok(htmlRes.body.includes("workflows"));

  // 4. Test Bull Board JSON stats endpoint
  const statsRes = await request("GET", "/admin/queues/stats", undefined, adminToken);
  assert.equal(statsRes.response.statusCode, 200);
  assert.ok(statsRes.body.queues);
  assert.ok(statsRes.body.queues.workflows);
  assert.ok(statsRes.body.queues.dlq);
  assert.equal(statsRes.body.concurrency, expectedConcurrency);

  // 5. Test Bull Board REST API endpoints
  const apiQueues = await request("GET", "/admin/queues/api/queues", undefined, adminToken);
  assert.equal(apiQueues.response.statusCode, 200);
  assert.ok(Array.isArray(apiQueues.body.queues));
  assert.equal(apiQueues.body.queues.length, 2);

  const retryAll = await request("POST", "/admin/queues/api/workflows/retry-all", undefined, adminToken);
  assert.equal(retryAll.response.statusCode, 200);
  assert.equal(retryAll.body.ok, true);

  const clean = await request("POST", "/admin/queues/api/workflows/clean", undefined, adminToken);
  assert.equal(clean.response.statusCode, 200);
  assert.equal(clean.body.ok, true);

  const pause = await request("POST", "/admin/queues/api/workflows/pause", undefined, adminToken);
  assert.equal(pause.response.statusCode, 200);
  assert.equal(pause.body.status, "paused");

  const resume = await request("POST", "/admin/queues/api/workflows/resume", undefined, adminToken);
  assert.equal(resume.response.statusCode, 200);
  assert.equal(resume.body.status, "resumed");
});

// ═════════════════════════════════════════════════════════════════
// Item 11: Webhooks HMAC SHA256 rawBody + Redis SET NX Idempotency 24h
// ═════════════════════════════════════════════════════════════════
test("Item 11: Webhook HMAC SHA256 rawBody verification and 24h idempotency deduplication", async () => {
  const token = await register("webhooks-trio11@example.com");

  // 1. Create a workflow and webhook
  const wf = await request("POST", "/api/workflows", { name: "Webhook Ingest Pipeline" }, token);
  assert.equal(wf.response.statusCode, 201);

  await request("PATCH", `/api/workflows/${wf.body.id}`, {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { type: "webhook", config: {} } },
      { id: "out", type: "advanced", position: { x: 200, y: 0 }, data: { type: "output", config: {} } },
    ],
    edges: [{ id: "e1", source: "trigger", target: "out" }],
  }, token);

  const hookSecret = "test_webhook_hmac_secret_key_32chars!";
  const hook = await request("POST", "/api/webhooks", {
    path: "order-events",
    workflowId: wf.body.id,
    secret: hookSecret,
  }, token);
  assert.equal(hook.response.statusCode, 201);
  const triggerPath = hook.body.path;

  // 2. Reject missing signature
  const rawPayload = JSON.stringify({ event: "order.created", orderId: "ord_12345", amount: 99.99 });
  const noSig = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: { "content-type": "application/json" },
    payload: rawPayload,
  });
  assert.equal(noSig.statusCode, 401);
  assert.equal(JSON.parse(noSig.body).code, "MISSING_SIGNATURE");

  // 3. Reject invalid HMAC signature
  const badSig = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": "sha256=invalid_hex_digest_000000000000000000000000000000000000000000000000",
    },
    payload: rawPayload,
  });
  assert.equal(badSig.statusCode, 401);
  assert.equal(JSON.parse(badSig.body).code, "INVALID_SIGNATURE");

  // 4. Valid HMAC SHA256 signature with idempotency key
  const validSignature = createHmac("sha256", hookSecret).update(rawPayload).digest("hex");
  const idempotencyKey = "evt_order_created_unique_uuid_999";

  const firstDelivery = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": `sha256=${validSignature}`,
      "x-idempotency-key": idempotencyKey,
    },
    payload: rawPayload,
  });
  assert.equal(firstDelivery.statusCode, 202);
  const firstExecId = JSON.parse(firstDelivery.body).executionId;
  assert.ok(firstExecId);

  // 5. Replay with same idempotency key (duplicate delivery within 24h)
  const replayDelivery = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": validSignature,
      "x-idempotency-key": idempotencyKey,
    },
    payload: rawPayload,
  });
  assert.equal(replayDelivery.statusCode, 200);
  const replayBody = JSON.parse(replayDelivery.body);
  assert.equal(replayBody.duplicate, true);
  assert.equal(replayBody.code, "IDEMPOTENT_REPLAY");
  assert.equal(replayBody.executionId, firstExecId);

  // 6. Automatic payload hash idempotency deduplication
  const payload2 = JSON.stringify({ event: "order.paid", orderId: "ord_99999" });
  const sig2 = createHmac("sha256", hookSecret).update(payload2).digest("hex");

  const hashDelivery1 = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": sig2,
    },
    payload: payload2,
  });
  assert.equal(hashDelivery1.statusCode, 202);

  const hashDelivery2 = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${triggerPath}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": sig2,
    },
    payload: payload2,
  });
  assert.equal(hashDelivery2.statusCode, 200);
  assert.equal(JSON.parse(hashDelivery2.body).duplicate, true);
});

// ═════════════════════════════════════════════════════════════════
// Item 12: Workflows CRUD Cursor Pagination, Org Scoping & Search
// ═════════════════════════════════════════════════════════════════
test("Item 12: Workflows CRUD cursor pagination, multi-tenant org scoping and case-insensitive search", async () => {
  // 1. Create two users in separate organizations
  const tokenA = await register("userA-trio12@example.com");
  const tokenB = await register("userB-trio12@example.com");

  // Upgrade orgs to pro plan to allow multiple workflows
  await (prisma.organization as any).updateMany({ data: { plan: "pro" } });

  // 2. User A creates 4 workflows
  const wfA1 = await request("POST", "/api/workflows", { name: "Alpha Ingest Workflow", description: "Payment records intake" }, tokenA);
  assert.equal(wfA1.response.statusCode, 201);

  const wfA2 = await request("POST", "/api/workflows", { name: "Alpha Sync Shopify", description: "E-commerce synchronization" }, tokenA);
  assert.equal(wfA2.response.statusCode, 201);

  const wfA3 = await request("POST", "/api/workflows", { name: "Beta Email Notification", description: "Customer alerts" }, tokenA);
  assert.equal(wfA3.response.statusCode, 201);

  const wfA4 = await request("POST", "/api/workflows", { name: "Zeta Archive Cleanup", description: "Nightly cron maintenance" }, tokenA);
  assert.equal(wfA4.response.statusCode, 201);

  // 3. User B creates 1 workflow in Org B
  const wfB1 = await request("POST", "/api/workflows", { name: "Org B Private Workflow", description: "Confidential data" }, tokenB);
  assert.equal(wfB1.response.statusCode, 201);

  // 4. Test Org Scoping: User B cannot see User A's workflows
  const listB = await request("GET", "/api/workflows", undefined, tokenB);
  assert.equal(listB.response.statusCode, 200);
  assert.equal(listB.body.length, 1);
  assert.equal(listB.body[0].id, wfB1.body.id);

  // User B cannot access User A's workflow by ID
  const forbiddenGet = await request("GET", `/api/workflows/${wfA1.body.id}`, undefined, tokenB);
  assert.equal(forbiddenGet.response.statusCode, 404);

  const forbiddenDelete = await request("DELETE", `/api/workflows/${wfA1.body.id}`, undefined, tokenB);
  assert.equal(forbiddenDelete.response.statusCode, 404);

  // 5. Test Search: case-insensitive name and description search
  const searchAlpha = await request("GET", "/api/workflows?q=alpha", undefined, tokenA);
  assert.equal(searchAlpha.response.statusCode, 200);
  assert.equal(searchAlpha.body.length, 2);

  const searchPayment = await request("GET", "/api/workflows?search=payment", undefined, tokenA);
  assert.equal(searchPayment.response.statusCode, 200);
  assert.equal(searchPayment.body.length, 1);
  assert.equal(searchPayment.body[0].name, "Alpha Ingest Workflow");

  const searchEmpty = await request("GET", "/api/workflows?q=nonexistent_xyz", undefined, tokenA);
  assert.equal(searchEmpty.response.statusCode, 200);
  assert.equal(searchEmpty.body.length, 0);

  // 6. Test Cursor-based Pagination
  const page1 = await request("GET", "/api/workflows?limit=2&paginate=true", undefined, tokenA);
  assert.equal(page1.response.statusCode, 200);
  assert.equal(page1.body.items.length, 2);
  assert.equal(page1.body.hasMore, true);
  assert.ok(page1.body.nextCursor);
  assert.equal(page1.response.headers["x-has-more"], "true");
  assert.equal(page1.response.headers["x-next-cursor"], page1.body.nextCursor);

  const page2 = await request("GET", `/api/workflows?cursor=${page1.body.nextCursor}&limit=2&paginate=true`, undefined, tokenA);
  assert.equal(page2.response.statusCode, 200);
  assert.equal(page2.body.items.length, 2);
  assert.equal(page2.body.hasMore, false);

  // 7. Test Workflow Canvas update, snapshot versioning and deletion
  const canvasUpdate = await request("PUT", `/api/workflows/${wfA1.body.id}/canvas`, {
    nodes: [
      { id: "node-1", type: "webhook", position: { x: 0, y: 0 }, data: { label: "Incoming Webhook" } },
      { id: "node-2", type: "http", position: { x: 300, y: 100 }, data: { label: "Forward HTTP" } },
    ],
    edges: [
      { id: "e1-2", sourceNodeId: "node-1", targetNodeId: "node-2" },
    ],
  }, tokenA);
  assert.equal(canvasUpdate.response.statusCode, 200);
  assert.equal(canvasUpdate.body.ok, true);

  const wfDetail = await request("GET", `/api/workflows/${wfA1.body.id}`, undefined, tokenA);
  assert.equal(wfDetail.response.statusCode, 200);
  assert.equal(wfDetail.body.nodes.length, 2);
  assert.equal(wfDetail.body.edges.length, 1);

  const deleteRes = await request("DELETE", `/api/workflows/${wfA1.body.id}`, undefined, tokenA);
  assert.equal(deleteRes.response.statusCode, 200);
  assert.equal(deleteRes.body.ok, true);

  const checkDeleted = await request("GET", `/api/workflows/${wfA1.body.id}`, undefined, tokenA);
  assert.equal(checkDeleted.response.statusCode, 404);
});

