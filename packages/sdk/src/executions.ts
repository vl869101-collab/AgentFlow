import type { AgentFlowClient } from "./client.js";
import type { ExecutionItem } from "./types.js";

export class ExecutionsApi {
  constructor(private client: AgentFlowClient) {}

  async list(query?: { page?: number; limit?: number; workflowId?: string; status?: string }): Promise<ExecutionItem[]> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.workflowId) params.set("workflowId", query.workflowId);
    if (query?.status) params.set("status", query.status);
    const qs = params.toString();
    return this.client.request<ExecutionItem[]>(`/api/executions${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  }

  async get(id: string): Promise<ExecutionItem> {
    return this.client.request<ExecutionItem>(`/api/executions/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }

  async trigger(params: { workflowId: string; input?: Record<string, unknown>; trigger?: string }): Promise<ExecutionItem> {
    return this.client.request<ExecutionItem>("/api/executions/trigger", {
      method: "POST",
      body: params,
    });
  }

  async cancel(id: string): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/executions/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
  }

  async getNodes(id: string): Promise<Array<Record<string, unknown>>> {
    return this.client.request<Array<Record<string, unknown>>>(`/api/executions/${encodeURIComponent(id)}/nodes`, {
      method: "GET",
    });
  }
}
