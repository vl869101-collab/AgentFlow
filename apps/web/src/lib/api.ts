const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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

export function setToken(token: string) {
  localStorage.setItem("agentflow_token", token);
}

export function clearToken() {
  localStorage.removeItem("agentflow_token");
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
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
}

export const executions = {
  list: (workflowId?: string) => {
    const q = workflowId ? `?workflowId=${workflowId}` : "";
    return api<Execution[]>(`/api/executions${q}`);
  },
  get: (id: string) => api<Execution>(`/api/executions/${id}`),
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
