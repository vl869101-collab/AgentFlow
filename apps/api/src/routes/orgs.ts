import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createOrgSchema, inviteMemberSchema } from "@agentflow/shared";

export async function orgRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // list user's orgs
  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: { org: { include: { _count: { select: { workflows: true, members: true } } } } },
    });
    return memberships.map((m: any) => ({ ...m.org, role: m.role }));
  });

  app.post("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const body = createOrgSchema.parse(request.body);

    // check slug uniqueness
    const existing = await prisma.organization.findUnique({ where: { slug: body.slug } });
    if (existing) return reply.code(409).send({ error: "Slug already taken", code: "SLUG_EXISTS" });

    const org = await prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    return reply.status(201).send(org);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: id } },
      include: { org: { include: { _count: { select: { workflows: true, members: true } } } } },
    });
    if (!membership) return reply.code(404).send({ error: "Organization not found", code: "NOT_FOUND" });
    return { ...membership.org, role: membership.role };
  });

  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: id } },
    });
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      return reply.code(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" });
    }

    const { name } = request.body as { name?: string };
    const org = await prisma.organization.update({ where: { id }, data: { name } });
    return org;
  });

  // members
  app.get("/:id/members", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: id } },
    });
    if (!membership) return reply.code(404).send({ error: "Organization not found", code: "NOT_FOUND" });

    return prisma.organizationMember.findMany({
      where: { orgId: id },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
  });

  app.post("/:id/invite", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const body = inviteMemberSchema.parse(request.body);

    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: id } },
    });
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      return reply.code(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" });
    }

    // H-05: only OWNER may grant ADMIN. ADMIN inviters are capped at MEMBER/VIEWER.
    let role = body.role as "ADMIN" | "MEMBER" | "VIEWER";
    if (role === "ADMIN" && membership.role !== "OWNER") {
      // Downgrade instead of rejecting so admins can still invite members
      // without gaining the ability to mint peers with equal or higher privilege.
      role = "MEMBER";
    }

    // find existing user by email — do NOT create placeholder accounts (H-05/H-04).
    // Invites target registered users only; a real invite-email flow is a future
    // enhancement (Invite entity). Creating disabled User rows here used to lock
    // invitees out of registration (register → 409 EMAIL_EXISTS, login → 401).
    const invitee = await prisma.user.findUnique({ where: { email: body.email } });
    if (!invitee) return reply.code(404).send({ error: "User not found; ask them to register first", code: "USER_NOT_FOUND" });
    if (invitee.passwordHash === "pending") {
      return reply.code(409).send({ error: "User has a pending invite and cannot be invited again", code: "PENDING_INVITE" });
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId: invitee.id, orgId: id } },
    });
    if (existing) return reply.code(409).send({ error: "Already a member", code: "ALREADY_MEMBER" });

    await prisma.organizationMember.create({
      data: { userId: invitee.id, orgId: id, role },
    });

    return { ok: true, role };
  });
}
