import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";

const NIM_BASE = process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";

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

  app.post("/generate", async (request, reply) => {
    const { prompt } = request.body as { prompt: string };
    if (!prompt) return reply.badRequest("prompt required");

    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) return reply.internalServerError("NVIDIA NIM API key not configured");

    const res = await fetch(`${NIM_BASE}/chat/completions`, {
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

    if (!res.ok) {
      const err = await res.text();
      return reply.badGateway(`NIM error: ${err}`);
    }

    const data = await res.json() as any;
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      const wf = JSON.parse(jsonStr);
      return { workflow: { name: wf.name, description: wf.description, nodes: wf.nodes, edges: wf.edges } };
    } catch {
      return { workflow: { name: "AI Generated Workflow", description: prompt.slice(0, 100), nodes: [], edges: [], raw: content } };
    }
  });
}
