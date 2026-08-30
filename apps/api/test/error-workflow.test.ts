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

const [{ resetStore }, { prisma }] = await Promise.all([
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const [{ createWorkflowExecution, runExecution }] = await Promise.all([
  import("../src/services/executor.js"),
]);

const [{ ErrorTriggerNodeHandler, ErrorTriggerPayloadSchema }] = await Promise.all([
  import("../src/services/nodes/error-trigger.js"),
]);

test.beforeEach(() => {
  resetStore();
});

test("Error Workflow Trigger: triggers configured errorWorkflow on execution failure", async () => {
  const org = await prisma.organization.create({ data: { name: "Error Org", slug: "error-org" } });
  const user = await prisma.user.create({ data: { email: "err@test.com", passwordHash: "h", name: "Error User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  // 1. Create Error Handler Workflow with an errorTrigger node and a follow-up node
  const errorWf = await prisma.workflow.create({
    data: {
      name: "Global Error Handler",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: {
        create: [
          { id: "err-trig-1", type: "errorTrigger", label: "Catch Error", config: {} },
          { id: "err-act-1", type: "transform", label: "Format Notification", config: {} },
        ],
      },
      edges: {
        create: [
          { id: "err-edge-1", sourceNodeId: "err-trig-1", targetNodeId: "err-act-1" },
        ],
      },
    },
  });

  // 2. Create Main Workflow configured with errorWorkflowId in settings, with a node that will fail
  const mainWf = await prisma.workflow.create({
    data: {
      name: "Main Failing Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: errorWf.id }),
      nodes: {
        create: [
          { id: "node-fail-1", type: "http", label: "HTTP Request", config: { url: "http://invalid-non-existent-domain.test" } },
        ],
      },
    },
  });

  // 3. Execute main workflow
  const execution = await createWorkflowExecution(mainWf.id, { testInput: 123 }, { userId: user.id, trigger: "manual" });
  const result = await runExecution(execution.id);

  assert.equal(result.status, "FAILED");

  // 4. Verify an error execution was created for errorWf with trigger "error"
  const executions = await prisma.workflowExecution.findMany({
    where: { workflowId: errorWf.id },
  });

  assert.equal(executions.length, 1);
  const errExec = executions[0];
  assert.equal(errExec.trigger, "error");
  assert.equal(errExec.orgId, org.id);

  const inputPayload = errExec.input as Record<string, any>;
  assert.ok(inputPayload);
  assert.equal(inputPayload.workflowId, mainWf.id);
  assert.equal(inputPayload.workflowName, mainWf.name);
  assert.equal(inputPayload.executionId, execution.id);
  assert.equal(inputPayload.failedNodeId, "node-fail-1");
  assert.equal(inputPayload.failedNodeType, "http");
  assert.equal(inputPayload.errorCode, "WORKFLOW_EXECUTION_FAILED");
  assert.ok(inputPayload.errorMessage);
  assert.ok(inputPayload.timestamp);
});

test("Error Workflow Payload: builds enriched error payload matching ErrorTriggerPayloadSchema", async () => {
  const handler = new ErrorTriggerNodeHandler();

  const rawErrorPayload = {
    errorMessage: "Connection refused on database port 5432",
    errorCode: "ECONNREFUSED",
    failedNodeId: "postgres-node-99",
    failedNodeType: "postgres",
    workflowId: "wf-main-123",
    executionId: "exec-fail-456",
    retryCount: 3,
    inputData: { query: "SELECT * FROM users" },
    stack: "Error: Connection refused\n    at Socket.<anonymous> (/app/db.ts:12:9)",
    timestamp: "2026-08-30T10:00:00.000Z",
  };

  const parsed = ErrorTriggerPayloadSchema.safeParse(rawErrorPayload);
  assert.equal(parsed.success, true);

  const result = await handler.execute({
    executionId: rawErrorPayload.executionId,
    nodeId: "error-node-1",
    workflowId: "error-wf-1",
    orgId: "org-1",
    nodeConfig: {},
    input: rawErrorPayload,
  });

  assert.equal(result.items.length, 1);
  const captured = result.items[0].json as Record<string, any>;
  assert.equal(captured.errorMessage, "Connection refused on database port 5432");
  assert.equal(captured.errorCode, "ECONNREFUSED");
  assert.equal(captured.failedNodeId, "postgres-node-99");
  assert.equal(captured.failedNodeType, "postgres");
  assert.equal(captured.workflowId, "wf-main-123");
  assert.equal(captured.executionId, "exec-fail-456");
  assert.equal(captured.retryCount, 3);
  assert.deepEqual(captured.inputData, { query: "SELECT * FROM users" });
  assert.ok(captured.stack.includes("Connection refused"));
});

test("Recursion Prevention: prevents recursive loops when error workflow itself fails or targets itself", async () => {
  const org = await prisma.organization.create({ data: { name: "Loop Org", slug: "loop-org" } });
  const user = await prisma.user.create({ data: { email: "loop@test.com", passwordHash: "h", name: "Loop User" } });

  // 1. Workflow that references itself as errorWorkflowId (self-loop prevention)
  const selfLoopWf = await prisma.workflow.create({
    data: {
      name: "Self Loop Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: "will-be-replaced" }),
      nodes: {
        create: [
          { id: "fail-node-self", type: "http", label: "Fail", config: { url: "http://invalid-self.test" } },
        ],
      },
    },
  });

  // Set errorWorkflowId to its own ID
  await prisma.workflow.update({
    where: { id: selfLoopWf.id },
    data: { settings: JSON.stringify({ errorWorkflowId: selfLoopWf.id }) },
  });

  const selfExec = await createWorkflowExecution(selfLoopWf.id, {}, { userId: user.id, trigger: "manual" });
  const selfResult = await runExecution(selfExec.id);
  assert.equal(selfResult.status, "FAILED");

  // Should NOT trigger any new execution for itself
  const selfExecutions = await prisma.workflowExecution.findMany({
    where: { workflowId: selfLoopWf.id },
  });
  assert.equal(selfExecutions.length, 1); // only the initial one

  // 2. Error workflow with trigger === "error" that fails (cascading error execution prevention)
  const errorWf2 = await prisma.workflow.create({
    data: {
      name: "Failing Error Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: "another-err-wf" }),
      nodes: {
        create: [
          { id: "fail-node-2", type: "http", label: "Fail in Error Handler", config: { url: "http://invalid-err.test" } },
        ],
      },
    },
  });

  // Execute directly with trigger: "error" (as if spawned by an error trigger)
  const errExecution = await createWorkflowExecution(errorWf2.id, { error: "Initial failure" }, { userId: user.id, trigger: "error" });
  const errResult = await runExecution(errExecution.id);
  assert.equal(errResult.status, "FAILED");

  // Verify that it did NOT trigger "another-err-wf" because execution.trigger === "error"
  const cascadingExecutions = await prisma.workflowExecution.findMany({
    where: { trigger: "error" },
  });
  // Exactly 1 (the one we created manually, no secondary error workflow was dispatched)
  assert.equal(cascadingExecutions.length, 1);
});
