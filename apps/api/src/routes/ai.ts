import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { generatedWorkflowSchema } from "@agentflow/shared";
import { z } from "zod";

const NIM_BASE = process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";

const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(5000),
});

const SYSTEM_PROMPT = `You are a workflow generator for AgentFlow. Given a user description, generate a valid workflow JSON.

Return ONLY a JSON object with this structure:
{
  "name": "workflow name",
  "description": "short description",
  "nodes": [
    {
      "id": "node-1",
      "type": "trigger" | "ai" | "condition" | "http" | "code" | "output",
      "label": "Node Label",
      "position": { "x": number, "y": number },
      "config": {}
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" }
  ]
}

Node types:
- trigger: { "event": "webhook" | "manual" | "cron" }
- ai: { "model": "meta/llama-3.1-8b-instruct", "prompt": "instruction" }
- condition: { "field": "path", "operator": "eq" | "gt" | "lt", "value": "x" }
- http: { "method": "GET" | "POST", "url": "https://..." }
- code: { "language": "javascript", "code": "return input;" }
- output: { "format": "json" }

Layout nodes vertically with 250px spacing. Return ONLY the JSON.`;

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.post("/generate", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { prompt } = generateRequestSchema.parse(request.body);

    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) return reply.code(503).send({ error: "AI service unavailable", code: "AI_NOT_CONFIGURED" });

    let res: Response;
    try {
      res = await fetch(`${NIM_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "meta/llama-3.1-8b-instruct",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });
    } catch (error) {
      app.log.warn({ error }, "AI provider request failed");
      return reply.code(502).send({ error: "AI provider unavailable", code: "AI_PROVIDER_ERROR" });
    }

    if (!res.ok) {
      app.log.warn(
        { statusCode: res.status, providerRequestId: res.headers.get("x-request-id") ?? undefined },
        "AI provider returned an error",
      );
      return reply.code(502).send({ error: "AI provider unavailable", code: "AI_PROVIDER_ERROR" });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (error) {
      app.log.warn({ error }, "AI provider returned invalid JSON");
      return reply.code(502).send({ error: "AI provider returned an invalid workflow", code: "AI_INVALID_OUTPUT" });
    }

    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      app.log.warn("AI provider response did not contain workflow content");
      return reply.code(502).send({ error: "AI provider returned an invalid workflow", code: "AI_INVALID_OUTPUT" });
    }

    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      app.log.warn({ error }, "AI provider returned non-JSON workflow content");
      return reply.code(502).send({ error: "AI provider returned an invalid workflow", code: "AI_INVALID_OUTPUT" });
    }

    const validation = generatedWorkflowSchema.safeParse(parsed);
    if (!validation.success) {
      app.log.warn(
        { issues: validation.error.issues.map(({ code, path }) => ({ code, path })) },
        "AI provider returned a workflow that failed validation",
      );
      return reply.code(502).send({ error: "AI provider returned an invalid workflow", code: "AI_INVALID_OUTPUT" });
    }

    return { workflow: validation.data };
  });
}
