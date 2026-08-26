import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { limitsForPlan, type PlanLimits } from "../lib/plans.js";
import { getRedisClient } from "../lib/redis.js";

export type UsageType =
  | "execution"
  | "ai_call"
  | "integration_call"
  | "webhook_call"
  | "execution_count"
  | "execution_duration_ms"
  | "llm_prompt_tokens"
  | "llm_completion_tokens"
  | "storage_bytes";

export interface RecordUsageParams {
  orgId: string;
  userId?: string;
  workflowId?: string;
  executionId?: string;
  type?: UsageType | string;
  metricType?: UsageType | string;
  quantity?: number;
  value?: number;
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
  status?: string;
  periodStart: string;
  periodEnd: string;
  limits: PlanLimits;
  metrics: {
    executions: MetricUsage;
    aiCalls: MetricUsage;
    workflows: MetricUsage;
    members: MetricUsage;
    totalDurationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    storageBytes?: number;
  };
}

export function getCurrentBillingMonthBounds(now = new Date()): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

/**
 * Generate cryptographic signature for tamper-proof ledger auditability.
 */
function generateLedgerSignature(orgId: string, metricType: string, value: number, timestamp: string): string {
  const secret = process.env.JWT_SECRET || "agentflow-ledger-signing-secret";
  return createHash("sha256")
    .update(`${orgId}:${metricType}:${value}:${timestamp}:${secret}`)
    .digest("hex");
}

/**
 * Record atomic resource consumption event into the usage ledger.
 */
export async function recordUsageEvent({
  orgId,
  userId,
  workflowId,
  executionId,
  type,
  metricType,
  quantity,
  value,
  metadata = {},
}: RecordUsageParams) {
  if (!orgId) return null;

  const effectiveType = (metricType || type || "execution") as string;
  const effectiveValue = Number(value ?? quantity ?? 1);
  const effectiveUserId = userId || "system";
  const timestamp = new Date().toISOString();
  const signature = generateLedgerSignature(orgId, effectiveType, effectiveValue, timestamp);

  const enrichedMetadata = {
    ...metadata,
    workflowId: workflowId ?? metadata.workflowId,
    executionId: executionId ?? metadata.executionId,
    metricType: effectiveType,
    value: effectiveValue,
    timestamp,
    signature,
  };

  try {
    const record = await prisma.usageRecord.create({
      data: {
        orgId,
        userId: effectiveUserId,
        type: effectiveType,
        quantity: effectiveValue,
        metadata: enrichedMetadata as any,
      },
    });

    // Increment real-time aggregate in Redis if available
    const redis = getRedisClient();
    if (redis) {
      const { monthStart } = getCurrentBillingMonthBounds();
      const periodKey = monthStart.toISOString().slice(0, 7);
      const redisKey = `metering:org:${orgId}:${periodKey}:${effectiveType}`;
      await redis.incrby(redisKey, effectiveValue).catch(() => {});
      await redis.expire(redisKey, 86400 * 35).catch(() => {});
    }

    return record;
  } catch (error) {
    console.error(`[metering] Failed to record usage event for org ${orgId}:`, error);
    return null;
  }
}

// Backwards-compatible alias for existing callers
export const recordUsage = recordUsageEvent;

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

  // Check subscription status
  const subscription = await prisma.subscription.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
  const subStatus = subscription?.status || "active";

  // Aggregate monthly usage records
  const records = await prisma.usageRecord.findMany({
    where: {
      orgId,
      createdAt: { gte: monthStart },
    },
  });

  let executionUsed = 0;
  let aiCallsUsed = 0;
  let totalDurationMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let storageBytes = 0;

  for (const record of records) {
    const qty = Number(record.quantity ?? 1);
    const recType = record.type;

    if (recType === "execution" || recType === "execution_count") {
      executionUsed += qty;
    } else if (recType === "ai_call") {
      aiCallsUsed += qty;
    } else if (recType === "execution_duration_ms") {
      totalDurationMs += qty;
    } else if (recType === "llm_prompt_tokens") {
      promptTokens += qty;
    } else if (recType === "llm_completion_tokens") {
      completionTokens += qty;
    } else if (recType === "storage_bytes") {
      storageBytes += qty;
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
    status: subStatus,
    periodStart: monthStart.toISOString(),
    periodEnd: monthEnd.toISOString(),
    limits,
    metrics: {
      executions: calcMetric(executionUsed, limits.executionsPerMonth),
      aiCalls: calcMetric(aiCallsUsed, limits.aiCallsPerMonth),
      workflows: calcMetric(workflowsCount, limits.workflows),
      members: calcMetric(membersCount, limits.members),
      totalDurationMs,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      storageBytes,
    },
  };
}

