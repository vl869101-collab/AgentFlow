import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (request, reply) => {
    const checks: Record<string, string> = {};

    try {
      if (process.env.DATABASE_URL) {
        await prisma.$queryRaw`SELECT 1`;
      }
      checks.postgres = process.env.DATABASE_URL ? "ok" : "in-memory";
    } catch {
      checks.postgres = "error";
    }

    const allHealthy = Object.values(checks).every((v) => v !== "error");
    const status = allHealthy ? 200 : 503;

    return reply.code(status).send({
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
