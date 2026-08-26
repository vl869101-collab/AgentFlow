import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createCredentialSchema } from "@agentflow/shared";
import {
  BUCKET_DEFINITIONS,
  decryptVaultData,
  encryptVaultData,
  listProviders,
  maskVaultData,
  mapCredentialToBucket,
  type CredentialBucket,
} from "../services/vault/index.js";
import { decryptCredential, encryptCredential } from "../lib/crypto.js";

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  type AuthenticatedRequest = Parameters<typeof userIdFromRequest>[0];

  async function currentMembership(request: AuthenticatedRequest) {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    if (!tokenOrgId) return null;
    return prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
  }

  async function currentOrgId(request: AuthenticatedRequest): Promise<string | undefined> {
    return (await currentMembership(request))?.orgId;
  }

  function maskedCredential(credential: {
    id: string;
    name: string;
    type: string;
    provider: string;
    createdAt: Date | string;
    data?: any;
  }) {
    let safeData: Record<string, any> = { hasValue: true };

    if (credential.data) {
      try {
        let rawObj: any = credential.data;
        if (typeof rawObj === "string") {
          try {
            rawObj = JSON.parse(decryptCredential(rawObj));
          } catch {
            rawObj = JSON.parse(rawObj);
          }
        }
        if (typeof rawObj === "object" && rawObj !== null) {
          safeData = maskVaultData(credential.type as CredentialBucket, rawObj);
          safeData.hasValue = true;
        }
      } catch {
        safeData = { hasValue: true };
      }
    }

    return {
      id: credential.id,
      name: credential.name,
      type: credential.type,
      provider: credential.provider,
      createdAt: credential.createdAt,
      data: safeData,
    };
  }

  // Metadata routes for UI & integrations
  app.get("/buckets", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async () => {
    return Object.values(BUCKET_DEFINITIONS);
  });

  app.get("/providers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const query = request.query as { category?: string; bucket?: CredentialBucket; search?: string };
    return listProviders({
      category: query.category,
      bucket: query.bucket,
      search: query.search,
    });
  });

  app.get("/", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const orgId = await currentOrgId(request);
    if (!orgId) return [];
    const credentials = await prisma.credential.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      ...parsePagination(request, reply),
    });
    return credentials.map(maskedCredential);
  });

  app.post("/", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = createCredentialSchema.parse(request.body);

    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });

    // Normalize and encrypt sensitive fields per-field using Vault AES-256-GCM
    const { bucket, data: normalizedData } = mapCredentialToBucket(body.provider || body.type, body.data);
    const encryptedDataObj = encryptVaultData(bucket, normalizedData);

    const credential = await prisma.credential.create({
      data: {
        name: body.name,
        type: body.type || bucket,
        provider: body.provider,
        data: encryptCredential(JSON.stringify(encryptedDataObj)),
        orgId,
      },
    });
    return reply.status(201).send(maskedCredential(credential));
  });

  app.get("/:id/reveal", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
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
      const decryptedOuter = JSON.parse(decryptCredential(credential.data));
      data = typeof decryptedOuter === "object" && decryptedOuter !== null
        ? decryptVaultData(credential.type as CredentialBucket, decryptedOuter)
        : decryptedOuter;
    } catch {
      return reply.code(500).send({ error: "Credential data is invalid or cannot be decrypted", code: "CREDENTIAL_DECRYPTION_FAILED" });
    }

    return { id: credential.id, name: credential.name, type: credential.type, provider: credential.provider, data };
  });

  app.delete("/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await currentOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });
    const credential = await prisma.credential.findFirst({ where: { id, orgId } });
    if (!credential) return reply.code(404).send({ error: "Credential not found", code: "NOT_FOUND" });
    await prisma.credential.delete({ where: { id: credential.id } });
    return { ok: true };
  });
}
