import type { FastifyInstance } from "fastify";
import { sharedRelayServer } from "../services/relay/index.js";
import {
  PairInitRequestSchema,
  PairConfirmRequestSchema,
} from "../services/relay/types.js";
import { requireAuth, orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";

const relayServer = sharedRelayServer;

export async function relayRoutes(app: FastifyInstance) {
  /**
   * POST /api/relay/pair/init
   * Gera QR Code / OTP efêmero para pareamento móvel do celular com a VPS ativa.
   */
  app.post(
    "/pair/init",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const orgId = orgIdFromRequest(request) || "default-org";
      const userId = userIdFromRequest(request);

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      const body = PairInitRequestSchema.parse(request.body || {});
      const host = request.headers.host?.split(":")[0] || "relay.agentflow.local";

      const initResult = relayServer.initPairing({
        nodeId: body.nodeId,
        orgId: body.orgId || orgId,
        userId: body.userId || userId,
        relayHost: host,
        ttlSeconds: body.ttlSeconds,
      });

      return reply.status(201).send({
        success: true,
        data: initResult,
      });
    }
  );

  /**
   * POST /api/relay/pair/confirm
   * Valida o handshake/OTP digitado ou escaneado no mobile e autoriza o dispositivo.
   */
  app.post(
    "/pair/confirm",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = PairConfirmRequestSchema.parse(request.body);

      try {
        const confirmResult = relayServer.confirmPairing({
          otp: body.otp,
          handshakeToken: body.handshakeToken,
          deviceId: body.deviceId,
        });

        return reply.send({
          success: true,
          data: confirmResult,
        });
      } catch (err: unknown) {
        return reply.status(400).send({
          success: false,
          error: err instanceof Error ? err.message : String(err),
          code: "PAIRING_FAILED",
        });
      }
    }
  );

  /**
   * GET /api/relay/status
   * Monitoramento de conexões Dial-Out ativas no Relay Server.
   */
  app.get(
    "/status",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (_request, reply) => {
      const sessions = relayServer.getActiveSessions();

      return reply.send({
        success: true,
        data: {
          activeNodesCount: sessions.length,
          sessions,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );
}

export { relayServer as sharedRelayServerInstance };
