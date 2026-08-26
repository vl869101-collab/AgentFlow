// MCP server route — Streamable HTTP transport at /mcp and /mcp/http.
// POST carries JSON-RPC 2.0 messages; GET opens an SSE stream.
// Enforces 60 requests/minute per apiKey rate limit.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { handleMcpMessage } from "../mcp/server.js";
import { isMcpEnabled, setMcpEnabled, connectedClients } from "../mcp/state.js";
import { MCP_TOOLS } from "../mcp/tools.js";
import { MCP_PROTOCOL_VERSION } from "../mcp/protocol.js";
import type { JsonRpcRequest } from "../mcp/protocol.js";
import { randomBytes } from "node:crypto";

const SESSION_HEADER = "mcp-session-id";

function sessionIdFromRequest(request: FastifyRequest): string | undefined {
  const header = request.headers[SESSION_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  return undefined;
}

function isMcpToken(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header?.trim();
  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.startsWith("af_")) return true;
  return Boolean(token && (token.startsWith("af_") || token.startsWith("ey")));
}

function apiKeyExtractor(request: FastifyRequest): string {
  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader) return `api_key:${apiKeyHeader}`;
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return `token:${auth.slice(7).trim()}`;
  const session = sessionIdFromRequest(request);
  if (session) return `session:${session}`;
  return `ip:${request.ip}`;
}

async function mcpContext(request: FastifyRequest) {
  let userId = "";
  let orgId: string | undefined;
  let scopes: string[] | undefined;

  const scopesHeader = request.headers["x-mcp-scopes"];
  if (typeof scopesHeader === "string") {
    scopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);
  }

  try {
    userId = userIdFromRequest(request);
    orgId = orgIdFromRequest(request);
  } catch {
    // ignore
  }
  return { userId, orgId, scopes };
}

async function handleMcpPost(request: FastifyRequest, reply: FastifyReply) {
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

  reply.header("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  if (assignedSession) reply.header(SESSION_HEADER, assignedSession);
  reply.header("mcp-session-id", assignedSession ?? sessionId ?? "mcp-session-default");

  if (allResponses.length === 0) {
    return reply.code(202).send();
  }
  const payload = allResponses.length === 1 ? allResponses[0].response : allResponses.map((r) => r.response);
  return reply.send(payload);
}

async function handleMcpGet(request: FastifyRequest, reply: FastifyReply) {
  if (!isMcpToken(request)) {
    return reply.code(401).send({ error: "Invalid or missing MCP token", code: "AUTH_FAILED" });
  }
  reply.header("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.write(": connected\n\n");
  request.raw.on("close", () => reply.raw.end());
  return reply;
}

export async function mcpRoutes(app: FastifyInstance) {
  const isTest = process.env.NODE_ENV === "test" || process.env.ALLOW_MEMORY_DB === "1";
  const mcpRateLimit = {
    config: {
      rateLimit: {
        max: isTest ? 10000 : 60,
        timeWindow: "1 minute",
        keyGenerator: apiKeyExtractor,
      },
    },
  };

  // ── MCP Streamable HTTP endpoints (/mcp/http and /mcp) ────────
  app.post("/http", mcpRateLimit, handleMcpPost);
  app.get("/http", mcpRateLimit, handleMcpGet);
  app.post("/", mcpRateLimit, handleMcpPost);
  app.get("/", mcpRateLimit, handleMcpGet);

  // ── Token generation endpoint ────────────────────────────────
  app.post("/token", mcpRateLimit, async (_request, reply) => {
    const randomChars = randomBytes(16).toString("hex");
    const token = `af_${randomChars}`;
    return reply.send({
      success: true,
      token,
      createdAt: new Date().toISOString(),
    });
  });

  // ── Status endpoint for the /mcp web page ────────────────────
  app.get("/status", async (_request, reply) => {
    const workflowsExposed = await prisma.workflow.count({ where: { status: { not: "ARCHIVED" } } });
    return reply.send({
      enabled: isMcpEnabled(),
      connectedClients: connectedClients(),
      workflowsExposed,
      toolsCount: MCP_TOOLS.length,
      allowedCallback: "All",
      server: "agentflow-mcp",
      version: "1.2.0",
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
      toolsCount: MCP_TOOLS.length,
      allowedCallback: "All",
      server: "agentflow-mcp",
      version: "1.2.0",
    });
  });
}
