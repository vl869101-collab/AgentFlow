-- Backend hardening: indexes, team plan support and multiple approvals per user.
-- This migration is intentionally forward-only. Removing the TEAM enum value is
-- not supported by PostgreSQL; the rollback is to stop assigning TEAM and keep
-- the additive indexes in place.

ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'TEAM';

DROP INDEX IF EXISTS "Approval_userId_key";

CREATE INDEX IF NOT EXISTS "Organization_plan_idx"
  ON "Organization" ("plan");
CREATE INDEX IF NOT EXISTS "OrganizationMember_orgId_idx"
  ON "OrganizationMember" ("orgId");
CREATE INDEX IF NOT EXISTS "Workflow_orgId_updatedAt_idx"
  ON "Workflow" ("orgId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Workflow_ownerId_updatedAt_idx"
  ON "Workflow" ("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "WorkflowVersion_workflowId_createdAt_idx"
  ON "WorkflowVersion" ("workflowId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkflowNode_workflowId_idx"
  ON "WorkflowNode" ("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowEdge_workflowId_idx"
  ON "WorkflowEdge" ("workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowEdge_sourceNodeId_idx"
  ON "WorkflowEdge" ("sourceNodeId");
CREATE INDEX IF NOT EXISTS "WorkflowEdge_targetNodeId_idx"
  ON "WorkflowEdge" ("targetNodeId");
CREATE INDEX IF NOT EXISTS "WorkflowExecution_orgId_startedAt_idx"
  ON "WorkflowExecution" ("orgId", "startedAt");
CREATE INDEX IF NOT EXISTS "WorkflowExecution_workflowId_startedAt_idx"
  ON "WorkflowExecution" ("workflowId", "startedAt");
CREATE INDEX IF NOT EXISTS "WorkflowExecution_userId_startedAt_idx"
  ON "WorkflowExecution" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "NodeExecution_executionId_startedAt_idx"
  ON "NodeExecution" ("executionId", "startedAt");
CREATE INDEX IF NOT EXISTS "Credential_orgId_createdAt_idx"
  ON "Credential" ("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "Webhook_orgId_active_idx"
  ON "Webhook" ("orgId", "active");
CREATE INDEX IF NOT EXISTS "Approval_executionId_status_idx"
  ON "Approval" ("executionId", "status");
CREATE INDEX IF NOT EXISTS "Approval_userId_status_idx"
  ON "Approval" ("userId", "status");
CREATE INDEX IF NOT EXISTS "UsageRecord_orgId_type_createdAt_idx"
  ON "UsageRecord" ("orgId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageRecord_userId_type_createdAt_idx"
  ON "UsageRecord" ("userId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiKey_userId_createdAt_idx"
  ON "ApiKey" ("userId", "createdAt");
