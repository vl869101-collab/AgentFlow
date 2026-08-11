import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";

const NIM_BASE = process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // ponytail: proxy to NVIDIA NIM, let frontend send prompt + node config
  app.post("/generate", async (request, reply) => {
    const { prompt, model } = request.body as { prompt: string; model?: string };
    if (!prompt) return reply.badRequest("prompt required");

    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) return reply.internalServerError("NVIDIA NIM API key not configured");

    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return reply.badGateway(`NIM error: ${err}`);
    }

    const data = await res.json() as any;
    return { content: data.choices?.[0]?.message?.content ?? "" };
  });
}
