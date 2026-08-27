import { Queue, Worker } from "bullmq";
import os from "node:os";
import { prisma } from "./lib/prisma.js";
import { getEnv } from "./lib/env.js";
import { runExecution } from "./services/executor.js";
import { sendToDLQ, DEFAULT_JOB_OPTIONS } from "./services/queue.js";
import { telemetry } from "./lib/otel.js";
import { cronScheduler } from "./services/cron-scheduler.js";
import { scanAndRefreshExpiringCredentials } from "./services/vault/oauth-refresh.js";

const env = getEnv();
const redis = new URL(env.REDIS_URL);
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
};

const cpus = os.cpus().length || 1;
export const concurrency = Math.max(2, cpus * 2);

export const workflowQueue = new Queue("workflows", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
export const oauthRefreshQueue = new Queue("oauth-refresh", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

export const worker = new Worker(
  "workflows",
  async (job) => {
    // Check if this is a repeatable cron trigger job from BullMQ
    if (job.name === "cron-trigger" || job.data?.isCron) {
      const workflowId = String(job.data?.workflowId ?? "");
      if (workflowId) {
        const triggered = await cronScheduler.triggerCron(workflowId);
        return {
          status: triggered ? "TRIGGERED" : "SKIPPED_OVERLAP",
          workflowId,
          isCron: true,
        };
      }
    }

    const executionId = String(job.data?.executionId ?? "");
    if (!executionId) throw new Error("Workflow job is missing executionId");

    // Extract W3C trace context from BullMQ job data (TASK-10)
    const traceParent = job.data?.traceparent || job.data?.traceParent || job.data?.traceContext?.traceparent;
    const parentContext = telemetry.parseTraceParent(traceParent);
    const workerSpan = telemetry.startSpan("bullmq.job.workflows", {
      "execution.id": executionId,
      "job.id": String(job.id || ""),
      "job.name": String(job.name || ""),
      "job.attempts_made": job.attemptsMade ?? 0,
    }, parentContext);

    try {
      // The executor loads the workflow graph, executes every reachable node,
      // records node-level input/output/status and finalizes the execution.
      const result = await runExecution(executionId, {
        parentContext: {
          traceId: workerSpan.traceId,
          spanId: workerSpan.spanId,
          traceFlags: "01",
        },
      });
      if (result.status === "FAILED") {
        throw new Error(result.error || "Workflow execution failed");
      }
      workerSpan.setStatus("OK");
      workerSpan.end();
      return { executionId, status: result.status };
    } catch (error) {
      workerSpan.recordException(error);
      workerSpan.setStatus("ERROR", error instanceof Error ? error.message : String(error));
      workerSpan.end();
      throw error;
    }
  },
  { connection, concurrency },
);

export const oauthRefreshWorker = new Worker(
  "oauth-refresh",
  async (job) => {
    const thresholdMinutes = Number(job.data?.thresholdMinutes ?? 30);
    const span = telemetry.startSpan("bullmq.job.oauth_refresh", {
      "job.id": String(job.id || ""),
      "job.name": String(job.name || ""),
      "threshold.minutes": thresholdMinutes,
    });
    try {
      const result = await scanAndRefreshExpiringCredentials(thresholdMinutes);
      span.setAttribute("oauth.scanned", result.scanned);
      span.setAttribute("oauth.refreshed", result.refreshed);
      span.setAttribute("oauth.failed", result.failed);
      span.setStatus("OK");
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus("ERROR", error instanceof Error ? error.message : String(error));
      span.end();
      throw error;
    }
  },
  { connection, concurrency: 1 },
);

export async function scheduleOAuthRefreshJob(intervalMs = 10 * 60 * 1000): Promise<void> {
  try {
    await oauthRefreshQueue.add(
      "scan-and-refresh",
      { thresholdMinutes: 30 },
      {
        repeat: {
          every: intervalMs, // 10 minutes default
        },
        jobId: "periodic-oauth-refresh",
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  } catch (err) {
    console.error("Failed to schedule repeatable OAuth refresh job:", err);
  }
}

worker.on("failed", async (job, error) => {
  if (!job?.data?.executionId) return;
  const executionId = String(job.data.executionId);
  try {
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: "FAILED", error: error.message, finishedAt: new Date() },
    });
    // Send to Dead Letter Queue (DLQ) if retries exhausted
    const attemptsMade = job.attemptsMade ?? 1;
    const maxAttempts = job.opts?.attempts ?? DEFAULT_JOB_OPTIONS.attempts;
    if (attemptsMade >= maxAttempts) {
      await sendToDLQ(executionId, error.message, { attemptsMade, jobId: job.id });
    }
  } catch (updateError) {
    console.error("Failed to persist worker error or send to DLQ", updateError);
  }
});

worker.on("ready", () => console.log(`AgentFlow workflow worker ready (concurrency: ${concurrency}, cpus: ${cpus})`));
worker.on("error", (error) => console.error("AgentFlow workflow worker error", error));

oauthRefreshWorker.on("ready", () => console.log("AgentFlow OAuth refresh worker ready"));
oauthRefreshWorker.on("error", (error) => console.error("AgentFlow OAuth refresh worker error", error));

async function shutdown(signal: string) {
  console.log(`Shutting down workflow worker (${signal})`);
  cronScheduler.stop();
  await worker.close();
  await workflowQueue.close();
  await oauthRefreshWorker.close();
  await oauthRefreshQueue.close();
  if (typeof prisma.$disconnect === "function") await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

