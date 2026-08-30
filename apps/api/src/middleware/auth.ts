import type { FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const SALT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

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
  const headerOrgId = request.headers["x-org-id"];
  const queryOrgId = (request.query as any)?.orgId;
  const bodyOrgId = (request.body as any)?.orgId;
  if (typeof headerOrgId === "string" && headerOrgId.trim()) return headerOrgId.trim();
  if (typeof queryOrgId === "string" && queryOrgId.trim()) return queryOrgId.trim();
  if (typeof bodyOrgId === "string" && bodyOrgId.trim()) return bodyOrgId.trim();
  return payload?.orgId;
}

export async function checkOrg(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Unauthorized", code: "AUTH_FAILED" });
  }
  const orgId = orgIdFromRequest(request);
  if (!orgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }
  const member = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
  }
  (request as any).orgId = orgId;
  (request as any).membership = member;
}

export async function requireOrgMember(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: readonly string[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const userId = userIdFromRequest(request);
  const orgId = orgIdFromRequest(request) || (request.params as any)?.id;
  if (!orgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }

  const member = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "NOT_ORG_MEMBER" });
  }
  if (!allowedRoles.includes(member.role)) {
    return reply.code(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Unauthorized", code: "AUTH_FAILED" });
  }

  const explicitOrgId = orgIdFromRequest(request);
  if (explicitOrgId) {
    const member = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: explicitOrgId } },
    });
    if (member && ["ADMIN", "OWNER"].includes(member.role)) {
      return;
    }
  }

  // Check any membership where user is ADMIN or OWNER
  const adminMembership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      role: { in: ["ADMIN", "OWNER"] },
    },
  });

  if (!adminMembership) {
    return reply.code(403).send({ error: "Admin role required", code: "FORBIDDEN" });
  }
}