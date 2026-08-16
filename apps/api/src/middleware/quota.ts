import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, userIdFromRequest } from "./auth.js";
import { limitsForPlan } from "../lib/plans.js";

export async function checkQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) return reply.code(403).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });

  const tokenOrgId = orgIdFromRequest(request);
  const membership = tokenOrgId
    ? await prisma.organizationMember.findUnique({ where: { userId_orgId: { userId, orgId: tokenOrgId } } })
    : await prisma.organizationMember.findFirst({ where: { userId } });
  const orgId = membership?.orgId;
  const organization = orgId ? await prisma.organization.findUnique({ where: { id: orgId } }) : null;
  const limit = limitsForPlan(organization?.plan).executionsPerMonth;
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
    reply.header("X-Quota-Limit", String(limit));
    reply.header("X-Quota-Used", String(used));
    reply.header("X-Quota-Remaining", "0");
    return reply.code(429).send({
      error: "Monthly execution quota exceeded",
      code: "QUOTA_EXCEEDED",
      used,
      limit,
    });
  }

  reply.header("X-Quota-Limit", String(limit));
  reply.header("X-Quota-Used", String(used));
  reply.header("X-Quota-Remaining", String(Math.max(limit - used, 0)));
}
