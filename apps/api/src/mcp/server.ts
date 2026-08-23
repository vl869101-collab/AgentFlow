// MCP server core: dispatches JSON-RPC 2.0 messages over the Streamable HTTP
// transport. Handles initialize, notifications/initialized, tools/list,
// tools/call and ping. Tools can be toggled on/off via the in-memory state.

import {
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  rpcError,
  rpcResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol.js";
import { randomUUID } from "node:crypto";
import { MCP_TOOLS, callTool } from "./tools.js";
import { isMcpEnabled, registerSession, touchSession } from "./state.js";

export type McpContext = {
  orgId?: string;
  userId?: string;
};

export async function handleMcpMessage(
  message: JsonRpcRequest,
  sessionId: string | undefined,
  ctx: McpContext,
): Promise<{ responses: JsonRpcResponse[]; sessionId?: string }> {
  // Notifications carry no id and expect no response.
  if (message.id === undefined || message.id === null) {
    if (message.method === "notifications/initialized" && sessionId) {
      touchSession(sessionId);
    }
    return { responses: [] };
  }

  const id = message.id;

  switch (message.method) {
    case "initialize": {
      const assigned = sessionId ?? `mcp-${randomUUID()}`;
      registerSession(assigned);
      return {
        sessionId: assigned,
        responses: [
          rpcResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          }),
        ],
      };
    }

    case "ping":
      return { responses: [rpcResult(id, {})] };

    case "tools/list": {
      if (!isMcpEnabled()) {
        return { responses: [rpcResult(id, { tools: [] })] };
      }
      return { responses: [rpcResult(id, { tools: MCP_TOOLS })] };
    }

    case "tools/call": {
      if (!isMcpEnabled()) {
        return {
          responses: [
            rpcResult(id, {
              content: [{ type: "text", text: JSON.stringify({ error: "MCP tools are disabled" }) }],
              isError: true,
            }),
          ],
        };
      }
      const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = params.name;
      if (!name) {
        return { responses: [rpcError(id, -32602, "Invalid params: tool name is required")] };
      }
      const result = await callTool(name, params.arguments ?? {}, ctx);
      return { responses: [rpcResult(id, result)] };
    }

    default:
      return { responses: [rpcError(id, -32601, `Method not found: ${message.method}`)] };
  }
}
