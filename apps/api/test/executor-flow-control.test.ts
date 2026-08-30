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
  const org = await prisma.organization.create({ data: { name: "Flow Test Org", slug: `flow-test-${Date.now()}-${Math.random()}` } });
  const user = await prisma.user.create({ data: { email: `flow-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "Flow Test" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return prisma.workflow.create({
    data: {
      name: "Flow control fixture",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: data.nodes.map((node) => ({ ...node, config: node.config ?? {} })) },
      edges: { create: data.edges },
    },
  });
}

test("executeGraph routes condition edges and marks the inactive branch cancelled", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "condition", type: "condition", config: { field: "approved", operator: "equals", value: true } },
      { id: "yes", type: "set_fields", config: { result: "yes" } },
      { id: "no", type: "set_fields", config: { result: "no" } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "condition" },
      { id: "e2", sourceNodeId: "condition", targetNodeId: "yes", sourceHandle: "true" },
      { id: "e3", sourceNodeId: "condition", targetNodeId: "no", sourceHandle: "false" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, { approved: true }, { trigger: "webhook" });
  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.output, { result: "yes" });

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "yes")?.status, "SUCCESS");
  assert.equal(nodeExecutions.find((item: any) => item.nodeId === "no")?.status, "CANCELLED");
});

test("executeGraph retries a node using maxTries and fixed backoff", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "retry", type: "http", config: { url: "http://127.0.0.1:1", retryOnFail: true, maxTries: 3, waitBetweenTries: 1, backoff: "fixed" } },
    ],
    edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "retry" }],
  });

  const execution = await createWorkflowExecution(workflow.id, {}, { trigger: "webhook" });
  const result = await runExecution(execution.id);
  assert.equal(result.status, "FAILED");
  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const retryExecution = nodeExecutions.find((item: any) => item.nodeId === "retry");
  assert.equal(retryExecution?.retryCount, 2);
});
