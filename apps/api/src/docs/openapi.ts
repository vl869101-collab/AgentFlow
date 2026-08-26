import type { FastifyInstance } from "fastify";
import { z, type ZodSchema } from "zod";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  signupSchema,
  loginSchema,
  createOrgSchema,
  inviteMemberSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  saveWorkflowCanvasSchema,
  createCredentialSchema,
  createWebhookSchema,
  generatedWorkflowSchema,
} from "@agentflow/shared";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════
// Registry + security schemes
// ═══════════════════════════════════════════

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "AgentFlow access token (from POST /api/auth/login) or a personal API key " +
    "(`af_…`, from POST /api/api-keys). Send as `Authorization: Bearer <token>`.",
});
registry.registerComponent("securitySchemes", "webhookSignature", {
  type: "apiKey",
  in: "header",
  name: "X-Webhook-Signature",
  description:
    "HMAC-SHA256 hex digest of the raw request body, computed with the webhook secret " +
    "(optional `sha256=` prefix). Required on every /api/webhooks/trigger/{path} call.",
});
registry.registerComponent("securitySchemes", "stripeSignature", {
  type: "apiKey",
  in: "header",
  name: "stripe-signature",
  description: "Stripe webhook signature header (t=…,v1=…).",
});

// ═══════════════════════════════════════════
// Reusable parameter schemas
// ═══════════════════════════════════════════

const idParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, description: "Entity ID (cuid)" }),
});

const webhookPathParams = z.object({
  path: z.string().openapi({
    param: { name: "path", in: "path" },
    description: "Webhook path configured at creation time",
    example: "new-order",
  }),
});

const oauthProviderParams = z.object({
  provider: z.enum(["google", "microsoft", "apple"]).openapi({
    param: { name: "provider", in: "path" },
    description: "OAuth provider",
  }),
});

registry.registerPath({
  method: "get",
  path: "/api/orgs/{id}/usage",
  tags: ["Orgs"],
  summary: "Get organization usage statistics and quota limits",
  security: [{ bearerAuth: [] }],
  request: { params: idParams },
  responses: {
    200: {
      description: "Organization usage and quota metrics breakdown",
      content: {
        "application/json": {
          schema: z.object({
            orgId: z.string(),
            plan: z.string(),
            periodStart: z.string().openapi({ format: "date-time" }),
            periodEnd: z.string().openapi({ format: "date-time" }),
            limits: z.object({
              executionsPerMonth: z.number(),
              workflows: z.number(),
              aiCallsPerMonth: z.number(),
              members: z.number(),
              concurrency: z.number(),
              dataRetentionDays: z.number(),
            }),
            metrics: z.object({
              executions: z.object({ used: z.number(), limit: z.number(), remaining: z.number(), percentage: z.number() }),
              aiCalls: z.object({ used: z.number(), limit: z.number(), remaining: z.number(), percentage: z.number() }),
              workflows: z.object({ used: z.number(), limit: z.number(), remaining: z.number(), percentage: z.number() }),
              members: z.object({ used: z.number(), limit: z.number(), remaining: z.number(), percentage: z.number() }),
            }),
          }),
        },
      },
    },
    404: { description: "Organization not found" },
  },
});

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).openapi({ param: { name: "page", in: "query" }, example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).openapi({ param: { name: "limit", in: "query" }, example: 25 }),
});

// ═══════════════════════════════════════════
// Component schemas
// ═══════════════════════════════════════════

const ApiError = z
  .object({
    error: z.string().openapi({ description: "Human-readable error message" }),
    code: z.string().openapi({ description: "Machine-readable error code", example: "NOT_FOUND" }),
    details: z.record(z.array(z.string())).optional().openapi({
      description: "Field-level validation errors (VALIDATION_ERROR only)",
    }),
  })
  .openapi({ description: "Error envelope used by every non-2xx response" });

const MessageResponse = z.object({
  message: z.string().openapi({ example: "If registration can be completed, you can sign in with your credentials." }),
});

const OkResponse = z.object({ ok: z.literal(true) });

const User = z.object({
  id: z.string().openapi({ example: "clx4f1v2m3abc" }),
  email: z.string().email().openapi({ example: "dev@example.com" }),
  name: z.string().openapi({ example: "Dev User" }),
});

const OrgSummary = z.object({
  id: z.string().openapi({ example: "clx4org923" }),
  name: z.string().openapi({ example: "Dev's Organization" }),
  slug: z.string().regex(/^[a-z0-9-]+$/).openapi({ example: "dev-user-clx4f1" }),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]).openapi({ example: "OWNER" }),
  plan: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]).optional(),
});

