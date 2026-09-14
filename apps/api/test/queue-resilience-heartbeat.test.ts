import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  {
    recordHeartbeat,
    getHeartbeat,
    getHeartbeatTTL,
    isHeartbeatActive,
    clearHeartbeat,
    resetMemoryHeartbeats,
    getDLQJobsList,
    purgeDLQ,
  },
  {
    reapOrphanExecutions,
    startOrphanReaper,
    stopOrphanReaper,
  },
  { getExecutionAuditTrail },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/queue.js"),
  import("../src/services/orphan-recovery.js"),
  import("../src/services/audit-ledger.js"),
]);

test.beforeEach(() => {
  resetStore();
  resetMemoryHeartbeats();
  purgeDLQ();
  stopOrphanReaper();
});

test.afterEach(() => {
  stopOrphanReaper();
  resetMemoryHeartbeats();
});

async function createTestFixture() {
  const org = await prisma.organization.create({
    data: {
      name: "Heartbeat Test Org",
      slug: `hb-org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `hb-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "hash",
      name: "HB User",
    },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });
  const workflow = await prisma.workflow.create({
    data: {
      name: "Heartbeat Test Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
    },
  });
  return { org, user, workflow };
}

test("WF-ENG Item 5: Heartbeat records timestamp, renews TTL and clears on termination", async () => {
  const execId = "exec-hb-1";

  // 1. Initial heartbeat record with 60s TTL
  const recorded = await recordHeartbeat(execId, 60, { node: "step_1" });
  assert.equal(recorded, true);

  // 2. Must be active with positive TTL
  const isActive = await isHeartbeatActive(execId);
  assert.equal(isActive, true);

  const ttl = await getHeartbeatTTL(execId);
  assert.ok(ttl > 0 && ttl <= 60, `TTL should be between 1 and 60, got ${ttl}`);

  const record = await getHeartbeat(execId);
  assert.ok(record, "Heartbeat record should be retrievable");
  assert.equal(record.executionId, execId);
  assert.ok(record.timestamp > 0);
  assert.ok(record.expiresAt > record.timestamp);

  // 3. Heartbeat renewal extends TTL
  const renewed = await recordHeartbeat(execId, 120, { node: "step_2" });
  assert.equal(renewed, true);

  const renewedTTL = await getHeartbeatTTL(execId);
  assert.ok(renewedTTL > 60 && renewedTTL <= 120, `Renewed TTL should be > 60 and <= 120, got ${renewedTTL}`);

  // 4. Clearing heartbeat removes tracking
  const cleared = await clearHeartbeat(execId);
  assert.equal(cleared, true);

  assert.equal(await isHeartbeatActive(execId), false);
  assert.equal(await getHeartbeatTTL(execId), -1);
  assert.equal(await getHeartbeat(execId), null);
});

test("WF-ENG Item 5: Expired heartbeat is reported as inactive", async () => {
  const execId = "exec-hb-expired";

  // Record heartbeat with 0 seconds TTL (already expired)
  await recordHeartbeat(execId, 0);

  // Must report inactive
  const active = await isHeartbeatActive(execId);
  assert.equal(active, false);

  const ttl = await getHeartbeatTTL(execId);
  assert.equal(ttl, -1);
});

test("WF-ENG Item 5: Orphan reaper detects frozen worker (>120s without heartbeat), marks FAILED, records audit and routes to DLQ", async () => {
  const { org, workflow } = await createTestFixture();

  // Create an execution in RUNNING state started 140 seconds ago
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      status: "RUNNING",
      startedAt: new Date(Date.now() - 140_000),
      createdAt: new Date(Date.now() - 140_000),
      input: { orderId: "12345" },
    },
  });

  // Worker crashed: no heartbeat was ever recorded
  const report = await reapOrphanExecutions({
    thresholdMs: 120_000,
    policy: "fail",
  });

  assert.equal(report.orphansFound, 1);
  assert.equal(report.reaped.length, 1);
  assert.equal(report.reaped[0].executionId, execution.id);
  assert.equal(report.reaped[0].action, "failed");
  assert.equal(report.reaped[0].reason, "orphan_recovered");

  // Verify database record transitioned to FAILED with orphan_recovered cause
  const updated = await prisma.workflowExecution.findUnique({
    where: { id: execution.id },
  });
  assert.equal(updated?.status, "FAILED");
  assert.equal(updated?.error, "orphan_recovered");
  assert.ok(updated?.finishedAt);

  // Verify cryptographically chained audit log was recorded
  const audit = await getExecutionAuditTrail(execution.id);
  const orphanEvent = audit.entries.find((e: any) => e.action === "execution.orphan_recovered");
  assert.ok(orphanEvent, "Must record execution.orphan_recovered in audit ledger");
  assert.equal(orphanEvent.actor, "orphan-reaper");
  assert.equal(orphanEvent.decision, "marked_failed");
  assert.equal(orphanEvent.payload?.error, "orphan_recovered");

  // Verify routing to Dead Letter Queue (DLQ)
  const dlq = await getDLQJobsList();
  const dlqEntry = dlq.jobs.find((j) => j.executionId === execution.id);
  assert.ok(dlqEntry, "Orphan execution must be enqueued into workflows-dlq");
  assert.equal(dlqEntry.error, "orphan_recovered");
});

