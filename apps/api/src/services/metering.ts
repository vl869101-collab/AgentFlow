import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { limitsForPlan, type PlanLimits } from "../lib/plans.js";

export type UsageType = "execution" | "ai_call" | "integration_call" | "webhook_call";

export interface RecordUsageParams {
  orgId: string;
  userId?: string;
  type: UsageType | string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}

export interface MetricUsage {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface OrgUsageSummary {
  orgId: string;
  plan: string;
  periodStart: string;
  periodEnd: string;
  limits: PlanLimits;
  metrics: {
    executions: MetricUsage;
    aiCalls: MetricUsage;
    workflows: MetricUsage;
    members: MetricUsage;
  };
}

export function getCurrentBillingMonthBounds(now = new Date()): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

/**
 * Record resource consumption in UsageRecord table.
 */
export async function recordUsage({
  orgId,
  userId,
  type,
  quantity = 1,
  metadata,
}: RecordUsageParams) {
  if (!orgId) return null;
  const effectiveUserId = userId || "system";

  try {
    return await prisma.usageRecord.create({
      data: {
        orgId,
        userId: effectiveUserId,
        type,
        quantity,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  } catch (error) {
    // If usage recording fails, log without breaking core workflow execution
    console.error(`[metering] Failed to record usage for org ${orgId}:`, error);
    return null;
  }
}

/**
 * Get comprehensive usage summary and quota status for an organization.
 */
export async function getOrgUsageSummary(orgId: string): Promise<OrgUsageSummary | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, plan: true },
  });
  if (!org) return null;

  const plan = String(org.plan || "FREE").toUpperCase();
  const limits = limitsForPlan(plan);
  const { monthStart, monthEnd } = getCurrentBillingMonthBounds();

  // Aggregate monthly usage records
  const records = await prisma.usageRecord.findMany({
    where: {
      orgId,
      createdAt: { gte: monthStart },
    },
  });

  let executionUsed = 0;
  let aiCallsUsed = 0;

  for (const record of records) {
    const qty = record.quantity ?? 1;
    if (record.type === "execution") {
      executionUsed += qty;
    } else if (record.type === "ai_call") {
      aiCallsUsed += qty;
    }
  }

  // Count active workflows
  const workflowsCount = await prisma.workflow.count({
    where: { orgId, status: { not: "ARCHIVED" } },
  });

  // Count members
  const membersCount = await prisma.organizationMember.count({
    where: { orgId },
  });

  const calcMetric = (used: number, limit: number): MetricUsage => {
    const isInfinity = !Number.isFinite(limit);
    const safeLimit = isInfinity ? 999999999 : limit;
    const remaining = isInfinity ? 999999999 : Math.max(limit - used, 0);
    const percentage = isInfinity ? 0 : Math.min(Math.round((used / limit) * 100), 100);
    return {
      used,
      limit: safeLimit,
      remaining,
      percentage,
    };
  };

  return {
    orgId,
    plan,
    periodStart: monthStart.toISOString(),
    periodEnd: monthEnd.toISOString(),
    limits,
    metrics: {
      executions: calcMetric(executionUsed, limits.executionsPerMonth),
      aiCalls: calcMetric(aiCallsUsed, limits.aiCallsPerMonth),
      workflows: calcMetric(workflowsCount, limits.workflows),
      members: calcMetric(membersCount, limits.members),
    },
  };
}

/**
 * Fastify preHandler hook for execution quota checking.
 */
export async function checkExecutionQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
  }

  const tokenOrgId = orgIdFromRequest(request);
  if (!tokenOrgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId: tokenOrgId } },
  });
  if (!membership) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
  }

  const orgId = membership.orgId;
  const organization = await prisma.organization.findUnique({ where: { id: orgId } });
  const limit = limitsForPlan(organization?.plan).executionsPerMonth;
  const { monthStart, monthEnd } = getCurrentBillingMonthBounds();

  const records = await prisma.usageRecord.findMany({
    where: {
      orgId,
      type: "execution",
      createdAt: { gte: monthStart },
    },
  });

  const used = records.reduce((total: number, record: { quantity?: number; createdAt?: Date | string }) => {
    if (record.createdAt && new Date(record.createdAt) < monthStart) return total;
    return total + (record.quantity ?? 1);
  }, 0);

  const isUnlimited = !Number.isFinite(limit);
  const remaining = isUnlimited ? 999999999 : Math.max(limit - used, 0);

  reply.header("X-Quota-Limit", String(isUnlimited ? -1 : limit));
  reply.header("X-Quota-Used", String(used));
  reply.header("X-Quota-Remaining", String(remaining));
  reply.header("X-Quota-Reset", monthEnd.toISOString());

  if (!isUnlimited && used >= limit) {
    return reply.code(429).send({
      error: "Monthly execution quota exceeded",
      code: "QUOTA_EXCEEDED",
      used,
      limit,
      resetAt: monthEnd.toISOString(),
    });
  }
}

