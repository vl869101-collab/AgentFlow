import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore, approvals, executions, nodeExecutions, workflows },
  { createWorkflowExecution, runExecution },
  { buildApp },
  { verifyWorkflowAuditIntegrity, getExecutionAuditTrail },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
  import("../src/server.js"),
  import("../src/services/audit-ledger.js"),
]);

test.beforeEach(() => {
  resetStore();
});

async function createFixture(nodes: any[], edges: any[]) {
  const org = await prisma.organization.create({
    data: { name: "Approval Org", slug: `appr-org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const user = await prisma.user.create({
    data: { email: `appr-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, passwordHash: "hash", name: "Approver" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Approval & Checkpoint Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: nodes.map((n) => ({ ...n, config: n.config ?? {} })) },
      edges: { create: edges },
    },
  });

  return { org, user, workflow };
}

test("EXP-ESS-01: node with requiresApproval: true suspends execution, registers pending approval, and zero external side effects occur", async () => {
  let sideEffectExecuted = false;

  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "step1",
        type: "set_fields",
        config: { initialValue: "prepared" },
      },
      {
        id: "dangerousNode",
        type: "set_fields",
        config: {
          requiresApproval: true,
          action: "delete_database_records",
          title: "Authorize DB Record Deletion",
          deleted: true,
        },
      },
      {
        id: "step3",
        type: "set_fields",
        config: { finalStep: "completed" },
      },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "step1" },
      { id: "e2", sourceNodeId: "step1", targetNodeId: "dangerousNode" },
      { id: "e3", sourceNodeId: "dangerousNode", targetNodeId: "step3" },
    ]
  );

  const exec = await createWorkflowExecution(workflow.id, { test: 123 }, { userId: user.id });
  assert.equal(exec.status, "PENDING");

  // Run execution
  const runResult = await runExecution(exec.id);

  // Assert execution suspended
  assert.equal(runResult.status, "WAITING_APPROVAL");
  const storedExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(storedExec?.status, "WAITING_APPROVAL");

  // Verify step1 succeeded and has checkpoint in nodeExecution
  const step1Exec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "step1" },
  });
  assert.ok(step1Exec, "Step 1 must have executed");
  assert.equal(step1Exec.status, "SUCCESS");

  // CRITICAL: dangerousNode must NOT have executed yet (zero side effects before approval)
  const dangerousNodeExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "dangerousNode" },
  });
  assert.equal(dangerousNodeExec, null, "Dangerous node must NOT execute before approval");

  // Verify pending approval was created
  const pendingApprovals = await prisma.approval.findMany({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.equal(pendingApprovals.length, 1);
  const appr = pendingApprovals[0];
  assert.equal(appr.status, "PENDING");
  assert.equal(appr.message, "Authorize DB Record Deletion");
  assert.equal((appr.context as any).nodeId, "dangerousNode");

  // Verify audit event for pending approval was emitted
  const { entries: auditTrail } = await getExecutionAuditTrail(exec.id);
  const pendingAuditEvent = auditTrail.find((e) => e.action === "approval.pending");
  assert.ok(pendingAuditEvent, "Audit ledger must record approval.pending");
  assert.equal(pendingAuditEvent.decision, "WAITING_APPROVAL");
});

