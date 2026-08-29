import { z } from "zod";
export {
  importN8nWorkflow,
  createAgentFlowFromN8n,
  validateN8nWorkflow,
  N8N_SDK_CATALOG,
  type N8nWorkflowExport,
  type N8nNode,
  type N8nConnections,
  type N8nNodeSdkSpec,
  type N8nValidationResult,
  type N8nValidationError,
  type AgentFlowImportResult,
  type ImportOptions,
} from "./n8n-import.js";

// ═══════════════════════════════════════════
// Auth Schemas
// ═══════════════════════════════════════════

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ═══════════════════════════════════════════
// Organization Schemas
// ═══════════════════════════════════════════

export const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MEMBER", "VIEWER"]),
});

// ═══════════════════════════════════════════
// Workflow Schemas
// ═══════════════════════════════════════════

const workflowNodeTypeValues = [
  // React Flow canvas categories used by the web app.
  "trigger",
  "action",
  "logic",
  "advanced",
  // Persisted/executable node types.
  "webhook",
  "cron",
  "cronTrigger",
  "manual",
  "http",
  "httpRequest",
  "postgres",
  "postgresql",
  "redis",
  "mongo",
  "mongodb",
  "email",
  "discord",
  "telegram",
  "telegramTrigger",
  "slack",
  "slackTrigger",
  "sheets",
  "googleSheets",
  "googleDrive",
  "drive",
  "gmail",
  "googleGmail",
  "gmailTrigger",
  "ai",
  "ai_agent",
  "condition",
  "transform",
  "delay",
  "code",
  "output",
  "approval",
  "merge",
  "filter",
  "splitInBatches",
  "set_fields",
  "respond_webhook",
  "evaluationTrigger",
  "emailReadImap",
] as const;

export const workflowNodeTypeSchema = z.enum(workflowNodeTypeValues);

export const nodeConfigSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  type: workflowNodeTypeSchema,
  label: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  data: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  width: z.number().optional(),
  height: z.number().optional(),
}).passthrough().superRefine((node, ctx) => {
  const nestedType = node.data?.type;
  if (nestedType !== undefined && !workflowNodeTypeSchema.safeParse(nestedType).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsupported workflow node type",
      path: ["data", "type"],
    });
  }
});

export const edgeConfigSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  sourceNodeId: z.string().optional(),
  targetNodeId: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.unknown().optional(),
}).passthrough().superRefine((edge, ctx) => {
  if (!edge.sourceNodeId && !edge.source) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge source is required", path: ["source"] });
  if (!edge.targetNodeId && !edge.target) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge target is required", path: ["target"] });
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});

export const saveWorkflowCanvasSchema = z.object({
  nodes: z.array(nodeConfigSchema),
  edges: z.array(edgeConfigSchema),
});

const workflowVersionNumberSchema = z.coerce.number().int().positive();

export const workflowDiffQuerySchema = z.object({
  fromVersion: workflowVersionNumberSchema.optional(),
  toVersion: workflowVersionNumberSchema.optional(),
  // Keep the original v1/v2 aliases for backwards compatibility.
  v1: workflowVersionNumberSchema.optional(),
  v2: workflowVersionNumberSchema.optional(),
}).transform((query) => ({
  fromVersion: query.fromVersion ?? query.v1 ?? 1,
  toVersion: query.toVersion ?? query.v2 ?? 2,
}));

export const workflowVersionParamsSchema = z.object({
  version: workflowVersionNumberSchema,
});

export const rollbackWorkflowSchema = z.object({
  targetVersion: workflowVersionNumberSchema.optional(),
  // Keep `version` as an accepted alias for older SDK consumers.
  version: workflowVersionNumberSchema.optional(),
}).refine((body) => body.targetVersion !== undefined || body.version !== undefined, {
  message: "targetVersion is required",
  path: ["targetVersion"],
}).transform((body) => ({ targetVersion: body.targetVersion ?? body.version! }));

export const auditEventSchema = z.object({
  action: z.string().trim().min(1).max(120),
  resource: z.string().trim().min(1).max(120).optional(),
  resourceId: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const auditListQuerySchema = z.object({
  action: z.string().trim().min(1).max(120).optional(),
  resource: z.string().trim().min(1).max(120).optional(),
});

export const auditExportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
  message: "from must be before or equal to to",
  path: ["from"],
});

const generatedNodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: workflowNodeTypeSchema,
  label: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  data: z.record(z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  width: z.number().optional(),
  height: z.number().optional(),
}).superRefine((node, ctx) => {
  const nestedType = node.data?.type;
  if (nestedType !== undefined && !workflowNodeTypeSchema.safeParse(nestedType).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported workflow node type", path: ["data", "type"] });
  }
});

const generatedEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  sourceNodeId: z.string().optional(),
  targetNodeId: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.unknown().optional(),
}).superRefine((edge, ctx) => {
  if (!edge.sourceNodeId && !edge.source) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge source is required", path: ["source"] });
  if (!edge.targetNodeId && !edge.target) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge target is required", path: ["target"] });
});

export const generatedWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  nodes: z.array(generatedNodeSchema).min(1).max(100),
  edges: z.array(generatedEdgeSchema).max(200),
}).superRefine((workflow, ctx) => {
  const nodeIds = new Set<string>();

  workflow.nodes.forEach((node, index) => {
    if (!node.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Generated nodes must have ids", path: ["nodes", index, "id"] });
      return;
    }
    if (nodeIds.has(node.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Generated node ids must be unique", path: ["nodes", index, "id"] });
    }
    nodeIds.add(node.id);
  });

  workflow.edges.forEach((edge, index) => {
    const source = edge.sourceNodeId ?? edge.source;
    const target = edge.targetNodeId ?? edge.target;
    if (source && !nodeIds.has(source)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge references an unknown source node", path: ["edges", index, "source"] });
    }
    if (target && !nodeIds.has(target)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge references an unknown target node", path: ["edges", index, "target"] });
    }
  });
});

// ═══════════════════════════════════════════
// Execution Schemas
// ═══════════════════════════════════════════

export const executeWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional(),
  trigger: z.enum(["manual", "webhook", "cron", "api"]).default("manual"),
});

// ═══════════════════════════════════════════
// Credential Schemas
// ═══════════════════════════════════════════

export const credentialBucketSchema = z.enum([
  "api_key",
  "bearer_token",
  "basic_auth",
  "oauth2_managed",
  "oauth2_custom",
  "header_auth",
  "query_auth",
  "mcp_oauth2",
  "oauth2",
  "basic",
  "token",
]);

export const createCredentialSchema = z.object({
  name: z.string().min(1).max(100),
  type: credentialBucketSchema.or(z.string().min(1).max(50)),
  provider: z.string().min(1).max(100),
  data: z.record(z.any()),
});

// ═══════════════════════════════════════════
// Webhook Schemas
// ═══════════════════════════════════════════

export const createWebhookSchema = z.object({
  path: z.string().min(1).max(200).regex(/^[a-z0-9][a-z0-9-/]*$/),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  workflowId: z.string().optional(),
  secret: z.string().optional(),
});

// ═══════════════════════════════════════════
// AI Schemas
// ═══════════════════════════════════════════

export const generateWorkflowSchema = z.object({
  description: z.string().min(10).max(5000),
});

export const explainErrorSchema = z.object({
  executionId: z.string(),
  nodeId: z.string().optional(),
  error: z.string(),
});

// ═══════════════════════════════════════════
// Approval Schemas
// ═══════════════════════════════════════════

export const decideApprovalSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  message: z.string().max(1000).optional(),
});

// ═══════════════════════════════════════════
// API Response Types
// ═══════════════════════════════════════════

export type ApiResponse<T> = {
  data: T;
  meta?: { total?: number; page?: number; limit?: number };
};

export type ApiError = {
  error: string;
  code: string;
  details?: Record<string, string[]>;
};

// ═══════════════════════════════════════════
// Enums (mirror Prisma)
// ═══════════════════════════════════════════

export const PlanEnum = z.enum(["FREE", "STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"]);
export const MemberRoleEnum = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export const WorkflowStatusEnum = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
export const ExecutionStatusEnum = z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"]);

export type Plan = z.infer<typeof PlanEnum>;
export type MemberRole = z.infer<typeof MemberRoleEnum>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusEnum>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

// ═══════════════════════════════════════════
// Node Types
// ═══════════════════════════════════════════

