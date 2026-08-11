import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createWebhookSchema } from "@agentflow/shared";

export async function webhookRoutes(app: FastifyInstance) {
  // management routes — auth required
  app.get("/", { preHandler: requireAuth }, async (request) => {
    const userId = userIdFromRequest(request);
    const memberships = await prisma.organizationMember.findMany({ where: { userId } });
    const orgIds = memberships.map((m: any) => m.orgId);
    return prisma.webhook.findMany({
      where: { orgId: { in: orgIds } },
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const body = createWebhookSchema.parse(request.body);

    const membership = await prisma.organizationMember.findFirst({ where: { userId } });
    if (!membership) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });

    // check path uniqueness
    const existing = await prisma.webhook.findUnique({ where: { path: body.path } });
    if (existing) return reply.code(409).send({ error: "Path already taken", code: "PATH_EXISTS" });

    const webhook = await prisma.webhook.create({
      data: {
        path: body.path,
        method: body.method,
        secret: body.secret,
        workflowId: body.workflowId,
        orgId: membership.orgId,
      },
    });
    return reply.status(201).send(webhook);
  });

  app.delete("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.webhook.delete({ where: { id } });
    return { ok: true };
  });

  // public webhook trigger — no auth, verified by path + optional secret
  app.all("/trigger/:path", async (request, reply) => {
    const { path } = request.params as { path: string };
    const webhook = await prisma.webhook.findUnique({
      where: { path, active: true },
      include: { workflow: true },
    });
    if (!webhook) return reply.code(404).send({ error: "Webhook not found", code: "NOT_FOUND" });

    if (!webhook.workflowId) {
      return reply.code(400).send({ error: "Webhook not linked to a workflow", code: "NO_WORKFLOW" });
    }

    // ponytail: verify secret signature in production (HMAC)
    if (webhook.secret) {
      const signature = (request.headers as any)["x-webhook-signature"];
      if (!signature) return reply.code(401).send({ error: "Missing signature", code: "MISSING_SIGNATURE" });
      // TODO: HMAC verification
    }

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: webhook.workflowId,
        orgId: webhook.orgId,
        status: "PENDING",
        trigger: "webhook",
        input: request.body as any,
      },
    });

    try {
      const { workflowQueue } = await import("../worker.js");
      await workflowQueue.add("execute", { executionId: execution.id }, { jobId: execution.id });
    } catch {
      // worker might not be running
    }

    return reply.status(202).send({ executionId: execution.id });
  });
}
