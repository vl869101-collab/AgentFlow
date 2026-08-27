import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";
import { z } from "zod";
import { assertSafeUrl } from "../../lib/ssrf.js";
import { decryptCredential } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

export const mcpClientConfigSchema = z.object({
  operation: z.enum(["callTool", "listTools", "listResources", "readResource", "listPrompts", "getPrompt"]).default("callTool"),
  transport: z.enum(["http", "sse", "stdio"]).default("http").optional(),
  serverUrl: z.string().url().optional(),
  endpoint: z.string().optional(),
  toolName: z.string().optional(),
  tool: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  uri: z.string().optional(),
  promptName: z.string().optional(),
  token: z.string().optional(),
  apiKey: z.string().optional(),
  credentialId: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  timeout: z.number().int().min(100).max(60000).default(15000),
  mock: z.boolean().optional(),
});

export type McpClientConfig = z.infer<typeof mcpClientConfigSchema>;

export async function executeMcpClient(
  config: Record<string, unknown>,
  input: unknown = {},
  orgId: string = ""
): Promise<Record<string, unknown>> {
  const parsed = mcpClientConfigSchema.safeParse(config);
  const validConfig = parsed.success ? parsed.data : {
    operation: "callTool" as const,
    serverUrl: String(config.serverUrl ?? config.endpoint ?? "http://localhost:3000/api/mcp"),
    toolName: String(config.toolName ?? config.tool ?? ""),
    arguments: (config.arguments as Record<string, unknown>) ?? (input as Record<string, unknown>) ?? {},
    timeout: 15000,
    mock: Boolean(config.mock),
  };

  const operation = validConfig.operation;
  const toolName = validConfig.toolName ?? validConfig.tool ?? (input as any)?.toolName ?? (input as any)?.tool ?? "";
  const serverUrl = validConfig.serverUrl ?? validConfig.endpoint ?? "http://localhost:3000/api/mcp";
  const args = validConfig.arguments ?? (typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {});
  const isMock =
    validConfig.mock === true ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  let token = validConfig.token ?? validConfig.apiKey ?? "";
  if (validConfig.credentialId && orgId) {
    try {
      const cred = await prisma.credential.findFirst({
        where: { id: validConfig.credentialId, orgId },
      });
      if (cred) {
        const data = JSON.parse(decryptCredential(cred.data));
        token = data.apiKey ?? data.token ?? data.accessToken ?? token;
      }
    } catch {
      // offline fallback
    }
  }

  // Mock execution mode
  if (isMock || serverUrl.includes("mock") || serverUrl.includes("localhost:3000")) {
    if (operation === "listTools") {
      return {
        _operation: "listTools",
        _serverUrl: serverUrl,
        tools: [
          { name: "searchWorkflows", description: "Search workflows", scopes: ["workflows:read"] },
          { name: "executeWorkflow", description: "Execute workflow", scopes: ["executions:write"] },
          { name: "queryDataTable", description: "Query database tables", scopes: ["database:read"] },
        ],
        _status: "SUCCESS",
        mock: true,
      };
    }

    if (operation === "listResources") {
      return {
        _operation: "listResources",
        _serverUrl: serverUrl,
        resources: [
          { uri: "agentflow://system/status", name: "System Status" },
          { uri: "agentflow://workflows", name: "Workflows Catalog" },
        ],
        _status: "SUCCESS",
        mock: true,
      };
    }

    if (operation === "readResource") {
      return {
        _operation: "readResource",
        _serverUrl: serverUrl,
        uri: validConfig.uri ?? "agentflow://system/status",
        content: { status: "healthy", version: "1.0.0" },
        _status: "SUCCESS",
        mock: true,
      };
    }

    if (operation === "listPrompts") {
      return {
        _operation: "listPrompts",
        _serverUrl: serverUrl,
        prompts: [
          { name: "build_workflow", description: "Build workflow template" },
          { name: "troubleshoot_execution", description: "Troubleshoot execution" },
        ],
        _status: "SUCCESS",
        mock: true,
      };
    }

    if (operation === "getPrompt") {
      const pName = validConfig.promptName ?? toolName ?? "build_workflow";
      return {
        _operation: "getPrompt",
        _serverUrl: serverUrl,
        prompt: {
          name: pName,
          description: `Prompt template for ${pName}`,
          messages: [{ role: "user", content: { type: "text", text: `MCP prompt template: ${pName}` } }],
        },
        _status: "SUCCESS",
        mock: true,
      };
    }

    return {
      _tool: toolName,
      _serverUrl: serverUrl,
      _status: "SUCCESS",
      result: {
        content: [
          {
            type: "text",
            text: `Successfully executed MCP tool '${toolName}' on ${serverUrl}`,
          },
        ],
        executedAt: new Date().toISOString(),
        args,
      },
      mock: true,
    };
  }

  // Live remote MCP JSON-RPC 2.0 invocation
  assertSafeUrl(serverUrl);

  let method = "tools/call";
  let params: Record<string, unknown> = { name: toolName, arguments: args };

  if (operation === "listTools") {
    method = "tools/list";
    params = {};
  } else if (operation === "listResources") {
    method = "resources/list";
    params = {};
  } else if (operation === "readResource") {
    method = "resources/read";
    params = { uri: validConfig.uri };
  } else if (operation === "listPrompts") {
    method = "prompts/list";
    params = {};
  } else if (operation === "getPrompt") {
    method = "prompts/get";
    params = { name: validConfig.promptName ?? toolName, arguments: args };
  }

  const rpcPayload = {
    jsonrpc: "2.0",
    id: `mcp_client_${Date.now()}`,
    method,
    params,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = token.startsWith("af_") || token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  if (validConfig.scopes && validConfig.scopes.length > 0) {
    headers["x-mcp-scopes"] = validConfig.scopes.join(",");
  }

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), validConfig.timeout);

  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    if (!res.ok) {
      throw new Error(`MCP remote server HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    if (data.error) {
      const code = data.error.code;
      const message = data.error.message ?? "MCP tool execution error";
      if (code === -32003) {
        throw new Error(`Forbidden: Insufficient scopes for tool '${toolName}'. (${message})`);
      }
      throw new Error(`MCP JSON-RPC Error [${code}]: ${message}`);
    }

    return {
      _tool: toolName,
      _serverUrl: serverUrl,
      _status: "SUCCESS",
      result: data.result,
    };
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    throw err;
  }
}

export class McpClientNodeHandler implements NodeHandler {
  type = "mcpClient";
  category = "agents";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const input = ctx.input;

    const items = Array.isArray(input) ? input : [input];
    const results: NodeItem[] = [];
    const logs: string[] = [];

    for (const item of items) {
      const itemData = (typeof item === "object" && item !== null && "json" in item ? (item as NodeItem).json : item) ?? {};
      const res = await executeMcpClient(config, itemData, ctx.orgId);
      results.push({ json: res });
      const toolLabel = res._tool ?? res._operation ?? config.toolName ?? config.operation ?? "mcp";
      logs.push(`MCP Client: Tool '${toolLabel}' invoked successfully`);
    }

    return { items: results, logs };
  }
}
