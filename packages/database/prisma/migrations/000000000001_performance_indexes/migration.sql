-- Additive and non-blocking performance indexes for high-throughput queries
CREATE INDEX IF NOT EXISTS "WorkflowExecution_orgId_status_startedAt_idx"
  ON "WorkflowExecution" ("orgId", "status", "startedAt");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_action_createdAt_idx"
  ON "AuditLog" ("orgId", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "NodeExecution_executionId_status_startedAt_idx"
  ON "NodeExecution" ("executionId", "status", "startedAt");
