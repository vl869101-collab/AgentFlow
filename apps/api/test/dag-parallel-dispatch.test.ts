import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createWorkflowExecution, runExecution, executeGraph },
  { createConcurrencyPool },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
  import("../src/services/executor/concurrency-pool.js"),
]);

test.beforeEach(() => resetStore());

async function createFixtureWorkflow(data: {
  nodes: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; sourceHandle?: string; label?: string }>;
  settings?: Record<string, unknown>;
}) {
  const org = await prisma.organization.create({
    data: { name: "DAG Test Org", slug: `dag-test-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: { email: `dag-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "DAG Test" },
  });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return prisma.workflow.create({
    data: {
      name: "DAG parallel dispatch fixture",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: data.settings ?? {},
      nodes: { create: data.nodes.map((node) => ({ ...node, config: node.config ?? {} })) },
      edges: { create: data.edges },
    },
  });
}

test("concurrency pool limits active tasks and handles clearQueue safely", async () => {
  const pool = createConcurrencyPool(2);
  assert.equal(pool.concurrency, 2);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.pendingCount, 0);

  let activeAtPeak = 0;
  const task = async (delayMs: number) => {
    return pool(async () => {
      activeAtPeak = Math.max(activeAtPeak, pool.activeCount);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return pool.activeCount;
    });
  };

  const p1 = task(50);
  const p2 = task(50);
  const p3 = task(50);

  assert.equal(pool.activeCount, 2);
  assert.equal(pool.pendingCount, 1);

  await Promise.all([p1, p2, p3]);
  assert.equal(activeAtPeak, 2);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.pendingCount, 0);

  // Test clearQueue
  const pool2 = createConcurrencyPool(1);
  const blocker = pool2(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  const queued1 = pool2(async () => "queued1");
  const queued2 = pool2(async () => "queued2");
  assert.equal(pool2.pendingCount, 2);

  pool2.clearQueue(new Error("custom cancel"));
  await assert.rejects(queued1, /custom cancel/);
  await assert.rejects(queued2, /custom cancel/);
  await blocker;
  assert.equal(pool2.activeCount, 0);
  assert.equal(pool2.pendingCount, 0);
});

test("WF-ENG-02: 3 parallel branches with 1000ms delay each finish in <1500ms total execution time", async () => {
  // Graph structure:
  // trigger -> wait1 (1000ms) \
  //         -> wait2 (1000ms)  -> merge -> output
  //         -> wait3 (1000ms) /
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "wait1", type: "wait", config: { mode: "inline", duration: 1000, unit: "ms" } },
      { id: "wait2", type: "wait", config: { mode: "inline", duration: 1000, unit: "ms" } },
      { id: "wait3", type: "wait", config: { mode: "inline", duration: 1000, unit: "ms" } },
      { id: "merge", type: "merge" },
      { id: "output", type: "output" },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "wait1" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "wait2" },
      { id: "e3", sourceNodeId: "trigger", targetNodeId: "wait3" },
      { id: "e4", sourceNodeId: "wait1", targetNodeId: "merge" },
      { id: "e5", sourceNodeId: "wait2", targetNodeId: "merge" },
      { id: "e6", sourceNodeId: "wait3", targetNodeId: "merge" },
      { id: "e7", sourceNodeId: "merge", targetNodeId: "output" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, { test: "parallel-dag" }, { trigger: "webhook" });

  const startTime = Date.now();
  const result = await runExecution(execution.id);
  const totalDuration = Date.now() - startTime;

  assert.equal(result.status, "SUCCESS");

  // 3 sequential 1000ms nodes would take >= 3000ms.
  // In parallel dispatch with concurrency >= 3, total time is ~1000ms-1200ms (< 1500ms).
  assert.ok(
    totalDuration < 1500,
    `Expected parallel execution duration < 1500ms, but took ${totalDuration}ms`
  );

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  assert.equal(nodeExecutions.length, 6); // trigger, wait1, wait2, wait3, merge, output
  const wait1 = nodeExecutions.find((ne: any) => ne.nodeId === "wait1");
  const wait2 = nodeExecutions.find((ne: any) => ne.nodeId === "wait2");
  const wait3 = nodeExecutions.find((ne: any) => ne.nodeId === "wait3");
  assert.equal(wait1?.status, "SUCCESS");
  assert.equal(wait2?.status, "SUCCESS");
  assert.equal(wait3?.status, "SUCCESS");
});

