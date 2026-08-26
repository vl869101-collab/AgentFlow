import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";

type StripeObject = Record<string, any>;

function idOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return undefined;
}

function dateFromUnix(value: unknown): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function subscriptionData(subscription: StripeObject) {
  const price = subscription.items?.data?.[0]?.price;
  return {
    stripeCustomerId: idOf(subscription.customer),
    stripeSubscriptionId: idOf(subscription.id),
    stripePriceId: idOf(subscription.stripePriceId) ?? idOf(price),
    status: subscription.status ?? "active",
    currentPeriodStart: dateFromUnix(subscription.current_period_start),
    currentPeriodEnd: dateFromUnix(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };
}

async function ownerForSubscription(source: StripeObject) {
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

async function upsertSubscription(source: StripeObject) {
  const data = subscriptionData(source);
  if (!data.stripeSubscriptionId) return;

  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: data.stripeSubscriptionId },
  });
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data });
    return;
  }

  const owner = await ownerForSubscription(source);
  if (!owner) return;

  await prisma.subscription.create({ data: { ...data, ...owner } });
}

export async function billingRoutes(app: FastifyInstance) {
  app.get("/subscription", { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const userId = userIdFromRequest(request);
    const sub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return sub ?? { status: "free" };
  });

  app.get("/usage", { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const records = await prisma.usageRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      ...parsePagination(request, reply, 50),
    });
    return records;
  });

  app.post("/checkout", { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request) => {
    const { priceId } = request.body as { priceId?: unknown };
    if (typeof priceId !== "string" || !priceId.trim()) {
      throw Object.assign(new Error("priceId is required"), { statusCode: 400, code: "PRICE_REQUIRED" });
    }
    const userId = userIdFromRequest(request);
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
  });

  app.post("/webhook", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return reply.code(503).send({ error: "Stripe webhook is not configured", code: "STRIPE_NOT_CONFIGURED" });
    }

    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return reply.code(400).send({ error: "Missing Stripe signature", code: "MISSING_SIGNATURE" });
    }

    let event: Stripe.Event;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_webhook_only");
      const rawBody = (request as typeof request & { rawBody?: string }).rawBody;
      event = stripe.webhooks.constructEvent(rawBody ?? JSON.stringify(request.body), signature, webhookSecret);
    } catch {
      return reply.code(400).send({ error: "Invalid Stripe webhook signature", code: "INVALID_SIGNATURE" });
    }

    const source = event.data.object as unknown as StripeObject;
    switch (event.type) {
      case "checkout.session.completed":
        await upsertSubscription({
          ...source,
          id: idOf(source.subscription),
          status: "active",
        });
        break;
      case "customer.subscription.updated":
        await upsertSubscription(source);
        break;
      case "customer.subscription.deleted": {
        const subscriptionId = idOf(source.id);
        if (subscriptionId) {
          const existing = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
          if (existing) await prisma.subscription.delete({ where: { id: existing.id } });
        }
        break;
      }
    }

    return { received: true };
  });
}
