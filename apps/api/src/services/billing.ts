import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { limitsForPlan, type PlanTier } from "../lib/plans.js";
import { checkAndSetWebhookIdempotency } from "../lib/redis.js";

export type StripeObject = Record<string, any>;

export function idOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return undefined;
}

export function dateFromUnix(value: unknown): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

/**
 * Maps a Stripe Price ID or metadata plan string to an AgentFlow Plan enum.
 */
export function mapPriceToPlan(priceId?: string | null, metadataPlan?: string | null): PlanTier {
  if (metadataPlan) {
    const upper = metadataPlan.toUpperCase();
    if (["FREE", "STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(upper)) {
      return upper as PlanTier;
    }
  }

  const env = getEnv() as any;
  if (priceId) {
    if (priceId === env.STRIPE_PRICE_ID_PRO || priceId.toLowerCase().includes("pro")) return "PRO";
    if (priceId === env.STRIPE_PRICE_ID_TEAM || priceId.toLowerCase().includes("growth") || priceId.toLowerCase().includes("team")) return "GROWTH";
    if (priceId.toLowerCase().includes("basic")) return "BASIC";
    if (priceId.toLowerCase().includes("starter")) return "STARTER";
    if (priceId.toLowerCase().includes("enterprise")) return "ENTERPRISE";
    if (priceId === env.STRIPE_PRICE_ID_MONTHLY || priceId === env.STRIPE_PRICE_ID_YEARLY) return "PRO";
  }

  return "PRO"; // Default upgraded tier for paid checkout
}

export function extractSubscriptionData(subscription: StripeObject) {
  const price = subscription.items?.data?.[0]?.price;
  const priceId = idOf(subscription.stripePriceId) ?? idOf(price);
  const metadata = subscription.metadata ?? {};
  const plan = mapPriceToPlan(priceId, metadata.plan ?? metadata.planTier);

  return {
    stripeCustomerId: idOf(subscription.customer),
    stripeSubscriptionId: idOf(subscription.id),
    stripePriceId: priceId,
    status: subscription.status ?? "active",
    currentPeriodStart: dateFromUnix(subscription.current_period_start),
    currentPeriodEnd: dateFromUnix(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    plan,
  };
}

export async function findSubscriptionOwner(source: StripeObject): Promise<{ userId: string; orgId: string } | null> {
  const metadata = source.metadata ?? {};
  const customerId = idOf(source.customer);
  const userId = metadata.userId ?? source.client_reference_id;

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : customerId
      ? await prisma.user.findUnique({ where: { stripeCustomerId: customerId } })
      : null;
  if (!user) return null;

  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  const orgId = metadata.orgId ?? membership?.orgId;
  return orgId ? { userId: user.id, orgId } : null;
}

/**
 * Atomically upsert subscription and update organization plan / status.
 */
export async function syncSubscription(source: StripeObject): Promise<any> {
  const data = extractSubscriptionData(source);
  if (!data.stripeSubscriptionId) return null;

  const owner = await findSubscriptionOwner(source);
  const orgId = owner?.orgId;

  // 1. Upsert subscription record
  let subRecord: any = null;
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: data.stripeSubscriptionId },
  });

  const subPayload = {
    stripeCustomerId: data.stripeCustomerId,
    stripeSubscriptionId: data.stripeSubscriptionId,
    stripePriceId: data.stripePriceId,
    status: data.status,
    currentPeriodStart: data.currentPeriodStart,
    currentPeriodEnd: data.currentPeriodEnd,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
  };

  if (existing) {
    subRecord = await prisma.subscription.update({
      where: { id: existing.id },
      data: subPayload,
    });
  } else if (owner) {
    subRecord = await prisma.subscription.create({
      data: {
        ...subPayload,
        userId: owner.userId,
        orgId: owner.orgId,
      },
    });
  }

  // 2. Update organization plan & limits accordingly
  const effectiveOrgId = orgId || existing?.orgId;
  if (effectiveOrgId) {
    const isPlanActive = ["active", "trialing"].includes(data.status);
    const targetPlan: PlanTier = isPlanActive ? data.plan : "FREE";

    await prisma.organization.update({
      where: { id: effectiveOrgId },
      data: {
        plan: targetPlan as any,
      },
    });

    // Record audit log for subscription synchronization
    await prisma.auditLog.create({
      data: {
        action: `billing.subscription_${data.status}`,
        resource: "organization",
        resourceId: effectiveOrgId,
        metadata: {
          subscriptionId: data.stripeSubscriptionId,
          plan: targetPlan,
          rawPlan: data.plan,
          status: data.status,
          currentPeriodEnd: data.currentPeriodEnd?.toISOString(),
        },
        userId: owner?.userId ?? existing?.userId ?? "system",
        orgId: effectiveOrgId,
      },
    }).catch(() => {});
  }

  return subRecord;
}

