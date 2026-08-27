import assert from "node:assert/strict";
import test from "node:test";

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
process.env.MOCK_SERVICES = "true";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const [{ limitsForPlan, PLAN_LIMITS }] = await Promise.all([
  import("../src/lib/plans.js"),
]);

const [{ recordUsage, getOrgUsageSummary, getCurrentBillingMonthBounds }] = await Promise.all([
  import("../src/services/metering.js"),
]);

const [{ telemetry }] = await Promise.all([
  import("../src/lib/otel.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
  telemetry.reset();
});

// ─────────────────────────────────────────────────────────────
// TASK 22: Quota Org + Metering
// ─────────────────────────────────────────────────────────────

test("TASK 22: Plan limits structure and calculation across tiers", () => {
  assert.equal(limitsForPlan("FREE").executionsPerMonth, 100);
  assert.equal(limitsForPlan("FREE").workflows, 10);
  assert.equal(limitsForPlan("FREE").aiCallsPerMonth, 50);
  assert.equal(limitsForPlan("FREE").members, 3);

  assert.equal(limitsForPlan("BASIC").executionsPerMonth, 500);
  assert.equal(limitsForPlan("BASIC").workflows, 25);
  assert.equal(limitsForPlan("BASIC").members, 10);

  assert.equal(limitsForPlan("GROWTH").executionsPerMonth, 2000);
  assert.equal(limitsForPlan("GROWTH").workflows, 100);
  assert.equal(limitsForPlan("GROWTH").members, 25);

  assert.equal(limitsForPlan("PRO").executionsPerMonth, Number.POSITIVE_INFINITY);
  assert.equal(limitsForPlan("PRO").workflows, Number.POSITIVE_INFINITY);
  assert.equal(limitsForPlan("PRO").members, Number.POSITIVE_INFINITY);
});

test("TASK 22: recordUsage creates usage records and getOrgUsageSummary calculates metrics", async () => {
  const org = await prisma.organization.create({
    data: { name: "Acme Corp", slug: "acme-corp", plan: "FREE" },
  });
  const user = await prisma.user.create({
    data: { email: "owner@acme.com", passwordHash: "hashed", name: "Acme Owner" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  // Record executions and AI calls
  await recordUsage({ orgId: org.id, userId: user.id, type: "execution", quantity: 5 });
  await recordUsage({ orgId: org.id, userId: user.id, type: "execution", quantity: 3 });
  await recordUsage({ orgId: org.id, userId: user.id, type: "ai_call", quantity: 2 });

  // Create active workflows
  await prisma.workflow.create({
    data: { name: "WF 1", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });
  await prisma.workflow.create({
    data: { name: "WF 2", orgId: org.id, ownerId: user.id, status: "DRAFT" },
  });

  const summary = await getOrgUsageSummary(org.id);
  assert.ok(summary);
  assert.equal(summary.orgId, org.id);
  assert.equal(summary.plan, "FREE");
  assert.equal(summary.metrics.executions.used, 8);
  assert.equal(summary.metrics.executions.limit, 100);
  assert.equal(summary.metrics.executions.remaining, 92);
  assert.equal(summary.metrics.executions.percentage, 8);

  assert.equal(summary.metrics.aiCalls.used, 2);
  assert.equal(summary.metrics.aiCalls.limit, 50);
  assert.equal(summary.metrics.aiCalls.remaining, 48);

  assert.equal(summary.metrics.workflows.used, 2);
  assert.equal(summary.metrics.workflows.limit, 10);

  assert.equal(summary.metrics.members.used, 1);
  assert.equal(summary.metrics.members.limit, 3);
});

test("TASK 22: GET /api/orgs/:id/usage returns organization quota summary", async () => {
  const regRes = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "usage-test@example.com", password: "Password123!", name: "Usage Tester" },
  });
  assert.equal(regRes.statusCode, 201);

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "usage-test@example.com", password: "Password123!" },
  });
  assert.equal(loginRes.statusCode, 200);
  const { token, org } = loginRes.json();

  const usageRes = await app.inject({
    method: "GET",
    url: `/api/orgs/${org.id}/usage`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(usageRes.statusCode, 200);
  const data = usageRes.json();
  assert.equal(data.orgId, org.id);
  assert.ok(data.metrics.executions);
  assert.ok(data.metrics.aiCalls);
  assert.ok(data.metrics.workflows);
  assert.ok(data.metrics.members);
});

test("TASK 22: Organization member limit is enforced on invite", async () => {
  const org = await prisma.organization.create({
    data: { name: "Tiny Org", slug: "tiny-org", plan: "FREE" },
  });
  const owner = await prisma.user.create({
    data: { email: "tiny-owner@example.com", passwordHash: "hashed", name: "Tiny Owner" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: owner.id, role: "OWNER" },
  });

  // Create 2 more users to fill up the limit of 3 for FREE tier
  const user1 = await prisma.user.create({ data: { email: "user1@example.com", passwordHash: "h", name: "U1" } });
  const user2 = await prisma.user.create({ data: { email: "user2@example.com", passwordHash: "h", name: "U2" } });
  const user3 = await prisma.user.create({ data: { email: "user3@example.com", passwordHash: "h", name: "U3" } });

  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user1.id, role: "MEMBER" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user2.id, role: "MEMBER" } });

  const token = app.jwt.sign({ sub: owner.id, orgId: org.id });

  // Attempting to invite a 4th member when limit is 3 should return 403 MEMBER_LIMIT_REACHED
  const inviteRes = await app.inject({
    method: "POST",
    url: `/api/orgs/${org.id}/invite`,
    headers: { authorization: `Bearer ${token}` },
    payload: { email: "user3@example.com", role: "MEMBER" },
  });

  assert.equal(inviteRes.statusCode, 403);
  const body = inviteRes.json();
  assert.equal(body.code, "MEMBER_LIMIT_REACHED");
  assert.equal(body.limit, 3);
});

