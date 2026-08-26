import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { getEnv } from "./lib/env.js";
import { telemetry, type Span } from "./lib/otel.js";
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
import { bullBoardRoutes } from "./routes/bullboard.js";
import { auditRoutes } from "./routes/audit.js";
import { usageRoutes } from "./routes/usage.js";
import { stripeWebhookRoutes } from "./routes/stripe-webhook.js";
import { chatRoutes } from "./routes/chat.js";
import { dlqRoutes } from "./routes/dlq.js";
import { mcpRoutes } from "./routes/mcp.js";
import { docsRoutes } from "./docs/openapi.js";

function parseTrustProxy(value: string | boolean | number): number | boolean | string[] {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (value === "true" || value === "1") return 1;
  if (value === "false" || value === "0" || !value.trim()) return 0;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 ? entries : 0;
}

function parseCorsOrigin(origin: string): boolean | string | (string | RegExp)[] {
  if (origin === "*" || origin === "true") return true;
  if (origin === "false") return false;
  const list = origin.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (list.length === 1) return list[0];
  return list;
}

function getPinoLoggerConfig(env: ReturnType<typeof getEnv>, options: { logger?: boolean | object } = {}) {
  if (options.logger === false) return false;
  if (typeof options.logger === "object") return options.logger;
  if (env.NODE_ENV === "test" && options.logger !== true) return false;

  return {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          path: req.routerPath,
          userAgent: req.headers?.["user-agent"],
          remoteAddress: req.ip,
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
      err(err: any) {
        return {
          type: err.name || err.constructor?.name,
          message: err.message,
          code: err.code,
          statusCode: err.statusCode,
          stack: env.NODE_ENV === "production" ? undefined : err.stack,
        };
      },
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "req.headers['x-webhook-signature']",
        "req.headers['x-signature-256']",
        "req.headers['x-hub-signature-256']",
        "password",
        "passwordHash",
        "token",
        "refreshToken",
        "secret",
        "apiKey",
        "api_key",
        "clientSecret",
        "client_secret",
        "botToken",
        "bot_token",
        "accessToken",
        "access_token",
        "privateKey",
        "private_key",
        "webhookSecret",
        "headerValue",
        "paramValue",
      ],
      censor: "[REDACTED]",
    },
  };
}

