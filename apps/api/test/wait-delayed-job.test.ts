import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createWorkflowExecution, runExecution },
  { calculateWaitMs, isWaitNode, WaitNodeHandler },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
  import("../src/services/nodes/wait.js"),
]);

test.beforeEach(() => {
  resetStore();
});

async function createWaitFixture(
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string }>,
) {
  const org = await prisma.organization.create({
    data: { name: "Wait Test Org", slug: `wait-org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const user = await prisma.user.create({
    data: { email: `wait-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, passwordHash: "hash", name: "Wait User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Wait Delayed Job Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: nodes.map((n) => ({ ...n, config: n.config ?? {} })) },
      edges: { create: edges },
    },
  });

  return { org, user, workflow };
}

test("calculateWaitMs: correctly converts all units and dates without blocking", () => {
  assert.equal(calculateWaitMs({ duration: 50, unit: "ms" }), 50);
  assert.equal(calculateWaitMs({ duration: 50, unit: "milliseconds" }), 50);
  assert.equal(calculateWaitMs({ duration: 2, unit: "seconds" }), 2000);
  assert.equal(calculateWaitMs({ duration: 5, unit: "minutes" }), 300000);
  assert.equal(calculateWaitMs({ duration: 1, unit: "hours" }), 3600000);
  assert.equal(calculateWaitMs({ duration: 1, unit: "days" }), 86400000);

  const future = new Date(Date.now() + 5000).toISOString();
  const waitMs = calculateWaitMs({ mode: "fixedDate", fixedDate: future });
  assert.ok(waitMs > 0 && waitMs <= 5000);

  assert.equal(isWaitNode("wait"), true);
  assert.equal(isWaitNode("delay"), true);
  assert.equal(isWaitNode("http"), false);
});

test("WF-ENG Item 4: Duration wait suspends execution to WAITING and records checkpoint", async () => {
  const { workflow } = await createWaitFixture(
    [
      { id: "trg", type: "webhook" },
      { id: "step1", type: "set_fields", config: { processedStep1: true } },
      { id: "wait1", type: "wait", config: { duration: 40, unit: "ms" } },
      { id: "step2", type: "set_fields", config: { processedStep2: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "step1" },
      { id: "e2", sourceNodeId: "step1", targetNodeId: "wait1" },
      { id: "e3", sourceNodeId: "wait1", targetNodeId: "step2" },
    ],
  );

  const execution = await createWorkflowExecution(workflow.id, { test: "start" }, { trigger: "webhook" });
  const suspended = await runExecution(execution.id);

  // 1. Must suspend with WAITING status
  assert.equal(suspended.status, "WAITING");

  // 2. Step 1 must have completed successfully
  const nodeExecs = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const step1Exec = nodeExecs.find((n: any) => n.nodeId === "step1");
  assert.ok(step1Exec, "step1 execution must exist");
  assert.equal(step1Exec.status, "SUCCESS");

  // 3. Wait node and Step 2 must NOT have completed yet
  const waitExec = nodeExecs.find((n: any) => n.nodeId === "wait1");
  const step2Exec = nodeExecs.find((n: any) => n.nodeId === "step2");
  assert.equal(waitExec, undefined, "wait node must not have finished execution yet");
  assert.equal(step2Exec, undefined, "step2 must not have executed while suspended");

  // 4. Pending wait approval record must exist in database
  const approvals = await prisma.approval.findMany({ where: { executionId: execution.id } });
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].status, "PENDING");
  assert.equal((approvals[0].context as any)?.waitNode, true);
  assert.equal((approvals[0].context as any)?.waitMs, 40);

  // 5. Wait for delay to elapse (40ms + buffer)
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 6. Check that execution resumed automatically or can be resumed from checkpoint
  let resumed = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  if (resumed?.status !== "SUCCESS") {
    resumed = await runExecution(execution.id);
  }

  assert.equal(resumed?.status, "SUCCESS");

  // 7. Verify all nodes completed
  const allNodeExecs = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const finalWaitExec = allNodeExecs.find((n: any) => n.nodeId === "wait1");
  const finalStep2Exec = allNodeExecs.find((n: any) => n.nodeId === "step2");
  assert.equal(finalWaitExec?.status, "SUCCESS");
  assert.equal(finalStep2Exec?.status, "SUCCESS");

  // 8. Verify step1 was executed exactly once (idempotent checkpoint replay)
  const step1Execs = allNodeExecs.filter((n: any) => n.nodeId === "step1");
  assert.equal(step1Execs.length, 1);
});

test("WF-ENG Item 4: FixedDate wait mode suspends and resumes after target date", async () => {
  const targetDate = new Date(Date.now() + 50).toISOString();
  const { workflow } = await createWaitFixture(
    [
      { id: "trg", type: "webhook" },
      { id: "wait_date", type: "wait", config: { mode: "fixedDate", fixedDate: targetDate } },
      { id: "step_after", type: "set_fields", config: { afterDate: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "wait_date" },
      { id: "e2", sourceNodeId: "wait_date", targetNodeId: "step_after" },
    ],
  );

  const execution = await createWorkflowExecution(workflow.id, { init: true });
  const suspended = await runExecution(execution.id);
  assert.equal(suspended.status, "WAITING");

  // Wait for the fixed target date to elapse
  await new Promise((resolve) => setTimeout(resolve, 90));

  let resumed = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  if (resumed?.status !== "SUCCESS") {
    resumed = await runExecution(execution.id);
  }

  assert.equal(resumed?.status, "SUCCESS");
  const nodeExecs = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  assert.equal(nodeExecs.find((n: any) => n.nodeId === "step_after")?.status, "SUCCESS");
});

test("WF-ENG Item 4: Legacy 'delay' type node is unified with 'wait' handler and suspends", async () => {
  const { workflow } = await createWaitFixture(
    [
      { id: "trg", type: "webhook" },
      { id: "legacy_delay", type: "delay", config: { duration: 30, unit: "ms" } },
      { id: "step_end", type: "set_fields", config: { delayed: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "legacy_delay" },
      { id: "e2", sourceNodeId: "legacy_delay", targetNodeId: "step_end" },
    ],
  );

  const execution = await createWorkflowExecution(workflow.id, {});
  const suspended = await runExecution(execution.id);
  assert.equal(suspended.status, "WAITING");

  await new Promise((resolve) => setTimeout(resolve, 70));

  let resumed = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  if (resumed?.status !== "SUCCESS") {
    resumed = await runExecution(execution.id);
  }

  assert.equal(resumed?.status, "SUCCESS");
});
