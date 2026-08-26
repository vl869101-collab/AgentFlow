import type { AgentFlowClient } from "./client.js";
import type { WorkflowItem } from "./types.js";

export class WorkflowsApi {
  constructor(private client: AgentFlowClient) {}

  async list(query?: { page?: number; limit?: number }): Promise<WorkflowItem[]> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return this.client.request<WorkflowItem[]>(`/api/workflows${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  }

  async get(id: string): Promise<WorkflowItem> {
    return this.client.request<WorkflowItem>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }

  async create(params: { name: string; description?: string }): Promise<WorkflowItem> {
    return this.client.request<WorkflowItem>("/api/workflows", {
      method: "POST",
      body: params,
    });
  }

  async update(id: string, params: { name?: string; description?: string; status?: string; nodes?: unknown[]; edges?: unknown[] }): Promise<WorkflowItem> {
    return this.client.request<WorkflowItem>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: params,
    });
  }

  async saveCanvas(id: string, canvas: { nodes: unknown[]; edges: unknown[] }): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/workflows/${encodeURIComponent(id)}/canvas`, {
      method: "PUT",
      body: canvas,
    });
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async run(id: string): Promise<{ id: string; status: string; workflowId: string }> {
    return this.client.request<{ id: string; status: string; workflowId: string }>(`/api/workflows/${encodeURIComponent(id)}/run`, {
      method: "POST",
    });
  }
}