export async function buildApp(options: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: getPinoLoggerConfig(env, options),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    genReqId: (req) => {
      const customId = req.headers["x-request-id"] || req.headers["x-correlation-id"];
      return typeof customId === "string" && customId.trim() ? customId.trim() : randomUUID();
    },
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
      const err = new Error("Invalid JSON payload");
      (err as any).statusCode = 400;
      (err as any).code = "VALIDATION_ERROR";
      done(err, undefined);
    }
  });

  // ═══════════════════════════════════════════
  // Request Correlation, Tracing & OTel Hooks
  // ═══════════════════════════════════════════

  app.addHook("onRequest", async (request: FastifyRequest) => {
    (request as any).requestStartTime = performance.now();

    const traceParentHeader = request.headers["traceparent"] as string | undefined;
    const parentContext = telemetry.parseTraceParent(traceParentHeader);

    const attributes: Record<string, string | number | boolean> = {
      "http.method": request.method,
      "http.url": request.url,
      "http.route": request.routeOptions?.url || "unknown",
      "http.client_ip": request.ip,
      "http.user_agent": (request.headers["user-agent"] as string) || "unknown",
      "agentflow.request_id": request.id,
    };

    const span = telemetry.startSpan(
      `${request.method} ${request.routeOptions?.url || request.url.split("?")[0]}`,
      attributes,
      parentContext
    );

    (request as any).span = span;
  });

  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload) => {
    reply.header("X-Request-Id", request.id);
    // Security headers — defense in depth (audit M-03 / H-02)
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    const span = (request as any).span as Span | undefined;
    if (span) {
      reply.header(
        "traceparent",
        telemetry.formatTraceParent({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: "01",
        })
      );
    }
    return payload;
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const span = (request as any).span as Span | undefined;
    const startTime = (request as any).requestStartTime as number | undefined;
    const durationMs = startTime ? performance.now() - startTime : 0;

    if (span) {
      span.setAttribute("http.status_code", reply.statusCode);
      span.setAttribute("http.duration_ms", durationMs);
      if (reply.statusCode >= 500) {
        span.setStatus("ERROR", `HTTP ${reply.statusCode}`);
      } else {
        span.setStatus("OK");
      }
      span.end();
    }

    const route = request.routeOptions?.url || request.url.split("?")[0];
    telemetry.recordHttpRequest(request.method, route, reply.statusCode, durationMs);
  });

  // ═══════════════════════════════════════════
  // Error Handling
  // ═══════════════════════════════════════════

  app.setErrorHandler((error, request, reply) => {
    const span = (request as any).span as Span | undefined;
    if (span) {
      span.recordException(error);
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        requestId: request.id,
        details: error.flatten().fieldErrors,
      });
    }

    const err = error as Error & { statusCode?: number; code?: string; stack?: string };
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const knownDatabaseError = err.code === "P2002" ? "A record with these values already exists" : err.code === "P2025" ? "Record not found" : undefined;
    const safeOperationalCodes = new Set([
      "STRIPE_NOT_CONFIGURED",
      "STRIPE_NO_URL",
      "INVALID_PRICE",
      "PRICE_REQUIRED",
      "NO_ORG",
      "QUOTA_EXCEEDED",
      "AI_QUOTA_EXCEEDED",
      "MEMBER_LIMIT_REACHED",
      "WORKFLOW_LIMIT_REACHED",
      "INVALID_SIGNATURE",
      "MISSING_SIGNATURE",
      "IDEMPOTENT_REPLAY",
      "VALIDATION_ERROR",
      "INVALID_CREDENTIALS",
      "INVALID_TOKEN",
      "AUTH_FAILED",
      "ORG_REQUIRED",
      "FORBIDDEN_ORG",
      "NOT_ORG_MEMBER",
      "FORBIDDEN",
      "NOT_FOUND",
      "EXEC_CODE_DISABLED",
      "SSRF_BLOCKED",
      "EGRESS_BLOCKED",
      "INVALID_URL",
      "UNSUPPORTED_PROTOCOL",
      "CREDENTIALS_IN_URL",
      "TOO_MANY_REDIRECTS",
      "RESPONSE_TOO_LARGE",
      "CODE_SECURITY_BLOCK",
      "CODE_TIMEOUT",
      "CODE_RUNTIME_ERROR",
      "CODE_MISSING_PARAMS",
      "CODE_MISSING_JS",
    ]);
    const operationalCode = err.code && safeOperationalCodes.has(err.code) ? err.code : undefined;
    const isProd = env.NODE_ENV === "production";

    const message = statusCode >= 500 && !knownDatabaseError && !operationalCode
      ? "Internal server error"
      : isProd && statusCode >= 500
        ? "Internal server error"
        : (knownDatabaseError ?? err.message ?? "Internal server error");

    if (statusCode >= 500) {
      app.log.error({ err, requestId: request.id }, "Unhandled API error");
    }

    const payload: Record<string, unknown> = {
      error: message,
      code: operationalCode ?? (statusCode >= 500 ? "INTERNAL_ERROR" : err.code ?? "REQUEST_ERROR"),
      requestId: request.id,
    };

    if (!isProd && statusCode >= 500 && err.stack) {
      payload.stack = err.stack;
    }

    return reply.status(statusCode).send(payload);
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Route not found", code: "NOT_FOUND" }));

  // ═══════════════════════════════════════════
  // Plugins & Routes
  // ═══════════════════════════════════════════

  await app.register(cors, { origin: parseCorsOrigin(env.CORS_ORIGIN), credentials: true });
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

  // Telemetry & Metrics endpoints (TASK-10)
  app.get("/metrics", async (_request, reply) => {
    return reply
      .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
      .send(telemetry.getPrometheusMetrics());
  });

  app.get("/api/telemetry/stats", async () => {
    return telemetry.getMetricsSummary();
  });

  app.get("/api/telemetry/spans", async (request) => {
    const limit = (request.query as { limit?: string })?.limit;
    return telemetry.getRecentSpans(limit ? Number(limit) : 100);
  });

  app.get("/api/telemetry/traces", async () => {
    return telemetry.exportSpansOTLP();
  });

  app.get("/api/telemetry/otlp", async () => {
    return telemetry.exportSpansOTLP();
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(workflowRoutes, { prefix: "/api/workflows" });
  await app.register(executionRoutes, { prefix: "/api/executions" });
  await app.register(credentialRoutes, { prefix: "/api/credentials" });
  await app.register(approvalRoutes, { prefix: "/api/approvals" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.register(billingRoutes, { prefix: "/api/billing" });
  await app.register(stripeWebhookRoutes, { prefix: "/api/stripe" });
  await app.register(usageRoutes, { prefix: "/api/usage" });
  await app.register(orgRoutes, { prefix: "/api/orgs" });
  await app.register(apiKeyRoutes, { prefix: "/api/api-keys" });
  await app.register(webhookRoutes, { prefix: "/api/webhooks" });
  await app.register(oauthRoutes, { prefix: "/api/auth" });
  await app.register(mcpRoutes, { prefix: "/mcp" });
  await app.register(mcpRoutes, { prefix: "/api/mcp" });
  await app.register(bullBoardRoutes, { prefix: "/admin/queues" });
  await app.register(chatRoutes, { prefix: "/api/chat" });
  await app.register(dlqRoutes, { prefix: "/api/admin/dlq" });
  await app.register(auditRoutes, { prefix: "/api/audit" });
  await app.register(docsRoutes);

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
