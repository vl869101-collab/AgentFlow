import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    return;
  } catch {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
    if (token?.startsWith("af_")) {
      const keyHash = createHash("sha256").update(token).digest("hex");
      const apiKey = await prisma.apiKey.findUnique({ where: { key: keyHash } });
      if (apiKey && (!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date())) {
        const user = await prisma.user.findUnique({ where: { id: apiKey.userId } });
        if (user) {
          const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
          (request as FastifyRequest & { user: unknown }).user = {
            sub: user.id,
            email: user.email,
            orgId: membership?.orgId,
            authType: "api-key",
          };
          void prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsed: new Date() } }).catch(() => undefined);
          return;
        }
      }
    }
    return reply.code(401).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
  }
}

export function userIdFromRequest(request: FastifyRequest): string {
  const payload = request.user as { sub: string } | undefined;
  return payload?.sub ?? "";
}

export function orgIdFromRequest(request: FastifyRequest): string | undefined {
  const payload = request.user as { orgId?: string } | undefined;
  return payload?.orgId;
}

// ponytail: simple RBAC check, expand when needed
export async function requireOrgMember(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const userId = userIdFromRequest(request);
  const orgId = (request.query as any)?.orgId || (request.body as any)?.orgId;
  if (!orgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }

  const member = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "NOT_ORG_MEMBER" });
  }
}