test("WF-ENG Item 5: Active executions with fresh heartbeats are NOT touched by the reaper", async () => {
  const { workflow } = await createTestFixture();

  // Execution started 200s ago but with an active, fresh heartbeat
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      status: "RUNNING",
      startedAt: new Date(Date.now() - 200_000),
      createdAt: new Date(Date.now() - 200_000),
    },
  });

  // Worker sends regular heartbeat
  await recordHeartbeat(execution.id, 60);

  const report = await reapOrphanExecutions({ thresholdMs: 120_000 });
  assert.equal(report.orphansFound, 0);

  // Verify execution remains RUNNING
  const fresh = await prisma.workflowExecution.findUnique({
    where: { id: execution.id },
  });
  assert.equal(fresh?.status, "RUNNING");
  assert.ok(!fresh?.error);
});

test("WF-ENG Item 5: Executions started recently (< thresholdMs) are not falsely flagged as orphans", async () => {
  const { workflow } = await createTestFixture();

  // Execution just started 30s ago (threshold is 120s)
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      status: "RUNNING",
      startedAt: new Date(Date.now() - 30_000),
      createdAt: new Date(Date.now() - 30_000),
    },
  });

  const report = await reapOrphanExecutions({ thresholdMs: 120_000 });
  assert.equal(report.orphansFound, 0);

  const fresh = await prisma.workflowExecution.findUnique({
    where: { id: execution.id },
  });
  assert.equal(fresh?.status, "RUNNING");
});

test("WF-ENG Item 5: Checkpoints are preserved and execution re-enqueued when recovery policy = 'resume'", async () => {
  const { workflow } = await createTestFixture();

  // Execution configured with recoveryPolicy: "resume"
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      status: "RUNNING",
      startedAt: new Date(Date.now() - 160_000),
      createdAt: new Date(Date.now() - 160_000),
      input: { recoveryPolicy: "resume", batchId: "b-999" },
    },
  });

  // Checkpoints: two nodes succeeded before worker crashed
  const cp1 = await prisma.nodeExecution.create({
    data: {
      executionId: execution.id,
      nodeId: "step_http_fetch",
      status: "SUCCESS",
      output: { statusCode: 200, payload: { items: [1, 2, 3] } },
      startedAt: new Date(Date.now() - 150_000),
      finishedAt: new Date(Date.now() - 145_000),
    },
  });
  const cp2 = await prisma.nodeExecution.create({
    data: {
      executionId: execution.id,
      nodeId: "step_transform",
      status: "SUCCESS",
      output: { transformedCount: 3 },
      startedAt: new Date(Date.now() - 140_000),
      finishedAt: new Date(Date.now() - 135_000),
    },
  });

  // Run orphan reaper with resume policy
  const report = await reapOrphanExecutions({ thresholdMs: 120_000 });

  assert.equal(report.orphansFound, 1);
  assert.equal(report.reaped[0].action, "resumed");
  assert.equal(report.reaped[0].checkpointNodesCount, 2);

  // 1. Execution must transition to PENDING (ready to be picked up by worker)
  const updated = await prisma.workflowExecution.findUnique({
    where: { id: execution.id },
  });
  assert.equal(updated?.status, "PENDING");
  assert.equal(updated?.error, null);

  // 2. Successful checkpoint nodes must remain untouched (not deleted or corrupted)
  const node1 = await prisma.nodeExecution.findUnique({ where: { id: cp1.id } });
  const node2 = await prisma.nodeExecution.findUnique({ where: { id: cp2.id } });
  assert.equal(node1?.status, "SUCCESS");
  assert.deepEqual(node1?.output, { statusCode: 200, payload: { items: [1, 2, 3] } });
  assert.equal(node2?.status, "SUCCESS");
  assert.deepEqual(node2?.output, { transformedCount: 3 });

  // 3. Audit trail must record execution.orphan_resumed event
  const audit = await getExecutionAuditTrail(execution.id);
  const resumeEvent = audit.entries.find((e: any) => e.action === "execution.orphan_resumed");
  assert.ok(resumeEvent, "Must record execution.orphan_resumed in audit ledger");
  assert.equal(resumeEvent.actor, "orphan-reaper");
  assert.equal(resumeEvent.decision, "resumed_from_checkpoint");
  assert.equal(resumeEvent.payload?.checkpointCount, 2);
  assert.equal(resumeEvent.payload?.policy, "resume");
});

test("WF-ENG Item 5: Background orphan reaper starts, runs and stops cleanly", async () => {
  const reaper = startOrphanReaper(1000);
  assert.equal(reaper.isRunning(), true);

  reaper.stop();
  assert.equal(reaper.isRunning(), false);
});
