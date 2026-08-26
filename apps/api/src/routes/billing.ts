import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { handleStripeWebhookEvent, createCheckoutSession } from "../services/billing.js";

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
    return createCheckoutSession({ userId, priceId });
  });

  app.post("/webhook", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
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

    const result = await handleStripeWebhookEvent(event);
    return { received: true, ...result };
  });
}