test("TASK 22: Execution quota middleware blocks POST /workflows/:id/run with 429 when quota exceeded", async () => {
  const org = await prisma.organization.create({
    data: { name: "Quota Org", slug: "quota-org", plan: "FREE" },
  });
  const user = await prisma.user.create({
    data: { email: "quota-user@example.com", passwordHash: "h", name: "Quota User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const wf = await prisma.workflow.create({
    data: {
      name: "Test Flow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
    },
  });
  await prisma.workflowNode.create({
    data: {
      id: "node-trig",
      type: "manual",
      workflowId: wf.id,
      position: { x: 0, y: 0 },
    },
  });

  // Consume 100 executions (full FREE quota)
  await prisma.usageRecord.create({
    data: { orgId: org.id, userId: user.id, type: "execution", quantity: 100 },
  });

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  const runRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${wf.id}/run`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.ok(runRes.statusCode === 402 || runRes.statusCode === 429);
  const body = runRes.json();
  assert.equal(body.code, "QUOTA_EXCEEDED");
  assert.equal(body.used, 100);
  assert.equal(body.limit, 100);
  assert.ok(runRes.headers["x-quota-limit"]);
  assert.ok(runRes.headers["x-quota-used"]);
  assert.ok(runRes.headers["x-quota-remaining"]);
  assert.ok(runRes.headers["x-quota-reset"]);
});

test("TASK 22: Workflow quota middleware blocks POST /api/workflows with 403 when workflow limit reached", async () => {
  const org = await prisma.organization.create({
    data: { name: "Max WF Org", slug: "max-wf-org", plan: "FREE" },
  });
  const user = await prisma.user.create({
    data: { email: "maxwf@example.com", passwordHash: "h", name: "Max User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  // Create 10 active workflows (FREE plan limit is 10)
  for (let i = 1; i <= 10; i++) {
    await prisma.workflow.create({
      data: { name: `WF ${i}`, orgId: org.id, ownerId: user.id, status: "ACTIVE" },
    });
  }

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  const createRes = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "WF 11 Exceeded" },
  });

  assert.equal(createRes.statusCode, 403);
  const body = createRes.json();
  assert.equal(body.code, "WORKFLOW_LIMIT_REACHED");
  assert.equal(body.limit, 10);
});

// ─────────────────────────────────────────────────────────────
// TASK 23: Pino + requestId + otel
// ─────────────────────────────────────────────────────────────

test("TASK 23: Request correlation preserves incoming x-request-id and propagates X-Request-Id header", async () => {
  const customRequestId = "req-custom-correlation-12345";
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-request-id": customRequestId },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["x-request-id"], customRequestId);
  assert.ok(res.headers["traceparent"]);
});

test("TASK 23: Request correlation generates UUID when no request id is provided", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.headers["x-request-id"]);
  assert.ok(res.headers["traceparent"]);
  assert.match(res.headers["traceparent"] as string, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
});

test("TASK 23: Workflow execution creates OpenTelemetry spans for workflow and node execution", async () => {
  const org = await prisma.organization.create({
    data: { name: "Otel Org", slug: "otel-org" },
  });
  const user = await prisma.user.create({
    data: { email: "otel@example.com", passwordHash: "h", name: "Otel User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const wf = await prisma.workflow.create({
    data: { name: "Otel Sample Flow", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });
  await prisma.workflowNode.create({
    data: { id: "trig-1", type: "manual", workflowId: wf.id, position: { x: 0, y: 0 } },
  });
  await prisma.workflowNode.create({
    data: { id: "out-1", type: "output", workflowId: wf.id, position: { x: 200, y: 0 } },
  });
  await prisma.workflowEdge.create({
    data: { sourceNodeId: "trig-1", targetNodeId: "out-1", workflowId: wf.id },
  });

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  const runRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${wf.id}/run`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(runRes.statusCode, 202);
  const execution = runRes.json();
  assert.ok(execution.id);

  // Check recent spans recorded in telemetry
  const spans = telemetry.getRecentSpans();
  const wfSpans = spans.filter((s) => s.attributes["execution.id"] === execution.id);
  assert.ok(wfSpans.length > 0, "Expected telemetry spans for workflow execution");
});

test("TASK 23: OpenTelemetry metrics endpoint /metrics exports Prometheus format", async () => {
  // Generate some traffic
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/health" });

  telemetry.recordWorkflowExecution("SUCCESS", "manual", "org-1", 125);
  telemetry.recordAiGeneration("SUCCESS", "meta/llama-3.1-8b-instruct");
  telemetry.recordQuotaExceeded("execution", "org-1");

  const res = await app.inject({
    method: "GET",
    url: "/metrics",
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/plain/);
  const text = res.body;

  assert.ok(text.includes("# HELP http_requests_total"));
  assert.ok(text.includes("# TYPE http_requests_total counter"));
  assert.ok(text.includes("workflow_executions_total"));
  assert.ok(text.includes("ai_generations_total"));
  assert.ok(text.includes("quota_exceeded_total"));
});

test("TASK 23: GET /api/telemetry/stats returns JSON summary", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/telemetry/stats",
  });

  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.service, "agentflow-api");
  assert.ok(typeof data.counters.httpRequests === "number");
  assert.ok(typeof data.activeExecutions === "number");
});

