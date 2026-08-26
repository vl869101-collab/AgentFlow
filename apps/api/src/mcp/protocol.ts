// Minimal MCP (Model Context Protocol) JSON-RPC 2.0 types for the
// Streamable HTTP transport. Protocol version 2025-03-26, capabilities: tools.

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const SERVER_NAME = "AgentFlow MCP Server";
export const SERVER_VERSION = "1.0.0";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  scopes?: string[];
  isMock?: boolean;
};

export type McpToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function textResult(text: string, isError = false): McpToolResult {
  return { content: [{ type: "text", text }], isError };
}

export function jsonResult(value: unknown): McpToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

export function errorResult(message: string): McpToolResult {
  return textResult(JSON.stringify({ error: message }, null, 2), true);
}

export function rpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

export function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