const CanvasNode = z.object({
  id: z.string().openapi({ example: "node-1" }),
  type: z.enum(["trigger", "action", "logic", "advanced"]).openapi({ description: "Canvas category" }),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    type: z.string().openapi({ description: "Executable node type (webhook, http, condition, …)", example: "http" }),
    label: z.string().openapi({ example: "HTTP Request" }),
    description: z.string(),
    config: z.record(z.unknown()),
  }),
});

const CanvasEdge = z.object({
  id: z.string().openapi({ example: "edge-1" }),
  source: z.string().openapi({ description: "Source node id" }),
  target: z.string().openapi({ description: "Target node id" }),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.unknown().optional(),
  animated: z.boolean(),
});

const Workflow = z.object({
  id: z.string().openapi({ example: "clx4wf777" }),
  name: z.string().openapi({ example: "Sync orders to Sheets" }),
  description: z.string().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).openapi({ example: "ACTIVE" }),
  orgId: z.string(),
  createdAt: z.string().openapi({ format: "date-time" }),
  updatedAt: z.string().openapi({ format: "date-time" }),
  nodes: z.array(CanvasNode).optional(),
  edges: z.array(CanvasEdge).optional(),
});

const Execution = z.object({
  id: z.string().openapi({ example: "clx4ex321" }),
  workflowId: z.string(),
  orgId: z.string().nullable(),
  status: z
    .enum(["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"])
    .openapi({ example: "SUCCESS" }),
  trigger: z.enum(["manual", "webhook", "cron", "api"]).openapi({ example: "manual" }),
  input: z.record(z.unknown()).nullable(),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: z.string().openapi({ format: "date-time" }),
  finishedAt: z.string().nullable().openapi({ format: "date-time" }),
});

const NodeExecution = z.object({
  id: z.string(),
  executionId: z.string(),
  status: z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED", "SKIPPED"]).openapi({ example: "SUCCESS" }),
  input: z.record(z.unknown()).nullable(),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: z.string().openapi({ format: "date-time" }),
  finishedAt: z.string().nullable().openapi({ format: "date-time" }),
});

const Approval = z.object({
  id: z.string(),
  executionId: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).openapi({ example: "PENDING" }),
  createdAt: z.string().openapi({ format: "date-time" }),
  decidedAt: z.string().nullable().openapi({ format: "date-time" }),
  execution: z.object({ id: z.string(), workflow: z.object({ id: z.string(), name: z.string() }) }).optional(),
});

const Credential = z.object({
  id: z.string(),
  name: z.string().openapi({ example: "Slack prod token" }),
  type: z.enum(["api_key", "oauth2", "basic", "token"]),
  provider: z.string().openapi({ example: "slack" }),
  createdAt: z.string().openapi({ format: "date-time" }),
  data: z.object({ hasValue: z.literal(true) }).openapi({ description: "Value is never returned in listings" }),
});

const CredentialReveal = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["api_key", "oauth2", "basic", "token"]),
  provider: z.string(),
  data: z.record(z.unknown()).openapi({ description: "Decrypted credential payload (OWNER/ADMIN only)" }),
});

const Settings = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string().openapi({ format: "date-time" }),
  organizations: z.array(OrgSummary),
});

const Subscription = z.union([
  z.object({
    id: z.string(),
    status: z.string().openapi({ example: "active" }),
    stripeCustomerId: z.string().nullable(),
    stripeSubscriptionId: z.string().nullable(),
    currentPeriodStart: z.string().nullable().openapi({ format: "date-time" }),
    currentPeriodEnd: z.string().nullable().openapi({ format: "date-time" }),
    cancelAtPeriodEnd: z.boolean(),
  }),
  z.object({ status: z.literal("free") }),
]);

const UsageRecord = z.object({
  id: z.string(),
  type: z.enum(["execution"]).openapi({ example: "execution" }),
  quantity: z.number().int(),
  createdAt: z.string().openapi({ format: "date-time" }),
});

const CheckoutResponse = z.object({
  url: z.string().openapi({ description: "Stripe Checkout URL to redirect the user to" }),
  sessionId: z.string().openapi({ example: "cs_test_abc123" }),
});

const ApiKey = z.object({
  id: z.string(),
  name: z.string().openapi({ example: "CI pipeline" }),
  lastUsed: z.string().nullable().openapi({ format: "date-time" }),
  expiresAt: z.string().nullable().openapi({ format: "date-time" }),
  createdAt: z.string().openapi({ format: "date-time" }),
});

const ApiKeyCreated = z.object({
  id: z.string(),
  name: z.string(),
  key: z
    .string()
    .regex(/^af_[0-9a-f]{64}$/)
    .openapi({ description: "Plaintext key — returned exactly once. Send as a Bearer token." }),
  createdAt: z.string().openapi({ format: "date-time" }),
});