test("EXP-ESS-01: GET /api/approvals?status=pending is org-scoped and lists pending approvals", async () => {
  const app = await buildApp({ logger: false });

  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "purgeNode",
        type: "set_fields",
        config: { requiresApproval: true, action: "purge_cache", title: "Purge Production Cache" },
      },
    ],
    [{ id: "e1", sourceNodeId: "trg", targetNodeId: "purgeNode" }]
  );

  const exec = await createWorkflowExecution(workflow.id, { key: "val" }, { userId: user.id });
  await runExecution(exec.id);

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 1. Authorized user lists approvals
  const res = await app.inject({
    method: "GET",
    url: "/api/approvals?status=pending",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(res.statusCode, 200);
  const list = JSON.parse(res.body);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "PENDING");
  assert.equal(list[0].message, "Purge Production Cache");
  assert.equal(list[0].executionId, exec.id);

  // 2. Unrelated org cannot see this approval (multi-tenant isolation)
  const otherOrg = await prisma.organization.create({
    data: { name: "Other Org", slug: `other-org-${Date.now()}` },
  });
  const otherUser = await prisma.user.create({
    data: { email: `other-${Date.now()}@test.local`, passwordHash: "hash" },
  });
  await prisma.organizationMember.create({
    data: { orgId: otherOrg.id, userId: otherUser.id, role: "OWNER" },
  });
  const otherToken = (app as any).jwt.sign({ sub: otherUser.id, orgId: otherOrg.id });

  const otherRes = await app.inject({
    method: "GET",
    url: "/api/approvals?status=pending",
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(otherRes.statusCode, 200);
  const otherList = JSON.parse(otherRes.body);
  assert.equal(otherList.length, 0, "Other org must not see approvals from different tenant");
});

test("EXP-ESS-01: approve resumes workflow from suspended node and finishes execution with SUCCESS", async () => {
  const app = await buildApp({ logger: false });

  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      { id: "prep", type: "set_fields", config: { base: 10 } },
      {
        id: "sensitiveOp",
        type: "set_fields",
        config: { requiresApproval: true, multiplier: 5 },
      },
      { id: "outputNode", type: "set_fields", config: { done: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "prep" },
      { id: "e2", sourceNodeId: "prep", targetNodeId: "sensitiveOp" },
      { id: "e3", sourceNodeId: "sensitiveOp", targetNodeId: "outputNode" },
    ]
  );

  const exec = await createWorkflowExecution(workflow.id, { start: true }, { userId: user.id });
  await runExecution(exec.id);

  const pending = await prisma.approval.findFirst({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.ok(pending);

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // Call POST /api/approvals/:id/approve
  const approveRes = await app.inject({
    method: "POST",
    url: `/api/approvals/${pending.id}/approve`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(approveRes.statusCode, 200);
  const approveBody = JSON.parse(approveRes.body);
  assert.equal(approveBody.ok, true);
  assert.equal(approveBody.status, "APPROVED");

  // In test environment without active BullMQ worker, runExecution is called via fallback.
  // Wait a moment or check execution status.
  const updatedExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(updatedExec?.status, "SUCCESS");

  // Verify all nodes executed successfully
  const sensitiveNodeExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "sensitiveOp" },
  });
  assert.ok(sensitiveNodeExec);
  assert.equal(sensitiveNodeExec.status, "SUCCESS");

  const outputNodeExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "outputNode" },
  });
  assert.ok(outputNodeExec);
  assert.equal(outputNodeExec.status, "SUCCESS");

  // Verify audit event for approval resolution was recorded
  const { entries: auditTrail } = await getExecutionAuditTrail(exec.id);
  const resolvedEvent = auditTrail.find((e) => e.action === "approval.resolved" && e.decision === "APPROVED");
  assert.ok(resolvedEvent, "Audit log must contain approval.resolved with APPROVED");

  // Verify cryptographic integrity of the audit chain
  const integrity = await verifyWorkflowAuditIntegrity(exec.id);
  assert.equal(integrity.valid, true, "Hash chain must remain valid after approval");
});

test("EXP-ESS-01: reject transitions execution to CANCELLED without executing suspended node", async () => {
  const app = await buildApp({ logger: false });

  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "dropTableNode",
        type: "set_fields",
        config: { requiresApproval: true, action: "drop_table", table: "customers" },
      },
      { id: "nextStep", type: "set_fields", config: { executed: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "dropTableNode" },
      { id: "e2", sourceNodeId: "dropTableNode", targetNodeId: "nextStep" },
    ]
  );

  const exec = await createWorkflowExecution(workflow.id, {}, { userId: user.id });
  await runExecution(exec.id);

  const pending = await prisma.approval.findFirst({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.ok(pending);

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // Call POST /api/approvals/:id/reject
  const rejectRes = await app.inject({
    method: "POST",
    url: `/api/approvals/${pending.id}/reject`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(rejectRes.statusCode, 200);
  const rejectBody = JSON.parse(rejectRes.body);
  assert.equal(rejectBody.ok, true);
  assert.equal(rejectBody.status, "REJECTED");

  // Verify execution was cancelled
  const updatedExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(updatedExec?.status, "CANCELLED");
  assert.match(updatedExec?.error || "", /rejected/i);

  // Verify dropTableNode and nextStep were NEVER executed
  const dropNodeExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "dropTableNode" },
  });
  assert.equal(dropNodeExec, null, "Rejected node must never execute");

  const nextNodeExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "nextStep" },
  });
  assert.equal(nextNodeExec, null, "Subsequent nodes must never execute after rejection");

  // Verify audit event
  const { entries: auditTrail } = await getExecutionAuditTrail(exec.id);
  const rejectAuditEvent = auditTrail.find((e) => e.action === "approval.resolved" && e.decision === "REJECTED");
  assert.ok(rejectAuditEvent, "Audit log must contain approval.resolved with REJECTED");
});

