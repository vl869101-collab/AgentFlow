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
    "manual",
    "http",
    "email",
    "discord",
    "telegram",
    "sheets",
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
    "set_fields",
    "respond_webhook",
];
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
    if (!edge.sourceNodeId && !edge.source)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge source is required", path: ["source"] });
    if (!edge.targetNodeId && !edge.target)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge target is required", path: ["target"] });
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
    if (!edge.sourceNodeId && !edge.source)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge source is required", path: ["source"] });
    if (!edge.targetNodeId && !edge.target)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Edge target is required", path: ["target"] });
});
export const generatedWorkflowSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    nodes: z.array(generatedNodeSchema).min(1).max(100),
    edges: z.array(generatedEdgeSchema).max(200),
}).superRefine((workflow, ctx) => {
    const nodeIds = new Set();
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
// Enums (mirror Prisma)
// ═══════════════════════════════════════════
export const PlanEnum = z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]);
export const MemberRoleEnum = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export const WorkflowStatusEnum = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
export const ExecutionStatusEnum = z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"]);
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
    { type: "merge", label: "Merge", icon: "Merge", color: "#06b6d4" },
    { type: "filter", label: "Filter", icon: "Filter", color: "#f97316" },
    { type: "set_fields", label: "Set Fields", icon: "Pencil", color: "#14b8a6" },
    { type: "respond_webhook", label: "Respond Webhook", icon: "Reply", color: "#8b5cf6" },
];
//# sourceMappingURL=index.js.map