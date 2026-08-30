-- Reversible down migration for database optimization indexes

DROP INDEX IF EXISTS "NodeExecution_failed_nodes_idx";
DROP INDEX IF EXISTS "NodeExecution_executionId_status_startedAt_idx";
DROP INDEX IF EXISTS "NodeExecution_nodeId_status_startedAt_idx";

DROP INDEX IF EXISTS "Workflow_active_org_idx";
DROP INDEX IF EXISTS "Workflow_orgId_status_updatedAt_idx";

DROP INDEX IF EXISTS "WorkflowVersion_workflowId_version_desc_idx";

DROP INDEX IF EXISTS "AuditLog_orgId_resource_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_orgId_action_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_orgId_createdAt_idx";

DROP INDEX IF EXISTS "WorkflowExecution_active_executions_idx";
DROP INDEX IF EXISTS "WorkflowExecution_orgId_trigger_startedAt_idx";
DROP INDEX IF EXISTS "WorkflowExecution_orgId_status_startedAt_idx";
