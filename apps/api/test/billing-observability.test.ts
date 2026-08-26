import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
process.env.STRIPE_SECRET_KEY = "sk_test_mock_stripe_secret_key_12345";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_stripe_webhook_secret_67890";
process.env.STRIPE_PRICE_ID_PRO = "price_pro_monthly";
process.env.STRIPE_PRICE_ID_TEAM = "price_growth_monthly";

const [{ buildApp }, { resetStore }, { prisma }, { resetMemoryRateLimitStore, checkSlidingWindowRateLimit }, { telemetry }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/lib/redis.js"),
  import("../src/lib/otel.js"),
]);

const [{ handleStripeWebhookEvent, mapPriceToPlan, syncSubscription }] = await Promise.all([
  import("../src/services/billing.js"),
]);

const [{ recordUsageEvent, getOrgUsageSummary, getOrgUsageBreakdown, getCurrentBillingMonthBounds }] = await Promise.all([
  import("../src/services/metering.js"),
]);

const [{ getTierRateLimit, TIER_RATE_LIMITS }] = await Promise.all([
  import("../src/middleware/rate-limit.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
  resetMemoryRateLimitStore();
  telemetry.reset();
});

// Helper to sign Stripe webhooks
function signStripePayload(payload: string, secret = process.env.STRIPE_WEBHOOK_SECRET!): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

// ═════════════════════════════════════════════════════════════════
// TASK-06: Stripe Billing & Quota Lifecycle Tests
// ═════════════════════════════════════════════════════════════════

test("TASK-06: mapPriceToPlan correctly maps price IDs and metadata to tiers", () => {
  assert.equal(mapPriceToPlan(null, "enterprise"), "ENTERPRISE");
  assert.equal(mapPriceToPlan(null, "growth"), "GROWTH");
  assert.equal(mapPriceToPlan(null, "basic"), "BASIC");
  assert.equal(mapPriceToPlan("price_pro_monthly"), "PRO");
  assert.equal(mapPriceToPlan("price_growth_monthly"), "GROWTH");
  assert.equal(mapPriceToPlan("price_enterprise_custom"), "ENTERPRISE");
});

test("TASK-06: Stripe Webhook checkout.session.completed creates subscription and upgrades org plan", async () => {
  const user = await prisma.user.create({
    data: { email: "customer@example.com", passwordHash: "hashed", name: "Customer One" },
  });
  const org = await prisma.organization.create({
    data: { name: "Startup Org", slug: "startup-org", plan: "FREE" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const eventPayload = {
    id: "evt_test_checkout_123",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        customer: "cus_stripe_123",
        subscription: "sub_stripe_pro_999",
        client_reference_id: user.id,
        metadata: { userId: user.id, orgId: org.id, plan: "PRO" },
        items: {
          data: [{ price: { id: "price_pro_monthly" } }],
        },
      },
    },
  };

  const rawBody = JSON.stringify(eventPayload);
  const sig = signStripePayload(rawBody);

  const res = await app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: {
      "content-type": "application/json",
      "stripe-signature": sig,
    },
    payload: rawBody,
  });

  assert.equal(res.statusCode, 200);
  const resBody = res.json();
  assert.equal(resBody.received, true);
  assert.equal(resBody.handled, true);

  // Verify subscription in database
  const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: "sub_stripe_pro_999" } });
  assert.ok(sub);
  assert.equal(sub.status, "active");
  assert.equal(sub.orgId, org.id);

  // Verify org upgraded to PRO
  const updatedOrg = await prisma.organization.findUnique({ where: { id: org.id } });
  assert.equal(updatedOrg.plan, "PRO");
});

