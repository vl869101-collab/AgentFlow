import { prisma as defaultPrisma } from "../lib/prisma.js";
import {
  isHeartbeatActive,
  sendToDLQ,
  enqueueExecution,
  ORPHAN_HEARTBEAT_THRESHOLD_MS,
} from "./queue.js";
import { recordWorkflowAuditEvent } from "./audit-ledger.js";

export interface OrphanRecoveryOptions {
  thresholdMs?: number;
  policy?: "fail" | "resume";
  maxAttempts?: number;
  prismaClient?: any;
}

export interface ReapedExecutionRecord {
  executionId: string;
  workflowId: string;
  action: "failed" | "resumed";
  reason: string;
  checkpointNodesCount?: number;
  reapedAt: string;
}

export interface OrphanRecoveryReport {
  scanned: number;
  orphansFound: number;
  reaped: ReapedExecutionRecord[];
}

let reaperIntervalTimer: NodeJS.Timeout | null = null;

/**
 * Scans RUNNING workflow executions and recovers orphan executions
 * whose workers crashed or failed to send periodic heartbeats.
 */
export async function reapOrphanExecutions(options: OrphanRecoveryOptions = {}): Promise<OrphanRecoveryReport> {
  const db = options.prismaClient ?? defaultPrisma;
  const thresholdMs = options.thresholdMs ?? ORPHAN_HEARTBEAT_THRESHOLD_MS;
  const defaultPolicy = options.policy ?? "fail";
  const maxAttempts = options.maxAttempts ?? 3;
  const now = Date.now();

  const runningExecutions = await db.workflowExecution.findMany({
    where: { status: "RUNNING" },
  });

  const reaped: ReapedExecutionRecord[] = [];

  for (const execution of runningExecutions) {
    // 1. Check if execution has an active heartbeat in Redis/memory
    const active = await isHeartbeatActive(execution.id);
    if (active) {
      continue;
    }

    // 2. Check if enough time has elapsed since execution began
    const startedTime = new Date(execution.startedAt || execution.createdAt || now).getTime();
    if (now - startedTime < thresholdMs) {
      continue;
    }

    // 3. Execution is confirmed orphan. Determine recovery policy (fail vs resume)
    const execInput =
      execution.input && typeof execution.input === "object"
        ? (execution.input as Record<string, unknown>)
        : {};
    const effectivePolicy =
      options.policy ?? (execInput.recoveryPolicy === "resume" ? "resume" : defaultPolicy);

    if (effectivePolicy === "resume") {
      // Query completed checkpoints to preserve progress
      const nodeExecs = await db.nodeExecution.findMany({
        where: { executionId: execution.id },
      });
      const successfulNodes = nodeExecs ? nodeExecs.filter((n: any) => n.status === "SUCCESS") : [];

      // Transition back to PENDING so the queue/worker can pick it up
      await db.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "PENDING",
          error: null,
        },
      });

      // Append immutable cryptographically chained audit log
      await recordWorkflowAuditEvent({
        executionId: execution.id,
        action: "execution.orphan_resumed",
        actor: "orphan-reaper",
        decision: "resumed_from_checkpoint",
        payload: {
          checkpointCount: successfulNodes.length,
          policy: "resume",
          reason: `Heartbeat expired (> ${thresholdMs}ms)`,
        },
      });

      // Re-enqueue execution into the workflow queue with checkpoint metadata
      await enqueueExecution(execution.id, {
        resumedFromCheckpoint: true,
        checkpointCount: successfulNodes.length,
      });

      reaped.push({
        executionId: execution.id,
        workflowId: execution.workflowId,
        action: "resumed",
        reason: "orphan_recovered_resumed",
        checkpointNodesCount: successfulNodes.length,
        reapedAt: new Date().toISOString(),
      });
    } else {
      // Mark execution as FAILED
      await db.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          error: "orphan_recovered",
          finishedAt: new Date(),
        },
      });

      // Append immutable audit log
      await recordWorkflowAuditEvent({
        executionId: execution.id,
        action: "execution.orphan_recovered",
        actor: "orphan-reaper",
        decision: "marked_failed",
        payload: {
          reason: `Heartbeat expired (> ${thresholdMs}ms)`,
          policy: "fail",
          error: "orphan_recovered",
        },
      });

      // Route to Dead Letter Queue (DLQ)
      await sendToDLQ(execution.id, "orphan_recovered", {
        workflowId: execution.workflowId,
        orgId: execution.orgId,
        attemptsMade: maxAttempts,
        reason: "orphan_recovered",
      });

      reaped.push({
        executionId: execution.id,
        workflowId: execution.workflowId,
        action: "failed",
        reason: "orphan_recovered",
        reapedAt: new Date().toISOString(),
      });
    }
  }

  return {
    scanned: runningExecutions.length,
    orphansFound: reaped.length,
    reaped,
  };
}

/**
 * Starts periodic background orphan recovery reaper.
 */
export function startOrphanReaper(
  intervalMs = 60_000,
  options: OrphanRecoveryOptions = {},
): {
  stop: () => void;
  isRunning: () => boolean;
} {
  if (reaperIntervalTimer) {
    clearInterval(reaperIntervalTimer);
  }

  reaperIntervalTimer = setInterval(async () => {
    try {
      await reapOrphanExecutions(options);
    } catch (err) {
      console.warn("[OrphanReaper] Periodic scan error:", (err as Error).message);
    }
  }, intervalMs);
  reaperIntervalTimer.unref();

  return {
    stop: stopOrphanReaper,
    isRunning: () => reaperIntervalTimer !== null,
  };
}

/**
 * Stops periodic background orphan recovery reaper.
 */
export function stopOrphanReaper(): void {
  if (reaperIntervalTimer) {
    clearInterval(reaperIntervalTimer);
    reaperIntervalTimer = null;
  }
}
