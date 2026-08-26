import type { AgentFlowClient } from "./client.js";
import type { McpToolSchema, McpToolCallResult } from "./types.js";

export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

export class McpApi {
  constructor(private client: AgentFlowClient) {}

  async listTools(): Promise<McpToolSchema[]> {
    const res = await this.client.request<{ tools: McpToolSchema[] }>("/api/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: `list_tools_${Date.now()}`, method: "tools/list" },
    });
    return res.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    const res = await this.client.request<McpToolCallResult>("/api/mcp", {
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: `call_tool_${Date.now()}`,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    return res;
  }

  async listResources(): Promise<McpResource[]> {
    const res = await this.client.request<{ resources: McpResource[] }>("/api/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: `list_res_${Date.now()}`, method: "resources/list" },
    });
    return res.resources ?? [];
  }

  async readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const res = await this.client.request<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>("/api/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: `read_res_${Date.now()}`, method: "resources/read", params: { uri } },
    });
    return res.contents?.[0] ?? { uri, mimeType: "application/json", text: "{}" };
  }

  async listPrompts(): Promise<McpPrompt[]> {
    const res = await this.client.request<{ prompts: McpPrompt[] }>("/api/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: `list_prompts_${Date.now()}`, method: "prompts/list" },
    });
    return res.prompts ?? [];
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<{
    description: string;
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }> {
    const res = await this.client.request<{
      description: string;
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    }>("/api/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: `get_prompt_${Date.now()}`, method: "prompts/get", params: { name, arguments: args } },
    });
    return res;
  }

  async getStatus(): Promise<{
    enabled: boolean;
    connectedClients: number;
    workflowsExposed: number;
    toolsCount: number;
    server: string;
    version: string;
  }> {
    return this.client.request<{
      enabled: boolean;
      connectedClients: number;
      workflowsExposed: number;
      toolsCount: number;
      server: string;
      version: string;
    }>("/mcp/status", { method: "GET" });
  }

  async generateToken(): Promise<{ success: boolean; token: string; createdAt: string }> {
    return this.client.request<{ success: boolean; token: string; createdAt: string }>("/mcp/token", {
      method: "POST",
      requiresAuth: false,
    });
  }
}
