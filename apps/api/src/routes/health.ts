import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getRedisClient } from "../lib/redis.js";
import { getWorkflowQueue, getDLQQueue } from "../services/queue.js";
import os from "node:os";

export interface DatabaseConnectionSaturationStatus {
  status: "ok" | "warning" | "saturated" | "unsupported";
  activeConnections?: number;
  maxConnections?: number;
  usageRatio?: number;
  waitingQueriesCount?: number;
  checkedAt: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  checks: Record<string, string>;
  latencyMs?: Record<string, number>;
  metrics?: {
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
      systemFreeMb: number;
      systemTotalMb: number;
    };
    deadlockCheck?: {
      status: "ok" | "deadlock_detected" | "unsupported";
      activeLocksCount?: number;
      waitingQueriesCount?: number;
      checkedAt: string;
    };
    connectionSaturation?: DatabaseConnectionSaturationStatus;
    workers?: {
      workflowQueue: {
        active: number;
        waiting: number;
        failed: number;
        paused: boolean;
      };
      dlqQueue: {
        waiting: number;
        failed: number;
      };
    };
  };
}

export async function checkDeadlockStatus(): Promise<{
  status: "ok" | "deadlock_detected" | "unsupported";
  activeLocksCount?: number;
  waitingQueriesCount?: number;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    return {
      status: "ok",
      activeLocksCount: 0,
      waitingQueriesCount: 0,
      checkedAt,
    };
  }

  try {
    // Check PostgreSQL pg_stat_activity and pg_locks for waiting queries / blocked transactions
    const waitingQueries: Array<{ count: bigint | number }> = await prisma.$queryRaw`
      SELECT count(*) as count
      FROM pg_stat_activity
      WHERE wait_event_type IS NOT NULL
        AND wait_event_type = 'Lock'
        AND state = 'active'
    `;
    const count = Number(waitingQueries?.[0]?.count ?? 0);
    return {
      status: count > 10 ? "deadlock_detected" : "ok",
      waitingQueriesCount: count,
      checkedAt,
    };
  } catch {
    // If not PostgreSQL or insufficient permissions, report ok or unsupported safely
    return {
      status: "unsupported",
      checkedAt,
    };
  }
}

/**
 * Checks PostgreSQL connection saturation: active connections vs max_connections.
 * Emits warning when connection usage exceeds 80% and saturated when >= 90%.
 */
