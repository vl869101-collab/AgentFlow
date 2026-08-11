import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/subscription", async (request) => {
    const userId = userIdFromRequest(request);
    const sub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return sub ?? { status: "free" };
  });

  app.get("/usage", async (request) => {
    const userId = userIdFromRequest(request);
    const records = await prisma.usageRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return records;
  });

  // ponytail: Stripe checkout stub — wire up real Stripe when key is set
  app.post("/checkout", async (request) => {
    const { priceId } = request.body as { priceId: string };
    const userId = userIdFromRequest(request);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!process.env.STRIPE_SECRET_KEY) {
      return { url: "#stripe-not-configured" };
    }

    // TODO: real Stripe checkout session
    return { url: `https://checkout.stripe.com/pay/cs_stub_${user.id}_${priceId}` };
  });

  app.post("/webhook", async (request) => {
    // ponytail: Stripe webhook handler — verify signature in production
    const body = request.body as any;
    const event = body?.type;
    if (event === "checkout.session.completed") {
      // TODO: activate subscription
    }
    return { received: true };
  });
}