test("EXP-ESS-01: approval timeout transitions approval to EXPIRED and execution to CANCELLED", async () => {
  const app = await buildApp({ logger: false });

  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "timeoutNode",
        type: "set_fields",
        config: {
          requiresApproval: true,
          title: "Expiring Approval",
        },
      },
    ],
    [{ id: "e1", sourceNodeId: "trg", targetNodeId: "timeoutNode" }]
  );

  const exec = await createWorkflowExecution(workflow.id, {}, { userId: user.id });
  await runExecution(exec.id);

  const pending = await prisma.approval.findFirst({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.ok(pending);

  // Simulate timeout expiration by moving expiresAt to the past
  const pastDate = new Date(Date.now() - 10000).toISOString();
  await prisma.approval.update({
    where: { id: pending.id },
    data: {
      context: {
        ...(pending.context as any),
        expiresAt: pastDate,
      },
    },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 1. Attempting to approve an expired approval returns 410 GONE
  const approveExpiredRes = await app.inject({
    method: "POST",
    url: `/api/approvals/${pending.id}/approve`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(approveExpiredRes.statusCode, 410);
  const errBody = JSON.parse(approveExpiredRes.body);
  assert.equal(errBody.code, "EXPIRED");

  // Verify approval status became EXPIRED
  const updatedAppr = await prisma.approval.findUnique({ where: { id: pending.id } });
  assert.equal(updatedAppr?.status, "EXPIRED");

  // Verify execution was CANCELLED
  const updatedExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(updatedExec?.status, "CANCELLED");
  assert.match(updatedExec?.error || "", /timed out/i);

  // Verify audit event
  const { entries: auditTrail } = await getExecutionAuditTrail(exec.id);
  const expiredEvent = auditTrail.find((e) => e.action === "approval.expired");
  assert.ok(expiredEvent, "Audit log must record approval.expired event");
});

test("EXP-ESS-01: node checkpoint replay on resumption prevents duplicate side effects (callCount = 1)", async () => {
  const { org, user, workflow } = await createFixture(
    [
      { id: "trg", type: "webhook" },
      { id: "node1", type: "set_fields", config: { step1: "done" } },
      { id: "node2", type: "set_fields", config: { step2: "done" } },
      { id: "node3", type: "set_fields", config: { step3: "done" } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "node1" },
      { id: "e2", sourceNodeId: "node1", targetNodeId: "node2" },
      { id: "e3", sourceNodeId: "node2", targetNodeId: "node3" },
    ]
  );

  const exec = await createWorkflowExecution(workflow.id, { test: 1 }, { userId: user.id });

  // Simulate partial completion: node1 completed before a simulated crash/restart
  await prisma.nodeExecution.create({
    data: {
      nodeId: "trg",
      executionId: exec.id,
      status: "SUCCESS",
      input: { test: 1 },
      output: { test: 1 },
      startedAt: new Date(Date.now() - 3000),
      finishedAt: new Date(Date.now() - 2900),
      duration: 100,
    },
  });

  const node1Execution = await prisma.nodeExecution.create({
    data: {
      nodeId: "node1",
      executionId: exec.id,
      status: "SUCCESS",
      input: { test: 1 },
      output: { test: 1, step1: "done", sideEffectExecuted: true },
      startedAt: new Date(Date.now() - 2000),
      finishedAt: new Date(Date.now() - 1900),
      duration: 100,
    },
  });

  // Track how many times nodeExecutions for node1 are created
  const node1ExecutionsBefore = await prisma.nodeExecution.findMany({
    where: { executionId: exec.id, nodeId: "node1" },
  });
  assert.equal(node1ExecutionsBefore.length, 1);

  // Resume / run execution from this checkpoint
  const result = await runExecution(exec.id);
  assert.equal(result.status, "SUCCESS");

  // Verify node1 was NOT re-executed (still exactly 1 nodeExecution record, no duplicate execution)
  const node1ExecutionsAfter = await prisma.nodeExecution.findMany({
    where: { executionId: exec.id, nodeId: "node1" },
  });
  assert.equal(node1ExecutionsAfter.length, 1, "Checkpoint node1 must NOT be re-executed");
  assert.equal(node1ExecutionsAfter[0].id, node1Execution.id, "Existing checkpoint record must be preserved");

  // Verify subsequent nodes completed successfully
  const node2Exec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "node2" },
  });
  assert.ok(node2Exec);
  assert.equal(node2Exec.status, "SUCCESS");

  const node3Exec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "node3" },
  });
  assert.ok(node3Exec);
  assert.equal(node3Exec.status, "SUCCESS");
});
