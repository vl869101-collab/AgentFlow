import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { buildApp },
  { telemetry, Span },
  { runExecution, createWorkflowExecution },
  { enqueueExecution },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/server.js"),
  import("../src/lib/otel.js"),
  import("../src/services/executor.js"),
  import("../src/services/queue.js"),
]);

test.beforeEach(() => {
  resetStore();
  telemetry.reset();
});

test.afterEach(() => {
  telemetry.reset();
});

async function createTestFixture() {
  const org = await prisma.organization.create({
    data: {
      name: "Tracing Test Org",
      slug: `trace-org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `trace-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "hash",
      name: "Trace User",
    },
  });
  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      orgId: org.id,
      role: "OWNER",
    },
  });
  return { org, user };
}

test("WF-ENG Item 7: W3C TraceContext parser strict conformance and fallback", () => {
  // 1. Valid standard W3C header
  const validHeader = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const parsedValid = telemetry.parseTraceParent(validHeader);
  assert.ok(parsedValid, "Valid W3C header must be parsed");
  assert.equal(parsedValid?.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(parsedValid?.spanId, "00f067aa0ba902b7");
  assert.equal(parsedValid?.traceFlags, "01");

  // 2. All-zero traceId must be rejected
  const allZeroTrace = "00-00000000000000000000000000000000-00f067aa0ba902b7-01";
  assert.equal(telemetry.parseTraceParent(allZeroTrace), null, "All-zero traceId must be rejected per W3C spec");

  // 3. All-zero spanId must be rejected
  const allZeroSpan = "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01";
  assert.equal(telemetry.parseTraceParent(allZeroSpan), null, "All-zero spanId must be rejected per W3C spec");

  // 4. Invalid version (not 00)
  const invalidVersion = "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  assert.equal(telemetry.parseTraceParent(invalidVersion), null, "Unsupported version must be rejected");

  // 5. Malformed parts count (3 parts or 5 parts)
  assert.equal(telemetry.parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7"), null);
  assert.equal(telemetry.parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra"), null);

  // 6. Non-hex characters
  assert.equal(telemetry.parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e47zz-00f067aa0ba902b7-01"), null);

  // 7. getOrCreateTraceParent fallback for invalid or missing headers
  const fallbackFromNull = telemetry.getOrCreateTraceParent(null);
  assert.ok(fallbackFromNull.traceparent);
  assert.equal(fallbackFromNull.context.traceId.length, 32);
  assert.equal(fallbackFromNull.context.spanId.length, 16);
  assert.notEqual(fallbackFromNull.context.traceId, "00000000000000000000000000000000");

  const fallbackFromMalformed = telemetry.getOrCreateTraceParent("invalid-garbage");
  assert.ok(fallbackFromMalformed.traceparent.startsWith("00-"));
  assert.ok(telemetry.parseTraceParent(fallbackFromMalformed.traceparent));

  const preservedFromValid = telemetry.getOrCreateTraceParent(validHeader);
  assert.equal(preservedFromValid.context.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(preservedFromValid.context.spanId, "00f067aa0ba902b7");
});

test("WF-ENG Item 7: End-to-end trace context propagation across DAG execution", async () => {
  const { org, user } = await createTestFixture();

  const workflow = await prisma.workflow.create({
    data: {
      name: "Trace Propagation DAG",
      orgId: org.id,
      ownerId: user.id,
      nodes: {
        create: [
          {
            id: "trigger_1",
            type: "trigger",
            name: "Trigger Node",
            config: {},
          },
          {
            id: "condition_1",
            type: "condition",
            name: "Condition Node",
            config: {
              field: "active",
              operator: "equals",
              value: true,
            },
          },
          {
            id: "output_1",
            type: "output",
            name: "Output Node",
            config: {},
          },
        ],
      },
      edges: {
        create: [
          { source: "trigger_1", target: "condition_1" },
          { source: "condition_1", target: "output_1" },
        ],
      },
    },
  });

  const incomingTraceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const incomingContext = telemetry.parseTraceParent(incomingTraceParent)!;

  const execution = await createWorkflowExecution(workflow.id, { active: true }, {
    userId: user.id,
    trigger: "api",
  });

  const res = await runExecution(execution.id, {
    traceparent: incomingTraceParent,
    parentContext: incomingContext,
  });

  assert.equal(res.status, "SUCCESS");

  const recordedSpans = telemetry.getSpansByExecutionId(execution.id);
  assert.ok(recordedSpans.length >= 3, `Expected at least 3 node spans, got ${recordedSpans.length}`);

  // Every single node in the execution DAG must share the EXACT incoming traceId
  for (const span of recordedSpans) {
    assert.equal(
      span.traceId,
      "4bf92f3577b34da6a3ce929d0e0e4736",
      `Node span "${span.name}" must have traceId matching incoming request`
    );
    assert.ok(span.parentSpanId, `Node span "${span.name}" must have a parentSpanId`);
  }

  // The workflow execution span must also share the exact incoming traceId
  const allSpansForTrace = telemetry.getSpansByTraceId("4bf92f3577b34da6a3ce929d0e0e4736");
  const wfExecutionSpan = allSpansForTrace.find((s) => s.name.startsWith("workflow.execution"));
  assert.ok(wfExecutionSpan, "Workflow execution root span must exist");
  assert.equal(wfExecutionSpan?.parentSpanId, "00f067aa0ba902b7");
});

test("WF-ENG Item 7: HTTP ingress route extraction and propagation with valid traceparent header", async () => {
  const { org, user } = await createTestFixture();
  const app = await buildApp();

  const workflow = await prisma.workflow.create({
    data: {
      name: "Ingress Tracing Test Flow",
      orgId: org.id,
      ownerId: user.id,
      nodes: {
        create: [
          { id: "trig", type: "trigger", name: "Start", config: {} },
          { id: "out", type: "output", name: "End", config: {} },
        ],
      },
      edges: {
        create: [{ source: "trig", target: "out" }],
      },
    },
  });

  const clientTraceParent = "00-11112222333344445555666677778888-aaaabbbbccccdddd-01";

  const token = (app as any).jwt.sign({
    sub: user.id,
    id: user.id,
    userId: user.id,
    email: user.email,
    orgId: org.id,
    role: "OWNER",
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/executions/trigger",
    headers: {
      authorization: `Bearer ${token}`,
      "x-user-id": user.id,
      "x-org-id": org.id,
      traceparent: clientTraceParent,
    },
    payload: {
      workflowId: workflow.id,
      input: { ping: "pong" },
      trigger: "api",
    },
  });

  assert.equal(response.statusCode, 202);
  const data = JSON.parse(response.body);
  assert.ok(data.id);

  // Check that the execution executed with the traceId from clientTraceParent
  const spans = telemetry.getSpansByTraceId("11112222333344445555666677778888");
  assert.ok(spans.length > 0, "Spans must be recorded with the propagated traceId from HTTP ingress");
  assert.ok(spans.some((s) => s.attributes["execution.id"] === data.id));
});

test("WF-ENG Item 7: HTTP ingress generates new valid traceparent when header is missing or invalid", async () => {
  const { org, user } = await createTestFixture();
  const app = await buildApp();

  const workflow = await prisma.workflow.create({
    data: {
      name: "Ingress Fallback Tracing Flow",
      orgId: org.id,
      ownerId: user.id,
      nodes: {
        create: [{ id: "t1", type: "trigger", name: "Start", config: {} }],
      },
    },
  });

  const token = (app as any).jwt.sign({
    sub: user.id,
    id: user.id,
    userId: user.id,
    email: user.email,
    orgId: org.id,
    role: "OWNER",
  });

  // 1. Missing header
  const resMissing = await app.inject({
    method: "POST",
    url: "/api/executions/trigger",
    headers: {
      authorization: `Bearer ${token}`,
      "x-user-id": user.id,
      "x-org-id": org.id,
    },
    payload: {
      workflowId: workflow.id,
      input: { mode: "missing" },
    },
  });
  assert.equal(resMissing.statusCode, 202);
  const dataMissing = JSON.parse(resMissing.body);
  const spansMissing = telemetry.getSpansByExecutionId(dataMissing.id);
  assert.ok(spansMissing.length > 0, "Spans should exist for execution with missing trace header");
  const generatedTraceId = spansMissing[0].traceId;
  assert.equal(generatedTraceId.length, 32);
  assert.notEqual(generatedTraceId, "00000000000000000000000000000000");

  // 2. Malformed / invalid header
  const resMalformed = await app.inject({
    method: "POST",
    url: "/api/executions/trigger",
    headers: {
      authorization: `Bearer ${token}`,
      "x-user-id": user.id,
      "x-org-id": org.id,
      traceparent: "00-malformed-all-zeroes-0000000000000000-invalid",
    },
    payload: {
      workflowId: workflow.id,
      input: { mode: "malformed" },
    },
  });
  assert.equal(resMalformed.statusCode, 202);
  const dataMalformed = JSON.parse(resMalformed.body);
  const spansMalformed = telemetry.getSpansByExecutionId(dataMalformed.id);
  assert.ok(spansMalformed.length > 0, "Spans should exist for execution with malformed trace header");
  assert.equal(spansMalformed[0].traceId.length, 32);
  assert.notEqual(spansMalformed[0].traceId, "00000000000000000000000000000000");
});

test("WF-ENG Item 7: Outgoing HTTP nodes inject active traceContext into headers", () => {
  const activeTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const activeSpanId = "00f067aa0ba902b7";

  const nodeSpan = new Span("agentflow.node.http", activeTraceId, activeSpanId, undefined, {
    "node.id": "http_1",
  });

  const outboundHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  telemetry.injectTraceContext(outboundHeaders, nodeSpan);

  assert.ok(outboundHeaders["traceparent"]);
  assert.equal(outboundHeaders["traceparent"], `00-${activeTraceId}-${activeSpanId}-01`);

  const parsed = telemetry.parseTraceParent(outboundHeaders["traceparent"]);
  assert.equal(parsed?.traceId, activeTraceId);
  assert.equal(parsed?.spanId, activeSpanId);
});
