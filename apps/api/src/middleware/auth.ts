import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
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
  } catch {
    return reply.code(403).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
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
  if (!orgId) return;

  const member = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "NOT_ORG_MEMBER" });
  }
}
