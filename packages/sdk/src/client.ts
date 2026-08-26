import { AgentFlowApiError, type AgentFlowClientOptions } from "./types.js";
import { AuthApi } from "./auth.js";
import { WorkflowsApi } from "./workflows.js";
import { ExecutionsApi } from "./executions.js";
import { CredentialsApi } from "./credentials.js";
import { ApprovalsApi } from "./approvals.js";
import { McpApi } from "./mcp.js";

export class AgentFlowClient {
  private baseUrl: string;
  private token?: string;
  private apiKey?: string;
  private orgId?: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;

  public auth: AuthApi;
  public workflows: WorkflowsApi;
  public executions: ExecutionsApi;
  public credentials: CredentialsApi;
  public approvals: ApprovalsApi;
  public mcp: McpApi;

  constructor(options: AgentFlowClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.token = options.token;
    this.apiKey = options.apiKey;
    this.orgId = options.orgId;
    this.defaultHeaders = options.headers ?? {};
    this.timeout = options.timeout ?? 30000;

    this.auth = new AuthApi(this);
    this.workflows = new WorkflowsApi(this);
    this.executions = new ExecutionsApi(this);
    this.credentials = new CredentialsApi(this);
    this.approvals = new ApprovalsApi(this);
    this.mcp = new McpApi(this);
  }

  setToken(token?: string) {
    this.token = token;
  }

  setApiKey(apiKey?: string) {
    this.apiKey = apiKey;
  }

  setOrgId(orgId?: string) {
    this.orgId = orgId;
  }

  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      requiresAuth?: boolean;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.defaultHeaders,
      ...(options.headers ?? {}),
    };

    if (options.requiresAuth !== false) {
      if (this.token) {
        headers.Authorization = this.token.startsWith("Bearer ") ? this.token : `Bearer ${this.token}`;
      } else if (this.apiKey) {
        headers["x-api-key"] = this.apiKey;
      }
      if (this.orgId) {
        headers["x-org-id"] = this.orgId;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get("content-type") ?? "";
      let data: any;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMsg = data?.error ?? data?.message ?? `Request failed with status ${response.status}`;
        const errorCode = data?.code ?? "REQUEST_ERROR";
        const requestId = response.headers.get("x-request-id") ?? data?.requestId;
        throw new AgentFlowApiError(errorMsg, response.status, errorCode, data?.details, requestId);
      }

      // Handle JSON-RPC response wrapping if MCP endpoint
      if (data && typeof data === "object" && data.jsonrpc === "2.0" && "result" in data) {
        return data.result as T;
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err instanceof AgentFlowApiError) throw err;
      if (err.name === "AbortError") {
        throw new AgentFlowApiError("Request timed out", 408, "TIMEOUT");
      }
      throw new AgentFlowApiError(err.message ?? "Network error", 500, "NETWORK_ERROR");
    }
  }

  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>("/health", {
      method: "GET",
      requiresAuth: false,
    });
  }

  async getOpenApiSpec(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/docs/json", {
      method: "GET",
      requiresAuth: false,
    });
  }
}

export function createAgentFlowClient(options: AgentFlowClientOptions = {}): AgentFlowClient {
  return new AgentFlowClient(options);
}
