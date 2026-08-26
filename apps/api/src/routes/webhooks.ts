import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createWebhookSchema } from "@agentflow/shared";
import { runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { limitsForPlan } from "../lib/plans.js";
import { checkAndSetWebhookIdempotency } from "../lib/redis.js";
import { verifyWebhookRequest } from "../services/webhook-verifier.js";

function executeTelegramTrigger(_config: any, body: any) {
  return {
    message: body?.message?.text ?? "",
    from: body?.message?.from?.username ?? "",
    chatId: body?.message?.chat?.id ?? "",
    raw: body,
  };
}

function executeSlackTrigger(_config: any, body: any) {
  return {
    text: body?.event?.text ?? body?.text ?? "",
    user: body?.event?.user ?? body?.user ?? "",
    channel: body?.event?.channel ?? body?.channel ?? "",
    raw: body,
  };
}

function monthStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
}

function stripSecret<T extends { secret?: string | null }>(row: T): Omit<T, "secret"> {
  const { secret: _secret, ...rest } = row;
  return rest;
}

function verifySignature(secret: string, rawBody: string, received: string): boolean {
  try {
    const normalized = received.startsWith("sha256=") ? received.slice("sha256=".length) : received;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const actualBuffer = Buffer.from(normalized, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export async function webhookRoutes(app: FastifyInstance) {
  async function currentOrgId(request: Parameters<typeof userIdFromRequest>[0]): Promise<string | undefined> {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    if (!tokenOrgId) return undefined;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
    return membership?.orgId;
  }

  // management routes — auth required
  app.get("/", { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
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

  app.post("/", { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);

    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });

    if (body.workflowId) {
      const workflow = await prisma.workflow.findFirst({ where: { id: body.workflowId, orgId } });
      if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "WORKFLOW_NOT_FOUND" });
    }

    const existing = await prisma.webhook.findFirst({ where: { path: body.path, orgId } });
    if (existing) return reply.code(409).send({ error: "Path already taken", code: "PATH_EXISTS" });

    const secret = body.secret && body.secret.trim().length > 0 ? body.secret.trim() : randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        path: body.path,
        method: body.method ?? "POST",
        secret,
        workflowId: body.workflowId,
        orgId,
        active: true,
      },
    });

    return reply.status(201).send({
      ...stripSecret(webhook),
      triggerPath: webhook.path,
      secret: webhook.secret,
    });
  });

  app.delete("/:id", { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await currentOrgId(request);
    const webhook = orgId ? await prisma.webhook.findFirst({ where: { id, orgId } }) : null;
    if (!webhook) return reply.code(404).send({ error: "Webhook not found", code: "NOT_FOUND" });
    await prisma.webhook.delete({ where: { id: webhook.id } });
    return { ok: true };
  });

  // public webhook trigger — no auth, verified by path + mandatory HMAC signature + Redis 24h idempotency
  app.all("/trigger/*", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const params = request.params as { "*"?: string; path?: string };
    const triggerPath = params["*"] ?? params.path ?? "";

    let webhook = await prisma.webhook.findFirst({
      where: { path: triggerPath, active: true },
      include: { workflow: true },
    });

    if (!webhook && triggerPath.includes("/")) {
      const parts = triggerPath.split("/");
      const subPath = parts.slice(1).join("/");
      webhook = await prisma.webhook.findFirst({
        where: { path: subPath, active: true },
        include: { workflow: true },
      });
    }

    if (!webhook) return reply.code(404).send({ error: "Webhook not found", code: "NOT_FOUND" });

    if (!webhook.workflowId) {
      return reply.code(400).send({ error: "Webhook not linked to a workflow", code: "NO_WORKFLOW" });
    }

    if (request.method !== webhook.method) {
      return reply.code(405).header("allow", webhook.method).send({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
    }

    // Capture rawBody exactly as received
    const rawBody =
      (request as typeof request & { rawBody?: string }).rawBody ??
      (typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? null));

    // Multi-Provider HMAC & signature verification (GitHub, Shopify, Stripe, Slack, Generic)
    const providerHeader = (request.headers["x-webhook-provider"] as string) || "generic";
    const verification = verifyWebhookRequest(providerHeader, webhook.secret ?? "", rawBody, request.headers as any);

    if (!verification.valid) {
      return reply.code(401).send({
        error: verification.error || (verification.code === "MISSING_SIGNATURE" ? "Missing signature" : "Invalid signature"),
        code: verification.code || "INVALID_SIGNATURE",
      });
    }

    // 24h Idempotency check via Redis SET NX
    const headerIdempotency = (
      request.headers["x-idempotency-key"] ||
      request.headers["idempotency-key"] ||
      request.headers["x-webhook-id"] ||
      request.headers["x-delivery-id"] ||
      request.headers["x-request-id"]
    ) as string | undefined;

    const idempotencyKey =
      headerIdempotency?.trim() ||
      `payload:${createHash("sha256").update(rawBody).digest("hex")}`;
    const redisKey = `webhook:idempotency:${webhook.id}:${idempotencyKey}`;

    // Quota verification
    const organization = await prisma.organization.findUnique({ where: { id: webhook.orgId } });
    const limit = limitsForPlan(organization?.plan).executionsPerMonth;
    const usageRecords = await prisma.usageRecord.findMany({
      where: { orgId: webhook.orgId, type: "execution", createdAt: { gte: monthStart() } },
    });
    const used = usageRecords.reduce((total: number, record: { quantity?: number }) => total + Number(record.quantity ?? 0), 0);
    if (used >= limit) {
      return reply.code(429).send({ error: "Monthly execution quota exceeded", code: "QUOTA_EXCEEDED", used, limit });
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

    // Enforce 24h idempotency lock
    const idempotencyResult = await checkAndSetWebhookIdempotency(redisKey, execution.id, 86400);
    if (idempotencyResult.isDuplicate) {
      return reply.status(200).send({
        executionId: idempotencyResult.existingExecutionId ?? execution.id,
        duplicate: true,
        idempotencyKey,
        code: "IDEMPOTENT_REPLAY",
      });
    }

    await prisma.usageRecord.create({ data: { type: "execution", quantity: 1, orgId: webhook.orgId, userId: null } });

    if (!(await enqueueExecution(execution.id))) {
      void runExecution(execution.id).catch((error) => app.log.error(error, "Webhook execution failed"));
    }

    return reply.status(202).send({ executionId: execution.id });
  });

  // ── Telegram Webhook Trigger (Task 18) ───────────────────────
  app.post("/telegram/*", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const params = request.params as { "*"?: string; path?: string };
    const path = params["*"] ?? params.path ?? "";
    const webhook = await prisma.webhook.findFirst({
      where: { path, active: true },
      include: { workflow: true },
    });
    if (!webhook || !webhook.workflowId) return reply.code(404).send({ error: "Telegram webhook not found", code: "NOT_FOUND" });

    // Verify secret token if present
    const secretHeader = request.headers["x-telegram-bot-api-secret-token"];
    if (webhook.secret && secretHeader && secretHeader !== webhook.secret) {
      return reply.code(401).send({ error: "Invalid secret token", code: "INVALID_SECRET" });
    }

    const normalizedInput = executeTelegramTrigger({}, request.body);
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: webhook.workflowId,
        orgId: webhook.orgId,
        status: "PENDING",
        trigger: "telegramTrigger",
        input: normalizedInput as any,
      },
    });

    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id).catch((error) => app.log.error(error, "Telegram trigger failed"));
    return reply.status(200).send({ ok: true, executionId: execution.id });
  });

  // ── Slack Webhook Trigger (Task 18) ──────────────────────────
  app.post("/slack/*", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    // Slack URL Verification Handshake
    if (body.type === "url_verification" && typeof body.challenge === "string") {
      return reply.code(200).header("Content-Type", "application/json").send({ challenge: body.challenge });
    }

    const params = request.params as { "*"?: string; path?: string };
    const path = params["*"] ?? params.path ?? "";
    const webhook = await (prisma.webhook as any).findFirst({
      where: { path, active: true },
      include: { workflow: true },
    });
    if (!webhook || !webhook.workflowId) return reply.code(404).send({ error: "Slack webhook not found", code: "NOT_FOUND" });

    const normalizedInput = executeSlackTrigger({}, body);
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: webhook.workflowId,
        orgId: webhook.orgId,
        status: "PENDING",
        trigger: "slackTrigger",
        input: normalizedInput as any,
      },
    });

    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id).catch((error) => app.log.error(error, "Slack trigger failed"));
    return reply.status(200).send({ ok: true, executionId: execution.id });
  });
}