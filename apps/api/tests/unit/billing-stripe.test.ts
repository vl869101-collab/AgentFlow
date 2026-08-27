import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_LIMITS,
  limitsForPlan,
  getPlanConfig,
  planForPrice,
  getStripePriceIdForPlan,
  getStripeProductDefinitions,
} from "../../src/lib/plans.js";

describe("Billing & Stripe Plans Sync", () => {
  it("defines all tiers (FREE, STARTER, BASIC, GROWTH, PRO, ENTERPRISE)", () => {
    expect(PLANS.FREE).toBeDefined();
    expect(PLANS.STARTER).toBeDefined();
    expect(PLANS.BASIC).toBeDefined();
    expect(PLANS.GROWTH).toBeDefined();
    expect(PLANS.PRO).toBeDefined();
    expect(PLANS.ENTERPRISE).toBeDefined();
  });

  it("returns correct limits for each plan tier", () => {
    const freeLimits = limitsForPlan("FREE");
    expect(freeLimits.executionsPerMonth).toBe(100);
    expect(freeLimits.workflows).toBe(10);
    expect(freeLimits.concurrency).toBe(2);

    const starterLimits = limitsForPlan("STARTER");
    expect(starterLimits.executionsPerMonth).toBe(100);
    expect(starterLimits.workflows).toBe(10);

    const basicLimits = limitsForPlan("BASIC");
    expect(basicLimits.executionsPerMonth).toBe(500);
    expect(basicLimits.workflows).toBe(25);
    expect(basicLimits.concurrency).toBe(5);

    const growthLimits = limitsForPlan("GROWTH");
    expect(growthLimits.executionsPerMonth).toBe(2000);
    expect(growthLimits.workflows).toBe(100);
    expect(growthLimits.concurrency).toBe(10);

    const proLimits = limitsForPlan("PRO");
    expect(proLimits.executionsPerMonth).toBe(Number.POSITIVE_INFINITY);
    expect(proLimits.workflows).toBe(Number.POSITIVE_INFINITY);
    expect(proLimits.concurrency).toBe(50);

    const enterpriseLimits = limitsForPlan("ENTERPRISE");
    expect(enterpriseLimits.teamMembers).toBe(Number.POSITIVE_INFINITY);
    expect(enterpriseLimits.concurrency).toBe(100);
  });

  it("getPlanConfig returns matching plan configuration", () => {
    const proConfig = getPlanConfig("PRO");
    expect(proConfig.id).toBe("PRO");
    expect(proConfig.name).toContain("Pro");
    expect(proConfig.monthlyPriceCents).toBe(19900);
    expect(proConfig.yearlyPriceCents).toBe(199000);

    const freeConfig = getPlanConfig("FREE");
    expect(freeConfig.id).toBe("FREE");
    expect(freeConfig.monthlyPriceCents).toBe(0);
  });

  it("maps Stripe price IDs to corresponding plan tiers", () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_123";
    process.env.STRIPE_PRICE_ID_TEAM = "price_team_456";
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_starter_789";

    expect(planForPrice("price_pro_123")).toBe("PRO");
    expect(planForPrice("price_team_456")).toBe("GROWTH");
    expect(planForPrice("price_starter_789")).toBe("STARTER");
    expect(planForPrice(undefined)).toBe("FREE");
  });

  it("getStripePriceIdForPlan resolves configured price IDs", () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_env";
    process.env.STRIPE_PRICE_ID_TEAM = "price_team_env";

    expect(getStripePriceIdForPlan("PRO")).toBe("price_pro_env");
    expect(getStripePriceIdForPlan("GROWTH")).toBe("price_team_env");
  });

  it("generates canonical Stripe product definitions for sync", () => {
    const definitions = getStripeProductDefinitions();
    expect(definitions.length).toBeGreaterThanOrEqual(4);
    expect(definitions.some((d) => d.planId === "STARTER")).toBe(true);
    expect(definitions.some((d) => d.planId === "BASIC")).toBe(true);
    expect(definitions.some((d) => d.planId === "GROWTH")).toBe(true);
    expect(definitions.some((d) => d.planId === "PRO")).toBe(true);
    expect(definitions.some((d) => d.planId === "ENTERPRISE")).toBe(true);

    for (const def of definitions) {
      expect(def.name).toContain("AgentFlow");
      expect(def.monthlyPriceCents).toBeGreaterThan(0);
      expect(def.yearlyPriceCents).toBeGreaterThan(0);
      expect(def.metadata.planTier).toBe(def.planId);
    }
  });
});
