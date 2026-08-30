-- Database performance optimization: composite indexes and partial indexes for high throughput queries.
-- Additive and non-blocking index strategy for PostgreSQL.

-- 1. WorkflowExecution: High-throughput filtering by orgId + status + startedAt & trigger
CREATE INDEX IF NOT EXISTS "WorkflowExecution_orgId_status_startedAt_idx"
  ON "WorkflowExecution" ("orgId", "status", "startedAt");

CREATE INDEX IF NOT EXISTS "WorkflowExecution_orgId_trigger_startedAt_idx"
  ON "WorkflowExecution" ("orgId", "trigger", "startedAt");

-- Partial index for active/unresolved workflow executions (QUEUE / POLL hot path)
CREATE INDEX IF NOT EXISTS "WorkflowExecution_active_executions_idx"
  ON "WorkflowExecution" ("orgId", "startedAt")
  WHERE "status" IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL');

-- 2. AuditLog: Cryptographic hash chain verification and audit query optimizations
CREATE INDEX IF NOT EXISTS "AuditLog_orgId_createdAt_idx"
  ON "AuditLog" ("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_action_createdAt_idx"
  ON "AuditLog" ("orgId", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_resource_createdAt_idx"
  ON "AuditLog" ("orgId", "resource", "createdAt");

-- 3. WorkflowVersion: Fast lookup for latest workflow version
CREATE INDEX IF NOT EXISTS "WorkflowVersion_workflowId_version_desc_idx"
  ON "WorkflowVersion" ("workflowId", "version" DESC);

-- 4. Workflow: Composite filtering by orgId + status + updatedAt
CREATE INDEX IF NOT EXISTS "Workflow_orgId_status_updatedAt_idx"
  ON "Workflow" ("orgId", "status", "updatedAt");

-- Partial index for active workflows
CREATE INDEX IF NOT EXISTS "Workflow_active_org_idx"
  ON "Workflow" ("orgId", "updatedAt")
  WHERE "status" = 'ACTIVE';

-- 5. NodeExecution: Traces, retry loops, and node throughput tracking
CREATE INDEX IF NOT EXISTS "NodeExecution_nodeId_status_startedAt_idx"
  ON "NodeExecution" ("nodeId", "status", "startedAt");

CREATE INDEX IF NOT EXISTS "NodeExecution_executionId_status_startedAt_idx"
  ON "NodeExecution" ("executionId", "status", "startedAt");

-- Partial index for failed nodes (error analysis / retry queues)
CREATE INDEX IF NOT EXISTS "NodeExecution_failed_nodes_idx"
  ON "NodeExecution" ("executionId", "startedAt")
  WHERE "status" = 'FAILED';
