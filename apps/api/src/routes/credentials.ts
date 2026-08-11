import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createCredentialSchema } from "@agentflow/shared";

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request) => {
    const { orgId } = request.query as { orgId: string };
    if (!orgId) return [];
    return prisma.credential.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  });

  app.post("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const body = createCredentialSchema.parse(request.body);

    const membership = await prisma.organizationMember.findFirst({ where: { userId } });
    if (!membership) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });

    const credential = await prisma.credential.create({
      data: {
        name: body.name,
        type: body.type,
        provider: body.provider,
        data: JSON.stringify(body.data),
        orgId: membership.orgId,
      },
    });
    return reply.status(201).send(credential);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.credential.delete({ where: { id } });
    return { ok: true };
  });
}
