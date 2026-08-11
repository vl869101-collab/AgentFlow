import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../middleware/auth.js";
import { signupSchema, loginSchema } from "@agentflow/shared";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const body = signupSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "Email already registered", code: "EMAIL_EXISTS" });

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    // ponytail: create default org for new user
    const slug = body.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const org = await prisma.organization.create({
      data: {
        name: `${body.name}'s Organization`,
        slug: `${slug}-${user.id.slice(0, 6)}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email, orgId: org.id }, { expiresIn: "15m" });
    const refreshToken = app.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

    return reply.code(201).send({
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
      org: { id: org.id, name: org.name, slug: org.slug },
    });
  });

  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });

    // get user's first org
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { org: true },
    });

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, orgId: membership?.orgId },
      { expiresIn: "15m" },
    );
    const refreshToken = app.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

    return {
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
      org: membership?.org ? { id: membership.org.id, name: membership.org.name, slug: membership.org.slug } : null,
    };
  });

  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };
    if (!refreshToken) return reply.code(400).send({ error: "refreshToken required", code: "MISSING_TOKEN" });

    try {
      const payload = app.jwt.verify<{ sub: string; type: string }>(refreshToken);
      if (payload.type !== "refresh") return reply.code(401).send({ error: "Invalid token type", code: "INVALID_TOKEN" });

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.code(401).send({ error: "User not found", code: "USER_NOT_FOUND" });

      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
      });

      const token = app.jwt.sign(
        { sub: user.id, email: user.email, orgId: membership?.orgId },
        { expiresIn: "15m" },
      );
      const newRefreshToken = app.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

      return { token, refreshToken: newRefreshToken };
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token", code: "INVALID_TOKEN" });
    }
  });

  app.post("/forgot-password", async (request) => {
    const { email } = request.body as { email: string };
    // ponytail: send email in production, stub for MVP
    return { message: "If an account exists, a reset link was sent" };
  });
}
