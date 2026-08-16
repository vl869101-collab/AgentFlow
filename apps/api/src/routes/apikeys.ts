import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import crypto from "crypto";

export async function apiKeyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    return prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, lastUsed: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const { name, expiresAt } = request.body as { name?: unknown; expiresAt?: string };
    if (typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
      return reply.code(400).send({ error: "A valid key name is required", code: "INVALID_NAME" });
    }
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      return reply.code(400).send({ error: "expiresAt must be a valid date", code: "INVALID_EXPIRY" });
    }

    const key = `af_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const apiKey = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        key: keyHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        userId,
      },
    });

    // only return the key once
    return reply.status(201).send({ id: apiKey.id, name: apiKey.name, key, createdAt: apiKey.createdAt });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const result = await prisma.apiKey.deleteMany({ where: { id, userId } });
    if (result.count === 0) return reply.code(404).send({ error: "API key not found", code: "NOT_FOUND" });
    return { ok: true };
  });
}
