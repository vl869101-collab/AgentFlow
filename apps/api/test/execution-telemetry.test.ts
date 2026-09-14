import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  {
    publishTelemetryEvent,
    subscribeToExecutionTelemetry,
    getEventsAfter,
    maskSensitiveData,
    resetTelemetryStore,
  },
  { createWorkflowExecution, runExecution },
  { buildApp },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/execution-telemetry.js"),
  import("../src/services/executor.js"),
  import("../src/server.js"),
]);

test.beforeEach(() => {
  resetStore();
  resetTelemetryStore();
});

test("maskSensitiveData deeply masks secrets and sensitive keys", () => {
  const payload = {
    user: "alice",
    password: "supersecretpassword",
    api_key: "sk-123456",
    nested: {
      authToken: "jwt-token-val",
      private_key: "pem-content",
      safeValue: 42,
    },
    list: [
      { secret: "hidden", publicInfo: "visible" },
      "plain-string",
    ],
  };

  const masked = maskSensitiveData(payload) as any;

  assert.equal(masked.user, "alice");
  assert.equal(masked.password, "***");
  assert.equal(masked.api_key, "***");
  assert.equal(masked.nested.authToken, "***");
  assert.equal(masked.nested.private_key, "***");
  assert.equal(masked.nested.safeValue, 42);
  assert.equal(masked.list[0].secret, "***");
  assert.equal(masked.list[0].publicInfo, "visible");
  assert.equal(masked.list[1], "plain-string");
});

test("publishTelemetryEvent assigns sequential IDs and buffers events", async () => {
  const executionId = "exec-test-1";

  const ev1 = await publishTelemetryEvent({
    executionId,
    eventType: "execution_started",
    status: "RUNNING",
  });

  const ev2 = await publishTelemetryEvent({
    executionId,
    nodeId: "node-1",
    eventType: "node_started",
    status: "RUNNING",
  });

  const ev3 = await publishTelemetryEvent({
    executionId,
    nodeId: "node-1",
    eventType: "node_finished",
    status: "SUCCESS",
    duration: 125,
    output: { result: "ok", token: "secret-token" },
  });

  assert.equal(ev1.id, "exec-test-1:1");
  assert.equal(ev1.seq, 1);
  assert.equal(ev2.id, "exec-test-1:2");
  assert.equal(ev2.seq, 2);
  assert.equal(ev3.id, "exec-test-1:3");
  assert.equal(ev3.seq, 3);
  assert.equal(ev3.duration, 125);
  assert.deepEqual(ev3.output, { result: "ok", token: "***" });

  const all = getEventsAfter(executionId);
  assert.equal(all.length, 3);
  assert.equal(all[0].id, "exec-test-1:1");
  assert.equal(all[2].id, "exec-test-1:3");

  const replayAfter1 = getEventsAfter(executionId, "exec-test-1:1");
  assert.equal(replayAfter1.length, 2);
  assert.equal(replayAfter1[0].id, "exec-test-1:2");
  assert.equal(replayAfter1[1].id, "exec-test-1:3");

  const replayAfter3 = getEventsAfter(executionId, "exec-test-1:3");
  assert.equal(replayAfter3.length, 0);
});

test("subscribeToExecutionTelemetry receives real-time events and unsubscribes cleanly", async () => {
  const executionId = "exec-test-stream";
  const received: any[] = [];

  const unsubscribe = await subscribeToExecutionTelemetry(executionId, (event) => {
    received.push(event);
  });

  await publishTelemetryEvent({
    executionId,
    eventType: "execution_started",
    status: "RUNNING",
  });

  await publishTelemetryEvent({
    executionId,
    nodeId: "node-a",
    eventType: "node_started",
    status: "RUNNING",
  });

  assert.equal(received.length, 2);
  assert.equal(received[0].eventType, "execution_started");
  assert.equal(received[1].nodeId, "node-a");

  await unsubscribe();

  await publishTelemetryEvent({
    executionId,
    eventType: "execution_finished",
    status: "SUCCESS",
  });

  assert.equal(received.length, 2); // No new events after unsubscribe
});

