import type { AgentFlowClient } from "./client.js";
import type { UserProfile } from "./types.js";

export class AuthApi {
  constructor(private client: AgentFlowClient) {}

  async register(params: { email: string; password: string; name: string }): Promise<{ message: string }> {
    return this.client.request<{ message: string }>("/api/auth/register", {
      method: "POST",
      body: params,
      requiresAuth: false,
    });
  }

  async login(params: { email: string; password: string }): Promise<{
    token: string;
    refreshToken: string;
    user: { id: string; email: string; name: string };
    org: { id: string; name: string; slug: string; role: string } | null;
  }> {
    const res = await this.client.request<{
      token: string;
      refreshToken: string;
      user: { id: string; email: string; name: string };
      org: { id: string; name: string; slug: string; role: string } | null;
    }>("/api/auth/login", {
      method: "POST",
      body: params,
      requiresAuth: false,
    });

    if (res.token) {
      this.client.setToken(res.token);
    }
    return res;
  }

  async refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    const res = await this.client.request<{ token: string; refreshToken: string }>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      requiresAuth: false,
    });

    if (res.token) {
      this.client.setToken(res.token);
    }
    return res;
  }

  async logout(refreshToken?: string): Promise<void> {
    await this.client.request<void>("/api/auth/logout", {
      method: "POST",
      body: refreshToken ? { refreshToken } : undefined,
      requiresAuth: false,
    });
    this.client.setToken(undefined);
  }

  async getProfile(): Promise<UserProfile> {
    return this.client.request<UserProfile>("/api/settings", { method: "GET" });
  }
}
