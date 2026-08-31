import { z } from "zod";

export const BotModeSchema = z.enum(["ai_autonomous", "human_takeover", "paused"]);
export type BotMode = z.infer<typeof BotModeSchema>;

export const BrowserActionTypeSchema = z.enum([
  "navigate",
  "click",
  "type",
  "scroll",
  "wait",
  "screenshot",
  "extract",
  "hover",
  "press_key",
  "evaluate",
]);
export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;

export const BrowserActionSchema = z.object({
  id: z.string(),
  type: BrowserActionTypeSchema,
  target: z.string().optional(), // CSS selector, XPath or coordinate text
  value: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  error: z.string().optional(),
  screenshotBase64: z.string().optional(),
  extractedData: z.unknown().optional(),
});
export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export const BotTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  progressPercent: z.number().min(0).max(100).default(0),
  subtasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    completed: z.boolean(),
  })).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type BotTask = z.infer<typeof BotTaskSchema>;

export const McpToolCallSchema = z.object({
  id: z.string(),
  serverName: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()),
  response: z.unknown().optional(),
  executionTimeMs: z.number().default(0),
  status: z.enum(["running", "success", "error"]),
  timestamp: z.string(),
});
export type McpToolCall = z.infer<typeof McpToolCallSchema>;

export const BotSessionStateSchema = z.object({
  sessionId: z.string(),
  mode: BotModeSchema,
  status: z.enum(["idle", "busy", "waiting_user_input", "paused", "error"]),
  currentUrl: z.string().default("about:blank"),
  pageTitle: z.string().default("AgentFlow Browser"),
  resolution: z.object({
    width: z.number().default(1920),
    height: z.number().default(1080),
  }),
  activeTaskId: z.string().nullable().default(null),
  actionsCount: z.number().default(0),
  connectedClients: z.number().default(0),
  noVncUrl: z.string().optional(),
  lastScreenshotBase64: z.string().optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
});
export type BotSessionState = z.infer<typeof BotSessionStateSchema>;
