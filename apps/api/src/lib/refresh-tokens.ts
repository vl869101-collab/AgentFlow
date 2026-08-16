import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "./prisma.js";

const DEFAULT_REFRESH_EXPIRES_IN = "7d";

export type RefreshJwtPayload = {
  sub: string;
  type: string;
  jti?: string;
};

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super("Invalid refresh token");
    this.name = "InvalidRefreshTokenError";
  }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function signRefreshToken(app: FastifyInstance, userId: string, jti: string): { token: string; expiresAt: Date } {
  const token = app.jwt.sign(
    { sub: userId, type: "refresh", jti },
    { expiresIn: process.env.REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN },
  );
  const payload = app.jwt.decode<{ exp?: number }>(token);
  if (!payload?.exp) throw new Error("Refresh token did not receive an expiry");
  return { token, expiresAt: new Date(payload.exp * 1000) };
}

export async function issueRefreshToken(app: FastifyInstance, userId: string, client: any = prisma): Promise<string> {
  const jti = randomUUID();
  const { token, expiresAt } = signRefreshToken(app, userId, jti);
  await client.refreshToken.create({
    data: {
      jti,
      tokenHash: hashRefreshToken(token),
      expiresAt,
      userId,
    },
  });
  return token;
}

export async function rotateRefreshToken(
  app: FastifyInstance,
  payload: RefreshJwtPayload,
  presentedToken: string,
  client: any = prisma,
): Promise<{ userId: string; refreshToken: string }> {
  if (payload.type !== "refresh" || !payload.sub || !payload.jti) throw new InvalidRefreshTokenError();

  const tokenHash = hashRefreshToken(presentedToken);
  const current = await client.refreshToken.findUnique({ where: { jti: payload.jti } });
  if (
    !current ||
    current.userId !== payload.sub ||
    current.tokenHash !== tokenHash ||
    current.revokedAt ||
    new Date(current.expiresAt).getTime() <= Date.now()
  ) {
    throw new InvalidRefreshTokenError();
  }

  const nextJti = randomUUID();
  const { token: nextRefreshToken, expiresAt } = signRefreshToken(app, current.userId, nextJti);
  await client.$transaction(async (tx: any) => {
    const consumed = await tx.refreshToken.updateMany({
      where: { id: current.id, tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), replacedByJti: nextJti },
    });
    if (consumed.count !== 1) throw new InvalidRefreshTokenError();

    await tx.refreshToken.create({
      data: {
        jti: nextJti,
        tokenHash: hashRefreshToken(nextRefreshToken),
        expiresAt,
        userId: current.userId,
      },
    });
  });

  return { userId: current.userId, refreshToken: nextRefreshToken };
}

export async function revokeRefreshToken(app: FastifyInstance, presentedToken: string, client: any = prisma): Promise<void> {
  try {
    const payload = app.jwt.verify<RefreshJwtPayload>(presentedToken);
    if (payload.type !== "refresh" || !payload.jti) return;
    await client.refreshToken.updateMany({
      where: { jti: payload.jti, tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Logout is intentionally idempotent and does not reveal token validity.
  }
}