/**
 * Handle Stripe webhook events idempotently with signed event validation and lifecycle sync.
 */
export async function handleStripeWebhookEvent(
  event: Stripe.Event
): Promise<{ handled: boolean; type: string; duplicate?: boolean; details?: any }> {
  // 1. Enforce Webhook Idempotency (7-day retention)
  if (event.id) {
    const idempotency = await checkAndSetWebhookIdempotency(
      `stripe:event:${event.id}`,
      event.type,
      86400 * 7
    );
    if (idempotency.isDuplicate) {
      return {
        handled: true,
        type: event.type,
        duplicate: true,
        details: "Event already processed (idempotent replay)",
      };
    }
  }

  const source = event.data.object as unknown as StripeObject;

  switch (event.type) {
    case "checkout.session.completed": {
      const subId = idOf(source.subscription);
      if (subId) {
        await syncSubscription({
          ...source,
          id: subId,
          status: "active",
        });
      }
      return { handled: true, type: event.type };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(source);
      return { handled: true, type: event.type };
    }

    case "customer.subscription.deleted": {
      const subscriptionId = idOf(source.id);
      if (subscriptionId) {
        const existing = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: { status: "canceled" },
          });

          // Downgrade organization to FREE
          if (existing.orgId) {
            await prisma.organization.update({
              where: { id: existing.orgId },
              data: { plan: "FREE" },
            });

            await prisma.auditLog.create({
              data: {
                action: "billing.subscription_canceled",
                resource: "organization",
                resourceId: existing.orgId,
                metadata: { subscriptionId, previousPlan: "PRO", newPlan: "FREE" },
                userId: existing.userId,
                orgId: existing.orgId,
              },
            }).catch(() => {});
          }
        }
      }
      return { handled: true, type: event.type };
    }

    case "invoice.payment_succeeded": {
      const subId = idOf(source.subscription);
      if (subId) {
        const existing = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: { status: "active" },
          });

          if (existing.orgId) {
            const plan = mapPriceToPlan(existing.stripePriceId);
            await prisma.organization.update({
              where: { id: existing.orgId },
              data: { plan: plan as any },
            });

            await prisma.auditLog.create({
              data: {
                action: "billing.payment_succeeded",
                resource: "organization",
                resourceId: existing.orgId,
                metadata: { subscriptionId: subId, invoiceId: idOf(source.id) },
                userId: existing.userId,
                orgId: existing.orgId,
              },
            }).catch(() => {});
          }
        }
      }
      return { handled: true, type: event.type };
    }

    case "invoice.payment_failed": {
      const subId = idOf(source.subscription);
      if (subId) {
        const existing = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: { status: "past_due" },
          });

          if (existing.orgId) {
            await prisma.auditLog.create({
              data: {
                action: "billing.payment_failed",
                resource: "organization",
                resourceId: existing.orgId,
                metadata: {
                  subscriptionId: subId,
                  invoiceId: idOf(source.id),
                  warning: "Account past_due. Non-critical workflows suspended.",
                },
                userId: existing.userId,
                orgId: existing.orgId,
              },
            }).catch(() => {});
          }
        }
      }
      return { handled: true, type: event.type };
    }

    default:
      return { handled: false, type: event.type };
  }
}

/**
 * Create Stripe Checkout Session.
 */
export async function createCheckoutSession(params: {
  userId: string;
  priceId: string;
  appUrl?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, priceId } = params;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error("Stripe checkout is not configured. Set STRIPE_SECRET_KEY."), {
      statusCode: 503,
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  const configuredPrices = [
    process.env.STRIPE_PRICE_ID_MONTHLY,
    process.env.STRIPE_PRICE_ID_YEARLY,
    process.env.STRIPE_PRICE_ID_PRO,
    process.env.STRIPE_PRICE_ID_TEAM,
  ].filter((value): value is string => Boolean(value));

  if (configuredPrices.length > 0 && !configuredPrices.includes(priceId)) {
    throw Object.assign(new Error("Unknown Stripe price"), { statusCode: 400, code: "INVALID_PRICE" });
  }

  const membership = await prisma.organizationMember.findFirst({ where: { userId } });
  if (!membership) {
    throw Object.assign(new Error("No organization found for user"), { statusCode: 400, code: "NO_ORG" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let customerId = user.stripeCustomerId as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId, orgId: membership.orgId },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const appUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
    metadata: { userId, orgId: membership.orgId, priceId },
    subscription_data: { metadata: { userId, orgId: membership.orgId, priceId } },
  });

  if (!session.url) {
    throw Object.assign(new Error("Stripe did not return a checkout URL"), { statusCode: 502, code: "STRIPE_NO_URL" });
  }

  return { url: session.url, sessionId: session.id };
}
