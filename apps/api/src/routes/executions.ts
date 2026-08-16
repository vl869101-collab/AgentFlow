import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { checkQuota } from "../middleware/quota.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { executeWorkflowSchema } from "@agentflow/shared";

export async function executionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.post("/trigger", { preHandler: checkQuota }, async (request, reply) => {
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
    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id);
    return reply.status(202).send(execution);
  });

  app.get("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const query = request.query as { workflowId?: string; status?: string };
    const pagination = parsePagination(request, reply, 50);
    return prisma.workflowExecution.findMany({
      where: {
        ...(orgIdFromRequest(request) ? { orgId: orgIdFromRequest(request) } : { userId }),
        ...(query.workflowId ? { workflowId: query.workflowId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      ...pagination,
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: orgIdFromRequest(request) ? { id, orgId: orgIdFromRequest(request) } : { id, userId },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });
    const [nodes, approvals, workflow] = await Promise.all([
      prisma.nodeExecution.findMany({ where: { executionId: id }, orderBy: { startedAt: "asc" } }),
      prisma.approval.findMany({ where: { executionId: id }, orderBy: { createdAt: "desc" } }),
      prisma.workflow.findFirst({ where: { id: execution.workflowId } }),
    ]);
    return { ...execution, nodes, approvals, workflow: workflow ? { id: workflow.id, name: workflow.name } : null };
  });

  app.post("/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const result = await prisma.workflowExecution.updateMany({
      where: { id, userId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (result.count === 0) return reply.code(404).send({ error: "Execution not found or not cancellable", code: "NOT_CANCELLABLE" });
    return { ok: true };
  });

  // node-level execution logs
  app.get("/:id/nodes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({ where: { id, userId } });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });

    return prisma.nodeExecution.findMany({
      where: { executionId: id },
      orderBy: { startedAt: "asc" },
    });
  });
}
