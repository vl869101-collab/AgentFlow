import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { getEnv } from "./lib/env.js";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.js";
import { workflowRoutes } from "./routes/workflows.js";
import { executionRoutes } from "./routes/executions.js";
import { credentialRoutes } from "./routes/credentials.js";
import { approvalRoutes } from "./routes/approvals.js";
import { settingsRoutes } from "./routes/settings.js";
import { aiRoutes } from "./routes/ai.js";
import { billingRoutes } from "./routes/billing.js";
import { healthRoutes } from "./routes/health.js";
import { orgRoutes } from "./routes/orgs.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { apiKeyRoutes } from "./routes/apikeys.js";
import { oauthRoutes } from "./routes/oauth.js";

function parseTrustProxy(value: string): boolean | string[] {
  if (value === "true") return true;
  if (value === "false" || !value.trim()) return false;
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== "test",
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  });

  // Stripe and signed webhooks need the exact request bytes. Parsing once here
  // keeps the raw payload available to every route without duplicate parsers.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    (request as typeof request & { rawBody?: string }).rawBody = rawBody;
    if (!rawBody || rawBody === "{}") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(rawBody));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.flatten().fieldErrors,
      });
    }

    const err = error as Error & { statusCode?: number; code?: string };
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const knownDatabaseError = err.code === "P2002" ? "A record with these values already exists" : err.code === "P2025" ? "Record not found" : undefined;
    const safeOperationalCodes = new Set(["STRIPE_NOT_CONFIGURED", "STRIPE_NO_URL", "INVALID_PRICE", "NO_ORG"]);
    const operationalCode = err.code && safeOperationalCodes.has(err.code) ? err.code : undefined;
    const message = statusCode >= 500 && !knownDatabaseError && !operationalCode ? "Internal server error" : knownDatabaseError ?? err.message;
    if (statusCode >= 500) app.log.error({ err, requestId: request.id }, "Unhandled API error");
    return reply.status(statusCode).send({ error: message, code: operationalCode ?? (statusCode >= 500 ? "INTERNAL_ERROR" : err.code ?? "REQUEST_ERROR") });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Route not found", code: "NOT_FOUND" }));

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const user = request.user as { sub?: string } | undefined;
      return user?.sub ? `user:${user.sub}` : request.ip;
    },
  });
  await app.register(jwt, { secret: env.JWT_SECRET });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(workflowRoutes, { prefix: "/api/workflows" });
  await app.register(executionRoutes, { prefix: "/api/executions" });
  await app.register(credentialRoutes, { prefix: "/api/credentials" });
  await app.register(approvalRoutes, { prefix: "/api/approvals" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.register(billingRoutes, { prefix: "/api/billing" });
  await app.register(orgRoutes, { prefix: "/api/orgs" });
  await app.register(apiKeyRoutes, { prefix: "/api/api-keys" });
  await app.register(webhookRoutes, { prefix: "/api/webhooks" });
  await app.register(oauthRoutes, { prefix: "/api/auth" });

  return app;
}

export async function startServer() {
  const env = getEnv();
  const app = await buildApp({ logger: true });
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`AgentFlow API running on ${env.HOST}:${env.PORT}`);
  return app;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
