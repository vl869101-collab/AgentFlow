import { Queue, type Job } from "bullmq";
import { getEnv } from "../lib/env.js";

let workflowQueue: Queue | undefined;
let dlqQueue: Queue | undefined;

function getRedisConnection() {
  const redis = new URL(getEnv().REDIS_URL);
  return {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function getWorkflowQueue(): Queue | undefined {
  const enabled = process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) return undefined;
  if (workflowQueue) return workflowQueue;

  workflowQueue = new Queue("workflows", { connection: getRedisConnection() });
  return workflowQueue;
}

export function getDLQQueue(): Queue | undefined {
  const enabled = process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) return undefined;
  if (dlqQueue) return dlqQueue;

  dlqQueue = new Queue("workflows-dlq", { connection: getRedisConnection() });
  return dlqQueue;
}

export function getQueueByName(name: "workflows" | "workflows-dlq" | string): Queue | undefined {
  if (name === "workflows") return getWorkflowQueue();
  if (name === "workflows-dlq" || name === "dlq") return getDLQQueue();
  return undefined;
}

export async function getQueueMetrics() {
  const q = getWorkflowQueue();
  const dlq = getDLQQueue();

  const emptyStats = { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  const getCounts = async (queue?: Queue) => {
    if (!queue) return emptyStats;
    try {
      const counts = await queue.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused");
      return {
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      };
    } catch {
      return emptyStats;
    }
  };

  return {
    workflows: await getCounts(q),
    dlq: await getCounts(dlq),
  };
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const DEFAULT_DLQ_OPTIONS = {
  attempts: 1,
  removeOnComplete: 5000,
  removeOnFail: 10000,
};

export async function sendToDLQ(executionId: string, error: string, metadata?: Record<string, unknown>): Promise<boolean> {
  const dlq = getDLQQueue();
  if (!dlq) return false;
  try {
    await dlq.add(
      "dead-letter",
      { executionId, error, metadata, timestamp: new Date().toISOString() },
      { jobId: `dlq-${executionId}-${Date.now()}`, ...DEFAULT_DLQ_OPTIONS }
    );
    return true;
  } catch (err) {
    console.error("Unable to enqueue into DLQ", err);
    return false;
  }
}

export async function enqueueExecution(executionId: string): Promise<boolean> {
  const queue = getWorkflowQueue();
  if (!queue) return false;
  try {
    await queue.add("execute", { executionId }, { jobId: executionId, ...DEFAULT_JOB_OPTIONS });
    return true;
  } catch (error) {
    console.error("Unable to enqueue workflow execution", error);
    return false;
  }
}

export async function retryFailedJobs(queueName: "workflows" | "workflows-dlq" | string = "workflows"): Promise<number> {
  const queue = getQueueByName(queueName);
  if (!queue) return 0;
  try {
    const failedJobs = await queue.getFailed(0, 100);
    let retried = 0;
    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }
    return retried;
  } catch (err) {
    console.error(`Error retrying failed jobs in ${queueName}:`, err);
    return 0;
  }
}

export async function retryJob(queueName: string, jobId: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    await job.retry();
    return true;
  } catch (err) {
    console.error(`Error retrying job ${jobId} in ${queueName}:`, err);
    return false;
  }
}

export async function getQueueJobs(
  queueName: string,
  types: Array<"active" | "waiting" | "completed" | "failed" | "delayed" | "paused"> = ["failed", "waiting", "active"],
  start = 0,
  end = 50
) {
  const queue = getQueueByName(queueName);
  if (!queue) return [];
  try {
    const jobs = await queue.getJobs(types as any, start, end);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (err) {
    console.error(`Error getting jobs for ${queueName}:`, err);
    return [];
  }
}

export async function cleanQueue(queueName: string, grace = 1000, limit = 1000, type: "completed" | "failed" = "completed") {
  const queue = getQueueByName(queueName);
  if (!queue) return [];
  try {
    return await queue.clean(grace, limit, type);
  } catch (err) {
    console.error(`Error cleaning queue ${queueName}:`, err);
    return [];
  }
}

export async function pauseQueue(queueName: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    await queue.pause();
    return true;
  } catch {
    return false;
  }
}

export async function resumeQueue(queueName: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    await queue.resume();
    return true;
  } catch {
    return false;
  }
}

export async function closeExecutionQueue() {
  await workflowQueue?.close();
  await dlqQueue?.close();
  workflowQueue = undefined;
  dlqQueue = undefined;
}
