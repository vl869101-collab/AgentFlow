const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ApiOptions {
  method?: string;
  body?: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agentflow_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agentflow_refresh_token");
}

export function setToken(token: string, refreshToken?: string) {
  localStorage.setItem("agentflow_token", token);
  if (refreshToken) localStorage.setItem("agentflow_refresh_token", refreshToken);
}

export function clearToken() {
  localStorage.removeItem("agentflow_token");
  localStorage.removeItem("agentflow_refresh_token");
}

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

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
async function rawRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  return res.json();
}

async function tryRefreshToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw new Error("Refresh failed");

  const data = await res.json();
  setToken(data.token, data.refreshToken);
  return data.token;
}

async function requestWithRefresh<T>(path: string, options: ApiOptions = {}, attempt = 0): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && attempt === 0) {
    try {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = tryRefreshToken();
      }
      const newToken = await refreshPromise;
      headers.Authorization = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retryRes.ok) {
        throw new ApiError(retryRes.status, await parseErrorMessage(retryRes));
      }
      return retryRes.json();
    } catch {
      clearToken();
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "Session expired");
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  return res.json();
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  return requestWithRefresh<T>(path, options);
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    rawRequest<{ token: string; refreshToken: string }>("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (email: string, password: string, name: string) =>
    rawRequest<{ message: string }>("/api/auth/register", { method: "POST", body: { email, password, name } }),
  logout: (refreshToken: string) =>
    rawRequest<void>("/api/auth/logout", { method: "POST", body: { refreshToken } }),
  exchangeOAuthCode: (code: string) =>
    rawRequest<{ token: string; refreshToken: string }>("/api/auth/oauth/exchange", { method: "POST", body: { code } }),
};

// Workflows
export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  ownerId: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  nodes?: unknown;
  edges?: unknown;
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

export const credentials = {
  list: () => api<Credential[]>("/api/credentials"),
  create: (data: { name: string; provider: string; value: string; type: string }) =>
    api<Credential>("/api/credentials", { method: "POST", body: { name: data.name, provider: data.provider, type: data.type, data: { value: data.value } } }),
  delete: (id: string) =>
    api<void>(`/api/credentials/${id}`, { method: "DELETE" }),
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
