import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildPrismaDatasourceUrl } from "../src/index";

describe("Database Performance & Schema Optimization Audit", () => {
  const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
  const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
  const optimizationMigrationDir = path.join(
    migrationsDir,
    "202608300001_database_optimization"
  );
  const performanceIndexesMigrationDir = path.join(
    migrationsDir,
    "000000000001_performance_indexes"
  );

  it("schema.prisma includes high-throughput composite indexes for WorkflowExecution", () => {
    const schema = fs.readFileSync(schemaPath, "utf8");

    expect(schema).toContain("model WorkflowExecution {");
    expect(schema).toContain("@@index([orgId, status, startedAt])");
    expect(schema).toContain("@@index([orgId, trigger, startedAt])");
    expect(schema).toContain("@@index([workflowId, status, startedAt])");
  });

  it("schema.prisma includes composite indexes for AuditLog, WorkflowVersion, and NodeExecution", () => {
    const schema = fs.readFileSync(schemaPath, "utf8");

    // AuditLog
    expect(schema).toContain("model AuditLog {");
    expect(schema).toContain("@@index([orgId, createdAt])");
    expect(schema).toContain("@@index([orgId, action, createdAt])");
    expect(schema).toContain("@@index([orgId, resource, createdAt])");

    // WorkflowVersion
    expect(schema).toContain("model WorkflowVersion {");
    expect(schema).toContain("@@index([workflowId, version(sort: Desc)])");

    // NodeExecution
    expect(schema).toContain("model NodeExecution {");
    expect(schema).toContain("@@index([executionId, startedAt])");
    expect(schema).toContain("@@index([nodeId, status, startedAt])");
    expect(schema).toContain("@@index([executionId, status, startedAt])");
  });

  it("000000000001_performance_indexes migration.sql and down.sql contain required composite indexes and rollback", () => {
    expect(fs.existsSync(performanceIndexesMigrationDir)).toBe(true);

    const upFile = path.join(performanceIndexesMigrationDir, "migration.sql");
    expect(fs.existsSync(upFile)).toBe(true);
    const sql = fs.readFileSync(upFile, "utf8");

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "WorkflowExecution_orgId_status_startedAt_idx"');
    expect(sql).toContain('ON "WorkflowExecution" ("orgId", "status", "startedAt")');

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "AuditLog_orgId_action_createdAt_idx"');
    expect(sql).toContain('ON "AuditLog" ("orgId", "action", "createdAt")');

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "NodeExecution_executionId_status_startedAt_idx"');
    expect(sql).toContain('ON "NodeExecution" ("executionId", "status", "startedAt")');

    const downFile = path.join(performanceIndexesMigrationDir, "down.sql");
    expect(fs.existsSync(downFile)).toBe(true);
    const downSql = fs.readFileSync(downFile, "utf8");

    expect(downSql).toContain('DROP INDEX IF EXISTS "NodeExecution_executionId_status_startedAt_idx"');
    expect(downSql).toContain('DROP INDEX IF EXISTS "AuditLog_orgId_action_createdAt_idx"');
    expect(downSql).toContain('DROP INDEX IF EXISTS "WorkflowExecution_orgId_status_startedAt_idx"');
  });

  it("202608300001_database_optimization migration.sql contains partial and composite indexes", () => {
    expect(fs.existsSync(optimizationMigrationDir)).toBe(true);

    const upFile = path.join(optimizationMigrationDir, "migration.sql");
    expect(fs.existsSync(upFile)).toBe(true);

    const sql = fs.readFileSync(upFile, "utf8");

    // Composite indexes
    expect(sql).toContain("WorkflowExecution_orgId_status_startedAt_idx");
    expect(sql).toContain("WorkflowExecution_orgId_trigger_startedAt_idx");
    expect(sql).toContain("AuditLog_orgId_createdAt_idx");
    expect(sql).toContain("AuditLog_orgId_action_createdAt_idx");
    expect(sql).toContain("AuditLog_orgId_resource_createdAt_idx");
    expect(sql).toContain("WorkflowVersion_workflowId_version_desc_idx");
    expect(sql).toContain("Workflow_orgId_status_updatedAt_idx");
    expect(sql).toContain("NodeExecution_nodeId_status_startedAt_idx");
    expect(sql).toContain("NodeExecution_executionId_status_startedAt_idx");

    // Partial indexes (WHERE predicates)
    expect(sql).toContain("WorkflowExecution_active_executions_idx");
    expect(sql).toContain("WHERE \"status\" IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL')");
    expect(sql).toContain("Workflow_active_org_idx");
    expect(sql).toContain("WHERE \"status\" = 'ACTIVE'");
    expect(sql).toContain("NodeExecution_failed_nodes_idx");
    expect(sql).toContain("WHERE \"status\" = 'FAILED'");
  });

  it("202608300001_database_optimization down.sql provides clean, reversible rollback", () => {
    const downFile = path.join(optimizationMigrationDir, "down.sql");
    expect(fs.existsSync(downFile)).toBe(true);

    const sql = fs.readFileSync(downFile, "utf8");

    expect(sql).toContain('DROP INDEX IF EXISTS "NodeExecution_failed_nodes_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "NodeExecution_executionId_status_startedAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "NodeExecution_nodeId_status_startedAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "Workflow_active_org_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "Workflow_orgId_status_updatedAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "WorkflowVersion_workflowId_version_desc_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "AuditLog_orgId_resource_createdAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "AuditLog_orgId_action_createdAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "AuditLog_orgId_createdAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "WorkflowExecution_active_executions_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "WorkflowExecution_orgId_trigger_startedAt_idx"');
    expect(sql).toContain('DROP INDEX IF EXISTS "WorkflowExecution_orgId_status_startedAt_idx"');
  });

  it("buildPrismaDatasourceUrl formats connection budget & pooling parameters efficiently", () => {
    const url = "postgresql://agent_user:secure_pwd@db-host.internal:5432/agentflow_prod";
    const built = buildPrismaDatasourceUrl(url, {
      connectionLimit: 25,
      poolTimeoutSeconds: 30,
      connectTimeoutSeconds: 15,
      applicationName: "agentflow-high-throughput-worker",
    });

    expect(built).toBeDefined();
    expect(built).toContain("connection_limit=25");
    expect(built).toContain("pool_timeout=30");
    expect(built).toContain("connect_timeout=15");
    expect(built).toContain("application_name=agentflow-high-throughput-worker");
  });
});
