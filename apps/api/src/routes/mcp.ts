// MCP server route — Streamable HTTP transport at /mcp/http.
// POST carries JSON-RPC 2.0 messages; GET opens an SSE stream (kept minimal).
// Also exposes /api/mcp/status for the web toggle + live counters.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { handleMcpMessage } from "../mcp/server.js";
import { isMcpEnabled, setMcpEnabled, connectedClients } from "../mcp/state.js";
import type { JsonRpcRequest } from "../mcp/protocol.js";

const SESSION_HEADER = "mcp-session-id";

function sessionIdFromRequest(request: FastifyRequest): string | undefined {
  const header = request.headers[SESSION_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  return undefined;
}

function isMcpToken(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  return Boolean(token && token.startsWith("af_"));
}

async function mcpContext(request: FastifyRequest) {
  // request.user is a @fastify/jwt getter that throws when no valid JWT is
  // present. MCP clients authenticate with an af_ token, so read it safely.
  let userId = "";
  let orgId: string | undefined;
  try {
    userId = userIdFromRequest(request);
    orgId = orgIdFromRequest(request);
  } catch {
    // unauthenticated MCP session — no org/user scoping
  }
  return { userId, orgId };
}

export async function mcpRoutes(app: FastifyInstance) {
  // ── MCP Streamable HTTP endpoint ─────────────────────────────
  app.post("/http", async (request, reply) => {
    if (!isMcpToken(request)) {
      return reply.code(401).send({ error: "Invalid or missing MCP token", code: "AUTH_FAILED" });
    }

    const body = request.body as JsonRpcRequest | JsonRpcRequest[];
    const messages = Array.isArray(body) ? body : [body];
    const sessionId = sessionIdFromRequest(request);
    const ctx = await mcpContext(request);

    const allResponses: { response: unknown; sessionId?: string }[] = [];
    let assignedSession: string | undefined;

    for (const message of messages) {
      if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
        allResponses.push({ response: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } } });
        continue;
      }
      const result = await handleMcpMessage(message, sessionId ?? assignedSession, ctx);
      if (result.sessionId) assignedSession = result.sessionId;
      for (const response of result.responses) allResponses.push({ response });
    }

    if (assignedSession) reply.header(SESSION_HEADER, assignedSession);
    reply.header("mcp-session-id", assignedSession ?? sessionId ?? "");

    if (allResponses.length === 0) {
      return reply.code(202).send();
    }
    const payload = allResponses.length === 1 ? allResponses[0].response : allResponses.map((r) => r.response);
    return reply.send(payload);
  });

  // Minimal SSE stream for server-initiated messages. Kept open; no
  // server-initiated events are emitted in this scope.
  app.get("/http", async (request, reply) => {
    if (!isMcpToken(request)) {
      return reply.code(401).send({ error: "Invalid or missing MCP token", code: "AUTH_FAILED" });
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    request.raw.on("close", () => reply.raw.end());
    return reply;
  });

  // ── Status endpoint for the /mcp web page ────────────────────
  app.get("/status", async (_request, reply) => {
    const workflowsExposed = await prisma.workflow.count({ where: { status: { not: "ARCHIVED" } } });
    return reply.send({
      enabled: isMcpEnabled(),
      connectedClients: connectedClients(),
      workflowsExposed,
      allowedCallback: "All",
      server: "agentflow-mcp",
    });
  });

  app.post("/status", async (request, reply) => {
    const body = request.body as { enabled?: unknown };
    if (typeof body?.enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required", code: "INVALID_INPUT" });
    }
    setMcpEnabled(body.enabled);
    const workflowsExposed = await prisma.workflow.count({ where: { status: { not: "ARCHIVED" } } });
    return reply.send({
      enabled: isMcpEnabled(),
      connectedClients: connectedClients(),
      workflowsExposed,
      allowedCallback: "All",
      server: "agentflow-mcp",
    });
  });
}
