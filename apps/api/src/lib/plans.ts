export type PlanTier = "FREE" | "STARTER" | "BASIC" | "GROWTH" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  executionsPerMonth: number;
  workflows: number;
  aiCallsPerMonth: number;
  members: number;
  teamMembers: number;
  concurrency: number;
  dataRetentionDays: number;
}

export interface PlanConfig {
  id: PlanTier;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  limits: PlanLimits;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    executionsPerMonth: 100,
    workflows: 10,
    aiCallsPerMonth: 50,
    members: 3,
    teamMembers: 3,
    concurrency: 2,
    dataRetentionDays: 7,
  },
  STARTER: {
    executionsPerMonth: 100,
    workflows: 10,
    aiCallsPerMonth: 50,
    members: 3,
    teamMembers: 3,
    concurrency: 2,
    dataRetentionDays: 7,
  },
  BASIC: {
    executionsPerMonth: 500,
    workflows: 25,
    aiCallsPerMonth: 200,
    members: 10,
    teamMembers: 10,
    concurrency: 5,
    dataRetentionDays: 30,
  },
  GROWTH: {
    executionsPerMonth: 2_000,
    workflows: 100,
    aiCallsPerMonth: 1_000,
    members: 25,
    teamMembers: 25,
    concurrency: 10,
    dataRetentionDays: 90,
  },
  PRO: {
    executionsPerMonth: Number.POSITIVE_INFINITY,
    workflows: Number.POSITIVE_INFINITY,
    aiCallsPerMonth: Number.POSITIVE_INFINITY,
    members: Number.POSITIVE_INFINITY,
    teamMembers: Number.POSITIVE_INFINITY,
    concurrency: 50,
    dataRetentionDays: 365,
  },
  ENTERPRISE: {
    executionsPerMonth: Number.POSITIVE_INFINITY,
    workflows: Number.POSITIVE_INFINITY,
    aiCallsPerMonth: Number.POSITIVE_INFINITY,
    members: Number.POSITIVE_INFINITY,
    teamMembers: Number.POSITIVE_INFINITY,
    concurrency: 100,
    dataRetentionDays: 730,
  },
};

export const PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    id: "FREE",
    name: "AgentFlow Free",
    description: "Free tier for personal workflows and experimentation",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    limits: PLAN_LIMITS.FREE,
  },
  STARTER: {
    id: "STARTER",
    name: "AgentFlow Starter",
    description: "Starter tier for individuals and indie hackers",
    monthlyPriceCents: 1900,
    yearlyPriceCents: 19000,
    limits: PLAN_LIMITS.STARTER,
  },
  BASIC: {
    id: "BASIC",
    name: "AgentFlow Basic",
    description: "Basic tier for growing teams and light automation",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    limits: PLAN_LIMITS.BASIC,
  },
  GROWTH: {
    id: "GROWTH",
    name: "AgentFlow Growth",
    description: "Growth tier for fast scaling businesses and multi-team collaboration",
    monthlyPriceCents: 9900,
    yearlyPriceCents: 99000,
    limits: PLAN_LIMITS.GROWTH,
  },
  PRO: {
    id: "PRO",
    name: "AgentFlow Pro",
    description: "Pro tier for high-throughput automation and mission-critical workflows",
    monthlyPriceCents: 19900,
    yearlyPriceCents: 199000,
    limits: PLAN_LIMITS.PRO,
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "AgentFlow Enterprise",
    description: "Enterprise tier with dedicated support, custom SLAs and unlimited scale",
    monthlyPriceCents: 59900,
    yearlyPriceCents: 599000,
    limits: PLAN_LIMITS.ENTERPRISE,
  },
};

export function limitsForPlan(plan: unknown): PlanLimits {
  const normalized = String(plan ?? "FREE").toUpperCase() as PlanTier;
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.FREE;
}

export function getPlanConfig(plan: unknown): PlanConfig {
  const normalized = String(plan ?? "FREE").toUpperCase() as PlanTier;
  return PLANS[normalized] ?? PLANS.FREE;
}

export function getStripePriceIdForPlan(plan: string, _interval: "month" | "year" = "month"): string | undefined {
  const upper = plan.toUpperCase();
  if (upper === "PRO") return process.env.STRIPE_PRICE_ID_PRO ?? process.env.STRIPE_PRICE_ID_MONTHLY;
  if (upper === "GROWTH") return process.env.STRIPE_PRICE_ID_TEAM;
  if (upper === "STARTER") return process.env.STRIPE_PRICE_ID_MONTHLY;
  if (upper === "ENTERPRISE") return process.env.STRIPE_PRICE_ID_ENTERPRISE;
  return undefined;
}

export function planForPrice(priceId?: string | null): PlanTier {
  if (!priceId) return "FREE";
  const proPrice = process.env.STRIPE_PRICE_ID_PRO;
  const teamPrice = process.env.STRIPE_PRICE_ID_TEAM;
  const starterPrice = process.env.STRIPE_PRICE_ID_MONTHLY;
  const yearlyPrice = process.env.STRIPE_PRICE_ID_YEARLY;
  const enterprisePrice = process.env.STRIPE_PRICE_ID_ENTERPRISE;

  if (priceId === proPrice) return "PRO";
  if (priceId === teamPrice) return "GROWTH";
  if (priceId === starterPrice) return "STARTER";
  if (priceId === yearlyPrice) return "PRO";
  if (priceId === enterprisePrice) return "ENTERPRISE";

  const lower = priceId.toLowerCase();
  if (lower.includes("enterprise")) return "ENTERPRISE";
  if (lower.includes("pro")) return "PRO";
  if (lower.includes("growth") || lower.includes("team")) return "GROWTH";
  if (lower.includes("basic")) return "BASIC";
  if (lower.includes("starter")) return "STARTER";

  return "PRO";
}

export interface StripeProductDefinition {
  planId: PlanTier;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  metadata: { planTier: PlanTier };
}

export function getStripeProductDefinitions(): StripeProductDefinition[] {
  return (["STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"] as PlanTier[]).map((tier) => {
    const config = PLANS[tier];
    return {
      planId: tier,
      name: config.name,
      description: config.description,
      monthlyPriceCents: config.monthlyPriceCents,
      yearlyPriceCents: config.yearlyPriceCents,
      metadata: { planTier: tier },
    };
  });
}
