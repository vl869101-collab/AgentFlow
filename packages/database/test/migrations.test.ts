import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildPrismaDatasourceUrl, createPrismaClient } from "../src/index";

describe("Database Migrations Audit & Reversibility", () => {
  const migrationsDir = path.resolve(__dirname, "../prisma/migrations");

  it("should have migration directories with valid up migration.sql files", () => {
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const migrationFolders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    expect(migrationFolders.length).toBeGreaterThanOrEqual(2);

    for (const folder of migrationFolders) {
      const upFile = path.join(migrationsDir, folder, "migration.sql");
      expect(fs.existsSync(upFile), `migration.sql should exist in ${folder}`).toBe(true);
      const sql = fs.readFileSync(upFile, "utf8");
      expect(sql.trim().length).toBeGreaterThan(0);
    }
  });

  it("should have corresponding down.sql files for reversibility", () => {
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const migrationFolders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const folder of migrationFolders) {
      const downFile = path.join(migrationsDir, folder, "down.sql");
      expect(fs.existsSync(downFile), `down.sql should exist for reversible rollback in ${folder}`).toBe(true);
      const sql = fs.readFileSync(downFile, "utf8");
      expect(sql.trim().length).toBeGreaterThan(0);
    }
  });

  it("20260811_backend_hardening down.sql drops added indexes and restores Approval_userId_key", () => {
    const downPath = path.join(migrationsDir, "20260811_backend_hardening", "down.sql");
    const downSql = fs.readFileSync(downPath, "utf8");
    expect(downSql).toContain('DROP INDEX IF EXISTS "Organization_plan_idx"');
    expect(downSql).toContain('DROP INDEX IF EXISTS "Approval_executionId_status_idx"');
    expect(downSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Approval_userId_key"');
  });

  it("202608160001_refresh_tokens down.sql drops constraints, indexes and table", () => {
    const downPath = path.join(migrationsDir, "202608160001_refresh_tokens", "down.sql");
    const downSql = fs.readFileSync(downPath, "utf8");
    expect(downSql).toContain('DROP TABLE IF EXISTS "RefreshToken"');
    expect(downSql).toContain('DROP INDEX IF EXISTS "RefreshToken_jti_key"');
    expect(downSql).toContain('DROP INDEX IF EXISTS "RefreshToken_tokenHash_key"');
  });

  it("buildPrismaDatasourceUrl enforces Connection Budget and Pooling Policy", () => {
    const raw = "postgresql://usr:pwd@localhost:5432/agentflow";
    const built = buildPrismaDatasourceUrl(raw, {
      connectionLimit: 12,
      poolTimeoutSeconds: 15,
      connectTimeoutSeconds: 10,
      applicationName: "agentflow-test-runner",
    });

    expect(built).toContain("connection_limit=12");
    expect(built).toContain("pool_timeout=15");
    expect(built).toContain("connect_timeout=10");
    expect(built).toContain("application_name=agentflow-test-runner");
  });
});
