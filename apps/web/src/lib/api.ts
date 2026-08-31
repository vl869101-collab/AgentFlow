const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("agentflow_token");
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("agentflow_refresh_token");
  } catch {
    return null;
  }
}

export function setToken(token: string, refreshToken?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("agentflow_token", token);
    if (refreshToken) localStorage.setItem("agentflow_refresh_token", refreshToken);
  } catch {
    // ignore storage write errors
  }
}

export function clearToken() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("agentflow_token");
    localStorage.removeItem("agentflow_refresh_token");
  } catch {
    // ignore storage remove errors
  }
}

let activeRefreshPromise: Promise<string> | null = null;

export function resetAuthLock(): void {
  activeRefreshPromise = null;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return res.statusText;
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (data.error) return data.error;
    if (data.message) return data.message;
  } catch {
    // not JSON
  }
  return text;
}

// Auth endpoints must NOT go through the refresh-retry wrapper: a 401 from
// /login means bad credentials, not an expired session.
export async function rawRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers: customHeaders = {} } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  return (await res.json()) as T;
}

async function executeRefreshToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(401, "No refresh token available");
  }

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearToken();
    throw new ApiError(401, "Session expired, please log in again");
  }

  const data = (await res.json()) as { token: string; refreshToken?: string };
  setToken(data.token, data.refreshToken);
  return data.token;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers: customHeaders = {}, skipAuth = false, skipRefresh = false } = options;
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };
  if (!skipAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If 401 and we have a token, attempt refresh and retry once
  if (res.status === 401 && !skipAuth && !skipRefresh && token) {
    try {
      if (!activeRefreshPromise) {
        activeRefreshPromise = executeRefreshToken().finally(() => {
          activeRefreshPromise = null;
        });
      }
      const newToken = await activeRefreshPromise;
      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (retryRes.status === 204) return undefined as T;
      if (!retryRes.ok) throw new ApiError(retryRes.status, await parseErrorMessage(retryRes));
      return (await retryRes.json()) as T;
    } catch (refreshErr) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw refreshErr;
    }
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  return (await res.json()) as T;
}

// Auth methods
export const auth = {
  login: (email: string, password: string) =>
    rawRequest<{ token: string; refreshToken?: string; user: { id: string; email: string; name?: string } }>(
      "/api/auth/login",
      { method: "POST", body: { email, password } }
    ),
  register: (email: string, password: string, name?: string) =>
    rawRequest<{ message: string; token?: string; refreshToken?: string; user?: { id: string; email: string; name?: string } }>(
      "/api/auth/register",
      { method: "POST", body: { email, password, name } }
    ),
  exchangeOAuthCode: (code: string) =>
    rawRequest<{ token: string; refreshToken?: string }>("/api/auth/oauth/exchange", {
      method: "POST",
      body: { code },
    }),
};

// Workflows
export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  nodes?: Array<{
    id: string;
    type: string;
    label?: string;
    config?: Record<string, unknown>;
    data?: Record<string, unknown>;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }>;
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    sourceNodeId?: string;
    targetNodeId?: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    condition?: unknown;
  }>;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  createdAt: string;
  nodesCount?: number;
  edgesCount?: number;
  snapshot?: {
    nodes?: unknown[];
    edges?: unknown[];
  };
}

export interface WorkflowFieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface VisualNodeDiffMarker {
  nodeId: string;
  status: "added" | "removed" | "modified" | "unchanged";
  styleClass: string;
  badgeLabel: string;
  changedFields: string[];
}

export interface VisualEdgeDiffMarker {
  edgeId?: string;
  source: string;
  target: string;
  status: "added" | "removed" | "modified" | "unchanged";
  styleClass: string;
  strokeColor: string;
  changedFields: string[];
}

export interface WorkflowVisualDiffMap {
  nodes: Record<string, VisualNodeDiffMarker>;
  edges: Record<string, VisualEdgeDiffMarker>;
}

export interface WorkflowDiff {
  workflowId: string;
  fromVersion: number;
  toVersion: number;
  nodesAdded: Array<Record<string, unknown>>;
  nodesRemoved: Array<Record<string, unknown>>;
  nodesModified: Array<{ nodeId: string; type: string; changes: WorkflowFieldDiff[] }>;
  edgesAdded: Array<Record<string, unknown>>;
  edgesRemoved: Array<Record<string, unknown>>;
  edgesModified: Array<{ edgeId?: string; source: string; target: string; changes: WorkflowFieldDiff[] }>;
  visualMap?: WorkflowVisualDiffMap;
  summary: {
    totalChanges: number;
    nodesAddedCount: number;
    nodesRemovedCount: number;
    nodesModifiedCount: number;
    edgesAddedCount: number;
    edgesRemovedCount: number;
    edgesModifiedCount: number;
    hasBreakingChanges: boolean;
  };
}

