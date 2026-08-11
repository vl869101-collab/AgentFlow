import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { userIdFromRequest } from "./auth.js";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 100,
  STARTER: 100,
  PRO: 5_000,
  TEAM: 50_000,
  ENTERPRISE: 50_000,
};

export async function checkQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) return reply.code(403).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });

  const membership = await prisma.organizationMember.findFirst({ where: { userId } });
  const orgId = membership?.orgId;
  const organization = orgId ? await prisma.organization.findUnique({ where: { id: orgId } }) : null;
  const plan = String(organization?.plan ?? "FREE").toUpperCase();
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const records = await prisma.usageRecord.findMany({
    where: {
      ...(orgId ? { orgId } : { userId }),
      type: "execution",
      createdAt: { gte: monthStart },
    },
  });
  const used = records.reduce((total: number, record: { quantity?: number; createdAt?: Date | string }) => {
    if (record.createdAt && new Date(record.createdAt) < monthStart) return total;
    return total + (record.quantity ?? 1);
  }, 0);

  if (used >= limit) {
    return reply.code(429).send({
      error: "Monthly execution quota exceeded",
      code: "QUOTA_EXCEEDED",
      used,
      limit,
    });
  }
}
