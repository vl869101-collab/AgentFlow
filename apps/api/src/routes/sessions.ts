import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { encryptVaultEnvelope, decryptVaultEnvelope } from "../services/vault/kms.js";

const createSessionSchema = z.object({
  name: z.string().optional(),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  storageState: z.record(z.unknown()),
  expiresAt: z.string().datetime().optional().nullable(),
});

const updateSessionStateSchema = z.object({
  storageState: z.record(z.unknown()),
  expiresAt: z.string().datetime().optional().nullable(),
});

async function resolveOrgId(request: FastifyRequest): Promise<string | undefined> {
  const userId = userIdFromRequest(request);
  const tokenOrgId = orgIdFromRequest(request);
  if (userId && tokenOrgId) {
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
    if (membership) return membership.orgId;
  }
  if (tokenOrgId) {
    return tokenOrgId;
  }
  if (userId) {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId },
    });
    if (membership) return membership.orgId;
  }
  return undefined;
}

export async function sessionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  /**
   * POST /api/sessions
   * Create a new browser session record with KMS AES-256-GCM encrypted storageState.
   * Never stores plaintext storageState at rest.
   */
  app.post("/", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const orgId = await resolveOrgId(request);

    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const body = createSessionSchema.parse(request.body);

    // Encrypt browser storageState with envelope encryption (KMS AES-256-GCM)
    const envelope = encryptVaultEnvelope(body.storageState);
    const encryptedState = JSON.stringify(envelope);

    const session = await prisma.browserSession.create({
      data: {
        orgId,
        userId: userId || null,
        name: body.name ?? null,
        workflowId: body.workflowId ?? null,
        executionId: body.executionId ?? null,
        encryptedState,
        keyVersion: envelope.keyVersion,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return reply.status(201).send({
      id: session.id,
      orgId: session.orgId,
      userId: session.userId,
      name: session.name,
      workflowId: session.workflowId,
      executionId: session.executionId,
      keyVersion: session.keyVersion,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  });

  /**
   * GET /api/sessions
   * List browser sessions for the organization (metadata only, no encryptedState or plaintext state).
   */
  app.get("/", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const query = request.query as {
      workflowId?: string;
      executionId?: string;
    };

    const where: Record<string, unknown> = { orgId };
    if (query.workflowId) where.workflowId = query.workflowId;
    if (query.executionId) where.executionId = query.executionId;

    const sessions = await prisma.browserSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...parsePagination(request, reply),
    });

    return sessions.map((session: any) => ({
      id: session.id,
      orgId: session.orgId,
      userId: session.userId,
      name: session.name,
      workflowId: session.workflowId,
      executionId: session.executionId,
      keyVersion: session.keyVersion,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  });

  /**
   * GET /api/sessions/:id
   * Get metadata for a specific browser session.
   */
  app.get("/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const session = await prisma.browserSession.findFirst({
      where: { id, orgId },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }

    return {
      id: session.id,
      orgId: session.orgId,
      userId: session.userId,
      name: session.name,
      workflowId: session.workflowId,
      executionId: session.executionId,
      keyVersion: session.keyVersion,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  });

  /**
   * POST /api/sessions/:id/state
   * Update encrypted storageState for an existing session.
   */
  app.post("/:id/state", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const session = await prisma.browserSession.findFirst({
      where: { id, orgId },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }

    const body = updateSessionStateSchema.parse(request.body);
    const envelope = encryptVaultEnvelope(body.storageState);
    const encryptedState = JSON.stringify(envelope);

    const updated = await prisma.browserSession.update({
      where: { id },
      data: {
        encryptedState,
        keyVersion: envelope.keyVersion,
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      ok: true,
      id: updated.id,
      keyVersion: updated.keyVersion,
      updatedAt: updated.updatedAt,
    };
  });

  /**
   * GET /api/sessions/:id/state
   * Decrypt and return the browser storageState.
   */
  app.get("/:id/state", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const session = await prisma.browserSession.findFirst({
      where: { id, orgId },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      return reply.code(410).send({
        error: "Session expired",
        code: "SESSION_EXPIRED",
        expiresAt: session.expiresAt,
      });
    }

    try {
      const envelope = JSON.parse(session.encryptedState);
      const storageState = decryptVaultEnvelope(envelope);

      return {
        id: session.id,
        storageState,
        keyVersion: session.keyVersion,
        expiresAt: session.expiresAt,
      };
    } catch {
      return reply.code(500).send({
        error: "Failed to decrypt session storage state",
        code: "DECRYPTION_FAILED",
      });
    }
  });

  /**
   * DELETE /api/sessions/:id
   * Delete a browser session.
   */
  app.delete("/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveOrgId(request);
    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const session = await prisma.browserSession.findFirst({
      where: { id, orgId },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }

    await prisma.browserSession.delete({
      where: { id },
    });

    return { ok: true, id };
  });
}
