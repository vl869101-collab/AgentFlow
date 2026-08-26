import type { AgentFlowClient } from "./client.js";
import type { ApprovalItem } from "./types.js";

export class ApprovalsApi {
  constructor(private client: AgentFlowClient) {}

  async list(query?: { page?: number; limit?: number }): Promise<ApprovalItem[]> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return this.client.request<ApprovalItem[]>(`/api/approvals${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  }

  async approve(id: string): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/approvals/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    });
  }

  async reject(id: string): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/approvals/${encodeURIComponent(id)}/reject`, {
      method: "POST",
    });
  }
}
