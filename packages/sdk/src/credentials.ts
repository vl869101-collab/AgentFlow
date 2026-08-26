import type { AgentFlowClient } from "./client.js";
import type { CredentialItem } from "./types.js";

export class CredentialsApi {
  constructor(private client: AgentFlowClient) {}

  async list(query?: { page?: number; limit?: number }): Promise<CredentialItem[]> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return this.client.request<CredentialItem[]>(`/api/credentials${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  }

  async create(params: { name: string; type: string; provider: string; data: Record<string, unknown> }): Promise<CredentialItem> {
    return this.client.request<CredentialItem>("/api/credentials", {
      method: "POST",
      body: params,
    });
  }

  async reveal(id: string): Promise<CredentialItem> {
    return this.client.request<CredentialItem>(`/api/credentials/${encodeURIComponent(id)}/reveal`, {
      method: "GET",
    });
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/credentials/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
}
