import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
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

const env = getEnv();

const app = Fastify({
  logger: true,
  trustProxy: true,
});

// global error handler — consistent { error, code } format
app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    const details = error.flatten().fieldErrors;
    return reply.status(400).send({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details,
    });
  }

  const err = error as any;
  const statusCode = err.statusCode ?? 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;
  const code = err.code ?? "INTERNAL_ERROR";

  if (statusCode === 500) app.log.error(error);
  return reply.status(statusCode).send({ error: message, code });
});

await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
await app.register(sensible);
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
await app.register(jwt, { secret: env.JWT_SECRET });

// health first — no auth
await app.register(healthRoutes);

// auth — no auth required
await app.register(authRoutes, { prefix: "/api/auth" });

// authenticated routes
await app.register(workflowRoutes, { prefix: "/api/workflows" });
await app.register(executionRoutes, { prefix: "/api/executions" });
await app.register(credentialRoutes, { prefix: "/api/credentials" });
await app.register(approvalRoutes, { prefix: "/api/approvals" });
await app.register(settingsRoutes, { prefix: "/api/settings" });
await app.register(aiRoutes, { prefix: "/api/ai" });
await app.register(billingRoutes, { prefix: "/api/billing" });
await app.register(orgRoutes, { prefix: "/api/orgs" });
await app.register(apiKeyRoutes, { prefix: "/api/api-keys" });

// webhooks — mixed auth (public trigger + auth management)
await app.register(webhookRoutes, { prefix: "/api/webhooks" });

await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(`AgentFlow API running on port ${env.PORT}`);