export const workflows = {
  list: () => api<Workflow[]>("/api/workflows"),
  get: (id: string) => api<Workflow>(`/api/workflows/${id}`),
  create: (data: { name: string; description?: string }) =>
    api<Workflow>("/api/workflows", { method: "POST", body: data }),
  update: (id: string, data: Partial<Workflow>) =>
    api<Workflow>(`/api/workflows/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    api<void>(`/api/workflows/${id}`, { method: "DELETE" }),
  versions: (id: string) => api<WorkflowVersion[]>(`/api/workflows/${id}/versions`),
  version: (id: string, version: number) => api<WorkflowVersion>(`/api/workflows/${id}/versions/${version}`),
  diff: (id: string, fromVersion: number, toVersion: number) =>
    api<WorkflowDiff>(`/api/workflows/${id}/diff?fromVersion=${fromVersion}&toVersion=${toVersion}`),
  rollback: (id: string, targetVersion: number) =>
    api<{ ok: true; rolledBackToVersion: number; newVersion: number; workflow: Workflow }>(`/api/workflows/${id}/rollback`, {
      method: "POST",
      body: { targetVersion },
    }),
};

// Executions
export interface Execution {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  nodes?: number;
  trigger?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  workflow?: { id: string; name: string };
  traces?: Array<{
    id: string;
    nodeId: string;
    status: string;
    duration?: number;
    error?: string;
    input?: unknown;
    output?: unknown;
    startedAt?: string;
    finishedAt?: string;
  }>;
}

export const executions = {
  list: (workflowId?: string) => {
    const q = workflowId ? `?workflowId=${workflowId}` : "";
    return api<Execution[]>(`/api/executions${q}`);
  },
  get: (id: string) => api<Execution>(`/api/executions/${id}`),
  trigger: (workflowId: string, input?: unknown) =>
    api<Execution>("/api/executions/trigger", { method: "POST", body: { workflowId, input } }),
};

// Approvals
export interface Approval {
  id: string;
  status: string;
  message?: string | null;
  context?: unknown;
  createdAt: string;
  decidedAt?: string | null;
  executionId: string;
  userId: string;
  approverId?: string | null;
  execution?: {
    id: string;
    workflow?: { id: string; name: string } | null;
  } | null;
}

export const approvals = {
  list: () => api<Approval[]>("/api/approvals"),
  approve: (id: string) => api(`/api/approvals/${id}/approve`, { method: "POST" }),
  reject: (id: string) => api(`/api/approvals/${id}/reject`, { method: "POST" }),
};

// Credentials
export interface Credential {
  id: string;
  name: string;
  provider: string;
  type: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  accountDetails?: {
    name?: string;
    email?: string;
    id?: string;
    username?: string;
    organization?: string;
  };
  error?: string;
}

export const credentials = {
  list: () => api<Credential[]>("/api/credentials"),
  create: (data: { name: string; provider: string; value: string; type: string }) =>
    api<Credential>("/api/credentials", { method: "POST", body: { name: data.name, provider: data.provider, type: data.type, data: { value: data.value } } }),
  delete: (id: string) =>
    api<void>(`/api/credentials/${id}`, { method: "DELETE" }),
  test: (data: { provider?: string; type?: string; data: Record<string, any> | string }) =>
    api<CredentialTestResult>("/api/credentials/test", { method: "POST", body: data }),
  testById: (id: string) =>
    api<CredentialTestResult>(`/api/credentials/${id}/test`, { method: "POST" }),
};

// AI
export const ai = {
  generate: (prompt: string) =>
    api<{ workflow: { name: string; description: string; nodes: unknown[]; edges: unknown[] } }>(
      "/api/ai/generate",
      { method: "POST", body: { prompt } }
    ),
};

// Billing
export interface Subscription {
  id: string;
  status: string;
  plan: string;
  currentPeriodEnd: string;
}

export const billing = {
  getSubscription: () => api<Subscription>("/api/billing/subscription"),
  createCheckout: (priceId: string) =>
    api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { priceId } }),
};

// Templates & Marketplace
export interface WorkflowTemplateDto {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon?: string;
  color?: string;
  connectors: string[];
  difficulty: "Iniciante" | "Intermediário" | "Avançado";
  estimatedSetupMinutes: number;
  featured?: boolean;
  workflow: {
    name: string;
    description?: string;
    nodes: Array<{
      id?: string;
      type: string;
      label?: string;
      config?: Record<string, unknown>;
      data?: Record<string, unknown>;
      position?: { x: number; y: number };
      width?: number;
      height?: number;
    }>;
    edges: Array<{
      id?: string;
      source?: string;
      target?: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      sourceHandle?: string;
      targetHandle?: string;
      label?: string;
      condition?: unknown;
    }>;
  };
}

export interface TemplateFilterParams {
  category?: string;
  search?: string;
  tag?: string;
}

export interface TemplatesListResponse {
  total: number;
  categories: string[];
  templates: WorkflowTemplateDto[];
}

export const templatesApi = {
  list: (params?: TemplateFilterParams) => {
    const searchParams = new URLSearchParams();
    if (params?.category && params.category !== "Todas") searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.tag) searchParams.set("tag", params.tag);
    const qs = searchParams.toString();
    return api<WorkflowTemplateDto[]>(`/api/templates${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api<WorkflowTemplateDto>(`/api/templates/${id}`),
  exportUrl: (id: string) => `${API_BASE}/api/templates/${id}/export`,
  clone: (id: string, custom?: { name?: string; description?: string }) =>
    api<{ success: boolean; message: string; workflow: Workflow }>(`/api/templates/${id}/clone`, {
      method: "POST",
      body: custom ?? {},
    }),
  import: (data: { template: unknown; name?: string }) =>
    api<{ success: boolean; message: string; workflow: Workflow }>("/api/templates/import", {
      method: "POST",
      body: data,
    }),
};
