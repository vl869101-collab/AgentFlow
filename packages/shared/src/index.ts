import { z } from "zod";

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
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

// ═══════════════════════════════════════════
// Workflow Schemas
// ═══════════════════════════════════════════

export const nodeConfigSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const edgeConfigSchema = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
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

export const createCredentialSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["api_key", "oauth2", "basic", "token"]),
  provider: z.string().min(1).max(50),
  data: z.record(z.string()),
});

// ═══════════════════════════════════════════
// Webhook Schemas
// ═══════════════════════════════════════════

export const createWebhookSchema = z.object({
  path: z.string().min(1).max(200).regex(/^[a-z0-9-/]+$/),
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

export const PlanEnum = z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]);
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
  { type: "email", label: "Send Email", icon: "Mail", color: "#10b981" },
  { type: "discord", label: "Discord", icon: "MessageSquare", color: "#5865f2" },
  { type: "telegram", label: "Telegram", icon: "Send", color: "#229ed9" },
  { type: "sheets", label: "Google Sheets", icon: "Table", color: "#34a853" },
  { type: "condition", label: "Condition", icon: "GitBranch", color: "#f59e0b" },
  { type: "transform", label: "Transform", icon: "Shuffle", color: "#ec4899" },
  { type: "delay", label: "Delay", icon: "Timer", color: "#64748b" },
  { type: "ai_agent", label: "AI Agent", icon: "Brain", color: "#a855f7" },
  { type: "approval", label: "Approval", icon: "CheckCircle", color: "#ef4444" },
] as const;
