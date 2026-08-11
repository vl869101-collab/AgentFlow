import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { decideApprovalSchema } from "@agentflow/shared";

export async function approvalRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    return prisma.approval.findMany({
      where: { userId, status: "PENDING" },
      include: { execution: { include: { workflow: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/:id/decide", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const body = decideApprovalSchema.parse(request.body);

    const approval = await prisma.approval.findFirst({
      where: { id, userId, status: "PENDING" },
    });
    if (!approval) return reply.code(404).send({ error: "Approval not found or already decided", code: "NOT_FOUND" });

    await prisma.approval.update({
      where: { id },
      data: { status: body.decision, message: body.message, decidedAt: new Date() },
    });

    // ponytail: resume execution if approval was approved
    if (body.decision === "APPROVED") {
      const execution = await prisma.workflowExecution.findUnique({ where: { id: approval.executionId } });
      if (execution?.status === "WAITING_APPROVAL") {
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { status: "RUNNING" },
        });
      }
    }

    return { ok: true };
  });
}
