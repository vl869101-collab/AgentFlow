import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { executeWorkflow } from "../services/executor.js";

export async function executionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.post("/trigger", async (request, reply) => {
    const body = request.body as { workflowId?: unknown; input?: unknown };
    if (!body || typeof body.workflowId !== "string" || !body.workflowId) {
      return reply.badRequest("workflowId required");
    }

    const userId = userIdFromRequest(request);
    const workflow = await prisma.workflow.findFirst({
      where: { id: body.workflowId, owner: { id: userId } },
    });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const execution = await executeWorkflow(body.workflowId, body.input);
    return reply.status(201).send(execution);
  });

  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    return prisma.workflowExecution.findMany({
      where: { userId },
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const execution = await prisma.workflowExecution.findFirst({
      where: { id, userId },
      include: { nodes: true, approvals: true, workflow: { select: { id: true, name: true } } },
    });
    if (!execution) return reply.code(404).send({ error: "Execution not found", code: "NOT_FOUND" });
    return execution;
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
