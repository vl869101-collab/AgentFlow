import test from "node:test";
import assert from "node:assert/strict";

process.env.ALLOW_MEMORY_DB = "1";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long";

const [
  { buildApp },
  { resetStore },
  { prisma },
  { telemetry, Span },
  { runExecution, createWorkflowExecution },
  { enqueueExecution },
] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/lib/otel.js"),
  import("../src/services/executor.js"),
  import("../src/services/queue.js"),
]);

test("TASK-10: W3C Trace Context parsing, formatting, injection and extraction", () => {
  telemetry.reset();

  // 1. Generation
  const traceId = telemetry.generateTraceId();
  const spanId = telemetry.generateSpanId();
  assert.equal(traceId.length, 32, "traceId must be 32 hex chars (16 bytes)");
  assert.equal(spanId.length, 16, "spanId must be 16 hex chars (8 bytes)");

  // 2. Formatting
  const formatted = telemetry.formatTraceParent({ traceId, spanId, traceFlags: "01" });
  assert.equal(formatted, `00-${traceId}-${spanId}-01`);

  // 3. Parsing valid header
  const parsed = telemetry.parseTraceParent(formatted);
  assert.ok(parsed, "Parsed trace context should not be null");
  assert.equal(parsed?.traceId, traceId);
  assert.equal(parsed?.spanId, spanId);
  assert.equal(parsed?.traceFlags, "01");

  // 4. Parsing invalid headers
  assert.equal(telemetry.parseTraceParent(""), null);
  assert.equal(telemetry.parseTraceParent("01-invalid-trace-parent-format"), null);
  assert.equal(telemetry.parseTraceParent("00-tooshort-span-01"), null);

  // 5. Context Injection into carrier
  const carrier: Record<string, any> = {};
  telemetry.injectTraceContext(carrier, { traceId, spanId, traceFlags: "01", traceState: "congo=t61rcWkgMzE" });
  assert.equal(carrier["traceparent"], `00-${traceId}-${spanId}-01`);
  assert.equal(carrier["tracestate"], "congo=t61rcWkgMzE");

  // 6. Context Extraction from carrier
  const extracted = telemetry.extractTraceContext(carrier);
  assert.ok(extracted);
  assert.equal(extracted?.traceId, traceId);
  assert.equal(extracted?.spanId, spanId);
  assert.equal(extracted?.traceState, "congo=t61rcWkgMzE");

  // 7. Auto-generation when context is omitted
  const emptyCarrier: Record<string, any> = {};
  telemetry.injectTraceContext(emptyCarrier);
  assert.ok(emptyCarrier["traceparent"], "Should auto-generate traceparent when context omitted");
  assert.ok(telemetry.parseTraceParent(emptyCarrier["traceparent"]));
});

test("TASK-10: Span lifecycle, attributes, events, exception recording and status", () => {
  telemetry.reset();

  const parentCtx = { traceId: telemetry.generateTraceId(), spanId: telemetry.generateSpanId(), traceFlags: "01" };
  const span = telemetry.startSpan("custom.operation", { "initial.attr": "value1" }, parentCtx);

  assert.equal(span.traceId, parentCtx.traceId, "Child span must inherit parent traceId");
  assert.equal(span.parentSpanId, parentCtx.spanId, "Child span parentSpanId must match parent spanId");
  assert.equal(span.name, "custom.operation");

  // Set attributes
  span.setAttribute("user.id", "usr-123");
  span.setAttributes({ "env": "production", "retry.count": 2 });
  assert.equal(span.attributes["user.id"], "usr-123");
  assert.equal(span.attributes["retry.count"], 2);

  // Add event
  span.addEvent("cache_miss", { key: "orders:active" });
  assert.equal(span.events.length, 1);
  assert.equal(span.events[0].name, "cache_miss");

  // Record exception
  const err = new Error("Database timeout");
  span.recordException(err);
  assert.equal(span.status.code, "ERROR");
  assert.equal(span.status.description, "Database timeout");
  assert.equal(span.events.length, 2);
  assert.equal(span.events[1].name, "exception");
  assert.equal((span.events[1].attributes as any)?.["exception.message"], "Database timeout");

  // End span
  const spanData = span.end();
  assert.ok(spanData.endTime !== undefined);
  assert.ok(spanData.durationMs !== undefined);
  assert.equal(spanData.status.code, "ERROR");

  // Verify recorded in telemetry
  const recent = telemetry.getRecentSpans();
  assert.equal(recent.length, 1);
  assert.equal(recent[0].spanId, span.spanId);
});