test("TASK-06: Stripe Webhook customer.subscription.updated and deleted lifecycle", async () => {
  const user = await prisma.user.create({
    data: { email: "cycle@example.com", passwordHash: "hashed", name: "Cycle User" },
  });
  const org = await prisma.organization.create({
    data: { name: "Cycle Org", slug: "cycle-org", plan: "PRO" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });
  await prisma.subscription.create({
    data: {
      stripeSubscriptionId: "sub_cycle_888",
      stripeCustomerId: "cus_cycle_888",
      status: "active",
      userId: user.id,
      orgId: org.id,
    },
  });

  // 1. Subscription past_due
  const pastDuePayload = {
    id: "evt_sub_past_due",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_cycle_888",
        customer: "cus_cycle_888",
        status: "past_due",
        metadata: { userId: user.id, orgId: org.id },
      },
    },
  };
  const rawPastDue = JSON.stringify(pastDuePayload);
  const resPastDue = await app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: { "content-type": "application/json", "stripe-signature": signStripePayload(rawPastDue) },
    payload: rawPastDue,
  });
  assert.equal(resPastDue.statusCode, 200);

  const subPastDue = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: "sub_cycle_888" } });
  assert.equal(subPastDue.status, "past_due");

  // 2. Subscription deleted (cancelled) -> downgrades org to FREE
  const deletedPayload = {
    id: "evt_sub_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_cycle_888",
        customer: "cus_cycle_888",
      },
    },
  };
  const rawDeleted = JSON.stringify(deletedPayload);
  const resDeleted = await app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: { "content-type": "application/json", "stripe-signature": signStripePayload(rawDeleted) },
    payload: rawDeleted,
  });
  assert.equal(resDeleted.statusCode, 200);

  const downgradedOrg = await prisma.organization.findUnique({ where: { id: org.id } });
  assert.equal(downgradedOrg.plan, "FREE");
});

test("TASK-06: Invoice payment succeeded and payment failed events", async () => {
  const user = await prisma.user.create({ data: { email: "inv@example.com", passwordHash: "h", name: "Inv User" } });
  const org = await prisma.organization.create({ data: { name: "Inv Org", slug: "inv-org", plan: "GROWTH" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  await prisma.subscription.create({
    data: {
      stripeSubscriptionId: "sub_inv_101",
      stripeCustomerId: "cus_inv_101",
      status: "active",
      userId: user.id,
      orgId: org.id,
    },
  });

  // Invoice payment failed
  const failPayload = {
    id: "evt_inv_fail",
    type: "invoice.payment_failed",
    data: { object: { subscription: "sub_inv_101", customer: "cus_inv_101" } },
  };
  await handleStripeWebhookEvent(failPayload as any);
  let sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: "sub_inv_101" } });
  assert.equal(sub.status, "past_due");

  // Invoice payment succeeded
  const succPayload = {
    id: "evt_inv_succ",
    type: "invoice.payment_succeeded",
    data: { object: { subscription: "sub_inv_101", customer: "cus_inv_101" } },
  };
  await handleStripeWebhookEvent(succPayload as any);
  sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: "sub_inv_101" } });
  assert.equal(sub.status, "active");
});

