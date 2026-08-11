import { Worker, Queue } from "bullmq";
import { prisma } from "./lib/prisma.js";
import { getEnv } from "./lib/env.js";

const env = getEnv();
const connection = { host: new URL(env.REDIS_URL).hostname, port: Number(new URL(env.REDIS_URL).port) || 6379 };

export const workflowQueue = new Queue("workflows", { connection });

const worker = new Worker(
  "workflows",
  async (job) => {
    const { executionId } = job.data;
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: "RUNNING" },
    });

    // TODO: iterate nodes in topological order, execute each, record NodeExecution
    // for now, mark as success
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: "SUCCESS", finishedAt: new Date(), duration: Date.now() - Date.now() },
    });
  },
  { connection, concurrency: 5 },
);

worker.on("failed", async (job, err) => {
  if (job?.data?.executionId) {
    await prisma.workflowExecution.update({
      where: { id: job.data.executionId },
      data: { status: "FAILED", error: err.message, finishedAt: new Date() },
    });
  }
});

worker.on("ready", () => {
  console.log("BullMQ worker ready");
});