test("runExecution emits execution_started, node lifecycle events, and execution_finished", async () => {
  const org = await prisma.organization.create({
    data: { name: "Telemetry Org", slug: `telem-org-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `telem-${Date.now()}@test.local`, passwordHash: "hash", name: "Telemetry User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Telemetry Test Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: {
        create: [
          { id: "node-start", type: "webhook", label: "Start Node" },
          {
            id: "node-calc",
            type: "set_fields",
            label: "Set Fields",
            config: { processed: true, secretKey: "leaked_secret" },
          },
        ],
      },
      edges: {
        create: [
          { id: "edge-1", sourceNodeId: "node-start", targetNodeId: "node-calc" },
        ],
      },
    },
  });

  const execution = await createWorkflowExecution(workflow.id, {
    triggerType: "MANUAL",
    input: { test: true },
    userId: user.id,
    orgId: org.id,
  });

  const capturedEvents: any[] = [];
  const unsubscribe = await subscribeToExecutionTelemetry(execution.id, (event) => {
    capturedEvents.push(event);
  });

  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  await unsubscribe();

  // Verify telemetry events were generated
  assert.ok(capturedEvents.length >= 4, `Expected at least 4 events, got ${capturedEvents.length}`);

  const types = capturedEvents.map((e) => e.eventType);
  assert.ok(types.includes("execution_started"), "Missing execution_started");
  assert.ok(types.includes("node_started"), "Missing node_started");
  assert.ok(types.includes("node_finished"), "Missing node_finished");
  assert.ok(types.includes("execution_finished"), "Missing execution_finished");

  const execFinished = capturedEvents.find((e) => e.eventType === "execution_finished");
  assert.equal(execFinished.status, "SUCCESS");
  assert.ok(typeof execFinished.duration === "number");

  // Verify buffer replay captures the identical sequence
  const buffered = getEventsAfter(execution.id);
  assert.equal(buffered.length, capturedEvents.length);
  assert.equal(buffered[buffered.length - 1].eventType, "execution_finished");
});

test("GET /api/executions/:id/stream supports query token authentication and SSE replay", async () => {
  const app = await buildApp({ logger: false });

  const org = await prisma.organization.create({
    data: { name: "SSE Test Org", slug: `sse-org-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `sse-${Date.now()}@test.local`, passwordHash: "hash", name: "SSE User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "SSE Test Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: [{ id: "n1", type: "webhook" }] },
      edges: { create: [] },
    },
  });

  const execution = await createWorkflowExecution(workflow.id, {
    triggerType: "MANUAL",
    input: {},
    userId: user.id,
    orgId: org.id,
  });

  // Pre-seed some telemetry events in buffer
  await publishTelemetryEvent({
    executionId: execution.id,
    eventType: "execution_started",
    status: "RUNNING",
  });
  await publishTelemetryEvent({
    executionId: execution.id,
    nodeId: "n1",
    eventType: "node_started",
    status: "RUNNING",
  });
  await publishTelemetryEvent({
    executionId: execution.id,
    nodeId: "n1",
    eventType: "node_finished",
    status: "SUCCESS",
    duration: 50,
  });

  // Mark execution as completed so stream closes automatically after replay
  await prisma.workflowExecution.update({
    where: { id: execution.id },
    data: { status: "SUCCESS", finishedAt: new Date() },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // Request with query token and replay from sequence 1 (skipping execution_started)
  const response = await app.inject({
    method: "GET",
    url: `/api/executions/${execution.id}/stream?token=${token}&lastEventId=${execution.id}:1`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/event-stream");

  const body = response.body;
  assert.ok(body.includes("event: node_started"));
  assert.ok(body.includes("event: node_finished"));
  assert.ok(body.includes("event: execution_finished"));
  assert.ok(!body.includes("event: execution_started"));
});
