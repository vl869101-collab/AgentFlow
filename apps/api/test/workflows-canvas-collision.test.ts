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
  { toScopedId, fromScopedId },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/server.js"),
  import("../src/routes/workflows.js"),
]);

test.beforeEach(() => {
  resetStore();
});

test("toScopedId and fromScopedId helper functions work correctly and idempotently", () => {
  const wId = "wf-123";
  assert.equal(toScopedId(wId, "n1"), "wf-123:n1");
  assert.equal(toScopedId(wId, "wf-123:n1"), "wf-123:n1", "idempotent when already scoped");
  assert.equal(fromScopedId(wId, "wf-123:n1"), "n1");
  assert.equal(fromScopedId(wId, "n1"), "n1", "returns original if not matching prefix");
  assert.equal(fromScopedId("other-wf", "wf-123:n1"), "wf-123:n1", "does not strip different workflow id");
});

test("FINDING-F2-06: Saving two distinct workflows with common IDs (e1/n1) both return 200 without PK collision", async () => {
  const app = await buildApp({ logger: false });

  // 1. Setup user and organization
  const user = await prisma.user.create({
    data: { email: "collision_test@example.com", name: "Collision Tester", passwordHash: "dummy" },
  });
  const org = await prisma.organization.create({
    data: { name: "Collision Org", slug: "collision-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 2. Create Workflow 1
  const wf1 = await prisma.workflow.create({
    data: {
      name: "Workflow Alpha",
      ownerId: user.id,
      orgId: org.id,
      status: "DRAFT",
    },
  });

  // 3. Create Workflow 2
  const wf2 = await prisma.workflow.create({
    data: {
      name: "Workflow Beta",
      ownerId: user.id,
      orgId: org.id,
      status: "DRAFT",
    },
  });

  // 4. Common canvas payload with identical client IDs: n1, n2, e1
  const commonCanvas = {
    nodes: [
      {
        id: "n1",
        type: "webhook",
        label: "Start Webhook",
        position: { x: 100, y: 100 },
        data: { type: "webhook", label: "Start Webhook", config: { path: "/test" } },
      },
      {
        id: "n2",
        type: "http",
        label: "HTTP Request",
        position: { x: 300, y: 100 },
        data: { type: "http", label: "HTTP Request", config: { url: "https://example.com" } },
      },
    ],
    edges: [
      {
        id: "e1",
        sourceNodeId: "n1",
        targetNodeId: "n2",
        label: "Next",
      },
    ],
  };

  // 5. Save canvas on Workflow 1
  const res1 = await app.inject({
    method: "PUT",
    url: `/api/workflows/${wf1.id}/canvas`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify(commonCanvas),
  });

  assert.equal(res1.statusCode, 200, `Expected 200 for wf1 canvas, got ${res1.statusCode}: ${res1.body}`);
  const data1 = JSON.parse(res1.body);
  assert.equal(data1.ok, true);
  assert.equal(data1.nodes[0].id, "n1");
  assert.equal(data1.nodes[1].id, "n2");
  assert.equal(data1.edges[0].id, "e1");

  // 6. Save identical canvas on Workflow 2 (MUST NOT collide on primary key)
  const res2 = await app.inject({
    method: "PUT",
    url: `/api/workflows/${wf2.id}/canvas`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify(commonCanvas),
  });

  assert.equal(res2.statusCode, 200, `Expected 200 for wf2 canvas, got ${res2.statusCode}: ${res2.body}`);
  const data2 = JSON.parse(res2.body);
  assert.equal(data2.ok, true);
  assert.equal(data2.nodes[0].id, "n1");
  assert.equal(data2.nodes[1].id, "n2");
  assert.equal(data2.edges[0].id, "e1");

  // 7. Verify GET /api/workflows/:id for both workflows preserves client IDs
  const get1 = await app.inject({
    method: "GET",
    url: `/api/workflows/${wf1.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(get1.statusCode, 200);
  const wf1Payload = JSON.parse(get1.body);
  assert.equal(wf1Payload.nodes.length, 2);
  assert.equal(wf1Payload.nodes[0].id, "n1");
  assert.equal(wf1Payload.nodes[1].id, "n2");
  assert.equal(wf1Payload.edges.length, 1);
  assert.equal(wf1Payload.edges[0].id, "e1");
  assert.equal(wf1Payload.edges[0].source, "n1");
  assert.equal(wf1Payload.edges[0].target, "n2");

  const get2 = await app.inject({
    method: "GET",
    url: `/api/workflows/${wf2.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(get2.statusCode, 200);
  const wf2Payload = JSON.parse(get2.body);
  assert.equal(wf2Payload.nodes.length, 2);
  assert.equal(wf2Payload.nodes[0].id, "n1");
  assert.equal(wf2Payload.nodes[1].id, "n2");
  assert.equal(wf2Payload.edges.length, 1);
  assert.equal(wf2Payload.edges[0].id, "e1");
  assert.equal(wf2Payload.edges[0].source, "n1");
  assert.equal(wf2Payload.edges[0].target, "n2");

  // 8. Verify database records are properly scoped per workflow
  const allNodes = await prisma.workflowNode.findMany({});
  assert.equal(allNodes.length, 4, "Expected 4 total nodes stored across both workflows");
  const wf1DbNodes = allNodes.filter((n) => n.workflowId === wf1.id);
  const wf2DbNodes = allNodes.filter((n) => n.workflowId === wf2.id);
  assert.equal(wf1DbNodes.length, 2);
  assert.equal(wf2DbNodes.length, 2);
  assert.ok(wf1DbNodes.some((n) => n.id === `${wf1.id}:n1`));
  assert.ok(wf2DbNodes.some((n) => n.id === `${wf2.id}:n1`));

  const allEdges = await prisma.workflowEdge.findMany({});
  assert.equal(allEdges.length, 2, "Expected 2 total edges stored across both workflows");
  assert.ok(allEdges.some((e) => e.id === `${wf1.id}:e1` && e.sourceNodeId === `${wf1.id}:n1`));
  assert.ok(allEdges.some((e) => e.id === `${wf2.id}:e1` && e.sourceNodeId === `${wf2.id}:n1`));

  await app.close();
});