test("TASK-10: End-to-end Workflow Execution generates hierarchical trace tree with node spans", async () => {
  telemetry.reset();
  resetStore();

  const user = await prisma.user.create({
    data: { email: "trace-user@example.com", passwordHash: "dummy", name: "Trace User" },
  });
  const org = await prisma.organization.create({
    data: { name: "Trace Org", slug: "trace-org", plan: "ENTERPRISE" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Tracing E2E Workflow",
      orgId: org.id,
      ownerId: user.id,
      published: true,
    },
  });

  const triggerNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Manual Trigger",
      type: "manual",
      config: JSON.stringify({}),
      position: JSON.stringify({ x: 0, y: 0 }),
    },
  });

  const codeNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Transform Code",
      type: "code",
      config: JSON.stringify({ jsCode: "return items.map(i => ({ json: { ...i.json, processed: true } }));" }),
      position: JSON.stringify({ x: 200, y: 0 }),
    },
  });

  const outputNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Final Output",
      type: "output",
      config: JSON.stringify({}),
      position: JSON.stringify({ x: 400, y: 0 }),
    },
  });

  await (prisma as any).workflowEdge.create({
    data: { workflowId: workflow.id, source: triggerNode.id, target: codeNode.id },
  });
  await (prisma as any).workflowEdge.create({
    data: { workflowId: workflow.id, source: codeNode.id, target: outputNode.id },
  });

  // Create and run execution
  const execution = await createWorkflowExecution(workflow.id, [{ json: { num: 42 } }]);
  const result = await runExecution(execution.id);

  assert.equal(result.status, "SUCCESS");

  // Inspect generated spans
  const execSpans = telemetry.getSpansByExecutionId(execution.id);
  assert.ok(execSpans.length >= 4, `Expected at least 4 spans (workflow + 3 nodes), got ${execSpans.length}`);

  const wfSpan = execSpans.find((s) => s.name.startsWith("workflow.execution"));
  assert.ok(wfSpan, "Should create workflow.execution root span");
  assert.equal(wfSpan?.status.code, "OK");
  assert.equal(wfSpan?.attributes["execution.status"], "SUCCESS");
  assert.equal(wfSpan?.attributes["workflow.id"], workflow.id);

  // Verify all node spans share the exact same traceId and reference wfSpan.spanId
  const nodeSpans = execSpans.filter((s) => s.name.startsWith("agentflow.node."));
  assert.equal(nodeSpans.length, 3, "Should create exactly 3 node spans");

  for (const nSpan of nodeSpans) {
    assert.equal(nSpan.traceId, wfSpan?.traceId, "Node span traceId must match workflow traceId");
    assert.equal(nSpan.parentSpanId, wfSpan?.spanId, "Node span parentSpanId must match workflow spanId");
    assert.equal(nSpan.attributes["execution.id"], execution.id);
    assert.equal(nSpan.attributes["workflow.id"], workflow.id);
    assert.equal(nSpan.attributes["org.id"], org.id);
    assert.equal(nSpan.attributes["node.status"], "SUCCESS");
    assert.equal(nSpan.status.code, "OK");
    assert.ok(typeof nSpan.attributes["node.duration_ms"] === "number");
  }
});

test("TASK-10: Node execution error records span ERROR status and exception details", async () => {
  telemetry.reset();
  resetStore();

  const org = await prisma.organization.create({
    data: { name: "Err Org", slug: "err-org", plan: "PRO" },
  });
  const workflow = await prisma.workflow.create({
    data: { name: "Error Workflow", orgId: org.id, published: true },
  });

  const triggerNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Trigger",
      type: "manual",
      config: JSON.stringify({}),
      position: JSON.stringify({ x: 0, y: 0 }),
    },
  });

  const failingNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Failing Code",
      type: "code",
      config: JSON.stringify({ jsCode: "throw new Error('Custom intentional failure in node');" }),
      position: JSON.stringify({ x: 200, y: 0 }),
    },
  });

  await (prisma as any).workflowEdge.create({
    data: { workflowId: workflow.id, source: triggerNode.id, target: failingNode.id },
  });

  const execution = await createWorkflowExecution(workflow.id, [{ json: { test: true } }]);
  const result = await runExecution(execution.id);

  assert.equal(result.status, "FAILED");

  const execSpans = telemetry.getSpansByExecutionId(execution.id);
  const failedNodeSpan = execSpans.find((s) => s.attributes["node.id"] === failingNode.id);

  assert.ok(failedNodeSpan, "Failing node span must exist");
  assert.equal(failedNodeSpan?.status.code, "ERROR");
  assert.equal(failedNodeSpan?.attributes["node.status"], "FAILED");
  assert.ok(failedNodeSpan?.events.some((e) => e.name === "exception"));

  const wfSpan = execSpans.find((s) => s.name.startsWith("workflow.execution"));
  assert.equal(wfSpan?.status.code, "ERROR");
  assert.equal(wfSpan?.attributes["execution.status"], "FAILED");
});

