import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { checkSlidingWindowRateLimit } from "../lib/redis.js";
import { orgIdFromRequest, userIdFromRequest } from "./auth.js";

export interface TierRateLimitConfig {
  limit: number;
  windowMs: number;
}

export const TIER_RATE_LIMITS: Record<string, TierRateLimitConfig> = {
  FREE: { limit: 60, windowMs: 60000 },
  STARTER: { limit: 60, windowMs: 60000 },
  BASIC: { limit: 120, windowMs: 60000 },
  GROWTH: { limit: 300, windowMs: 60000 },
  PRO: { limit: 600, windowMs: 60000 },
  ENTERPRISE: { limit: 6000, windowMs: 60000 },
};

export function getTierRateLimit(plan?: string | null): TierRateLimitConfig {
  const normalized = String(plan || "FREE").toUpperCase();
  return TIER_RATE_LIMITS[normalized] || TIER_RATE_LIMITS.FREE;
}

/**
 * Dynamic Sliding Window Rate Limiting Hook based on Organization Tier.
 */
export async function tierRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const userId = userIdFromRequest(request);
  const tokenOrgId = orgIdFromRequest(request);

  let orgId = tokenOrgId;
  let plan = "FREE";

  if (userId) {
    if (!orgId) {
      const membership = await prisma.organizationMember.findFirst({ where: { userId } });
      orgId = membership?.orgId;
    }
  }

  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    if (org?.plan) {
      plan = String(org.plan).toUpperCase();
    }
  }

  const { limit, windowMs } = getTierRateLimit(plan);
  const key = orgId ? `ratelimit:org:${orgId}` : userId ? `ratelimit:user:${userId}` : `ratelimit:ip:${request.ip}`;

  const result = await checkSlidingWindowRateLimit(key, limit, windowMs);
  const resetAt = new Date(Date.now() + result.resetMs).toISOString();

  reply.header("X-RateLimit-Limit", String(result.limit));
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", resetAt);

  if (!result.allowed) {
    reply.header("Retry-After", String(result.retryAfterSeconds));
    return reply.code(429).send({
      error: "Too Many Requests",
      code: "RATE_LIMIT_EXCEEDED",
      limit: result.limit,
      remaining: 0,
      retryAfter: result.retryAfterSeconds,
      resetAt,
    });
  }
}

/**
 * Factory for route-specific sliding window rate limits.
 */
export function createSlidingRateLimit(limit: number, windowMs = 60000) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const orgId = orgIdFromRequest(request);
    const route = request.routeOptions?.url || request.url.split("?")[0];
    const key = orgId
      ? `ratelimit:custom:${route}:org:${orgId}`
      : userId
        ? `ratelimit:custom:${route}:user:${userId}`
        : `ratelimit:custom:${route}:ip:${request.ip}`;

    const result = await checkSlidingWindowRateLimit(key, limit, windowMs);
    const resetAt = new Date(Date.now() + result.resetMs).toISOString();

    reply.header("X-RateLimit-Limit", String(result.limit));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", resetAt);

    if (!result.allowed) {
      reply.header("Retry-After", String(result.retryAfterSeconds));
      return reply.code(429).send({
        error: "Too Many Requests",
        code: "RATE_LIMIT_EXCEEDED",
        limit: result.limit,
        remaining: 0,
        retryAfter: result.retryAfterSeconds,
        resetAt,
      });
    }
  };
}
