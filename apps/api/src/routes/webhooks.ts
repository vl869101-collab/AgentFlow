import type { FastifyInstance } from "fastify";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createWebhookSchema } from "@agentflow/shared";
import { runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { limitsForPlan } from "../lib/plans.js";

function monthStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
}

function stripSecret<T extends { secret?: string | null }>(row: T): Omit<T, "secret"> {
  const { secret: _secret, ...rest } = row;
  return rest;
}

function verifySignature(secret: string, rawBody: string, received: string): boolean {
  const normalized = received.startsWith("sha256=") ? received.slice("sha256=".length) : received;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(normalized, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function webhookRoutes(app: FastifyInstance) {
  async function currentOrgId(request: Parameters<typeof userIdFromRequest>[0]): Promise<string | undefined> {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    if (tokenOrgId) {
      const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId, orgId: tokenOrgId } },
      });
      if (membership) return membership.orgId;
    }
    const membership = await prisma.organizationMember.findFirst({ where: { userId } });
    return membership?.orgId;
  }

  // management routes — auth required
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const memberships = await prisma.organizationMember.findMany({ where: { userId } });
    const orgIds = memberships.map((m: any) => m.orgId);
    return (
      await prisma.webhook.findMany({
        where: { orgId: { in: orgIds } },
        include: { workflow: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        ...parsePagination(request, reply),
      })
    ).map(stripSecret);
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);

    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });

    if (body.workflowId) {
      const workflow = await prisma.workflow.findFirst({ where: { id: body.workflowId, orgId } });
      if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "WORKFLOW_NOT_FOUND" });
    }

    // check path uniqueness
    const existing = await prisma.webhook.findUnique({ where: { path: body.path } });
    if (existing) return reply.code(409).send({ error: "Path already taken", code: "PATH_EXISTS" });

    const webhook = await prisma.webhook.create({
      data: {
        path: body.path,
        method: body.method,
        secret: body.secret && body.secret.length > 0 ? body.secret : randomBytes(32).toString("hex"),
        workflowId: body.workflowId,
        orgId,
      },
    });

    // Return the secret once on creation so the caller can copy it. It is never
    // returned again on list/get responses (H-03).
    return reply.status(201).send({ ...webhook, secret: webhook.secret });
  });

  app.delete("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await currentOrgId(request);
    const webhook = orgId ? await prisma.webhook.findFirst({ where: { id, orgId } }) : null;
    if (!webhook) return reply.code(404).send({ error: "Webhook not found", code: "NOT_FOUND" });
    await prisma.webhook.delete({ where: { id: webhook.id } });
    return { ok: true };
  });

  // public webhook trigger — no auth, verified by path + mandatory signature (H-03)
  app.all("/trigger/*", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const params = request.params as { "*"?: string; path?: string };
    const path = params["*"] ?? params.path ?? "";
    const webhook = await prisma.webhook.findFirst({
      where: { path, active: true },
      include: { workflow: true },
    });
    if (!webhook) return reply.code(404).send({ error: "Webhook not found", code: "NOT_FOUND" });

    if (!webhook.workflowId) {
      return reply.code(400).send({ error: "Webhook not linked to a workflow", code: "NO_WORKFLOW" });
    }

    if (request.method !== webhook.method) {
      return reply.code(405).header("allow", webhook.method).send({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
    }

    // Always enforce signature verification (H-03): secret is now always present
    // (server-generated on create), so a missing/invalid signature is rejected.
    const signature = request.headers["x-webhook-signature"];
    if (!signature) return reply.code(401).send({ error: "Missing signature", code: "MISSING_SIGNATURE" });
    const rawBody = (request as typeof request & { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? null);
    if (!verifySignature(webhook.secret ?? "", rawBody, String(signature))) {
      return reply.code(401).send({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
    }

    // Enforce org monthly quota on anonymous triggers (H-03) so webhooks cannot
    // bypass billing limits. Reads Organization.plan and counts usage records.
    const organization = await prisma.organization.findUnique({ where: { id: webhook.orgId } });
    const limit = limitsForPlan(organization?.plan).executionsPerMonth;
    const used = await prisma.usageRecord.aggregate({
      _sum: { quantity: true },
      where: { orgId: webhook.orgId, type: "execution", createdAt: { gte: monthStart() } },
    });
    if ((used._sum.quantity ?? 0) >= limit) {
      return reply.code(429).send({ error: "Monthly execution quota exceeded", code: "QUOTA_EXCEEDED", used: used._sum.quantity ?? 0, limit });
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

    // Record usage so webhook triggers count toward the monthly quota (H-03).
    await prisma.usageRecord.create({ data: { type: "execution", quantity: 1, orgId: webhook.orgId, userId: null } });

    // Enqueue through the worker queue when available (H-03: never run inline in
    // the API process to avoid DoS). Falls back to inline only when no worker.
    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id).catch((error) => app.log.error(error, "Webhook execution failed"));

    return reply.status(202).send({ executionId: execution.id });
  });
}
