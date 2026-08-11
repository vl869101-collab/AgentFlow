import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true, emailVerified: true, createdAt: true },
    });

    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: { org: { select: { id: true, name: true, slug: true, plan: true } } },
    });

    return { ...user, organizations: memberships.map((m: any) => ({ ...m.org, role: m.role })) };
  });

  app.put("/", async (request) => {
    const userId = userIdFromRequest(request);
    const { name, avatarUrl } = request.body as { name?: string; avatarUrl?: string };
    await prisma.user.update({ where: { id: userId }, data: { name, avatarUrl } });
    return { ok: true };
  });
}
