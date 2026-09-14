import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [{ prisma }, { resetStore }, { createWorkflowExecution, runExecution }] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
]);

test.beforeEach(() => resetStore());

async function createFixtureWorkflow(data: {
  nodes: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; sourceHandle?: string; label?: string }>;
}) {
  const org = await prisma.organization.create({ data: { name: "DAG Dead-Path Org", slug: `dag-org-${Date.now()}-${Math.random()}` } });
  const user = await prisma.user.create({ data: { email: `dag-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "DAG User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return prisma.workflow.create({
    data: {
      name: "DAG Dead-Path Fixture",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: data.nodes.map((node) => ({ ...node, config: node.config ?? {} })) },
      edges: { create: data.edges },
    },
  });
}

test("WF-ENG-01: condition with untaken branch having downstream nodes does not fail with false cycle and downstream executes", async () => {
  // Graph topology:
  // trigger -> condition
  // condition (true)  -> branch_true -> downstream_merge
  // condition (false) -> branch_false_step1 -> branch_false_step2 -> downstream_merge
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "condition", type: "condition", config: { field: "approved", operator: "equals", value: true } },
      { id: "branch_true", type: "set_fields", config: { result: "active_path" } },
      { id: "branch_false_step1", type: "set_fields", config: { result: "dead_path_step1" } },
      { id: "branch_false_step2", type: "set_fields", config: { result: "dead_path_step2" } },
      { id: "downstream_merge", type: "set_fields", config: { finalStatus: "completed" } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "condition" },
      { id: "e2", sourceNodeId: "condition", targetNodeId: "branch_true", sourceHandle: "true" },
      { id: "e3", sourceNodeId: "condition", targetNodeId: "branch_false_step1", sourceHandle: "false" },
      { id: "e4", sourceNodeId: "branch_false_step1", targetNodeId: "branch_false_step2" },
      { id: "e5", sourceNodeId: "branch_true", targetNodeId: "downstream_merge" },
      { id: "e6", sourceNodeId: "branch_false_step2", targetNodeId: "downstream_merge" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, { approved: true }, { trigger: "webhook" });
  const result = await runExecution(execution.id);

  assert.equal(result.status, "SUCCESS", `Execution failed with error: ${result.error}`);

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });

  // Active path executed
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "branch_true")?.status, "SUCCESS");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "downstream_merge")?.status, "SUCCESS");

  // Inactive path properly marked CANCELLED and dead-path eliminated
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "branch_false_step1")?.status, "CANCELLED");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "branch_false_step2")?.status, "CANCELLED");
});

test("WF-ENG-01: multi-step dead branch with no merge terminates cleanly without false cycle error", async () => {
  // Graph topology:
  // trigger -> condition
  // condition (true)  -> active_end
  // condition (false) -> dead_step1 -> dead_step2 -> dead_step3
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "condition", type: "condition", config: { field: "score", operator: "gt", value: 50 } },
      { id: "active_end", type: "set_fields", config: { status: "passed" } },
      { id: "dead_step1", type: "set_fields", config: { status: "dead_1" } },
      { id: "dead_step2", type: "set_fields", config: { status: "dead_2" } },
      { id: "dead_step3", type: "set_fields", config: { status: "dead_3" } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "condition" },
      { id: "e2", sourceNodeId: "condition", targetNodeId: "active_end", sourceHandle: "true" },
      { id: "e3", sourceNodeId: "condition", targetNodeId: "dead_step1", sourceHandle: "false" },
      { id: "e4", sourceNodeId: "dead_step1", targetNodeId: "dead_step2" },
      { id: "e5", sourceNodeId: "dead_step2", targetNodeId: "dead_step3" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, { score: 100 }, { trigger: "webhook" });
  const result = await runExecution(execution.id);

  assert.equal(result.status, "SUCCESS", `Execution failed with error: ${result.error}`);

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "active_end")?.status, "SUCCESS");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "dead_step1")?.status, "CANCELLED");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "dead_step2")?.status, "CANCELLED");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "dead_step3")?.status, "CANCELLED");
});
