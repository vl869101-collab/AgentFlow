export interface AgentFlowClientOptions {
  baseUrl?: string;
  token?: string;
  apiKey?: string;
  orgId?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class AgentFlowApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, string[]>;
  requestId?: string;

  constructor(message: string, statusCode: number, code: string = "API_ERROR", details?: Record<string, string[]>, requestId?: string) {
    super(message);
    this.name = "AgentFlowApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface WorkflowItem {
  id: string;
  name: string;
  description?: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | string;
  orgId?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}

export interface ExecutionItem {
  id: string;
  workflowId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "WAITING_APPROVAL" | string;
  trigger: "manual" | "webhook" | "cron" | "api" | string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  duration?: number | null;
  nodes?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
  workflow?: { id: string; name: string } | null;
}

export interface CredentialItem {
  id: string;
  name: string;
  type: "api_key" | "oauth2" | "basic" | "token" | string;
  provider: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface ApprovalItem {
  id: string;
  executionId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  createdAt: string;
  decidedAt?: string | null;
  execution?: { id: string; workflow?: { id: string; name: string } };
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  organizations?: Array<{ id: string; name: string; slug: string; role: string }>;
}

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  scopes?: string[];
}

export interface McpToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