/**
 * Detailed breakdown of usage records by workflow and date.
 */
export async function getOrgUsageBreakdown(
  orgId: string,
  options: { startDate?: Date | string; endDate?: Date | string; workflowId?: string; metricType?: string; limit?: number } = {}
) {
  const { monthStart, monthEnd } = getCurrentBillingMonthBounds();
  const start = options.startDate ? new Date(options.startDate) : monthStart;
  const end = options.endDate ? new Date(options.endDate) : monthEnd;

  const where: Record<string, any> = {
    orgId,
    createdAt: { gte: start, lte: end },
  };

  if (options.metricType) {
    where.type = options.metricType;
  }

  const records = await prisma.usageRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 200,
  });

  const byWorkflow = new Map<string, { executions: number; durationMs: number; promptTokens: number; completionTokens: number }>();
  const byDay = new Map<string, { executions: number; aiCalls: number; durationMs: number }>();

  for (const r of records) {
    const meta = (r.metadata as Record<string, any>) || {};
    const wfId = meta.workflowId || "unassigned";
    const day = (r.createdAt ? new Date(r.createdAt) : new Date()).toISOString().slice(0, 10);
    const qty = Number(r.quantity ?? 1);

    // Group by workflow
    if (!byWorkflow.has(wfId)) {
      byWorkflow.set(wfId, { executions: 0, durationMs: 0, promptTokens: 0, completionTokens: 0 });
    }
    const wfData = byWorkflow.get(wfId)!;
    if (r.type === "execution" || r.type === "execution_count") wfData.executions += qty;
    if (r.type === "execution_duration_ms") wfData.durationMs += qty;
    if (r.type === "llm_prompt_tokens") wfData.promptTokens += qty;
    if (r.type === "llm_completion_tokens") wfData.completionTokens += qty;

    // Group by day
    if (!byDay.has(day)) {
      byDay.set(day, { executions: 0, aiCalls: 0, durationMs: 0 });
    }
    const dayData = byDay.get(day)!;
    if (r.type === "execution" || r.type === "execution_count") dayData.executions += qty;
    if (r.type === "ai_call") dayData.aiCalls += qty;
    if (r.type === "execution_duration_ms") dayData.durationMs += qty;
  }

  return {
    orgId,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalRecords: records.length,
    byWorkflow: Object.fromEntries(byWorkflow),
    byDay: Object.fromEntries(byDay),
    recentEvents: records.slice(0, 50),
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

  // Check subscription status
  const subscription = await prisma.subscription.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
  if (subscription && ["past_due", "unpaid"].includes(subscription.status)) {
    reply.header("X-Subscription-Status", subscription.status);
    return reply.code(402).send({
      error: "Subscription payment is past due or unpaid. Please update payment method.",
      code: "PAYMENT_REQUIRED",
      status: subscription.status,
    });
  }

  const records = await prisma.usageRecord.findMany({
    where: {
      orgId,
      type: { in: ["execution", "execution_count"] },
      createdAt: { gte: monthStart },
    },
  });

  const used = records.reduce((total: number, record: { quantity?: number; createdAt?: Date | string }) => {
    if (record.createdAt && new Date(record.createdAt) < monthStart) return total;
    return total + Number(record.quantity ?? 1);
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

  const used = records.reduce((total: number, record: { quantity?: number }) => total + Number(record.quantity ?? 1), 0);
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
