import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { buildFormZodSchema, type FormField } from "../services/nodes/form.js";
import { enqueueExecution } from "../services/queue.js";
import { runExecution } from "../services/executor.js";

export async function approvalRoutes(app: FastifyInstance) {
  // Public / Token-based Form endpoints (does not require standard session if token is valid)
  app.get("/form/:token", async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };

    const approval = await prisma.approval.findFirst({
      where: { id: token },
      include: { execution: { include: { workflow: { select: { id: true, name: true } } } } },
    });

    if (!approval) {
      return reply.code(404).send({ error: "Approval form not found or invalid token", code: "NOT_FOUND" });
    }

    const context = (approval.context as Record<string, any>) ?? {};
    if (approval.status !== "PENDING") {
      return reply.code(400).send({
        error: `Form already decided (${approval.status})`,
        code: "ALREADY_DECIDED",
        status: approval.status,
      });
    }

    if (context.expiresAt && new Date(context.expiresAt).getTime() < Date.now()) {
      return reply.code(410).send({ error: "Approval form has expired", code: "EXPIRED" });
    }

    return {
      id: approval.id,
      status: approval.status,
      title: context.title ?? approval.message ?? "Workflow Approval",
      description: context.description ?? "",
      fields: (context.fields as FormField[]) ?? [],
      workflow: approval.execution?.workflow,
      createdAt: approval.createdAt,
      expiresAt: context.expiresAt,
    };
  });

  app.post("/form/:token/submit", async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const rawBody = (request.body as Record<string, any>) ?? {};

    const approval = await prisma.approval.findFirst({
      where: { id: token },
    });

    if (!approval) {
      return reply.code(404).send({ error: "Approval not found or invalid token", code: "NOT_FOUND" });
    }

    if (approval.status !== "PENDING") {
      return reply.code(400).send({ error: "Approval is no longer pending", code: "ALREADY_DECIDED" });
    }

    const context = (approval.context as Record<string, any>) ?? {};
    const fields = (context.fields as FormField[]) ?? [];
    
    // Validate submitted data against dynamic schema
    const schema = buildFormZodSchema(fields);
    const parsedData = schema.parse(rawBody);

    const isApproved = parsedData.approved !== false && parsedData.decision !== "REJECT";
    const newStatus = isApproved ? "APPROVED" : "REJECTED";

    await prisma.approval.update({
      where: { id: token },
      data: {
        status: newStatus,
        decidedAt: new Date(),
        context: {
          ...context,
          submittedData: parsedData,
        },
      },
    });

    if (newStatus === "APPROVED") {
      await prisma.workflowExecution.updateMany({
        where: { id: approval.executionId, status: "WAITING_APPROVAL" },
        data: { status: "RUNNING" },
      });

      // Resume execution asynchronously
      const enqueued = await enqueueExecution(approval.executionId);
      if (!enqueued) {
        void runExecution(approval.executionId).catch((err) => {
          console.error(`Error resuming execution ${approval.executionId}:`, err);
        });
      }
    } else {
      await prisma.workflowExecution.updateMany({
        where: { id: approval.executionId, status: "WAITING_APPROVAL" },
        data: { status: "CANCELLED", error: "Approval was rejected by user" },
      });
    }

    return { ok: true, status: newStatus, data: parsedData };
  });

  // Authenticated list and decision routes
  app.register(async (authApp) => {
    authApp.addHook("onRequest", requireAuth);

    authApp.get("/", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
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
        ...parsePagination(request, reply),
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

      if (status === "APPROVED") {
        await prisma.workflowExecution.updateMany({
          where: { id: approval.executionId, status: "WAITING_APPROVAL" },
          data: { status: "RUNNING" },
        });

        const enqueued = await enqueueExecution(approval.executionId);
        if (!enqueued) {
          void runExecution(approval.executionId).catch((err) => {
            console.error(`Error resuming execution ${approval.executionId}:`, err);
          });
        }
      } else {
        await prisma.workflowExecution.updateMany({
          where: { id: approval.executionId, status: "WAITING_APPROVAL" },
          data: { status: "CANCELLED", error: "Approval was rejected" },
        });
      }

      return { ok: true, status };
    }

    authApp.post("/:id/approve", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => decide(request, reply, "APPROVED"));
    authApp.post("/:id/reject", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => decide(request, reply, "REJECTED"));
  });
}
