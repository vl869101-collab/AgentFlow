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

test("FINDING-F2-09: GET /api/workflows/:id/export returns Content-Disposition attachment header and complete clean graph structure", async () => {
  const app = await buildApp({ logger: false });

  // 1. Setup user and organization
  const user = await prisma.user.create({
    data: { email: "export_test@example.com", name: "Export Tester", passwordHash: "dummy" },
  });
  const org = await prisma.organization.create({
    data: { name: "Export Org", slug: "export-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 2. Create workflow with nodes and edges
  const wf = await prisma.workflow.create({
    data: {
      name: "Customer Support Automation",
      description: "Automated routing and ticket tagging workflow",
      ownerId: user.id,
      orgId: org.id,
      status: "ACTIVE",
    },
  });

  const canvasPayload = {
    nodes: [
      {
        id: "webhook-trigger",
        type: "webhook",
        label: "Incoming Ticket",
        position: { x: 100, y: 150 },
        data: { type: "webhook", label: "Incoming Ticket", config: { path: "/zendesk-hook" } },
      },
      {
        id: "ai-classifier",
        type: "code",
        label: "Sentiment Classifier",
        position: { x: 350, y: 150 },
        data: { type: "code", label: "Sentiment Classifier", config: { language: "javascript" } },
      },
    ],
    edges: [
      {
        id: "edge-trigger-ai",
        sourceNodeId: "webhook-trigger",
        targetNodeId: "ai-classifier",
        label: "Process Ticket",
      },
    ],
  };

  const saveRes = await app.inject({
    method: "PUT",
    url: `/api/workflows/${wf.id}/canvas`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify(canvasPayload),
  });
  assert.equal(saveRes.statusCode, 200);

  // 3. Export workflow via GET /api/workflows/:id/export
  const exportRes = await app.inject({
    method: "GET",
    url: `/api/workflows/${wf.id}/export`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(exportRes.statusCode, 200, `Expected 200, got ${exportRes.statusCode}: ${exportRes.body}`);

  // 4. Assert download attachment headers
  const contentDisposition = exportRes.headers["content-disposition"];
  assert.equal(
    contentDisposition,
    `attachment; filename="agentflow-workflow-${wf.id}.json"`,
    "Content-Disposition header must specify attachment with agentflow-workflow-<id>.json filename"
  );
  assert.ok(
    String(exportRes.headers["content-type"]).includes("application/json"),
    "Content-Type header must be application/json"
  );

  // 5. Assert exported payload structure
  const payload = JSON.parse(exportRes.body);
  assert.equal(payload.name, "Customer Support Automation");
  assert.equal(payload.description, "Automated routing and ticket tagging workflow");
  assert.equal(payload.status, "ACTIVE");
  assert.equal(payload.version, 1);
  assert.ok(payload.exportedAt, "exportedAt timestamp must be set");

  // Verify node structure and clean IDs (no internal scoped prefix)
  assert.equal(payload.nodes.length, 2);
  const node1 = payload.nodes.find((n: any) => n.id === "webhook-trigger");
  assert.ok(node1, "webhook-trigger node must be present with clean un-scoped ID");
  assert.equal(node1.data.label, "Incoming Ticket");

  const node2 = payload.nodes.find((n: any) => n.id === "ai-classifier");
  assert.ok(node2, "ai-classifier node must be present with clean un-scoped ID");

  // Verify edge structure and clean source/target
  assert.equal(payload.edges.length, 1);
  const edge1 = payload.edges[0];
  assert.equal(edge1.id, "edge-trigger-ai");
  assert.equal(edge1.source, "webhook-trigger");
  assert.equal(edge1.target, "ai-classifier");
  assert.equal(edge1.label, "Process Ticket");

  // 6. Test 404 anti-enumeration for nonexistent workflow
  const nonExistentRes = await app.inject({
    method: "GET",
    url: `/api/workflows/non-existent-wf/export`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(nonExistentRes.statusCode, 404);
});
