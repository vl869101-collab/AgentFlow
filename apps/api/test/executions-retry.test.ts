import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createWorkflowExecution },
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

test("FINDING-F2-03: POST /api/executions/:id/retry clones execution with lineage and parentExecutionId", async () => {
  const app = await buildApp({ logger: false });

  // 1. Setup User, Org, and Workflow
  const user = await prisma.user.create({
    data: { email: "retry_owner@example.com", name: "Retry Owner", passwordHash: "dummy" },
  });
  const org = await prisma.organization.create({
    data: { name: "Retry Org", slug: "retry-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Lineage Workflow",
      ownerId: user.id,
      orgId: org.id,
      status: "ACTIVE",
    },
  });

  // 2. Create initial execution with input payload
  const initialInput = { message: "Hello original run", count: 42 };
  const initialExecution = await createWorkflowExecution(workflow.id, initialInput, {
    userId: user.id,
    trigger: "manual",
  });

  // Mark initial execution as failed to simulate a retry scenario
  await prisma.workflowExecution.update({
    where: { id: initialExecution.id },
    data: { status: "FAILED", finishedAt: new Date() },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // 3. Call POST /api/executions/:id/retry without body to inherit original input
  const retryRes = await app.inject({
    method: "POST",
    url: `/api/executions/${initialExecution.id}/retry`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  assert.equal(retryRes.statusCode, 202);
  const retried = JSON.parse(retryRes.body);
  assert.ok(retried.id);
  assert.notEqual(retried.id, initialExecution.id);
  assert.equal(retried.workflowId, workflow.id);
  assert.equal(retried.trigger, "retry");
  assert.equal(retried.parentExecutionId, initialExecution.id);
  assert.deepEqual(retried.input, initialInput);

  // 4. Verify audit ledger record for execution.created has parentExecutionId
  const auditLogs = await prisma.auditLog.findMany({
    where: { orgId: org.id },
  });
  const retryRequestedLog = auditLogs.find((l) => l.action === "execution.retry_requested");
  assert.ok(retryRequestedLog, "Expected execution.retry_requested audit log");
  assert.equal((retryRequestedLog.metadata as any).parentExecutionId, initialExecution.id);

  // 5. Retry with overridden input
  const overriddenInput = { message: "Custom retry payload", count: 99 };
  const customRetryRes = await app.inject({
    method: "POST",
    url: `/api/executions/${initialExecution.id}/retry`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ input: overriddenInput }),
  });

  assert.equal(customRetryRes.statusCode, 202);
  const customRetried = JSON.parse(customRetryRes.body);
  assert.equal(customRetried.parentExecutionId, initialExecution.id);
  assert.deepEqual(customRetried.input, overriddenInput);

  // 6. Anti-enumeration / Cross-org: other user from other org gets 404
  const otherUser = await prisma.user.create({
    data: { email: "other_org_user@example.com", name: "Other User", passwordHash: "dummy" },
  });
  const otherOrg = await prisma.organization.create({
    data: { name: "Other Org", slug: "other-org" },
  });
  await prisma.organizationMember.create({
    data: { userId: otherUser.id, orgId: otherOrg.id, role: "OWNER" },
  });
  const otherToken = (app as any).jwt.sign({ sub: otherUser.id, orgId: otherOrg.id });

  const crossOrgRetryRes = await app.inject({
    method: "POST",
    url: `/api/executions/${initialExecution.id}/retry`,
    headers: {
      authorization: `Bearer ${otherToken}`,
      "content-type": "application/json",
    },
  });

  assert.equal(crossOrgRetryRes.statusCode, 404);
  assert.equal(JSON.parse(crossOrgRetryRes.body).code, "NOT_FOUND");

  await app.close();
});
