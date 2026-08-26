import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../middleware/auth.js";
import { signupSchema, loginSchema } from "@agentflow/shared";
import { z } from "zod";
import { InvalidRefreshTokenError, issueRefreshToken, revokeRefreshToken, rotateRefreshToken, verifyRefreshJwt } from "../lib/refresh-tokens.js";

const GENERIC_REGISTER_MESSAGE = "If registration can be completed, you can sign in with your credentials.";
const refreshRequestSchema = z.object({ refreshToken: z.string().min(1).max(4096) });
const refreshJwtSchema = z.object({ sub: z.string().min(1), type: z.string(), jti: z.string().min(1) });

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = signupSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(201).send({ message: GENERIC_REGISTER_MESSAGE });

    const passwordHash = await hashPassword(body.password);
    let user;
    try {
      user = await prisma.user.create({
        data: { email: body.email, name: body.name, passwordHash },
      });
    } catch (error) {
      // A concurrent registration can win the unique-email race. Keep the
      // response indistinguishable from the already-existing-account path.
      if ((error as { code?: string }).code === "P2002") {
        return reply.code(201).send({ message: GENERIC_REGISTER_MESSAGE });
      }
      throw error;
    }

    // ponytail: create default org for new user
    const slug = body.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const org = await prisma.organization.create({
      data: {
        name: `${body.name}'s Organization`,
        slug: `${slug}-${user.id.slice(0, 6)}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    return reply.code(201).send({ message: GENERIC_REGISTER_MESSAGE });
  });

  app.post("/login", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request, reply) => {
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
    const refreshToken = await issueRefreshToken(app, user.id);

    return {
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, orgId: membership?.orgId },
      org: membership?.org ? { id: membership.org.id, name: membership.org.name, slug: membership.org.slug } : null,
    };
  });

  app.post("/refresh", { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const { refreshToken } = refreshRequestSchema.parse(request.body);

    try {
      const payload = refreshJwtSchema.parse(verifyRefreshJwt(app, refreshToken));

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new InvalidRefreshTokenError();

      const { refreshToken: newRefreshToken } = await rotateRefreshToken(app, payload, refreshToken);

      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
      });

      const token = app.jwt.sign(
        { sub: user.id, email: user.email, orgId: membership?.orgId },
        { expiresIn: "15m" },
      );

      return { token, refreshToken: newRefreshToken };
    } catch (err) {
      request.log.error(err, "Refresh error");
      return reply.code(401).send({ error: "Invalid refresh token", code: "INVALID_TOKEN" });
    }
  });

  app.post("/logout", { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = refreshRequestSchema.safeParse(request.body);
    if (parsed.success) await revokeRefreshToken(app, parsed.data.refreshToken);
    return reply.code(204).send();
  });

  app.post("/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request) => {
    const { email } = request.body as { email: string };
    // ponytail: send email in production, stub for MVP
    return { message: "If an account exists, a reset link was sent" };
  });
}