/**
 * Fastify preHandler hook for AI quota checking.
 */
export async function checkAiQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
  }

  const tokenOrgId = orgIdFromRequest(request);
  if (!tokenOrgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId: tokenOrgId } },
  });
  if (!membership) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
  }

  const orgId = membership.orgId;
  const organization = await prisma.organization.findUnique({ where: { id: orgId } });
  const limit = limitsForPlan(organization?.plan).aiCallsPerMonth;
  const { monthStart, monthEnd } = getCurrentBillingMonthBounds();

  const records = await prisma.usageRecord.findMany({
    where: {
      orgId,
      type: "ai_call",
      createdAt: { gte: monthStart },
    },
  });

  const used = records.reduce((total: number, record: { quantity?: number }) => total + (record.quantity ?? 1), 0);
  const isUnlimited = !Number.isFinite(limit);
  const remaining = isUnlimited ? 999999999 : Math.max(limit - used, 0);

  reply.header("X-AI-Quota-Limit", String(isUnlimited ? -1 : limit));
  reply.header("X-AI-Quota-Used", String(used));
  reply.header("X-AI-Quota-Remaining", String(remaining));
  reply.header("X-AI-Quota-Reset", monthEnd.toISOString());

  if (!isUnlimited && used >= limit) {
    return reply.code(429).send({
      error: "Monthly AI generation quota exceeded",
      code: "AI_QUOTA_EXCEEDED",
      used,
      limit,
      resetAt: monthEnd.toISOString(),
    });
  }
}

/**
 * Fastify preHandler hook for workflow quota checking on creates and imports.
 */
export async function checkWorkflowQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
  }

  const tokenOrgId = orgIdFromRequest(request);
  if (!tokenOrgId) {
    return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId: tokenOrgId } },
  });
  if (!membership) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
  }

  const orgId = membership.orgId;
  const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  const workflowLimit = limitsForPlan(organization?.plan).workflows;
  const workflowCount = await prisma.workflow.count({ where: { orgId, status: { not: "ARCHIVED" } } });

  const isUnlimited = !Number.isFinite(workflowLimit);
  const remaining = isUnlimited ? 999999999 : Math.max(workflowLimit - workflowCount, 0);

  reply.header("X-Workflow-Quota-Limit", String(isUnlimited ? -1 : workflowLimit));
  reply.header("X-Workflow-Quota-Used", String(workflowCount));
  reply.header("X-Workflow-Quota-Remaining", String(remaining));

  if (!isUnlimited && workflowCount >= workflowLimit) {
    return reply.code(403).send({
      error: `Your plan allows ${workflowLimit} workflow${workflowLimit === 1 ? "" : "s"}`,
      code: "WORKFLOW_LIMIT_REACHED",
      limit: workflowLimit,
      current: workflowCount,
    });
  }
}

/**
 * Fastify preHandler hook for organization member quota checking on invites.
 */
export async function checkMemberQuota(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return reply.code(401).send({ error: "Invalid or missing token", code: "AUTH_FAILED" });
  }

  const { id: orgId } = (request.params as { id?: string }) ?? {};
  if (!orgId) {
    return reply.code(403).send({ error: "Organization ID is required", code: "ORG_REQUIRED" });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) {
    return reply.code(403).send({ error: "Not a member of this organization", code: "FORBIDDEN_ORG" });
  }

  const organization = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!organization) {
    return reply.code(404).send({ error: "Organization not found", code: "NOT_FOUND" });
  }

  const memberLimit = limitsForPlan(organization?.plan).members;
  const currentMembers = await prisma.organizationMember.count({ where: { orgId } });

  const isUnlimited = !Number.isFinite(memberLimit);
  const remaining = isUnlimited ? 999999999 : Math.max(memberLimit - currentMembers, 0);

  reply.header("X-Member-Quota-Limit", String(isUnlimited ? -1 : memberLimit));
  reply.header("X-Member-Quota-Used", String(currentMembers));
  reply.header("X-Member-Quota-Remaining", String(remaining));

  if (!isUnlimited && currentMembers >= memberLimit) {
    return reply.code(403).send({
      error: `Organization has reached member limit for plan ${organization.plan || "FREE"} (${memberLimit})`,
      code: "MEMBER_LIMIT_REACHED",
      limit: memberLimit,
      current: currentMembers,
    });
  }
}

// Re-export default execution check as checkQuota
export const checkQuota = checkExecutionQuota;