export async function checkConnectionSaturation(): Promise<DatabaseConnectionSaturationStatus> {
  const checkedAt = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    return {
      status: "ok",
      activeConnections: 1,
      maxConnections: 100,
      usageRatio: 0.01,
      waitingQueriesCount: 0,
      checkedAt,
    };
  }

  try {
    const [connStats, maxConnResult]: [Array<{ count: bigint | number; waiting: bigint | number }>, Array<{ setting: string }>] =
      await Promise.all([
        prisma.$queryRaw`
          SELECT
            count(*) as count,
            count(*) FILTER (WHERE wait_event_type = 'Lock' OR state = 'active') as waiting
          FROM pg_stat_activity
        `,
        prisma.$queryRaw`
          SELECT setting FROM pg_settings WHERE name = 'max_connections'
        `,
      ]);

    const activeConnections = Number(connStats?.[0]?.count ?? 0);
    const waitingQueriesCount = Number(connStats?.[0]?.waiting ?? 0);
    const maxConnections = Number(maxConnResult?.[0]?.setting ?? 100);

    const usageRatio = maxConnections > 0 ? Math.round((activeConnections / maxConnections) * 100) / 100 : 0;

    let status: DatabaseConnectionSaturationStatus["status"] = "ok";
    if (usageRatio >= 0.9 || activeConnections >= maxConnections - 5) {
      status = "saturated";
    } else if (usageRatio >= 0.8) {
      status = "warning";
    }

    return {
      status,
      activeConnections,
      maxConnections,
      usageRatio,
      waitingQueriesCount,
      checkedAt,
    };
  } catch {
    return {
      status: "unsupported",
      checkedAt,
    };
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, string> = {};
    const latencyMs: Record<string, number> = {};

    // 1. PostgreSQL check & latency
    const dbStart = performance.now();
    try {
      if (process.env.DATABASE_URL) {
        await prisma.$queryRaw`SELECT 1`;
      }
      latencyMs.postgres = Math.round((performance.now() - dbStart) * 100) / 100;
      checks.postgres = process.env.DATABASE_URL ? "ok" : "in-memory";
    } catch (err) {
      latencyMs.postgres = Math.round((performance.now() - dbStart) * 100) / 100;
      checks.postgres = "error";
    }

    // 2. Redis latency & health check
    const redisClient = getRedisClient();
    if (redisClient) {
      const redisStart = performance.now();
      try {
        const pingRes = await Promise.race([
          redisClient.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Redis ping timeout")), 2000)),
        ]);
        latencyMs.redis = Math.round((performance.now() - redisStart) * 100) / 100;
        checks.redis = pingRes === "PONG" ? "ok" : "degraded";
      } catch {
        latencyMs.redis = Math.round((performance.now() - redisStart) * 100) / 100;
        checks.redis = "error";
      }
    } else {
      checks.redis = process.env.ALLOW_MEMORY_DB === "1" ? "in-memory" : "not-configured";
    }

    // 3. Workers & Queue status
    const workflowQ = getWorkflowQueue();
    const dlqQ = getDLQQueue();
    let workerStatus = "idle";
    let workerCounts = {
      workflowQueue: { active: 0, waiting: 0, failed: 0, paused: false },
      dlqQueue: { waiting: 0, failed: 0 },
    };

    if (workflowQ) {
      try {
        const [wfCounts, isPaused] = await Promise.all([
          workflowQ.getJobCounts("active", "waiting", "failed"),
          workflowQ.isPaused(),
        ]);
        workerCounts.workflowQueue = {
          active: wfCounts.active ?? 0,
          waiting: wfCounts.waiting ?? 0,
          failed: wfCounts.failed ?? 0,
          paused: isPaused,
        };
        checks.workflowQueue = isPaused ? "paused" : "ok";
        workerStatus = "active";
      } catch {
        checks.workflowQueue = "error";
      }
    } else {
      checks.workflowQueue = "in-memory";
    }

    if (dlqQ) {
      try {
        const dlqCounts = await dlqQ.getJobCounts("waiting", "failed");
        workerCounts.dlqQueue = {
          waiting: dlqCounts.waiting ?? 0,
          failed: dlqCounts.failed ?? 0,
        };
        checks.dlqQueue = (dlqCounts.failed ?? 0) > 50 ? "degraded" : "ok";
      } catch {
        checks.dlqQueue = "error";
      }
    } else {
      checks.dlqQueue = "in-memory";
    }
    checks.workers = workerStatus;

    // 4. Memory metrics
    const mem = process.memoryUsage();
    const memoryMetrics = {
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
      externalMb: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
      systemFreeMb: Math.round((os.freemem() / (1024 * 1024)) * 100) / 100,
      systemTotalMb: Math.round((os.totalmem() / (1024 * 1024)) * 100) / 100,
    };
    checks.memory = memoryMetrics.heapUsedMb > 1500 ? "warning" : "ok";

    // 5. Deadlock check
    const deadlock = await checkDeadlockStatus();
    checks.deadlock = deadlock.status === "deadlock_detected" ? "error" : "ok";

    // 6. DB Connection Saturation & Pool monitoring
    const saturation = await checkConnectionSaturation();
    checks.connectionSaturation = saturation.status === "saturated" ? "error" : saturation.status === "warning" ? "warning" : "ok";

    const hasError = Object.values(checks).some((v) => v === "error");
    const isDegraded = Object.values(checks).some((v) => v === "degraded" || v === "warning" || v === "paused");

    const statusCode = hasError ? 503 : 200;

    const responseBody: HealthCheckResponse = {
      status: hasError ? "error" : isDegraded ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      checks,
      latencyMs,
      metrics: {
        memory: memoryMetrics,
        deadlockCheck: deadlock,
        connectionSaturation: saturation,
        workers: workerCounts,
      },
    };

    return reply.code(statusCode).send(responseBody);
  });
}
