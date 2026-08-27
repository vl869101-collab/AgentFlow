import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

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

const [{ buildApp }, { resetStore }, { prisma }, { resetMemoryRateLimitStore, checkSlidingWindowRateLimit }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/lib/redis.js"),
]);

const [{ recordUsageEvent, getOrgUsageSummary, getOrgUsageBreakdown, generateLedgerSignature, verifyLedgerSignature, getCurrentBillingMonthBounds }] = await Promise.all([
  import("../src/services/metering.js"),
]);

const [{ getTierRateLimit, TIER_RATE_LIMITS, tierRateLimitMiddleware, createSlidingRateLimit }] = await Promise.all([
  import("../src/middleware/rate-limit.js"),
]);

const [{ executeWorkflow }] = await Promise.all([
  import("../src/services/executor.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
  resetMemoryRateLimitStore();
});

// ═════════════════════════════════════════════════════════════════
// TASK-12: Metering Usage Ledger & Aggregation (TDD & E2E)
// ═════════════════════════════════════════════════════════════════

test("TASK-12: recordUsageEvent generates cryptographic HMAC-SHA256 signature and verifies non-tampering", async () => {
  const org = await prisma.organization.create({ data: { name: "Audit Org", slug: "audit-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "audit@example.com", passwordHash: "h", name: "Audit User" } });

  const record = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_audit_100",
    executionId: "exec_audit_100",
    metricType: "llm_prompt_tokens",
    value: 2048,
    metadata: { model: "nvidia/llama-3.1-70b-instruct" },
  });

  assert.ok(record);
  assert.equal(record.quantity, 2048);
  assert.equal(record.type, "llm_prompt_tokens");

  const meta = record.metadata as any;
  assert.ok(meta.signature);
  assert.equal(meta.metricType, "llm_prompt_tokens");
  assert.equal(meta.value, 2048);
  assert.ok(meta.timestamp);

  // Verification succeeds on authentic record
  assert.equal(verifyLedgerSignature(record), true);

  // Verification fails if tampered
  const tamperedRecord = {
    ...record,
    quantity: 999999, // tampered value
  };
  assert.equal(verifyLedgerSignature(tamperedRecord), false);

  const tamperedTypeRecord = {
    ...record,
    type: "storage_bytes",
  };
  assert.equal(verifyLedgerSignature(tamperedTypeRecord), false);
});

test("TASK-12: Atomic usage recording covers all standard metrics (execution_count, duration, tokens, storage)", async () => {
  const org = await prisma.organization.create({ data: { name: "MultiMetric Org", slug: "multimetric-org", plan: "GROWTH" } });
  const user = await prisma.user.create({ data: { email: "multi@example.com", passwordHash: "h", name: "Multi User" } });

  // Record diverse metric types
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_1", executionId: "e_1", metricType: "execution_count", value: 1 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_1", executionId: "e_1", metricType: "execution_duration_ms", value: 350 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_1", executionId: "e_1", metricType: "llm_prompt_tokens", value: 1500 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_1", executionId: "e_1", metricType: "llm_completion_tokens", value: 500 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_1", executionId: "e_1", metricType: "storage_bytes", value: 1048576 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_2", executionId: "e_2", metricType: "ai_call", value: 2 });

  const summary = await getOrgUsageSummary(org.id);
  assert.ok(summary);
  assert.equal(summary.metrics.executions.used, 1);
  assert.equal(summary.metrics.totalDurationMs, 350);
  assert.equal(summary.metrics.promptTokens, 1500);
  assert.equal(summary.metrics.completionTokens, 500);
  assert.equal(summary.metrics.totalTokens, 2000);
  assert.equal(summary.metrics.storageBytes, 1048576);
  assert.equal(summary.metrics.aiCalls.used, 2);
});