const Webhook = z.object({
  id: z.string(),
  path: z.string().openapi({ example: "new-order" }),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  workflowId: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().openapi({ format: "date-time" }),
  workflow: z.object({ id: z.string(), name: z.string() }).optional(),
});

const WebhookCreated = Webhook.extend({
  secret: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .openapi({ description: "Signing secret — returned exactly once" }),
});

const TriggerAccepted = z.object({
  executionId: z.string().openapi({ description: "ID of the queued execution", example: "clx4ex321" }),
});

const LoginResponse = z.object({
  token: z.string().openapi({ description: "JWT access token (15 min TTL)" }),
  refreshToken: z.string().openapi({ description: "Refresh token (7 day TTL)" }),
  user: User,
  org: OrgSummary.nullable(),
});

const TokenPair = z.object({
  token: z.string(),
  refreshToken: z.string(),
});

// Register component schemas so they can be referenced by name in the document.
const refs = {
  ApiError: registry.register("ApiError", ApiError),
  MessageResponse: registry.register("MessageResponse", MessageResponse),
  OkResponse: registry.register("OkResponse", OkResponse),
  User: registry.register("User", User),
  OrgSummary: registry.register("OrgSummary", OrgSummary),
  Workflow: registry.register("Workflow", Workflow),
  Execution: registry.register("Execution", Execution),
  NodeExecution: registry.register("NodeExecution", NodeExecution),
  Approval: registry.register("Approval", Approval),
  Credential: registry.register("Credential", Credential),
  CredentialReveal: registry.register("CredentialReveal", CredentialReveal),
  Settings: registry.register("Settings", Settings),
  Subscription: registry.register("Subscription", Subscription),
  UsageRecord: registry.register("UsageRecord", UsageRecord),
  CheckoutResponse: registry.register("CheckoutResponse", CheckoutResponse),
  ApiKey: registry.register("ApiKey", ApiKey),
  ApiKeyCreated: registry.register("ApiKeyCreated", ApiKeyCreated),
  Webhook: registry.register("Webhook", Webhook),
  WebhookCreated: registry.register("WebhookCreated", WebhookCreated),
  LoginResponse: registry.register("LoginResponse", LoginResponse),
  TokenPair: registry.register("TokenPair", TokenPair),
  TriggerAccepted: registry.register("TriggerAccepted", TriggerAccepted),
} satisfies Record<string, ZodSchema>;

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

const bearer = [{ bearerAuth: [] }];

function jsonBody(schema: ZodSchema, description: string) {
  return { content: { "application/json": { schema } }, required: true, description };
}

function jsonResponse(schema: ZodSchema, description: string) {
  return { description, content: { "application/json": { schema } } };
}

const errorResponses = {
  400: jsonResponse(refs.ApiError, "Validation failed"),
  401: jsonResponse(refs.ApiError, "Missing or invalid token"),
  500: jsonResponse(refs.ApiError, "Internal server error"),
};

// ═══════════════════════════════════════════
// Paths — System
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness and dependency check",
  responses: {
    200: jsonResponse(
      z.object({
        status: z.enum(["ok", "degraded"]),
        timestamp: z.string().openapi({ format: "date-time" }),
        checks: z.record(z.enum(["ok", "error", "in-memory"])),
      }),
      "Service health (503 when degraded)",
    ),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/docs",
  tags: ["System"],
  summary: "OpenAPI 3.1 JSON document",
  responses: { 200: { description: "OpenAPI 3.1 specification" } },
});

registry.registerPath({
  method: "get",
  path: "/docs",
  tags: ["System"],
  summary: "Interactive Swagger UI documentation",
  responses: { 200: { description: "Swagger UI HTML page" } },
});

registry.registerPath({
  method: "get",
  path: "/docs/json",
  tags: ["System"],
  summary: "OpenAPI 3.1 JSON document alias",
  responses: { 200: { description: "OpenAPI 3.1 specification" } },
});

registry.registerPath({
  method: "get",
  path: "/metrics",
  tags: ["System"],
  summary: "Prometheus formatted OpenTelemetry metrics",
  responses: { 200: { description: "Prometheus text metrics" } },
});

registry.registerPath({
  method: "get",
  path: "/api/telemetry/stats",
  tags: ["System"],
  summary: "Telemetry summary metrics in JSON format",
  responses: {
    200: jsonResponse(
      z.object({
        service: z.string(),
        timestamp: z.string(),
        activeExecutions: z.number(),
        counters: z.object({
          httpRequests: z.number(),
          workflowExecutions: z.number(),
          aiGenerations: z.number(),
        }),
        spansRecorded: z.number(),
      }),
      "Telemetry metrics summary"
    ),
  },
});