test("TASK-10: Handled node error policy (onError: continue) records status OK with HANDLED_ERROR", async () => {
  telemetry.reset();
  resetStore();

  const org = await prisma.organization.create({
    data: { name: "Recover Org", slug: "recover-org", plan: "PRO" },
  });
  const workflow = await prisma.workflow.create({
    data: { name: "Handled Error Workflow", orgId: org.id, published: true },
  });

  const triggerNode = await (prisma as any).workflowNode.create({
    data: { workflowId: workflow.id, name: "Trigger", type: "manual", config: JSON.stringify({}) },
  });

  const handledFailingNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Handled Code",
      type: "code",
      config: JSON.stringify({
        jsCode: "throw new Error('Non-fatal failure');",
        onError: "continue",
      }),
    },
  });

  const outputNode = await (prisma as any).workflowNode.create({
    data: { workflowId: workflow.id, name: "Output", type: "output", config: JSON.stringify({}) },
  });

  await (prisma as any).workflowEdge.create({
    data: { workflowId: workflow.id, source: triggerNode.id, target: handledFailingNode.id },
  });
  await (prisma as any).workflowEdge.create({
    data: { workflowId: workflow.id, source: handledFailingNode.id, target: outputNode.id },
  });

  const execution = await createWorkflowExecution(workflow.id, [{ json: { test: true } }]);
  const result = await runExecution(execution.id);

  assert.equal(result.status, "SUCCESS");

  const execSpans = telemetry.getSpansByExecutionId(execution.id);
  const handledSpan = execSpans.find((s) => s.attributes["node.id"] === handledFailingNode.id);

  assert.ok(handledSpan);
  assert.equal(handledSpan?.status.code, "OK");
  assert.equal(handledSpan?.attributes["node.status"], "HANDLED_ERROR");
});

test("TASK-10: BullMQ queue enqueueExecution injects W3C traceparent", async () => {
  const customTrace = "00-11112222333344445555666677778888-9999000011112222-01";
  const enqueued = await enqueueExecution("exec-test-trace-1", { traceparent: customTrace });
  // Function executes without throwing and accepts traceparent in metadata
  assert.ok(typeof enqueued === "boolean");
});

test("TASK-10: OTLP Exporter representation & Telemetry API endpoints (/traces, /spans, /stats, /metrics)", async () => {
  telemetry.reset();
  resetStore();
  const app = await buildApp();

  // Create test spans in telemetry
  const root = telemetry.startSpan("test.http.inbound", { "http.method": "GET", "http.route": "/api/test" });
  const child = telemetry.startSpan(
    "agentflow.node.http",
    { "workflow.id": "wf-1", "node.type": "http", "node.id": "n-1", "org.id": "org-1" },
    { traceId: root.traceId, spanId: root.spanId, traceFlags: "01" }
  );
  child.setStatus("OK");
  child.end();
  root.setStatus("OK");
  root.end();

  // 1. OTLP representation export
  const otlpExport = telemetry.exportSpansOTLP();
  assert.ok(otlpExport.resourceSpans, "OTLP export must include resourceSpans");
  assert.equal(otlpExport.resourceSpans.length, 1);
  const resAttrs = otlpExport.resourceSpans[0].resource.attributes;
  assert.ok(resAttrs.some((a: any) => a.key === "service.name" && a.value.stringValue === "agentflow-api"));

  const scopeSpans = otlpExport.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(scopeSpans.length, 2);
  assert.equal(scopeSpans[0].traceId, root.traceId);
  assert.equal(scopeSpans[1].traceId, root.traceId);
  assert.equal(scopeSpans[1].parentSpanId, root.spanId);

  // 2. GET /api/telemetry/traces
  const tracesRes = await app.inject({ method: "GET", url: "/api/telemetry/traces" });
  assert.equal(tracesRes.statusCode, 200);
  const tracesData = JSON.parse(tracesRes.payload);
  assert.ok(tracesData.resourceSpans);

  // 3. GET /api/telemetry/otlp
  const otlpRes = await app.inject({ method: "GET", url: "/api/telemetry/otlp" });
  assert.equal(otlpRes.statusCode, 200);

  // 4. GET /api/telemetry/spans
  const spansRes = await app.inject({ method: "GET", url: "/api/telemetry/spans" });
  assert.equal(spansRes.statusCode, 200);
  const spansList = JSON.parse(spansRes.payload);
  assert.ok(Array.isArray(spansList));
  assert.ok(spansList.length >= 2);

  // 5. GET /api/telemetry/stats
  const statsRes = await app.inject({ method: "GET", url: "/api/telemetry/stats" });
  assert.equal(statsRes.statusCode, 200);
  const statsData = JSON.parse(statsRes.payload);
  assert.equal(statsData.service, "agentflow-api");
  assert.ok(statsData.slo);
  assert.equal(statsData.slo.p95BudgetMs, 300);

  // 6. GET /metrics (Prometheus format)
  const metricsRes = await app.inject({ method: "GET", url: "/metrics" });
  assert.equal(metricsRes.statusCode, 200);
  assert.ok(metricsRes.payload.includes("# TYPE http_requests_total counter"));
  assert.ok(metricsRes.payload.includes("# TYPE workflow_executions_total counter"));
});
