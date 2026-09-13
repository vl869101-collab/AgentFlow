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
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/server.js"),
]);

test.beforeEach(() => {
  resetStore();
});

test("FINDING-F2-08: POST /api/workflows/:id/duplicate performs atomic clone with new IDs, ' (copy)' suffix, and no execution history", async () => {
  const app = await buildApp({ logger: false });

  // 1. Setup user and organization
  const user = await prisma.user.create({
    data: { email: "duplicate_test@example.com", name: "Duplication Tester", passwordHash: "dummy" },
  });
  const org = await prisma.organization.create({
    data: { name: "Duplication Org", slug: "dup-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 2. Create source workflow with nodes and edges
  const sourceWf = await prisma.workflow.create({
    data: {
      name: "Payment Notification Pipeline",
      description: "Dispatches emails and webhooks upon payment capture",
      ownerId: user.id,
      orgId: org.id,
      status: "ACTIVE",
    },
  });

  const canvasPayload = {
    nodes: [
      {
        id: "start-node",
        type: "webhook",
        label: "Stripe Webhook",
        position: { x: 50, y: 120 },
        data: { type: "webhook", label: "Stripe Webhook", config: { path: "/stripe-pay" } },
      },
      {
        id: "filter-node",
        type: "condition",
        label: "Check Amount",
        position: { x: 250, y: 120 },
        data: { type: "condition", label: "Check Amount", config: { min: 100 } },
      },
      {
        id: "email-node",
        type: "email",
        label: "Send Receipt",
        position: { x: 500, y: 120 },
        data: { type: "email", label: "Send Receipt", config: { template: "receipt_v1" } },
      },
    ],
    edges: [
      {
        id: "e-start-filter",
        sourceNodeId: "start-node",
        targetNodeId: "filter-node",
        label: "Valid",
      },
      {
        id: "e-filter-email",
        sourceNodeId: "filter-node",
        targetNodeId: "email-node",
        label: "High Value",
      },
    ],
  };

  const saveRes = await app.inject({
    method: "PUT",
    url: `/api/workflows/${sourceWf.id}/canvas`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify(canvasPayload),
  });
  assert.equal(saveRes.statusCode, 200);

  // 3. Create a dummy execution on the source workflow to ensure executions are NOT inherited
  await prisma.workflowExecution.create({
    data: {
      workflowId: sourceWf.id,
      userId: user.id,
      status: "COMPLETED",
      trigger: "manual",
    },
  });

  const initialSourceExecCount = await prisma.workflowExecution.count({
    where: { workflowId: sourceWf.id },
  });
  assert.equal(initialSourceExecCount, 1);

  // 4. Duplicate the workflow via POST /api/workflows/:id/duplicate
  const duplicateRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${sourceWf.id}/duplicate`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({}),
  });

  assert.equal(duplicateRes.statusCode, 201, `Expected 201, got ${duplicateRes.statusCode}: ${duplicateRes.body}`);
  const cloned = JSON.parse(duplicateRes.body);

  // Assertions on cloned workflow metadata
  assert.notEqual(cloned.id, sourceWf.id, "Cloned workflow must have a distinct ID");
  assert.equal(cloned.name, "Payment Notification Pipeline (copy)", "Name must have ' (copy)' suffix");
  assert.equal(cloned.description, sourceWf.description);
  assert.equal(cloned.status, "DRAFT", "Cloned workflow status must default to DRAFT");

  // Assertions on cloned canvas
  assert.equal(cloned.nodes.length, 3, "All 3 nodes must be duplicated");
  assert.equal(cloned.edges.length, 2, "All 2 edges must be duplicated");

  // Verify node IDs are fresh and do not match source
  const sourceNodeIds = ["start-node", "filter-node", "email-node"];
  for (const node of cloned.nodes) {
    assert.ok(!sourceNodeIds.includes(node.id), `Node ID ${node.id} must be regenerated`);
    assert.ok(node.data.type, "Node data type must be present");
  }

  // Verify edge connectivity is cleanly preserved with new IDs
  const clonedNodeMap = new Map(cloned.nodes.map((n: any) => [n.data.label, n.id]));
  const startId = clonedNodeMap.get("Stripe Webhook");
  const filterId = clonedNodeMap.get("Check Amount");
  const emailId = clonedNodeMap.get("Send Receipt");

  const edge1 = cloned.edges.find((e: any) => e.source === startId && e.target === filterId);
  assert.ok(edge1, "Edge between Stripe Webhook and Check Amount must be rewired to cloned node IDs");

  const edge2 = cloned.edges.find((e: any) => e.source === filterId && e.target === emailId);
  assert.ok(edge2, "Edge between Check Amount and Send Receipt must be rewired to cloned node IDs");

  // Assertions on executions: Cloned workflow must have 0 executions
  const clonedExecCount = await prisma.workflowExecution.count({
    where: { workflowId: cloned.id },
  });
  assert.equal(clonedExecCount, 0, "Cloned workflow must NOT inherit any execution history");

  // Assertions on versions: Cloned workflow must have initial version 1
  const clonedVersions = await prisma.workflowVersion.findMany({
    where: { workflowId: cloned.id },
  });
  assert.equal(clonedVersions.length, 1, "Cloned workflow must have exactly 1 version");
  assert.equal(clonedVersions[0].version, 1);

  // 5. Test duplicating with custom name
  const customRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${sourceWf.id}/duplicate`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ name: "Custom Named Fork" }),
  });

  assert.equal(customRes.statusCode, 201);
  const customCloned = JSON.parse(customRes.body);
  assert.equal(customCloned.name, "Custom Named Fork");

  // 6. Test 404 anti-enumeration for nonexistent workflow or different org
  const nonExistentRes = await app.inject({
    method: "POST",
    url: `/api/workflows/non-existent-wf-id/duplicate`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({}),
  });
  assert.equal(nonExistentRes.statusCode, 404);
});
