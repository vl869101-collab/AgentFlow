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
  { convertN8nToAgentflow, importN8nWorkflow },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/server.js"),
  import("@agentflow/shared"),
]);

test.beforeEach(() => {
  resetStore();
});

test("convertN8nToAgentflow is exported and generates unique node IDs across invocations", () => {
  assert.equal(typeof convertN8nToAgentflow, "function");
  assert.equal(convertN8nToAgentflow, importN8nWorkflow);

  const n8nPayload = {
    name: "Duplicate Template",
    nodes: [
      { id: "1", name: "Start Node", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0] },
      { id: "2", name: "End Node", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [200, 0] },
    ],
    connections: {
      "Start Node": { main: [[{ node: "End Node", type: "main", index: 0 }]] },
    },
  };

  const run1 = convertN8nToAgentflow(n8nPayload);
  const run2 = convertN8nToAgentflow(n8nPayload);

  assert.equal(run1.nodes.length, 2);
  assert.equal(run2.nodes.length, 2);

  const ids1 = run1.nodes.map((n) => n.id);
  const ids2 = run2.nodes.map((n) => n.id);

  assert.notEqual(ids1[0], ids2[0], "Node 1 ID must be universally unique across imports");
  assert.notEqual(ids1[1], ids2[1], "Node 2 ID must be universally unique across imports");

  // Edges must correctly resolve to the generated node IDs
  assert.equal(run1.edges[0].sourceNodeId, ids1[0]);
  assert.equal(run1.edges[0].targetNodeId, ids1[1]);
  assert.equal(run2.edges[0].sourceNodeId, ids2[0]);
  assert.equal(run2.edges[0].targetNodeId, ids2[1]);
});

test("FINDING-F2-07: Importing the EXACT same n8n payload twice creates two workflows with HTTP 201 and zero PK collision", async () => {
  const app = await buildApp({ logger: false });

  // 1. Setup user and organization
  const user = await prisma.user.create({
    data: { email: "n8n_importer@example.com", name: "n8n Importer", passwordHash: "dummy" },
  });
  const org = await prisma.organization.create({
    data: { name: "n8n Org", slug: "n8n-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 2. n8n export with fixed static node IDs that caused PK collision when imported twice
  const n8nWorkflowExport = {
    name: "Customer Webhook Pipeline",
    nodes: [
      {
        id: "webhook-node-1",
        name: "Incoming Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 1,
        position: [100, 200],
        parameters: { path: "/customer", httpMethod: "POST" },
      },
      {
        id: "postgres-node-2",
        name: "Save Customer",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2,
        position: [400, 200],
        parameters: { operation: "insert", table: "customers" },
      },
    ],
    connections: {
      "Incoming Webhook": {
        main: [[{ node: "Save Customer", type: "main", index: 0 }]],
      },
    },
  };

  // 3. First Import
  const res1 = await app.inject({
    method: "POST",
    url: "/api/workflows/import",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ n8nJson: n8nWorkflowExport }),
  });

  assert.equal(res1.statusCode, 201, `Expected 201 for first import, got ${res1.statusCode}: ${res1.body}`);
  const body1 = JSON.parse(res1.body);
  assert.ok(body1.workflow?.id, "First workflow must have an ID");
  assert.equal(body1.workflow.name, "Customer Webhook Pipeline");
  assert.equal(body1.workflow.nodes.length, 2);
  assert.equal(body1.workflow.edges.length, 1);

  // 4. Second Import with identical n8n payload (MUST NOT fail with 500 or unique constraint error)
  const res2 = await app.inject({
    method: "POST",
    url: "/api/workflows/import",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ n8nJson: n8nWorkflowExport }),
  });

  assert.equal(res2.statusCode, 201, `Expected 201 for second import, got ${res2.statusCode}: ${res2.body}`);
  const body2 = JSON.parse(res2.body);
  assert.ok(body2.workflow?.id, "Second workflow must have an ID");
  assert.notEqual(body1.workflow.id, body2.workflow.id, "Workflows must have different IDs");
  assert.equal(body2.workflow.name, "Customer Webhook Pipeline");
  assert.equal(body2.workflow.nodes.length, 2);
  assert.equal(body2.workflow.edges.length, 1);

  // Verify node IDs across the two imported workflows are completely disjoint
  const nodeIds1 = new Set(body1.workflow.nodes.map((n: any) => n.id));
  const nodeIds2 = new Set(body2.workflow.nodes.map((n: any) => n.id));
  for (const id of nodeIds1) {
    assert.ok(!nodeIds2.has(id), `Node ID ${id} should not collide across imports`);
  }

  // Verify database persistence
  const allNodes = await prisma.workflowNode.findMany({});
  assert.equal(allNodes.length, 4, "Expected 4 total nodes stored in database across both workflows");

  const allEdges = await prisma.workflowEdge.findMany({});
  assert.equal(allEdges.length, 2, "Expected 2 total edges stored in database across both workflows");

  await app.close();
});