// ═══════════════════════════════════════════
// Paths — Auth
// ═══════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/auth/register",
  tags: ["Auth"],
  summary: "Create an account (with a default organization)",
  description:
    "Creates the user and a personal organization where they are OWNER. " +
    "The response is intentionally identical whether or not the email already exists " +
    "(10 requests/hour rate limit).",
  request: { body: jsonBody(signupSchema, "Registration payload") },
  responses: {
    201: jsonResponse(refs.MessageResponse, "Registration accepted"),
    400: errorResponses[400],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Exchange email + password for tokens",
  description: "Rate limited to 10 requests per 15 minutes.",
  request: { body: jsonBody(loginSchema, "Credentials") },
  responses: {
    200: jsonResponse(refs.LoginResponse, "Tokens and the user's first organization"),
    401: jsonResponse(refs.ApiError, "Invalid credentials"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate a refresh token",
  description:
    "Validates and rotates the refresh token (single-use) and returns a fresh access token. " +
    "Rate limited to 30 requests per 15 minutes.",
  request: {
    body: jsonBody(z.object({ refreshToken: z.string().min(1).max(4096) }), "Refresh token to rotate"),
  },
  responses: {
    200: jsonResponse(refs.TokenPair, "New token pair"),
    401: jsonResponse(refs.ApiError, "Invalid or already-used refresh token"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  summary: "Revoke a refresh token",
  request: {
    body: {
      content: { "application/json": { schema: z.object({ refreshToken: z.string() }) } },
      description: "Optional — revokes the given token when present",
    },
  },
  responses: { 204: { description: "Token revoked (or body ignored)" } },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/forgot-password",
  tags: ["Auth"],
  summary: "Request a password reset email",
  description: "Always returns 200 to avoid account enumeration (5 requests/hour rate limit). Email delivery is stubbed in the current MVP.",
  request: { body: jsonBody(z.object({ email: z.string().email() }), "Account email") },
  responses: { 200: jsonResponse(refs.MessageResponse, "Generic confirmation") },
});

registry.registerPath({
  method: "get",
  path: "/api/auth/{provider}",
  tags: ["Auth"],
  summary: "Start a social login flow",
  description:
    "Redirects (302) to the provider's consent screen. Requires the matching `*_CLIENT_ID`/" +
    "`*_CLIENT_SECRET` env vars; returns 501 OAUTH_NOT_CONFIGURED otherwise.",
  request: { params: oauthProviderParams },
  responses: {
    302: { description: "Redirect to the provider authorization URL" },
    501: jsonResponse(refs.ApiError, "Provider not configured"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/auth/{provider}/callback",
  tags: ["Auth"],
  summary: "OAuth callback (browser-facing)",
  description:
    "Exchanges the authorization code, then returns an HTML page that auto-submits the tokens " +
    "to `{NEXT_PUBLIC_APP_URL}/auth/callback` via POST. On failure, redirects to `/register?error=…`.",
  request: {
    params: oauthProviderParams,
    query: z.object({
      code: z.string().optional().openapi({ param: { name: "code", in: "query" } }),
      state: z.string().optional().openapi({ param: { name: "state", in: "query" } }),
      error: z.string().optional().openapi({ param: { name: "error", in: "query" } }),
    }),
  },
  responses: {
    200: { description: "HTML auto-submit form carrying the token pair" },
    302: { description: "Redirect to the frontend with an error" },
  },
});

// ═══════════════════════════════════════════
// Paths — Workflows
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/workflows",
  tags: ["Workflows"],
  summary: "List workflows of the active organization",
  security: bearer,
  request: { query: paginationQuery },
  responses: {
    200: jsonResponse(z.array(refs.Workflow), "Workflows, most recently updated first"),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/workflows",
  tags: ["Workflows"],
  summary: "Create a workflow",
  description: "Enforces the workflow limit of the organization's plan (403 WORKFLOW_LIMIT_REACHED).",
  security: bearer,
  request: { body: jsonBody(createWorkflowSchema, "Workflow metadata") },
  responses: {
    201: jsonResponse(refs.Workflow, "Created workflow"),
    400: jsonResponse(refs.ApiError, "Validation failed or user has no organization (NO_ORG)"),
    403: jsonResponse(refs.ApiError, "Plan workflow limit reached"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/workflows/{id}",
  tags: ["Workflows"],
  summary: "Get a workflow with canvas and latest version",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.Workflow, "Workflow including nodes and edges"),
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

const workflowUpdateBody = updateWorkflowSchema.extend({
  nodes: z.array(z.unknown()).optional().openapi({ description: "Full node list (canvas save)" }),
  edges: z.array(z.unknown()).optional().openapi({ description: "Full edge list (canvas save)" }),
});

registry.registerPath({
  method: "put",
  path: "/api/workflows/{id}",
  tags: ["Workflows"],
  summary: "Update workflow metadata and/or canvas",
  description:
    "When `nodes` or `edges` are present, both are treated as the full canvas: existing nodes/edges " +
    "are replaced and a new immutable WorkflowVersion snapshot is recorded.",
  security: bearer,
  request: { params: idParams, body: jsonBody(workflowUpdateBody, "Fields to update") },
  responses: {
    200: jsonResponse(refs.Workflow, "Updated workflow"),
    400: errorResponses[400],
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/workflows/{id}",
  tags: ["Workflows"],
  summary: "Partially update workflow metadata and/or canvas",
  security: bearer,
  request: { params: idParams, body: jsonBody(workflowUpdateBody, "Fields to update") },
  responses: {
    200: jsonResponse(refs.Workflow, "Updated workflow"),
    400: errorResponses[400],
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/workflows/{id}",
  tags: ["Workflows"],
  summary: "Delete a workflow (and its canvas)",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Deleted"),
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "put",
  path: "/api/workflows/{id}/canvas",
  tags: ["Workflows"],
  summary: "Replace the workflow canvas",
  description:
    "Validates node ids for uniqueness and edge endpoints for existence, persists nodes/edges atomically, and snapshots a new version.",
  security: bearer,
  request: { params: idParams, body: jsonBody(saveWorkflowCanvasSchema, "Full canvas") },
  responses: {
    200: jsonResponse(z.object({ ok: z.literal(true), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }), "Saved canvas"),
    400: errorResponses[400],
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/workflows/{id}/run",
  tags: ["Workflows"],
  summary: "Run a workflow manually",
  description:
    "Enqueues an execution (BullMQ when Redis is available, inline otherwise) and records usage " +
    "against the organization's monthly quota.",
  security: bearer,
  request: { params: idParams },
  responses: {
    202: jsonResponse(refs.Execution, "Execution created and queued"),
    403: jsonResponse(refs.ApiError, "Monthly execution quota exceeded (QUOTA_EXCEEDED)"),
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Executions
// ═══════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/executions/trigger",
  tags: ["Executions"],
  summary: "Trigger a workflow execution via API",
  description: "Quota-checked. Ideal for scheduled/CI invocations using an API key.",
  security: bearer,
  request: {
    body: jsonBody(
      z.object({
        workflowId: z.string().min(1).openapi({ example: "clx4wf777" }),
        input: z.record(z.unknown()).optional().openapi({ description: "Initial execution input" }),
        trigger: z.enum(["manual", "webhook", "cron", "api"]).optional().openapi({ default: "api" }),
      }),
      "Execution request",
    ),
  },
  responses: {
    202: jsonResponse(refs.Execution, "Execution created and queued"),
    400: errorResponses[400],
    403: jsonResponse(refs.ApiError, "Monthly execution quota exceeded"),
    404: jsonResponse(refs.ApiError, "Workflow not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/executions",
  tags: ["Executions"],
  summary: "List executions",
  security: bearer,
  request: {
    query: paginationQuery.extend({
      workflowId: z.string().optional().openapi({ param: { name: "workflowId", in: "query" } }),
      status: z
        .enum(["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"])
        .optional()
        .openapi({ param: { name: "status", in: "query" } }),
    }),
  },
  responses: {
    200: jsonResponse(
      z.array(refs.Execution.extend({ workflow: z.object({ id: z.string(), name: z.string() }) })),
      "Executions, newest first",
    ),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/executions/{id}",
  tags: ["Executions"],
  summary: "Get execution details (nodes, approvals, workflow)",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(
      refs.Execution.extend({
        nodes: z.array(refs.NodeExecution),
        approvals: z.array(refs.Approval),
        workflow: z.object({ id: z.string(), name: z.string() }).nullable(),
      }),
      "Execution detail",
    ),
    404: jsonResponse(refs.ApiError, "Execution not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/executions/{id}/cancel",
  tags: ["Executions"],
  summary: "Cancel a pending or running execution",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Cancelled"),
    404: jsonResponse(refs.ApiError, "Not found or already finished (NOT_CANCELLABLE)"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/executions/{id}/nodes",
  tags: ["Executions"],
  summary: "List node-level logs of an execution",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(z.array(refs.NodeExecution), "Node executions in run order"),
    404: jsonResponse(refs.ApiError, "Execution not found"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Credentials
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/credentials",
  tags: ["Credentials"],
  summary: "List credentials (masked)",
  security: bearer,
  request: { query: paginationQuery },
  responses: {
    200: jsonResponse(z.array(refs.Credential), "Credentials without secret values"),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/credentials",
  tags: ["Credentials"],
  summary: "Store an encrypted credential",
  description: "Values are encrypted at rest with AES-256-GCM (CREDENTIAL_ENCRYPTION_KEY).",
  security: bearer,
  request: { body: jsonBody(createCredentialSchema, "Credential to store") },
  responses: {
    201: jsonResponse(refs.Credential, "Stored credential (masked)"),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/credentials/{id}/reveal",
  tags: ["Credentials"],
  summary: "Reveal a credential's decrypted value",
  description: "Restricted to organization OWNER and ADMIN members.",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.CredentialReveal, "Decrypted credential"),
    403: jsonResponse(refs.ApiError, "Only owners and admins can reveal credentials"),
    404: jsonResponse(refs.ApiError, "Credential not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/credentials/{id}",
  tags: ["Credentials"],
  summary: "Delete a credential",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Deleted"),
    404: jsonResponse(refs.ApiError, "Credential not found"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Approvals
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/approvals",
  tags: ["Approvals"],
  summary: "List pending approvals across your organizations",
  security: bearer,
  request: { query: paginationQuery },
  responses: {
    200: jsonResponse(z.array(refs.Approval), "Pending approvals, newest first"),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/approvals/{id}/approve",
  tags: ["Approvals"],
  summary: "Approve a pending approval",
  description: "Approving resumes the WAITING_APPROVAL execution.",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Approved"),
    404: jsonResponse(refs.ApiError, "Approval not found or already decided"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/approvals/{id}/reject",
  tags: ["Approvals"],
  summary: "Reject a pending approval",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Rejected"),
    404: jsonResponse(refs.ApiError, "Approval not found or already decided"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Settings
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/settings",
  tags: ["Settings"],
  summary: "Current user profile and organizations",
  security: bearer,
  responses: { 200: jsonResponse(refs.Settings, "User settings"), 401: errorResponses[401] },
});

registry.registerPath({
  method: "put",
  path: "/api/settings",
  tags: ["Settings"],
  summary: "Update the user profile",
  security: bearer,
  request: {
    body: jsonBody(
      z.object({
        name: z.string().optional(),
        avatarUrl: z.string().optional(),
      }),
      "Fields to update",
    ),
  },
  responses: { 200: jsonResponse(refs.OkResponse, "Updated"), 401: errorResponses[401] },
});

// ═══════════════════════════════════════════
// Paths — AI
// ═══════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/ai/generate",
  tags: ["AI"],
  summary: "Generate a workflow from a natural-language prompt",
  description:
    "Sends the prompt to the NVIDIA NIM provider (meta/llama-3.1-8b-instruct), parses and validates " +
    "the returned workflow. Rate limited to 20 requests/minute. Requires NVIDIA_NIM_API_KEY.",
  security: bearer,
  request: {
    body: jsonBody(z.object({ prompt: z.string().trim().min(1).max(5000) }), "Workflow description"),
  },
  responses: {
    200: jsonResponse(
      z.object({ workflow: generatedWorkflowSchema }),
      "Validated workflow draft (not persisted)",
    ),
    502: jsonResponse(refs.ApiError, "Provider returned an invalid workflow (AI_INVALID_OUTPUT / AI_PROVIDER_ERROR)"),
    503: jsonResponse(refs.ApiError, "AI not configured (AI_NOT_CONFIGURED)"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Billing
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/billing/subscription",
  tags: ["Billing"],
  summary: "Current subscription (or free)",
  security: bearer,
  responses: {
    200: jsonResponse(refs.Subscription, "Latest subscription, or {status:'free'}"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/billing/usage",
  tags: ["Billing"],
  summary: "Usage records for the current user",
  security: bearer,
  request: { query: paginationQuery },
  responses: {
    200: jsonResponse(z.array(refs.UsageRecord), "Usage records, newest first"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/billing/checkout",
  tags: ["Billing"],
  summary: "Create a Stripe Checkout session",
  description:
    "Requires STRIPE_SECRET_KEY (503 STRIPE_NOT_CONFIGURED otherwise). The priceId must match one " +
    "of the configured STRIPE_PRICE_ID_* values when any are set. Rate limited to 10/hour.",
  security: bearer,
  request: {
    body: jsonBody(
      z.object({
        priceId: z.string().min(1).openapi({
          example: "price_1PabcDEFghiJKLmno",
          description: "Stripe price ID of the plan to subscribe to",
        }),
      }),
      "Checkout request",
    ),
  },
  responses: {
    200: jsonResponse(refs.CheckoutResponse, "Checkout session URL"),
    400: jsonResponse(refs.ApiError, "priceId required (PRICE_REQUIRED), unknown price (INVALID_PRICE), or no organization (NO_ORG)"),
    502: jsonResponse(refs.ApiError, "Stripe returned no checkout URL"),
    503: jsonResponse(refs.ApiError, "Stripe not configured"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/billing/webhook",
  tags: ["Billing"],
  summary: "Stripe webhook receiver",
  description:
    "Verifies the `stripe-signature` header against STRIPE_WEBHOOK_SECRET and keeps the local " +
    "Subscription table in sync (checkout.session.completed, customer.subscription.updated/deleted).",
  security: [{ stripeSignature: [] }],
  responses: {
    200: jsonResponse(z.object({ received: z.literal(true) }), "Event processed"),
    400: jsonResponse(refs.ApiError, "Missing or invalid signature"),
    503: jsonResponse(refs.ApiError, "Webhook not configured"),
  },
});

// ═══════════════════════════════════════════
// Paths — Organizations
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/orgs",
  tags: ["Orgs"],
  summary: "List organizations the user belongs to",
  security: bearer,
  responses: {
    200: jsonResponse(z.array(refs.OrgSummary), "Organizations with the caller's role"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/orgs",
  tags: ["Orgs"],
  summary: "Create an organization",
  security: bearer,
  request: { body: jsonBody(createOrgSchema, "Organization to create") },
  responses: {
    201: jsonResponse(refs.OrgSummary, "Created organization (caller becomes OWNER)"),
    409: jsonResponse(refs.ApiError, "Slug already taken (SLUG_EXISTS)"),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/orgs/{id}",
  tags: ["Orgs"],
  summary: "Get an organization",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OrgSummary, "Organization"),
    404: jsonResponse(refs.ApiError, "Not a member or does not exist"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "put",
  path: "/api/orgs/{id}",
  tags: ["Orgs"],
  summary: "Rename an organization (OWNER/ADMIN only)",
  security: bearer,
  request: {
    params: idParams,
    body: jsonBody(z.object({ name: z.string().optional() }), "Fields to update"),
  },
  responses: {
    200: jsonResponse(refs.OrgSummary, "Updated organization"),
    403: jsonResponse(refs.ApiError, "Insufficient permissions"),
    404: jsonResponse(refs.ApiError, "Organization not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/orgs/{id}/members",
  tags: ["Orgs"],
  summary: "List members of an organization",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(
      z.array(
        z.object({
          id: z.string(),
          role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
          user: z.object({ id: z.string(), email: z.string(), name: z.string(), avatarUrl: z.string().nullable() }),
        }),
      ),
      "Members",
    ),
    404: jsonResponse(refs.ApiError, "Organization not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/orgs/{id}/invite",
  tags: ["Orgs"],
  summary: "Add a registered user to the organization",
  description:
    "Invites target existing accounts only — the invitee must register first. Only OWNER can " +
    "grant the ADMIN role; ADMIN inviters are capped at MEMBER.",
  security: bearer,
  request: { params: idParams, body: jsonBody(inviteMemberSchema, "Invitee email and role") },
  responses: {
    200: jsonResponse(z.object({ ok: z.literal(true), role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) }), "Member added"),
    403: jsonResponse(refs.ApiError, "Insufficient permissions"),
    404: jsonResponse(refs.ApiError, "Invitee has no account (USER_NOT_FOUND)"),
    409: jsonResponse(refs.ApiError, "Already a member (ALREADY_MEMBER) or pending invite"),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — API Keys
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/api-keys",
  tags: ["API Keys"],
  summary: "List personal API keys (without values)",
  security: bearer,
  responses: {
    200: jsonResponse(z.array(refs.ApiKey), "API keys, newest first. Values are stored hashed and never returned."),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/api-keys",
  tags: ["API Keys"],
  summary: "Create a personal API key",
  description: "The plaintext `af_…` key is returned exactly once; only its SHA-256 hash is stored.",
  security: bearer,
  request: {
    body: jsonBody(
      z.object({
        name: z.string().min(1).max(100).openapi({ example: "CI pipeline" }),
        expiresAt: z.string().openapi({ format: "date-time", description: "Optional expiry timestamp" }).optional(),
      }),
      "Key request",
    ),
  },
  responses: {
    201: jsonResponse(refs.ApiKeyCreated, "Created key — copy it now"),
    400: jsonResponse(refs.ApiError, "Invalid name or expiry"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/api-keys/{id}",
  tags: ["API Keys"],
  summary: "Revoke a personal API key",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Revoked"),
    404: jsonResponse(refs.ApiError, "API key not found"),
    401: errorResponses[401],
  },
});

// ═══════════════════════════════════════════
// Paths — Webhooks
// ═══════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/webhooks",
  tags: ["Webhooks"],
  summary: "List webhooks of your organizations",
  description: "Signing secrets are never included in list responses.",
  security: bearer,
  request: { query: paginationQuery },
  responses: {
    200: jsonResponse(z.array(refs.Webhook), "Webhooks, newest first"),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/webhooks",
  tags: ["Webhooks"],
  summary: "Create a webhook trigger",
  description:
    "Generates a random signing secret when none is supplied. The secret is returned exactly once, " +
    "in this response. Paths must be unique.",
  security: bearer,
  request: { body: jsonBody(createWebhookSchema, "Webhook to create") },
  responses: {
    201: jsonResponse(refs.WebhookCreated, "Created webhook — store the secret now"),
    400: jsonResponse(refs.ApiError, "Validation failed or no organization (NO_ORG)"),
    404: jsonResponse(refs.ApiError, "Linked workflow not found (WORKFLOW_NOT_FOUND)"),
    409: jsonResponse(refs.ApiError, "Path already taken (PATH_EXISTS)"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/webhooks/{id}",
  tags: ["Webhooks"],
  summary: "Delete a webhook",
  security: bearer,
  request: { params: idParams },
  responses: {
    200: jsonResponse(refs.OkResponse, "Deleted"),
    404: jsonResponse(refs.ApiError, "Webhook not found"),
    401: errorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/webhooks/trigger/{path}",
  tags: ["Webhooks"],
  summary: "Invoke a webhook (public, signed)",
  description:
    "No authentication token — access is granted by knowing the path **and** a valid HMAC-SHA256 " +
    "signature of the raw body (`X-Webhook-Signature` header, computed with the webhook secret). " +
    "The request method must match the webhook's configured method. Enforces the organization's " +
    "monthly execution quota. Rate limited to 60 requests/minute.",
  security: [{ webhookSignature: [] }],
  request: {
    params: webhookPathParams,
    body: {
      content: { "application/json": { schema: z.unknown() } },
      description: "Arbitrary JSON payload delivered to the workflow as execution input",
      required: false,
    },
  },
  responses: {
    202: jsonResponse(refs.TriggerAccepted, "Execution queued"),
    401: jsonResponse(refs.ApiError, "Missing or invalid signature"),
    404: jsonResponse(refs.ApiError, "Webhook not found"),
    405: jsonResponse(refs.ApiError, "Method does not match the webhook configuration"),
    429: jsonResponse(refs.ApiError, "Monthly execution quota exceeded"),
  },
});

// ═══════════════════════════════════════════
// Document generation
// ═══════════════════════════════════════════

const generator = new OpenApiGeneratorV31(registry.definitions);

// Named alias keeps the emitted declaration portable across pnpm layouts.
type OpenApiDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>;

export const openApiDocument: OpenApiDocument = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "AgentFlow API",
    version: "0.1.0",
    description:
      "REST API for AgentFlow — an open-source workflow automation platform.\n\n" +
      "**Authentication** — send `Authorization: Bearer <token>` with a JWT access token " +
      "(POST /api/auth/login) or a personal API key (`af_…`, POST /api/api-keys).\n\n" +
      "**Rate limiting** — 200 requests/minute per user or IP by default; stricter limits apply " +
      "to auth, AI and checkout endpoints.\n\n" +
      "**Pagination** — list endpoints accept `page` and `limit` (max 100) and return the applied " +
      "values in the `X-Page` and `X-Limit` response headers.",
    license: { name: "MIT" },
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
    { url: "https://api.agentflow.dev", description: "Production (placeholder)" },
  ],
  tags: [
    { name: "System", description: "Health and documentation endpoints" },
    { name: "Auth", description: "Registration, login, token rotation and social login" },
    { name: "Workflows", description: "Workflow CRUD, canvas persistence and manual runs" },
    { name: "Executions", description: "Execution triggering, listing and inspection" },
    { name: "Credentials", description: "Encrypted third-party credentials" },
    { name: "Approvals", description: "Human-in-the-loop approval gates" },
    { name: "Settings", description: "User profile settings" },
    { name: "AI", description: "AI-powered workflow generation" },
    { name: "Billing", description: "Subscriptions, usage metering and Stripe integration" },
    { name: "Orgs", description: "Organizations, members and invites" },
    { name: "API Keys", description: "Personal API keys for programmatic access" },
    { name: "Webhooks", description: "Webhook triggers with HMAC signature verification" },
  ],
});

// ═══════════════════════════════════════════
// Fastify plugin that serves the spec + UI
// ═══════════════════════════════════════════

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AgentFlow API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({ url: "/api/docs", dom_id: "#swagger-ui", deepLinking: true });
    };
  </script>
</body>
</html>`;

export async function docsRoutes(app: FastifyInstance) {
  // JSON OpenAPI Specification
  app.get("/api/docs", async () => openApiDocument);
  app.get("/docs/json", async () => openApiDocument);

  // Interactive Swagger UI
  app.get("/docs", async (_request, reply) => reply.type("text/html; charset=utf-8").send(swaggerUiHtml));
  app.get("/docs/ui", async (_request, reply) => reply.type("text/html; charset=utf-8").send(swaggerUiHtml));
  app.get("/api/docs/ui", async (_request, reply) => reply.type("text/html; charset=utf-8").send(swaggerUiHtml));
}
