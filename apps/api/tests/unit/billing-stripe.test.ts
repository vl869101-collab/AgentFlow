import { describe, it, expect } from "vitest";
import {
  PLANS,
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
    expect(freeLimits.workflows).toBe(1);

    const proLimits = limitsForPlan("PRO");
    expect(proLimits.executionsPerMonth).toBe(Number.POSITIVE_INFINITY);
    expect(proLimits.workflows).toBe(Number.POSITIVE_INFINITY);

    const enterpriseLimits = limitsForPlan("ENTERPRISE");
    expect(enterpriseLimits.teamMembers).toBe(Number.POSITIVE_INFINITY);
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

  it("generates canonical Stripe product definitions for sync", () => {
    const definitions = getStripeProductDefinitions();
    expect(definitions.length).toBeGreaterThanOrEqual(4);
    expect(definitions.some((d) => d.planId === "STARTER")).toBe(true);
    expect(definitions.some((d) => d.planId === "BASIC")).toBe(true);
    expect(definitions.some((d) => d.planId === "GROWTH")).toBe(true);
    expect(definitions.some((d) => d.planId === "PRO")).toBe(true);

    for (const def of definitions) {
      expect(def.name).toContain("AgentFlow");
      expect(def.monthlyPriceCents).toBeGreaterThan(0);
      expect(def.yearlyPriceCents).toBeGreaterThan(0);
      expect(def.metadata.planTier).toBe(def.planId);
    }
  });
});
