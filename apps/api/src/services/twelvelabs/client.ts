/**
 * TwelveLabs API Client & Jockey MCP Client Wrapper
 * Handles both Direct REST API (TwelveLabs v1.2/v1.3) and Jockey MCP Server protocol
 */
import { TwelveLabsConfig } from "./types.js";

const DEFAULT_TWELVELABS_BASE = "https://api.twelvelabs.io/v1.3";
const DEFAULT_JOCKEY_MCP_URL = "https://mcp.twelvelabs.io/jockey/mcp";

export class TwelveLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly jockeyUrl: string;
  private readonly isMock: boolean;

  constructor(config?: TwelveLabsConfig) {
    this.apiKey = config?.apiKey || process.env.TWELVELABS_API_KEY || "";
    this.baseUrl = config?.baseUrl || process.env.TWELVELABS_BASE_URL || DEFAULT_TWELVELABS_BASE;
    this.jockeyUrl = process.env.TWELVELABS_JOCKEY_MCP_URL || DEFAULT_JOCKEY_MCP_URL;
    this.isMock =
      config?.mock === true ||
      !this.apiKey ||
      process.env.MOCK_SERVICES === "true" ||
      process.env.EXEC_MOCK === "true" ||
      process.env.NODE_ENV === "test";
  }

  public isMockMode(): boolean {
    return this.isMock;
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getJockeyUrl(): string {
    return this.jockeyUrl;
  }

  /**
   * Helper para chamadas REST autenticadas com TwelveLabs API
   */
  public async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (this.isMock) {
      return this.handleMockRequest<T>(endpoint, options);
    }

    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TwelveLabs API Error [${response.status}]: ${errorText || response.statusText}`
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Invoca uma tool no servidor Jockey MCP (TwelveLabs Official MCP)
   */
  public async executeJockeyTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ result: unknown; isMock: boolean }> {
    if (this.isMock) {
      return {
        result: {
          tool: toolName,
          status: "success",
          executedAt: new Date().toISOString(),
          data: {
            message: `[Jockey MCP Mock] Successfully executed tool ${toolName}`,
            args,
          },
        },
        isMock: true,
      };
    }

    try {
      const payload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const response = await fetch(this.jockeyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Jockey MCP HTTP ${response.status}: ${await response.text()}`);
      }

      const mcpResponse = (await response.json()) as {
        result?: unknown;
        error?: { message: string };
      };

      if (mcpResponse.error) {
        throw new Error(`Jockey MCP Tool Error: ${mcpResponse.error.message}`);
      }

      return {
        result: mcpResponse.result ?? mcpResponse,
        isMock: false,
      };
    } catch (err: any) {
      // Fallback gracioso com log
      return {
        result: {
          error: err.message,
          fallbackExecuted: true,
          tool: toolName,
        },
        isMock: false,
      };
    }
  }

  private handleMockRequest<T>(endpoint: string, options: RequestInit): T {
    const method = options.method || "GET";

    if (endpoint.includes("/indexes") && method === "POST") {
      const body = options.body ? JSON.parse(String(options.body)) : {};
      return {
        _id: "idx_mock_day69_genesis",
        index_name: body.index_name || "overclock-bot-day69-live",
        models: body.models || [
          { model_name: "marengo2.7", model_options: ["visual", "conversation", "text_in_video"] },
          { model_name: "pegasus1.2", model_options: ["visual", "conversation"] },
        ],
        video_count: 1,
        total_duration: 14400, // 4 hours
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T;
    }

    if (endpoint.includes("/indexes") && method === "GET") {
      return {
        data: [
          {
            _id: "idx_mock_day69_genesis",
            index_name: "overclock-bot-day69-live",
            video_count: 1,
            total_duration: 14400,
            created_at: new Date().toISOString(),
          },
        ],
        page_info: { total_results: 1 },
      } as T;
    }

    if (endpoint.includes("/tasks") && method === "POST") {
      return {
        _id: "task_mock_ingest_day69",
        index_id: "idx_mock_day69_genesis",
        status: "ready",
        video_id: "vid_mock_day69_bot_genesis",
        created_at: new Date().toISOString(),
      } as T;
    }

    if (endpoint.includes("/tasks/")) {
      return {
        _id: "task_mock_ingest_day69",
        index_id: "idx_mock_day69_genesis",
        status: "ready",
        video_id: "vid_mock_day69_bot_genesis",
        process: { percentage: 100 },
        created_at: new Date().toISOString(),
      } as T;
    }

    if (endpoint.includes("/search")) {
      return {
        search_pool: { total_count: 1, total_duration: 14400 },
        data: [
          {
            video_id: "vid_mock_day69_bot_genesis",
            score: 92.4,
            start: 120,
            end: 450,
            confidence: "high",
            thumbnail_url: "https://agentflow.ai/thumbnails/day69-setup.png",
            modules: [{ type: "conversation", confidence: "high" }],
          },
          {
            video_id: "vid_mock_day69_bot_genesis",
            score: 89.1,
            start: 1800,
            end: 2400,
            confidence: "high",
            thumbnail_url: "https://agentflow.ai/thumbnails/day69-playwright.png",
            modules: [{ type: "visual", confidence: "high" }],
          },
        ],
      } as T;
    }

    if (endpoint.includes("/generate") || endpoint.includes("/summarize")) {
      return {
        summary: "Live do Dia 69: Construção completa do Overclock Bot do zero com Playwright, noVNC e MCP.",
        id: "gen_mock_day69",
      } as T;
    }

    return { success: true, mock: true, endpoint } as T;
  }
}
