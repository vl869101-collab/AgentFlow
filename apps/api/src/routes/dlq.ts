import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getDLQJobsList,
  getDLQJobById,
  replayDLQJob,
  replayBatchDLQ,
  replayAllDLQ,
  purgeDLQ,
  getQueueMetrics,
} from "../services/queue.js";

export async function dlqRoutes(app: FastifyInstance) {
  // List failed jobs in Dead Letter Queue with filters & pagination
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as Record<string, string>) ?? {};
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const workflowId = query.workflowId;
    const orgId = query.orgId;

    const result = await getDLQJobsList({ workflowId, orgId, limit, offset });
    return {
      items: result.jobs,
      total: result.total,
      limit,
      offset,
    };
  });

  // Get metrics & anomaly detection for DLQ
  app.get("/metrics", async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await getQueueMetrics();
    return {
      dlq: metrics.dlq,
      anomaly: metrics.dlq.anomalyAlert ?? false,
      timestamp: new Date().toISOString(),
    };
  });

  // Get specific job details
  app.get("/:jobId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await getDLQJobById(jobId);
    if (!job) {
      return reply.code(404).send({ error: `DLQ job '${jobId}' not found`, code: "NOT_FOUND" });
    }
    return job;
  });

  // Replay job(s) from DLQ back to primary workflow queue
  app.post("/replay", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { jobId?: string; jobIds?: string[]; all?: boolean }) ?? {};

    if (body.jobId) {
      const success = await replayDLQJob(body.jobId);
      if (!success) {
        return reply.code(404).send({ error: `DLQ job '${body.jobId}' not found or replay failed`, code: "NOT_FOUND" });
      }
      return { ok: true, replayed: 1, failed: 0 };
    }

    if (Array.isArray(body.jobIds) && body.jobIds.length > 0) {
      const result = await replayBatchDLQ(body.jobIds);
      return { ok: true, ...result };
    }

    if (body.all === true) {
      const result = await replayAllDLQ();
      return { ok: true, ...result };
    }

    return reply.code(400).send({
      error: "Must provide 'jobId', 'jobIds' array, or 'all: true'",
      code: "INVALID_REQUEST",
    });
  });

  // Purge/clear DLQ
  app.delete("/purge", async (_request: FastifyRequest, reply: FastifyReply) => {
    const purged = await purgeDLQ();
    return { ok: true, purged };
  });
}
