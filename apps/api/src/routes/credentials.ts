import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createCredentialSchema } from "@agentflow/shared";
import { decryptCredential, encryptCredential } from "../lib/crypto.js";

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  type AuthenticatedRequest = Parameters<typeof userIdFromRequest>[0];

  async function currentMembership(request: AuthenticatedRequest) {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    if (tokenOrgId) {
      const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId, orgId: tokenOrgId } },
      });
      if (membership) return membership;
    }
    return prisma.organizationMember.findFirst({ where: { userId } });
  }

  async function currentOrgId(request: AuthenticatedRequest): Promise<string | undefined> {
    return (await currentMembership(request))?.orgId;
  }

  function maskedCredential(credential: { id: string; name: string; type: string; provider: string; createdAt: Date | string }) {
    return {
      id: credential.id,
      name: credential.name,
      type: credential.type,
      provider: credential.provider,
      createdAt: credential.createdAt,
      data: { hasValue: true },
    };
  }

  app.get("/", async (request, reply) => {
    const orgId = await currentOrgId(request);
    if (!orgId) return [];
    const credentials = await prisma.credential.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      ...parsePagination(request, reply),
    });
    return credentials.map(maskedCredential);
  });

  app.post("/", async (request, reply) => {
    const body = createCredentialSchema.parse(request.body);

    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });

    const credential = await prisma.credential.create({
      data: {
        name: body.name,
        type: body.type,
        provider: body.provider,
        data: encryptCredential(JSON.stringify(body.data)),
        orgId,
      },
    });
    return reply.status(201).send(maskedCredential(credential));
  });

  app.get("/:id/reveal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const membership = await currentMembership(request);
    if (!membership) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });

    const credential = await prisma.credential.findFirst({ where: { id, orgId: membership.orgId } });
    if (!credential) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });
    if (!(["OWNER", "ADMIN"] as string[]).includes(String(membership.role))) {
      return reply.code(403).send({ error: "Only organization owners and admins can reveal credentials", code: "FORBIDDEN" });
    }

    let data: unknown;
    try {
      data = JSON.parse(decryptCredential(credential.data));
    } catch {
      return reply.code(500).send({ error: "Credential data is invalid or cannot be decrypted", code: "CREDENTIAL_DECRYPTION_FAILED" });
    }

    return { id: credential.id, name: credential.name, type: credential.type, provider: credential.provider, data };
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });
    const credential = await prisma.credential.findFirst({ where: { id, orgId } });
    if (!credential) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });
    await prisma.credential.delete({ where: { id: credential.id } });
    return { ok: true };
  });
}