export const NODE_TYPES = [
  { type: "webhook", label: "Webhook", icon: "Webhook", color: "#6366f1" },
  { type: "cron", label: "Schedule", icon: "Clock", color: "#8b5cf6" },
  { type: "http", label: "HTTP Request", icon: "Globe", color: "#06b6d4" },
  { type: "postgres", label: "PostgreSQL", icon: "Database", color: "#336791" },
  { type: "redis", label: "Redis", icon: "Database", color: "#dc382d" },
  { type: "mongo", label: "MongoDB", icon: "Database", color: "#13aa52" },
  { type: "email", label: "Send Email", icon: "Mail", color: "#10b981" },
  { type: "discord", label: "Discord", icon: "MessageSquare", color: "#5865f2" },
  { type: "telegram", label: "Telegram", icon: "Send", color: "#229ed9" },
  { type: "sheets", label: "Google Sheets", icon: "Table", color: "#34a853" },
  { type: "condition", label: "Condition", icon: "GitBranch", color: "#f59e0b" },
  { type: "transform", label: "Transform", icon: "Shuffle", color: "#ec4899" },
  { type: "delay", label: "Delay", icon: "Timer", color: "#64748b" },
  { type: "code", label: "Code Sandbox", icon: "Code", color: "#0ea5e9" },
  { type: "ai_agent", label: "AI Agent", icon: "Brain", color: "#a855f7" },
  { type: "approval", label: "Approval", icon: "CheckCircle", color: "#ef4444" },
  { type: "merge", label: "Merge", icon: "Merge", color: "#06b6d4" },
  { type: "filter", label: "Filter", icon: "Filter", color: "#f97316" },
  { type: "set_fields", label: "Set Fields", icon: "Pencil", color: "#14b8a6" },
  { type: "respond_webhook", label: "Respond Webhook", icon: "Reply", color: "#8b5cf6" },
  { type: "gmailTrigger", label: "Gmail Trigger", icon: "Mail", color: "#ea4335" },
  { type: "googleDrive", label: "Google Drive", icon: "HardDrive", color: "#34a853" },
  { type: "drive", label: "Drive", icon: "HardDrive", color: "#34a853" },
  { type: "evaluationTrigger", label: "Evaluation Trigger", icon: "ClipboardCheck", color: "#f59e0b" },
  { type: "emailReadImap", label: "IMAP Email", icon: "Mail", color: "#06b6d4" },
  { type: "gmail", label: "Gmail", icon: "Mail", color: "#ea4335" },
  { type: "googleGmail", label: "Google Gmail", icon: "Mail", color: "#ea4335" },
  { type: "googleSheets", label: "Google Sheets", icon: "Table", color: "#34a853" },
  { type: "slack", label: "Slack", icon: "MessageSquare", color: "#4a154b" },
  { type: "slackTrigger", label: "Slack Trigger", icon: "Zap", color: "#4a154b" },
  { type: "telegramTrigger", label: "Telegram Trigger", icon: "Zap", color: "#229ed9" },
  { type: "cronTrigger", label: "Cron Trigger", icon: "Clock", color: "#8b5cf6" },
] as const;

// ═══════════════════════════════════════════
// Inferred Schema Input Types
// ═══════════════════════════════════════════

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type SaveWorkflowCanvasInput = z.infer<typeof saveWorkflowCanvasSchema>;
export type WorkflowDiffQuery = z.infer<typeof workflowDiffQuerySchema>;
export type RollbackWorkflowInput = z.infer<typeof rollbackWorkflowSchema>;
export type AuditEventInput = z.infer<typeof auditEventSchema>;
export type NodeConfigInput = z.infer<typeof nodeConfigSchema>;
export type EdgeConfigInput = z.infer<typeof edgeConfigSchema>;
export type ExecuteWorkflowInput = z.infer<typeof executeWorkflowSchema>;
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type CredentialBucket = z.infer<typeof credentialBucketSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type GenerateWorkflowInput = z.infer<typeof generateWorkflowSchema>;
export type ExplainErrorInput = z.infer<typeof explainErrorSchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
export type GeneratedWorkflow = z.infer<typeof generatedWorkflowSchema>;

// ═══════════════════════════════════════════
// Quota & Metering Types
// ═══════════════════════════════════════════

export type PlanLimits = {
  executionsPerMonth: number;
  workflows: number;
  aiCallsPerMonth: number;
  members: number;
  concurrency: number;
  dataRetentionDays: number;
};

export type MetricUsage = {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
};

export type OrgUsageSummary = {
  orgId: string;
  plan: string;
  periodStart: string;
  periodEnd: string;
  limits: PlanLimits;
  metrics: {
    executions: MetricUsage;
    aiCalls: MetricUsage;
    workflows: MetricUsage;
    members: MetricUsage;
  };
};

export type UsageType = "execution" | "ai_call" | "integration_call" | "webhook_call";

export interface RecordUsageParams {
  orgId: string;
  userId?: string;
  type: UsageType | string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════
// Observability & OpenTelemetry Types
// ═══════════════════════════════════════════

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
  traceState?: string;
}

export type SpanStatusCode = "UNSET" | "OK" | "ERROR";

export interface SpanData {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: SpanStatusCode; description?: string };
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

export interface TelemetryStats {
  service: string;
  timestamp: string;
  activeExecutions: number;
  counters: {
    httpRequests: number;
    workflowExecutions: number;
    aiGenerations: number;
  };
  spansRecorded: number;
}

export interface NodeTrace {
  id: string;
  nodeId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt: Date | string;
  finishedAt?: Date | string | null;
  duration?: number | null;
}

export interface ExecutionTrace {
  executionId: string;
  status: string;
  startedAt: Date | string;
  finishedAt?: Date | string | null;
  duration?: number | null;
  traces: NodeTrace[];
}
