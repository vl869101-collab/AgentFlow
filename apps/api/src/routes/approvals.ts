import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";

export async function approvalRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { orgId: true },
    });
    const orgIds = memberships.map((membership: { orgId: string }) => membership.orgId);
    if (orgIds.length === 0) return [];

    return prisma.approval.findMany({
      where: { status: "PENDING", execution: { orgId: { in: orgIds } } },
      include: { execution: { include: { workflow: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  });

  async function decide(request: FastifyRequest, reply: FastifyReply, status: "APPROVED" | "REJECTED") {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { orgId: true },
    });
    const orgIds = memberships.map((membership: { orgId: string }) => membership.orgId);

    const approval = await prisma.approval.findFirst({
      where: { id, status: "PENDING", execution: { orgId: { in: orgIds } } },
    });
    if (!approval) return reply.code(404).send({ error: "Approval not found or already decided", code: "NOT_FOUND" });

    const result = await prisma.approval.updateMany({
      where: { id, status: "PENDING" },
      data: { status, decidedAt: new Date(), approverId: userId },
    });
    if (result.count === 0) return reply.code(404).send({ error: "Approval not found or already decided", code: "NOT_FOUND" });

    // ponytail: resume execution if approval was approved
    if (status === "APPROVED") {
      await prisma.workflowExecution.updateMany({
        where: { id: approval.executionId, status: "WAITING_APPROVAL" },
        data: { status: "RUNNING" },
      });
    }

    return { ok: true };
  }

  app.post("/:id/approve", async (request, reply) => decide(request, reply, "APPROVED"));
  app.post("/:id/reject", async (request, reply) => decide(request, reply, "REJECTED"));
}
