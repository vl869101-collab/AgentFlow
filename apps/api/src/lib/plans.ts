export type PlanLimits = {
  executionsPerMonth: number;
  workflows: number;
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE: { executionsPerMonth: 100, workflows: 1 },
  STARTER: { executionsPerMonth: 100, workflows: 1 },
  BASIC: { executionsPerMonth: 500, workflows: 3 },
  GROWTH: { executionsPerMonth: 2_000, workflows: 10 },
  PRO: { executionsPerMonth: Number.POSITIVE_INFINITY, workflows: Number.POSITIVE_INFINITY },
};

export function limitsForPlan(plan: unknown): PlanLimits {
  return PLAN_LIMITS[String(plan ?? "FREE").toUpperCase()] ?? PLAN_LIMITS.FREE;
}
