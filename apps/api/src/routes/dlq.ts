import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getDLQJobsList,
  getDLQJobById,
  replayDLQJob,
  replayBatchDLQ,
  replayAllDLQ,
  purgeDLQ,
  getQueueMetrics,
  getDLQIncidents,
  getDLQIncidentById,
  updateDLQIncidentStatus,
  type DLQIncidentRecord,
} from "../services/queue.js";
import { deadMansSwitch, type DeadMansSwitchConfig } from "../services/dead-mans-switch.js";
import { requireAdmin } from "../middleware/auth.js";

export async function dlqRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAdmin);

  // List failed jobs in Dead Letter Queue with filters & pagination
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as Record<string, string>) ?? {};
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const workflowId = query.workflowId;
    const orgId = query.orgId;
    const startDate = query.startDate;
    const endDate = query.endDate;
    const search = query.search || query.q;

    const result = await getDLQJobsList({ workflowId, orgId, startDate, endDate, search, limit, offset });
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

  // Get incident history & audit log for DLQ
  app.get("/incidents", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as Record<string, string>) ?? {};
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const workflowId = query.workflowId;
    const orgId = query.orgId;
    const status = query.status;
    const severity = query.severity;

    const result = await getDLQIncidents({ workflowId, orgId, status, severity, limit, offset });
    return {
      items: result.incidents,
      total: result.total,
      limit,
      offset,
    };
  });

  // Get specific incident details
  app.get("/incidents/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const incident = await getDLQIncidentById(id);
    if (!incident) {
      return reply.code(404).send({ error: `Incident '${id}' not found`, code: "NOT_FOUND" });
    }
    return incident;
  });

  // Update incident status
  app.patch("/incidents/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { status?: DLQIncidentRecord["status"] }) ?? {};
    if (!body.status) {
      return reply.code(400).send({ error: "Missing status field", code: "INVALID_REQUEST" });
    }
    const updated = await updateDLQIncidentStatus(id, body.status);
    if (!updated) {
      return reply.code(404).send({ error: `Incident '${id}' not found`, code: "NOT_FOUND" });
    }
    return { ok: true, incident: updated };
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

  // Get Dead Man's Switch alert configuration
  app.get("/alerts/config", async (_request: FastifyRequest, reply: FastifyReply) => {
    return {
      config: deadMansSwitch.getConfig(),
    };
  });

  // Update Dead Man's Switch alert configuration
  app.post("/alerts/config", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Partial<DeadMansSwitchConfig>) ?? {};
    deadMansSwitch.updateConfig(body);
    return {
      ok: true,
      config: deadMansSwitch.getConfig(),
    };
  });

  // Manually trigger a test alert via Dead Man's Switch
  app.post("/alerts/test", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { executionId?: string; error?: string }) ?? {};
    const executionId = body.executionId || `test-exec-${Date.now()}`;
    const errorMsg = body.error || "Manual Dead Man's Switch Test Alert";

    const testIncident: DLQIncidentRecord = {
      id: `test-inc-${Date.now()}`,
      jobId: `test-job-${Date.now()}`,
      executionId,
      error: errorMsg,
      timestamp: new Date().toISOString(),
      severity: "HIGH",
      status: "OPEN",
    };

    const discordPayload = deadMansSwitch.formatDiscordAlert(testIncident, 1);
    const slackPayload = deadMansSwitch.formatSlackAlert(testIncident, 1);

    return {
      ok: true,
      testIncident,
      formattedAlerts: {
        discord: discordPayload,
        slack: slackPayload,
      },
    };
  });
}