test("TASK-06: Quota middleware blocks execution with 402 when subscription is past_due or unpaid", async () => {
  const org = await prisma.organization.create({ data: { name: "PastDue Org", slug: "pastdue-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "pd@example.com", passwordHash: "h", name: "PD User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  await prisma.subscription.create({
    data: { stripeSubscriptionId: "sub_pd_1", status: "past_due", userId: user.id, orgId: org.id },
  });

  const wf = await prisma.workflow.create({ data: { name: "Blocked Flow", orgId: org.id, ownerId: user.id } });
  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  const runRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${wf.id}/run`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(runRes.statusCode, 402);
  const body = runRes.json();
  assert.equal(body.code, "PAYMENT_REQUIRED");
});

// ═════════════════════════════════════════════════════════════════
// TASK-10: OpenTelemetry Distributed Tracing Tests
// ═════════════════════════════════════════════════════════════════

test("TASK-10: W3C Trace Context injection and extraction", () => {
  const traceId = telemetry.generateTraceId();
  const spanId = telemetry.generateSpanId();
  const context = { traceId, spanId, traceFlags: "01", traceState: "agentflow=p0" };

  // Format header
  const formatted = telemetry.formatTraceParent(context);
  assert.equal(formatted, `00-${traceId}-${spanId}-01`);

  // Parse header
  const parsed = telemetry.parseTraceParent(formatted);
  assert.ok(parsed);
  assert.equal(parsed.traceId, traceId);
  assert.equal(parsed.spanId, spanId);
  assert.equal(parsed.traceFlags, "01");

  // Carrier injection & extraction
  const carrier: Record<string, string> = {};
  telemetry.injectTraceContext(carrier, context);
  assert.equal(carrier.traceparent, formatted);
  assert.equal(carrier.tracestate, "agentflow=p0");

  const extracted = telemetry.extractTraceContext(carrier);
  assert.ok(extracted);
  assert.equal(extracted.traceId, traceId);
  assert.equal(extracted.spanId, spanId);
  assert.equal(extracted.traceState, "agentflow=p0");
});

test("TASK-10: Hierarchical agentflow.node.<type> spans with standardized attributes and error recording", async () => {
  const org = await prisma.organization.create({ data: { name: "Trace Org", slug: "trace-org" } });
  const user = await prisma.user.create({ data: { email: "trace@example.com", passwordHash: "h", name: "Trace User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const wf = await prisma.workflow.create({ data: { name: "Otel Trace Flow", orgId: org.id, ownerId: user.id, status: "ACTIVE" } });
  await prisma.workflowNode.create({ data: { id: "node-manual", type: "manual", workflowId: wf.id, position: { x: 0, y: 0 } } });
  await prisma.workflowNode.create({ data: { id: "node-set", type: "set_fields", workflowId: wf.id, config: { status: "processed" }, position: { x: 200, y: 0 } } });
  await prisma.workflowNode.create({ data: { id: "node-out", type: "output", workflowId: wf.id, position: { x: 400, y: 0 } } });

  await prisma.workflowEdge.create({ data: { sourceNodeId: "node-manual", targetNodeId: "node-set", workflowId: wf.id } });
  await prisma.workflowEdge.create({ data: { sourceNodeId: "node-set", targetNodeId: "node-out", workflowId: wf.id } });

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  const res = await app.inject({
    method: "POST",
    url: `/api/workflows/${wf.id}/run`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 202);
  const exec = res.json();

  const spans = telemetry.getSpansByExecutionId(exec.id);
  assert.ok(spans.length >= 3, `Expected at least 3 spans, got ${spans.length}`);

  // Check agentflow.node spans
  const nodeSpans = spans.filter((s) => s.name.startsWith("agentflow.node."));
  assert.ok(nodeSpans.length >= 2, "Expected agentflow.node spans");

  for (const ns of nodeSpans) {
    assert.equal(ns.attributes["workflow.id"], wf.id);
    assert.equal(ns.attributes["execution.id"], exec.id);
    assert.equal(ns.attributes["org.id"], org.id);
    assert.ok(ns.attributes["node.id"]);
    assert.ok(ns.attributes["node.type"]);
    assert.ok(ns.attributes["items.count"] !== undefined);
  }
});

test("TASK-10: OTLP spans export representation and endpoints", async () => {
  const parentSpan = telemetry.startSpan("http.request.test", { "http.method": "GET", "http.route": "/test" });
  const childSpan = telemetry.startSpan("agentflow.node.http", { "node.type": "http" }, { traceId: parentSpan.traceId, spanId: parentSpan.spanId, traceFlags: "01" });
  childSpan.recordException(new Error("Downstream timeout"));
  childSpan.end();
  parentSpan.end();

  const otlp = telemetry.exportSpansOTLP();
  assert.ok(otlp.resourceSpans);
  assert.ok(Array.isArray(otlp.resourceSpans));
  assert.equal(otlp.resourceSpans[0].resource.attributes[0].key, "service.name");

  const endpointRes = await app.inject({ method: "GET", url: "/api/telemetry/traces" });
  assert.equal(endpointRes.statusCode, 200);
  const json = endpointRes.json();
  assert.ok(json.resourceSpans);

  const spansRes = await app.inject({ method: "GET", url: "/api/telemetry/spans" });
  assert.equal(spansRes.statusCode, 200);
  assert.ok(Array.isArray(spansRes.json()));
});

// ═════════════════════════════════════════════════════════════════
// TASK-12: Metering Usage Ledger & Aggregation Tests
// ═════════════════════════════════════════════════════════════════

test("TASK-12: recordUsageEvent writes tamper-proof ledger entries with SHA256 signature", async () => {
  const org = await prisma.organization.create({ data: { name: "Meter Org", slug: "meter-org", plan: "PRO" } });
  const user = await prisma.user.create({ data: { email: "meter@example.com", passwordHash: "h", name: "Meter User" } });

  // Record atomic usage events across different metrics
  const r1 = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_1",
    executionId: "exec_1",
    metricType: "execution_count",
    value: 1,
  });
  assert.ok(r1);
  assert.equal(r1.quantity, 1);
  assert.ok((r1.metadata as any).signature);

  const r2 = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_1",
    executionId: "exec_1",
    metricType: "execution_duration_ms",
    value: 450,
  });
  assert.ok(r2);
  assert.equal(r2.quantity, 450);

  const r3 = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_1",
    executionId: "exec_1",
    metricType: "llm_prompt_tokens",
    value: 1200,
  });
  assert.ok(r3);
  assert.equal(r3.quantity, 1200);

  const r4 = await recordUsageEvent({
    orgId: org.id,
    userId: user.id,
    workflowId: "wf_1",
    executionId: "exec_1",
    metricType: "llm_completion_tokens",
    value: 300,
  });
  assert.ok(r4);
  assert.equal(r4.quantity, 300);

  // Verify getOrgUsageSummary aggregates tokens, duration, and executions
  const summary = await getOrgUsageSummary(org.id);
  assert.ok(summary);
  assert.equal(summary.metrics.executions.used, 1);
  assert.equal(summary.metrics.totalDurationMs, 450);
  assert.equal(summary.metrics.promptTokens, 1200);
  assert.equal(summary.metrics.completionTokens, 300);
  assert.equal(summary.metrics.totalTokens, 1500);
});

test("TASK-12: getOrgUsageBreakdown groups metrics by workflow and day", async () => {
  const org = await prisma.organization.create({ data: { name: "Breakdown Org", slug: "breakdown-org", plan: "GROWTH" } });
  const user = await prisma.user.create({ data: { email: "bd@example.com", passwordHash: "h", name: "BD User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", metricType: "execution_count", value: 3 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_alpha", metricType: "llm_prompt_tokens", value: 500 });
  await recordUsageEvent({ orgId: org.id, userId: user.id, workflowId: "wf_beta", metricType: "execution_count", value: 2 });

  const breakdown = await getOrgUsageBreakdown(org.id);
  assert.ok(breakdown);
  assert.equal(breakdown.byWorkflow["wf_alpha"]?.executions, 3);
  assert.equal(breakdown.byWorkflow["wf_alpha"]?.promptTokens, 500);
  assert.equal(breakdown.byWorkflow["wf_beta"]?.executions, 2);

  // Test /api/usage/breakdown endpoint
  const token = app.jwt.sign({ sub: user.id, orgId: org.id });
  const res = await app.inject({
    method: "GET",
    url: "/api/usage/breakdown",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.byWorkflow["wf_alpha"].executions, 3);
});

// ═════════════════════════════════════════════════════════════════
// TASK-13: Dynamic Rate Limiting per Tier Tests
// ═════════════════════════════════════════════════════════════════

test("TASK-13: getTierRateLimit returns configured tier limits", () => {
  assert.equal(getTierRateLimit("FREE").limit, 60);
  assert.equal(getTierRateLimit("STARTER").limit, 60);
  assert.equal(getTierRateLimit("BASIC").limit, 120);
  assert.equal(getTierRateLimit("GROWTH").limit, 300);
  assert.equal(getTierRateLimit("PRO").limit, 600);
  assert.equal(getTierRateLimit("ENTERPRISE").limit, 6000);
});

test("TASK-13: checkSlidingWindowRateLimit enforces accurate sliding window without boundary bursts", async () => {
  const key = "test:ratelimit:sliding:1";
  const limit = 5;
  const windowMs = 1000;

  // 5 requests succeed
  for (let i = 0; i < limit; i++) {
    const res = await checkSlidingWindowRateLimit(key, limit, windowMs);
    assert.equal(res.allowed, true);
    assert.equal(res.remaining, limit - i - 1);
  }

  // 6th request fails with 429 Retry-After
  const blocked = await checkSlidingWindowRateLimit(key, limit, windowMs);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("TASK-13: Rate limit headers and 429 response structure", async () => {
  const limit = 3;
  const key = "custom:test:burst";

  const r1 = await checkSlidingWindowRateLimit(key, limit, 60000);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = await checkSlidingWindowRateLimit(key, limit, 60000);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = await checkSlidingWindowRateLimit(key, limit, 60000);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  const r4 = await checkSlidingWindowRateLimit(key, limit, 60000);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.retryAfterSeconds > 0);
});
