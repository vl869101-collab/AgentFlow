export type PlanLimits = {
  executionsPerMonth: number;
  workflows: number;
  aiCallsPerMonth: number;
  members: number;
  concurrency: number;
  dataRetentionDays: number;
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE: {
    executionsPerMonth: 100,
    workflows: 10,
    aiCallsPerMonth: 50,
    members: 3,
    concurrency: 2,
    dataRetentionDays: 7,
  },
  STARTER: {
    executionsPerMonth: 100,
    workflows: 10,
    aiCallsPerMonth: 50,
    members: 3,
    concurrency: 2,
    dataRetentionDays: 7,
  },
  BASIC: {
    executionsPerMonth: 500,
    workflows: 25,
    aiCallsPerMonth: 200,
    members: 10,
    concurrency: 5,
    dataRetentionDays: 30,
  },
  GROWTH: {
    executionsPerMonth: 2_000,
    workflows: 100,
    aiCallsPerMonth: 1_000,
    members: 25,
    concurrency: 10,
    dataRetentionDays: 90,
  },
  PRO: {
    executionsPerMonth: Number.POSITIVE_INFINITY,
    workflows: Number.POSITIVE_INFINITY,
    aiCallsPerMonth: Number.POSITIVE_INFINITY,
    members: Number.POSITIVE_INFINITY,
    concurrency: 50,
    dataRetentionDays: 365,
  },
  ENTERPRISE: {
    executionsPerMonth: Number.POSITIVE_INFINITY,
    workflows: Number.POSITIVE_INFINITY,
    aiCallsPerMonth: Number.POSITIVE_INFINITY,
    members: Number.POSITIVE_INFINITY,
    concurrency: 100,
    dataRetentionDays: 730,
  },
};

export function limitsForPlan(plan: unknown): PlanLimits {
  return PLAN_LIMITS[String(plan ?? "FREE").toUpperCase()] ?? PLAN_LIMITS.FREE;
}