// ─────────────────────────────────────────────────────────────
// TASK 24: OpenAPI /docs
// ─────────────────────────────────────────────────────────────

test("TASK 24: GET /api/docs and /docs/json return valid OpenAPI 3.1 specification", async () => {
  const res1 = await app.inject({ method: "GET", url: "/api/docs" });
  assert.equal(res1.statusCode, 200);
  const doc1 = res1.json();
  assert.equal(doc1.openapi, "3.1.0");
  assert.equal(doc1.info.title, "AgentFlow API");
  assert.ok(doc1.paths["/health"]);
  assert.ok(doc1.paths["/api/auth/login"]);
  assert.ok(doc1.paths["/api/workflows"]);
  assert.ok(doc1.paths["/api/executions"]);
  assert.ok(doc1.paths["/api/orgs/{id}/usage"]);
  assert.ok(doc1.paths["/metrics"]);

  const res2 = await app.inject({ method: "GET", url: "/docs/json" });
  assert.equal(res2.statusCode, 200);
  const doc2 = res2.json();
  assert.equal(doc2.openapi, "3.1.0");
});

test("TASK 24: GET /docs, /docs/ui, and /api/docs/ui serve interactive Swagger UI HTML", async () => {
  for (const url of ["/docs", "/docs/ui", "/api/docs/ui"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] as string, /text\/html/);
    assert.ok(res.body.includes("SwaggerUIBundle"));
    assert.ok(res.body.includes("AgentFlow API — Swagger UI"));
  }
});

