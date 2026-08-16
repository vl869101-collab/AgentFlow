import { Queue } from "bullmq";
import { getEnv } from "../lib/env.js";

let workflowQueue: Queue | undefined;

function getQueue(): Queue | undefined {
  const enabled = process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) return undefined;
  if (workflowQueue) return workflowQueue;

  const redis = new URL(getEnv().REDIS_URL);
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
  workflowQueue = new Queue("workflows", { connection });
  return workflowQueue;
}

export async function enqueueExecution(executionId: string): Promise<boolean> {
  const queue = getQueue();
  if (!queue) return false;
  try {
    await queue.add("execute", { executionId }, { jobId: executionId, removeOnComplete: 1000, removeOnFail: 5000 });
    return true;
  } catch (error) {
    console.error("Unable to enqueue workflow execution", error);
    return false;
  }
}

export async function closeExecutionQueue() {
  await workflowQueue?.close();
  workflowQueue = undefined;
}
