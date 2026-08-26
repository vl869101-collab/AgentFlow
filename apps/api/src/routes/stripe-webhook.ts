import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { handleStripeWebhookEvent } from "../services/billing.js";

export async function stripeWebhookRoutes(app: FastifyInstance) {
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
