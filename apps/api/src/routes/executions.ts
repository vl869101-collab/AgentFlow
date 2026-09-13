import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseCursorPagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { checkQuota } from "../middleware/quota.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { executeWorkflowSchema } from "@agentflow/shared";
import { telemetry } from "../lib/otel.js";
import { recordAuditEvent, getExecutionAuditTrail } from "../services/audit-ledger.js";
import {
  getEventsAfter,
  subscribeToExecutionTelemetry,
  type ExecutionTelemetryEvent,
} from "../services/execution-telemetry.js";

export async function executionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Validate that if an organization context is requested, the user is a verified member
  app.addHook("preHandler", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const requestedOrgId = orgIdFromRequest(request);
    if (userId && requestedOrgId) {
      const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId, orgId: requestedOrgId } },
      });
      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
      }
    }
  });

  const isTest = process.env.NODE_ENV === "test";

  app.post("/trigger", { config: { rateLimit: { max: isTest ? 10000 : 60, timeWindow: "1 minute" } }, preHandler: checkQuota }, async (request, reply) => {
    const body = request.body as { workflowId?: unknown; input?: unknown; trigger?: unknown };
    if (!body || typeof body.workflowId !== "string" || !body.workflowId) {
      return reply.badRequest("workflowId required");
    }

    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const workflow = await prisma.workflow.findFirst({ where: { id: body.workflowId, ...(orgId ? { orgId } : { ownerId: userId }) } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const parsed = executeWorkflowSchema.parse({ input: body.input, trigger: body.trigger ?? "api" });
    const execution = await createWorkflowExecution(body.workflowId, parsed.input, { userId, trigger: parsed.trigger });
    await prisma.usageRecord.create({ data: { type: "execution", quantity: 1, orgId: workflow.orgId, userId } });

    const incomingTraceHeader =
      (request.headers["traceparent"] as string | undefined) ||
      (request.headers["x-traceparent"] as string | undefined);
    const traceInfo = telemetry.getOrCreateTraceParent(incomingTraceHeader);

    if (!(await enqueueExecution(execution.id, { traceparent: traceInfo.traceparent }))) {
      void runExecution(execution.id, {
        traceparent: traceInfo.traceparent,
        parentContext: traceInfo.context,
      });
    }
    return reply.status(202).send(execution);
  });

  app.get("/", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const query = request.query as {
      workflowId?: string;
      status?: string;
      trigger?: string;
      cursor?: string;
      limit?: string;
      paginate?: string;
      from?: string;
      to?: string;
      startDate?: string;
      endDate?: string;
    };

    const where: Record<string, unknown> = {
      ...(orgId ? { orgId } : { userId }),
    };
    if (query.workflowId) where.workflowId = query.workflowId;
    if (query.status) where.status = query.status;
    if (query.trigger) where.trigger = query.trigger;
    const dateGte = query.from || query.startDate;
    const dateLte = query.to || query.endDate;
    if (dateGte || dateLte) {
      const dateFilter: Record<string, Date> = {};
      if (dateGte) dateFilter.gte = new Date(dateGte);
      if (dateLte) dateFilter.lte = new Date(dateLte);
      where.startedAt = dateFilter;
    }

    const pagination = parseCursorPagination(request, reply, 50);
    const limit = pagination.limit;

    const findArgs: any = {
      where,
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: limit + 1,
    };

    if (pagination.isCursor && pagination.cursor) {
      findArgs.cursor = { id: pagination.cursor };
      findArgs.skip = 1;
    } else if (pagination.skip !== undefined && pagination.skip > 0) {
      findArgs.skip = pagination.skip;
    }

    const executions = await prisma.workflowExecution.findMany(findArgs);
    const hasMore = executions.length > limit;
    const items = hasMore ? executions.slice(0, limit) : executions;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    reply.header("X-Has-More", String(hasMore));
    if (nextCursor) {
      reply.header("X-Next-Cursor", nextCursor);
    }

    if (query.cursor !== undefined || query.paginate === "true" || query.paginate === "1") {
      return {
        items,
        nextCursor,
        hasMore,
        limit,
      };
    }

    return items;
  });

  app.get("/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });

    const [nodes, approvals, workflow] = await Promise.all([
      prisma.nodeExecution.findMany({ where: { executionId: id }, orderBy: { startedAt: "asc" } }),
      prisma.approval.findMany({ where: { executionId: id }, orderBy: { createdAt: "desc" } }),
      prisma.workflow.findFirst({ where: { id: execution.workflowId } }),
    ]);

    const traces = nodes.map((node: any) => ({
      id: node.id,
      nodeId: node.nodeId,
      status: node.status,
      input: node.input,
      output: node.output,
      error: node.error,
      startedAt: node.startedAt,
      finishedAt: node.finishedAt,
      duration: node.duration,
    }));

    let errorWorkflow: { id: string; name: string } | null = null;
    let snapshotSettings: Record<string, unknown> = {};
    const version = await prisma.workflowVersion.findFirst({
      where: { workflowId: execution.workflowId },
      orderBy: { version: "desc" },
    });
    if (version?.snapshot) {
      try {
        const snap = typeof version.snapshot === "string" ? JSON.parse(version.snapshot) : version.snapshot;
        if (snap && typeof snap === "object" && snap.settings) {
          snapshotSettings = snap.settings;
        }
      } catch {}
    }
    const rawWfSettings = workflow?.settings;
    let parsedWfSettings: Record<string, unknown> = {};
    if (rawWfSettings) {
      try {
        parsedWfSettings = typeof rawWfSettings === "string" ? JSON.parse(rawWfSettings) : (rawWfSettings as Record<string, unknown>);
      } catch {}
    }
    const combinedSettings = { ...snapshotSettings, ...parsedWfSettings };
    const errorWorkflowId = (combinedSettings.errorWorkflowId ?? combinedSettings.errorWorkflow ?? (workflow as any)?.errorWorkflowId ?? (workflow as any)?.errorWorkflow) as string | undefined;
    if (errorWorkflowId && typeof errorWorkflowId === "string") {
      const errWf = await prisma.workflow.findFirst({ where: { id: errorWorkflowId } });
      if (errWf) {
        errorWorkflow = { id: errWf.id, name: errWf.name };
      }
    }

    return {
      ...execution,
      nodes,
      traces,
      approvals,
      errorWorkflow,
      workflow: workflow ? { id: workflow.id, name: workflow.name } : null,
    };
  });

  app.get("/:id/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) {
      return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });
    }

    reply.hijack();
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();

    let isAborted = false;

    const sendEvent = (event: ExecutionTelemetryEvent) => {
      if (isAborted) return;
      try {
        reply.raw.write(`id: ${event.id}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        isAborted = true;
      }
    };

    const lastEventId =
      (request.headers["last-event-id"] as string | undefined) ||
      ((request.query as any)?.lastEventId as string | undefined);

    const replayed = getEventsAfter(id, lastEventId);
    for (const ev of replayed) {
      sendEvent(ev);
    }

    const isTerminal = ["SUCCESS", "COMPLETED", "FAILED", "CANCELLED"].includes(execution.status);
    const hasDeliveredFinished = replayed.some((e) => e.eventType === "execution_finished");

    if (isTerminal) {
      if (!hasDeliveredFinished) {
        sendEvent({
          id: `${id}:terminal`,
          seq: replayed.length > 0 ? replayed[replayed.length - 1].seq + 1 : 1,
          executionId: id,
          eventType: "execution_finished",
          status: execution.status,
          duration: execution.duration ?? undefined,
          timestamp: (execution.finishedAt ?? new Date()).toISOString(),
          output: execution.output,
          error: execution.error ?? undefined,
        });
      }
      setTimeout(() => {
        if (!isAborted) {
          try {
            reply.raw.end();
          } catch {}
        }
      }, 50);
      return;
    }

    const unsubscribe = await subscribeToExecutionTelemetry(id, (event) => {
      if (isAborted) return;
      sendEvent(event);
      if (event.eventType === "execution_finished") {
        setTimeout(() => {
          if (!isAborted) {
            try {
              reply.raw.end();
            } catch {}
          }
        }, 500);
      }
    });

    const heartbeat = setInterval(() => {
      if (!isAborted) {
        try {
          reply.raw.write(": keepalive\n\n");
        } catch {
          isAborted = true;
          clearInterval(heartbeat);
        }
      }
    }, 15000);

    request.raw.on("close", () => {
      isAborted = true;
      clearInterval(heartbeat);
      void unsubscribe();
    });
  });

  app.get("/:id/traces", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });

    const nodes = await prisma.nodeExecution.findMany({
      where: { executionId: id },
      orderBy: { startedAt: "asc" },
    });

    const traces = nodes.map((node: any) => ({
      id: node.id,
      nodeId: node.nodeId,
      status: node.status,
      input: node.input,
      output: node.output,
      error: node.error,
      startedAt: node.startedAt,
      finishedAt: node.finishedAt,
      duration: node.duration,
    }));

    const otelSpans = telemetry.getSpansByExecutionId(id);
    return {
      executionId: id,
      traceId: otelSpans[0]?.traceId || (execution as any).traceId || `trace-${id}`,
      spans: traces,
      otelSpans,
      status: execution.status,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      duration: execution.duration,
      traces,
    };
  });

  app.post("/:id/cancel", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const where = orgId ? { id, orgId, status: { in: ["PENDING", "RUNNING"] } } : { id, userId, status: { in: ["PENDING", "RUNNING"] } };
    const execution = await prisma.workflowExecution.findFirst({ where });
    const result = await prisma.workflowExecution.updateMany({
      where,
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (result.count === 0) return reply.code(404).send({ error: "Execution not found or not cancellable", code: "NOT_CANCELLABLE" });
    if (execution?.orgId) {
      await recordAuditEvent({
        orgId: execution.orgId,
        userId,
        action: "execution.cancel_requested",
        resource: "execution",
        resourceId: id,
        metadata: { workflowId: execution.workflowId, previousStatus: execution.status },
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });
    }
    return { ok: true };
  });

  app.post("/:id/retry", { config: { rateLimit: { max: isTest ? 10000 : 30, timeWindow: "1 minute" } }, preHandler: checkQuota }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);

    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) {
      return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });
    }

    const workflow = await prisma.workflow.findFirst({
      where: { id: execution.workflowId, ...(orgId ? { orgId } : { ownerId: userId }) },
    });
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    }

    const body = (request.body as { input?: unknown } | null | undefined) ?? {};
    const input = body.input !== undefined ? body.input : execution.input;

    const newExecution = await createWorkflowExecution(execution.workflowId, input, {
      userId,
      trigger: "retry",
      parentExecutionId: execution.id,
    });

    await prisma.usageRecord.create({
      data: { type: "execution", quantity: 1, orgId: workflow.orgId, userId },
    });

    if (execution.orgId) {
      await recordAuditEvent({
        orgId: execution.orgId,
        userId,
        action: "execution.retry_requested",
        resource: "execution",
        resourceId: newExecution.id,
        metadata: {
          workflowId: execution.workflowId,
          parentExecutionId: execution.id,
          originalTrigger: execution.trigger,
        },
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      }).catch(() => {});
    }

    const incomingTraceHeader =
      (request.headers["traceparent"] as string | undefined) ||
      (request.headers["x-traceparent"] as string | undefined);
    const traceInfo = telemetry.getOrCreateTraceParent(incomingTraceHeader);

    if (!(await enqueueExecution(newExecution.id, { traceparent: traceInfo.traceparent }))) {
      void runExecution(newExecution.id, {
        traceparent: traceInfo.traceparent,
        parentContext: traceInfo.context,
      });
    }

    return reply.status(202).send({
      ...newExecution,
      parentExecutionId: execution.id,
    });
  });

  // node-level execution logs — org-scoped to prevent IDOR (see redesign audit H-05)
  app.get("/:id/nodes", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });

    return prisma.nodeExecution.findMany({
      where: { executionId: id },
      orderBy: { startedAt: "asc" },
    });
  });

  app.get("/:id/audit", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgId ? { id, orgId } : { id, userId },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });

    const auditTrail = await getExecutionAuditTrail(id);
    return auditTrail;
  });
}
