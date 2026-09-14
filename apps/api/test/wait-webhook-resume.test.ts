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
  { buildApp },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
  import("../src/server.js"),
]);

test.beforeEach(() => {
  resetStore();
});

async function createWebhookWaitFixture() {
  const org = await prisma.organization.create({
    data: { name: "Webhook Wait Org", slug: `webhook-wait-org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const user = await prisma.user.create({
    data: { email: `webhook-wait-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, passwordHash: "hash", name: "Webhook Wait User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Wait Webhook Callback Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: {
        create: [
          { id: "trg", type: "webhook", config: {} },
          { id: "step1", type: "set_fields", config: { stage: "prepared" } },
          { id: "wait_cb", type: "wait", config: { mode: "webhook" } },
          { id: "step2", type: "set_fields", config: { stage: "finalized" } },
        ],
      },
      edges: {
        create: [
          { id: "e1", sourceNodeId: "trg", targetNodeId: "step1" },
          { id: "e2", sourceNodeId: "step1", targetNodeId: "wait_cb" },
          { id: "e3", sourceNodeId: "wait_cb", targetNodeId: "step2" },
        ],
      },
    },
  });

  return { org, user, workflow };
}

test("WF-ENG Item 4: Webhook wait suspends execution, persists resumeToken, and rejects invalid token", async () => {
  const app = await buildApp({ logger: false });
  const { workflow } = await createWebhookWaitFixture();

  const execution = await createWorkflowExecution(workflow.id, { start: true });
  const suspended = await runExecution(execution.id);

  // 1. Must suspend with WAITING status
  assert.equal(suspended.status, "WAITING");

  // 2. Check pending approval record and extract resumeToken
  const approvals = await prisma.approval.findMany({ where: { executionId: execution.id } });
  assert.equal(approvals.length, 1);
  const approval = approvals[0];
  assert.equal(approval.status, "PENDING");
  assert.equal((approval.context as any)?.waitNode, true);
  assert.equal((approval.context as any)?.mode, "webhook");
  const resumeToken = (approval.context as any)?.resumeToken;
  assert.ok(resumeToken && typeof resumeToken === "string", "resumeToken must be generated and persisted");

  // 3. Step 1 executed; wait_cb and step2 have NOT executed
  const nodeExecs = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  assert.equal(nodeExecs.find((n: any) => n.nodeId === "step1")?.status, "SUCCESS");
  assert.equal(nodeExecs.find((n: any) => n.nodeId === "wait_cb"), undefined);
  assert.equal(nodeExecs.find((n: any) => n.nodeId === "step2"), undefined);

  // 4. Test invalid token rejection (404)
  const invalidRes = await app.inject({
    method: "POST",
    url: "/api/webhooks/resume/non-existent-token-abc-123",
    payload: { fake: true },
  });
  assert.equal(invalidRes.statusCode, 404);
  const invalidBody = invalidRes.json();
  assert.equal(invalidBody.code, "NOT_FOUND");

  // 5. Execution must still remain in WAITING status
  const stillWaiting = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  assert.equal(stillWaiting?.status, "WAITING");

  await app.close();
});

test("WF-ENG Item 4: POST /api/webhooks/resume/:token resumes execution, injects payload, and forbids replay", async () => {
  const app = await buildApp({ logger: false });
  const { workflow } = await createWebhookWaitFixture();

  const execution = await createWorkflowExecution(workflow.id, { init: true });
  await runExecution(execution.id);

  const approvals = await prisma.approval.findMany({ where: { executionId: execution.id } });
  const resumeToken = (approvals[0].context as any)?.resumeToken;

  // 1. Call valid resume endpoint with external payload
  const callbackPayload = {
    externalStatus: "PAYMENT_CONFIRMED",
    amountPaid: 150.75,
    referenceId: "ref-9988",
  };

  const resumeRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/resume/${resumeToken}`,
    payload: callbackPayload,
  });

  assert.equal(resumeRes.statusCode, 200);
  const resumeBody = resumeRes.json();
  assert.equal(resumeBody.ok, true);
  assert.equal(resumeBody.executionId, execution.id);

  // 2. Wait for completion (in-process resumption)
  await new Promise((resolve) => setTimeout(resolve, 50));

  let finalExecution = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  if (finalExecution?.status !== "SUCCESS") {
    finalExecution = await runExecution(execution.id);
  }
  assert.equal(finalExecution?.status, "SUCCESS");

  // 3. Verify wait node completed and received injected webhook payload as output
  const nodeExecs = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const waitNodeExec = nodeExecs.find((n: any) => n.nodeId === "wait_cb");
  assert.ok(waitNodeExec, "wait node execution must exist");
  assert.equal(waitNodeExec.status, "SUCCESS");

  const waitOutput = (waitNodeExec.output as any);
  assert.ok(Array.isArray(waitOutput) && waitOutput.length > 0, "wait output must be an array of items");
  assert.equal(waitOutput[0].json?.externalStatus, "PAYMENT_CONFIRMED");
  assert.equal(waitOutput[0].json?.amountPaid, 150.75);

  // 4. Verify step2 completed after resumption
  const step2Exec = nodeExecs.find((n: any) => n.nodeId === "step2");
  assert.equal(step2Exec?.status, "SUCCESS");

  // 5. Test token replay rejection (400 ALREADY_RESUMED)
  const replayRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/resume/${resumeToken}`,
    payload: { tryAgain: true },
  });
  assert.equal(replayRes.statusCode, 400);
  const replayBody = replayRes.json();
  assert.equal(replayBody.code, "ALREADY_RESUMED");

  await app.close();
});

test("WF-ENG Item 4: GET /api/webhooks/resume/:token resumes via query parameters", async () => {
  const app = await buildApp({ logger: false });
  const { workflow } = await createWebhookWaitFixture();

  const execution = await createWorkflowExecution(workflow.id, { via: "get" });
  await runExecution(execution.id);

  const approvals = await prisma.approval.findMany({ where: { executionId: execution.id } });
  const resumeToken = (approvals[0].context as any)?.resumeToken;

  const getRes = await app.inject({
    method: "GET",
    url: `/api/webhooks/resume/${resumeToken}?action=verified&user=abc`,
  });

  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().ok, true);

  await new Promise((resolve) => setTimeout(resolve, 50));
  let finalExecution = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
  if (finalExecution?.status !== "SUCCESS") {
    finalExecution = await runExecution(execution.id);
  }
  assert.equal(finalExecution?.status, "SUCCESS");

  await app.close();
});
