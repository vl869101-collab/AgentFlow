// MCP server core: dispatches JSON-RPC 2.0 messages over the Streamable HTTP
// transport. Handles initialize, notifications/initialized, tools/list,
// tools/call, ping, resources/list, resources/read, prompts/list, and prompts/get.
// Tools can be toggled on/off via the in-memory state.

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
import { recordAuditEvent } from "../services/audit-ledger.js";

export type McpContext = {
  orgId?: string;
  userId?: string;
  scopes?: string[];
  ip?: string;
  userAgent?: string;
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

      if (ctx.orgId) {
        void recordAuditEvent({
          orgId: ctx.orgId,
          userId: ctx.userId ?? "system",
          action: "mcp.session.open",
          resource: "mcp_session",
          resourceId: assigned,
          metadata: {
            sessionId: assigned,
            protocolVersion: MCP_PROTOCOL_VERSION,
            clientInfo: message.params,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        }).catch(() => undefined);
      }

      return {
        sessionId: assigned,
        responses: [
          rpcResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
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

    case "resources/list": {
      return {
        responses: [
          rpcResult(id, {
            resources: [
              { uri: "agentflow://system/status", name: "System Status", mimeType: "application/json" },
              { uri: "agentflow://workflows", name: "Workflows Catalog", mimeType: "application/json" },
              { uri: "agentflow://metrics", name: "System Metrics", mimeType: "application/json" },
              { uri: "agentflow://tools", name: "Tools Schema Registry", mimeType: "application/json" },
            ],
          }),
        ],
      };
    }

    case "resources/read": {
      const params = (message.params ?? {}) as { uri?: string };
      const uri = params.uri ?? "agentflow://system/status";
      let textContent = "";

      if (uri === "agentflow://workflows") {
        textContent = JSON.stringify({
          server: SERVER_NAME,
          category: "workflows",
          totalExposed: 125,
          activeTransports: ["http", "sse"],
        });
      } else if (uri === "agentflow://tools") {
        textContent = JSON.stringify({
          totalTools: MCP_TOOLS.length,
          supportedCategories: ["workflows", "google", "comms", "databases", "ai", "utils"],
        });
      } else {
        textContent = JSON.stringify({
          server: SERVER_NAME,
          version: SERVER_VERSION,
          status: "healthy",
          protocol: MCP_PROTOCOL_VERSION,
          uri,
        });
      }

      return {
        responses: [
          rpcResult(id, {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: textContent,
              },
            ],
          }),
        ],
      };
    }

    case "prompts/list": {
      return {
        responses: [
          rpcResult(id, {
            prompts: [
              {
                name: "build_workflow",
                description: "Build a new AgentFlow workflow from natural language description",
                arguments: [{ name: "goal", description: "Goal or requirements of the workflow", required: true }],
              },
              {
                name: "troubleshoot_execution",
                description: "Troubleshoot a failed workflow execution and suggest fixes",
                arguments: [{ name: "executionId", description: "The execution ID to inspect", required: true }],
              },
            ],
          }),
        ],
      };
    }

    case "prompts/get": {
      const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, string> };
      const name = params.name ?? "build_workflow";
      const args = params.arguments ?? {};

      if (name === "troubleshoot_execution") {
        return {
          responses: [
            rpcResult(id, {
              description: "Troubleshoot a failed workflow execution",
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `Analyze and troubleshoot failed execution ${args.executionId ?? "unknown"}. Inspect node error logs and recommend fix.`,
                  },
                },
              ],
            }),
          ],
        };
      }

      return {
        responses: [
          rpcResult(id, {
            description: "Build a new AgentFlow workflow from natural language",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Design an AgentFlow automation workflow for: ${args.goal ?? args.prompt ?? "automated integration process"}. Provide structured JSON nodes and edges.`,
                },
              },
            ],
          }),
        ],
      };
    }

    default:
      return { responses: [rpcError(id, -32601, `Method not found: ${message.method}`)] };
  }
}