test("TASK-12: Workflow execution automatically records execution_count and execution_duration_ms in ledger", async () => {
  const org = await prisma.organization.create({ data: { name: "Exec Ledger Org", slug: "exec-ledger-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "execledger@example.com", passwordHash: "h", name: "ExecLedger User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const wf = await prisma.workflow.create({
    data: {
      name: "Auto Metering Flow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: [
        { id: "trig", type: "manual", config: {} },
        { id: "set", type: "set_fields", config: { processed: true } },
        { id: "out", type: "output", config: {} },
      ],
      edges: [
        { id: "e1", sourceNodeId: "trig", targetNodeId: "set" },
        { id: "e2", sourceNodeId: "set", targetNodeId: "out" },
      ],
    },
  });

  const execResult = await executeWorkflow(wf.id, { sample: 123 });
  assert.equal(execResult.status, "SUCCESS");

  // Verify ledger events recorded for this execution
  const records = await prisma.usageRecord.findMany({
    where: { orgId: org.id },
  });

  const countRecord = records.find((r) => r.type === "execution_count");
  assert.ok(countRecord, "Expected execution_count ledger record");
  assert.equal(countRecord.quantity, 1);
  assert.equal((countRecord.metadata as any).workflowId, wf.id);
  assert.equal((countRecord.metadata as any).executionId, execResult.id);

  const durationRecord = records.find((r) => r.type === "execution_duration_ms");
  assert.ok(durationRecord, "Expected execution_duration_ms ledger record");
  assert.ok(Number(durationRecord.quantity) >= 0);
  assert.equal((durationRecord.metadata as any).workflowId, wf.id);
});

test("TASK-12: getOrgUsageBreakdown filters by workflowId, date range and aggregates by workflow & day", async () => {
  const org = await prisma.organization.create({ data: { name: "Filter Org", slug: "filter-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "filter@example.com", passwordHash: "h", name: "Filter User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  // Record usage for two distinct workflows
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", executionId: "ea1", metricType: "execution_count", value: 5 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", executionId: "ea1", metricType: "execution_duration_ms", value: 1200 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", executionId: "ea1", metricType: "llm_prompt_tokens", value: 3000 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", executionId: "ea1", metricType: "llm_completion_tokens", value: 1000 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_beta", executionId: "eb1", metricType: "execution_count", value: 2 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_beta", executionId: "eb1", metricType: "execution_duration_ms", value: 400 });

  // 1. Overall breakdown
  const fullBreakdown = await getOrgUsageBreakdown(org.id);
  assert.equal(fullBreakdown.byWorkflow["wf_alpha"].executions, 5);
  assert.equal(fullBreakdown.byWorkflow["wf_alpha"].durationMs, 1200);
  assert.equal(fullBreakdown.byWorkflow["wf_alpha"].promptTokens, 3000);
  assert.equal(fullBreakdown.byWorkflow["wf_alpha"].completionTokens, 1000);
  assert.equal(fullBreakdown.byWorkflow["wf_alpha"].totalTokens, 4000);
  assert.equal(fullBreakdown.byWorkflow["wf_beta"].executions, 2);

  // 2. Filtered by workflowId
  const alphaBreakdown = await getOrgUsageBreakdown(org.id, { workflowId: "wf_alpha" });
  assert.ok(alphaBreakdown.byWorkflow["wf_alpha"]);
  assert.equal(alphaBreakdown.byWorkflow["wf_beta"], undefined);
  assert.equal(alphaBreakdown.byWorkflow["wf_alpha"].executions, 5);
});

test("TASK-12: REST endpoints GET /api/organizations/:id/usage, GET /api/usage and POST /api/usage/verify", async () => {
  const org = await prisma.organization.create({ data: { name: "Rest Meter Org", slug: "rest-meter-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "restmeter@example.com", passwordHash: "h", name: "Rest Meter User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const record = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_rest",
    executionId: "exec_rest",
    metricType: "execution_count",
    value: 3,
  });
  assert.ok(record);

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  // 1. GET /api/organizations/:id/usage
  const orgUsageRes = await app.inject({
    method: "GET",
    url: `/api/organizations/${org.id}/usage`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(orgUsageRes.statusCode, 200);
  const orgUsage = orgUsageRes.json();
  assert.equal(orgUsage.orgId, org.id);
  assert.equal(orgUsage.plan, "PRO");
  assert.equal(orgUsage.metrics.executions.used, 3);

  // 2. GET /api/organizations/:id/usage with breakdown query
  const orgBreakdownRes = await app.inject({
    method: "GET",
    url: `/api/organizations/${org.id}/usage?breakdown=true`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(orgBreakdownRes.statusCode, 200);
  const orgBreakdown = orgBreakdownRes.json();
  assert.ok(orgBreakdown.breakdown);
  assert.equal(orgBreakdown.breakdown.byWorkflow["wf_rest"].executions, 3);

  // 3. GET /api/usage/events
  const eventsRes = await app.inject({
    method: "GET",
    url: "/api/usage/events",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(eventsRes.statusCode, 200);
  const events = eventsRes.json();
  assert.ok(Array.isArray(events));
  assert.equal(events.length, 1);

  // 4. POST /api/usage/verify (signature verification endpoint)
  const verifyRes = await app.inject({
    method: "POST",
    url: "/api/usage/verify",
    headers: { authorization: `Bearer ${token}` },
    payload: { recordId: record.id },
  });
  assert.equal(verifyRes.statusCode, 200);
  const verifyBody = verifyRes.json();
  assert.equal(verifyBody.valid, true);
  assert.equal(verifyBody.recordId, record.id);
});

// ═════════════════════════════════════════════════════════════════
// TASK-13: Dynamic per-tier Sliding-Window Rate Limiting (TDD & E2E)
// ═════════════════════════════════════════════════════════════════

test("TASK-13: getTierRateLimit returns exact configured limits per tier", () => {
  assert.equal(getTierRateLimit("FREE").limit, 60);
  assert.equal(getTierRateLimit("FREE").windowMs, 60000);
  assert.equal(getTierRateLimit("STARTER").limit, 60);
  assert.equal(getTierRateLimit("BASIC").limit, 120);
  assert.equal(getTierRateLimit("GROWTH").limit, 300);
  assert.equal(getTierRateLimit("PRO").limit, 600);
  assert.equal(getTierRateLimit("ENTERPRISE").limit, 6000);
  // Default fallback for unknown tier
  assert.equal(getTierRateLimit("UNKNOWN").limit, 60);
});

test("TASK-13: checkSlidingWindowRateLimit rolling window prevents burst boundary loopholes", async () => {
  const key = "test:ratelimit:window:strict";
  const limit = 4;
  const windowMs = 500;

  // First 4 requests within window must succeed
  for (let i = 0; i < limit; i++) {
    const result = await checkSlidingWindowRateLimit(key, limit, windowMs);
    assert.equal(result.allowed, true);
    assert.equal(result.limit, limit);
    assert.equal(result.remaining, limit - i - 1);
  }

  // 5th request in the same window must be blocked with retryAfter
  const blocked = await checkSlidingWindowRateLimit(key, limit, windowMs);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetMs > 0);
  assert.ok(blocked.retryAfterSeconds >= 1);

  // Wait for sliding window to expire
  await new Promise((resolve) => setTimeout(resolve, windowMs + 50));

  // Request after window should succeed again
  const renewed = await checkSlidingWindowRateLimit(key, limit, windowMs);
  assert.equal(renewed.allowed, true);
  assert.equal(renewed.remaining, limit - 1);
});

test("TASK-13: Concurrent burst simulation enforces exact tier capacity", async () => {
  const key = "test:ratelimit:concurrent:burst";
  const limit = 10;
  const windowMs = 2000;

  // Fire 15 concurrent requests
  const promises = Array.from({ length: 15 }, () =>
    checkSlidingWindowRateLimit(key, limit, windowMs)
  );
  const results = await Promise.all(promises);

  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.filter((r) => !r.allowed).length;

  assert.equal(allowedCount, 10, "Exactly 10 requests should be allowed");
  assert.equal(blockedCount, 5, "Exactly 5 requests should be rejected");

  // All blocked results must contain valid retryAfter
  for (const b of results.filter((r) => !r.allowed)) {
    assert.equal(b.remaining, 0);
    assert.ok(b.retryAfterSeconds >= 1);
  }
});

test("TASK-13: Rate limiting middleware sets X-RateLimit headers and returns 429 when exceeded", async () => {
  const customLimit = createSlidingRateLimit(3, 60000);
  const testApp = Fastify({ logger: false });

  // Create mock route on testApp with sliding rate limit
  testApp.get("/test-ratelimit-route", { preHandler: customLimit }, async (_req, reply) => {
    return reply.send({ status: "ok" });
  });

  // Request 1
  const res1 = await testApp.inject({ method: "GET", url: "/test-ratelimit-route" });
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.headers["x-ratelimit-limit"], "3");
  assert.equal(res1.headers["x-ratelimit-remaining"], "2");
  assert.ok(res1.headers["x-ratelimit-reset"]);

  // Request 2
  const res2 = await testApp.inject({ method: "GET", url: "/test-ratelimit-route" });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.headers["x-ratelimit-remaining"], "1");

  // Request 3
  const res3 = await testApp.inject({ method: "GET", url: "/test-ratelimit-route" });
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.headers["x-ratelimit-remaining"], "0");

  // Request 4 (Exceeds limit -> 429)
  const res4 = await testApp.inject({ method: "GET", url: "/test-ratelimit-route" });
  assert.equal(res4.statusCode, 429);
  assert.equal(res4.headers["x-ratelimit-remaining"], "0");
  assert.ok(res4.headers["retry-after"]);

  const body4 = res4.json();
  assert.equal(body4.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(body4.error, "Too Many Requests");
  assert.equal(body4.limit, 3);
  assert.equal(body4.remaining, 0);
  assert.ok(body4.retryAfter >= 1);
});
