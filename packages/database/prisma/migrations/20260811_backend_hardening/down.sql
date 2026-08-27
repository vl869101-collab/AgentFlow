-- Reversal for 20260811_backend_hardening
DROP INDEX IF EXISTS "ApiKey_userId_createdAt_idx";
DROP INDEX IF EXISTS "UsageRecord_userId_type_createdAt_idx";
DROP INDEX IF EXISTS "UsageRecord_orgId_type_createdAt_idx";
DROP INDEX IF EXISTS "Approval_userId_status_idx";
DROP INDEX IF EXISTS "Approval_executionId_status_idx";
DROP INDEX IF EXISTS "Webhook_orgId_active_idx";
DROP INDEX IF EXISTS "Credential_orgId_createdAt_idx";
DROP INDEX IF EXISTS "NodeExecution_executionId_startedAt_idx";
DROP INDEX IF EXISTS "WorkflowExecution_userId_startedAt_idx";
DROP INDEX IF EXISTS "WorkflowExecution_workflowId_startedAt_idx";
DROP INDEX IF EXISTS "WorkflowExecution_orgId_startedAt_idx";
DROP INDEX IF EXISTS "WorkflowEdge_targetNodeId_idx";
DROP INDEX IF EXISTS "WorkflowEdge_sourceNodeId_idx";
DROP INDEX IF EXISTS "WorkflowEdge_workflowId_idx";
DROP INDEX IF EXISTS "WorkflowNode_workflowId_idx";
DROP INDEX IF EXISTS "WorkflowVersion_workflowId_createdAt_idx";
DROP INDEX IF EXISTS "Workflow_ownerId_updatedAt_idx";
DROP INDEX IF EXISTS "Workflow_orgId_updatedAt_idx";
DROP INDEX IF EXISTS "OrganizationMember_orgId_idx";
DROP INDEX IF EXISTS "Organization_plan_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Approval_userId_key" ON "Approval" ("userId");
