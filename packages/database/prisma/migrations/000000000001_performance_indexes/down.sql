-- Reversible down migration for performance indexes
DROP INDEX IF EXISTS "NodeExecution_executionId_status_startedAt_idx";
DROP INDEX IF EXISTS "AuditLog_orgId_action_createdAt_idx";
DROP INDEX IF EXISTS "WorkflowExecution_orgId_status_startedAt_idx";
