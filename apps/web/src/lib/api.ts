const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  return res.json();
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    api<{ token: string }>("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (email: string, password: string, name: string) =>
    api<{ token: string }>("/api/auth/register", { method: "POST", body: { email, password, name } }),
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
  list: (token: string) => api<Workflow[]>("/api/workflows", { token }),
  get: (id: string, token: string) => api<Workflow>(`/api/workflows/${id}`, { token }),
  create: (data: { name: string; description?: string }, token: string) =>
    api<Workflow>("/api/workflows", { method: "POST", body: data, token }),
  update: (id: string, data: Partial<Workflow>, token: string) =>
    api<Workflow>(`/api/workflows/${id}`, { method: "PATCH", body: data, token }),
  delete: (id: string, token: string) =>
    api<void>(`/api/workflows/${id}`, { method: "DELETE", token }),
};

// Executions
export interface Execution {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  triggerType: string;
  nodesExecuted: number;
  error?: string;
}

export const executions = {
  list: (token: string, workflowId?: string) => {
    const q = workflowId ? `?workflowId=${workflowId}` : "";
    return api<Execution[]>(`/api/executions${q}`, { token });
  },
  get: (id: string, token: string) => api<Execution>(`/api/executions/${id}`, { token }),
};

// Credentials
export interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastUsedAt?: string;
}

export const credentials = {
  list: (token: string) => api<Credential[]>("/api/credentials", { token }),
  create: (data: { name: string; type: string; config: Record<string, string> }, token: string) =>
    api<Credential>("/api/credentials", { method: "POST", body: data, token }),
  delete: (id: string, token: string) =>
    api<void>(`/api/credentials/${id}`, { method: "DELETE", token }),
};

// AI
export const ai = {
  generate: (prompt: string, token: string) =>
    api<{ workflow: { name: string; description: string; nodes: unknown[]; edges: unknown[] } }>(
      "/api/ai/generate",
      { method: "POST", body: { prompt }, token }
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
  getSubscription: (token: string) => api<Subscription>("/api/billing/subscription", { token }),
  createCheckout: (priceId: string, token: string) =>
    api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { priceId }, token }),
};

// Token management (client-side)
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agentflow_token");
}

export function setToken(token: string) {
  localStorage.setItem("agentflow_token", token);
}

export function clearToken() {
  localStorage.removeItem("agentflow_token");
}
