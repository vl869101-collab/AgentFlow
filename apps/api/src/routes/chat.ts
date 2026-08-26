import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";

export interface ChatStreamRequest {
  workflowId?: string;
  message?: string;
  prompt?: string;
  sessionId?: string;
  history?: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

export async function chatRoutes(app: FastifyInstance) {
  // SSE Streaming Endpoint
  app.post("/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as ChatStreamRequest) ?? {};
    const workflowId = String(body.workflowId ?? "");
    const message = String(body.message ?? body.prompt ?? "");
    const sessionId = String(body.sessionId ?? `sess_${Date.now()}`);
    const history = Array.isArray(body.history) ? body.history : [];

    if (!workflowId) {
      return reply.code(400).send({ error: "workflowId is required", code: "INVALID_INPUT" });
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    }

    // Set Server-Sent Events headers
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();

    let isAborted = false;
    request.raw.on("close", () => {
      isAborted = true;
    });

    const sendEvent = (event: string, data: unknown) => {
      if (isAborted) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent("node_status", { status: "STARTING", sessionId, workflowId });

      const input = {
        message,
        sessionId,
        history,
        streaming: true,
        protocol: "sse",
        timestamp: new Date().toISOString(),
      };

      const execution = await createWorkflowExecution(workflowId, input, { trigger: "chat" });
      sendEvent("node_status", { executionId: execution.id, status: "RUNNING", nodeId: "chatTrigger" });

      // Run execution
      const result = await runExecution(execution.id);

      if (isAborted) return;

      if (result.status === "FAILED") {
        sendEvent("error", { error: result.error ?? "Execution failed", executionId: execution.id });
      } else {
        const output = result.output;
        // If output contains text/tokens, emit token events
        const outputText = typeof output === "string" 
          ? output 
          : typeof output === "object" && output !== null && "text" in output 
          ? (output as any).text 
          : typeof output === "object" && output !== null && "message" in output 
          ? (output as any).message 
          : JSON.stringify(output);

        if (outputText) {
          sendEvent("token", { token: outputText, sessionId });
        }

        sendEvent("done", {
          executionId: execution.id,
          status: result.status,
          output: result.output,
          duration: result.duration,
        });
      }
    } catch (err: any) {
      if (!isAborted) {
        sendEvent("error", { error: err.message ?? "Stream processing error" });
      }
    } finally {
      if (!isAborted) {
        reply.raw.end();
      }
    }
  });

  // Workflow-scoped GET stream route
  app.get("/workflows/:id/chat/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = (request.query as Record<string, string>) ?? {};
    const message = query.message || query.q || "";
    const sessionId = query.sessionId || `sess_${Date.now()}`;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    reply.raw.write(`event: node_status\ndata: ${JSON.stringify({ status: "CONNECTED", workflowId: id, sessionId })}\n\n`);
    reply.raw.write(`event: token\ndata: ${JSON.stringify({ token: `Echo: ${message}`, sessionId })}\n\n`);
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ status: "SUCCESS", sessionId })}\n\n`);
    reply.raw.end();
  });
}
