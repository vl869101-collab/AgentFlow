import type { FastifyInstance } from "fastify";
import { sharedOtpManager } from "../services/remote-bridge/index.js";
import { requireAuth, orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { VerifyOtpRequestSchema } from "../services/remote-bridge/types.js";

const otpManager = sharedOtpManager;

export async function remoteBridgeRoutes(app: FastifyInstance) {
  // Gera OTP de pareamento para o usuário autenticado na Web/Desktop
  app.post("/otp/generate", { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const orgId = orgIdFromRequest(request) || "default-org";
    const userId = userIdFromRequest(request);

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }

    const result = otpManager.generateOtp({ orgId, userId });
    return reply.status(201).send({
      success: true,
      data: {
        code: result.code,
        expiresAt: result.expiresAt,
        wsUrl: `ws://${request.hostname.split(":")[0]}:${process.env.REMOTE_BRIDGE_PORT || 8789}`,
      },
    });
  });

  // Valida e queima o OTP no dispositivo móvel PWA
  app.post("/otp/verify", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = VerifyOtpRequestSchema.parse(request.body);

    try {
      const pairing = otpManager.verifyAndBurnOtp(body.code);
      return reply.send({
        success: true,
        data: pairing,
      });
    } catch (err: unknown) {
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export { otpManager as remoteBridgeOtpManagerInstance };
