import { Queue, Worker } from "bullmq";
import { prisma } from "./lib/prisma.js";
import { getEnv } from "./lib/env.js";
import { runExecution } from "./services/executor.js";

const env = getEnv();
const redis = new URL(env.REDIS_URL);
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
};

export const workflowQueue = new Queue("workflows", { connection });

const worker = new Worker(
  "workflows",
  async (job) => {
    const executionId = String(job.data?.executionId ?? "");
    if (!executionId) throw new Error("Workflow job is missing executionId");

    // The executor loads the workflow graph, executes every reachable node,
    // records node-level input/output/status and finalizes the execution.
    const result = await runExecution(executionId);
    if (result.status === "FAILED") throw new Error(result.error || "Workflow execution failed");
    return { executionId, status: result.status };
  },
  { connection, concurrency: 5 },
);

worker.on("failed", async (job, error) => {
  if (!job?.data?.executionId) return;
  try {
    await prisma.workflowExecution.update({
      where: { id: String(job.data.executionId) },
      data: { status: "FAILED", error: error.message, finishedAt: new Date() },
    });
  } catch (updateError) {
    console.error("Failed to persist worker error", updateError);
  }
});

worker.on("ready", () => console.log("AgentFlow workflow worker ready"));
worker.on("error", (error) => console.error("AgentFlow workflow worker error", error));

async function shutdown(signal: string) {
  console.log(`Shutting down workflow worker (${signal})`);
  await worker.close();
  await workflowQueue.close();
  if (typeof prisma.$disconnect === "function") await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