test("WF-ENG-02: respects maxParallelNodes / maxConcurrency configuration setting", async () => {
  // With maxParallelNodes: 2, running 4 branches of 300ms each must run in 2 waves, taking >= 600ms.
  // With maxParallelNodes: 4, it takes ~300ms (< 550ms).
  const workflowPool2 = await createFixtureWorkflow({
    settings: { maxParallelNodes: 2 },
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "b1", type: "wait", config: { mode: "inline", duration: 300, unit: "ms" } },
      { id: "b2", type: "wait", config: { mode: "inline", duration: 300, unit: "ms" } },
      { id: "b3", type: "wait", config: { mode: "inline", duration: 300, unit: "ms" } },
      { id: "b4", type: "wait", config: { mode: "inline", duration: 300, unit: "ms" } },
      { id: "merge", type: "merge" },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "b1" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "b2" },
      { id: "e3", sourceNodeId: "trigger", targetNodeId: "b3" },
      { id: "e4", sourceNodeId: "trigger", targetNodeId: "b4" },
      { id: "e5", sourceNodeId: "b1", targetNodeId: "merge" },
      { id: "e6", sourceNodeId: "b2", targetNodeId: "merge" },
      { id: "e7", sourceNodeId: "b3", targetNodeId: "merge" },
      { id: "e8", sourceNodeId: "b4", targetNodeId: "merge" },
    ],
  });

  const exec2 = await createWorkflowExecution(workflowPool2.id, {}, { trigger: "webhook" });
  const start2 = Date.now();
  const res2 = await runExecution(exec2.id);
  const dur2 = Date.now() - start2;
  assert.equal(res2.status, "SUCCESS");
  assert.ok(
    dur2 >= 550,
    `Expected maxParallelNodes=2 to take >= 550ms (2 waves of 300ms), took ${dur2}ms`
  );
});

test("WF-ENG-02: downstream nodes receive merged outputs from parallel upstream branches", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "branchA", type: "set_fields", config: { keyA: "valA" } },
      { id: "branchB", type: "set_fields", config: { keyB: "valB" } },
      { id: "merge", type: "merge" },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "branchA" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "branchB" },
      { id: "e3", sourceNodeId: "branchA", targetNodeId: "merge" },
      { id: "e4", sourceNodeId: "branchB", targetNodeId: "merge" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, { initial: true }, { trigger: "webhook" });
  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const mergeExec = nodeExecutions.find((ne: any) => ne.nodeId === "merge");
  assert.equal(mergeExec?.status, "SUCCESS");
  // Merge node receives inputs from both branchA and branchB
  const mergeInput = mergeExec?.input;
  assert.ok(Array.isArray(mergeInput));
  assert.equal(mergeInput.length, 2);
});

test("WF-ENG-02: fatal node error in one branch cancels pending queue cleanly", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "goodBranch", type: "wait", config: { mode: "duration", duration: 100, unit: "ms" } },
      { id: "badBranch", type: "http", config: { url: "http://127.0.0.1:1" } }, // invalid connection throws
      { id: "afterBad", type: "set_fields", config: { shouldNotRun: true } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "goodBranch" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "badBranch" },
      { id: "e3", sourceNodeId: "badBranch", targetNodeId: "afterBad" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, {}, { trigger: "webhook" });
  const result = await runExecution(execution.id);
  assert.equal(result.status, "FAILED");

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const afterBad = nodeExecutions.find((ne: any) => ne.nodeId === "afterBad");
  assert.equal(afterBad, undefined, "Downstream node of failed branch must not have run");
});
