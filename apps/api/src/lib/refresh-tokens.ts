import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "./prisma.js";
import { getEnv } from "./env.js";

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

export function verifyRefreshJwt(app: FastifyInstance, presentedToken: string): RefreshJwtPayload {
  try {
    return app.jwt.verify<RefreshJwtPayload>(presentedToken);
  } catch (err) {
    const env = getEnv();
    if (env.JWT_SECRET_PREVIOUS) {
      try {
        return app.jwt.verify<RefreshJwtPayload>(presentedToken, { key: env.JWT_SECRET_PREVIOUS });
      } catch {
        throw new InvalidRefreshTokenError();
      }
    }
    throw new InvalidRefreshTokenError();
  }
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
  
  if (!current) {
    throw new InvalidRefreshTokenError();
  }

  // Token reuse detection: if a revoked token is re-submitted, revoke the entire user token family
  if (current.revokedAt) {
    await client.refreshToken.updateMany({
      where: { userId: current.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new InvalidRefreshTokenError();
  }

  if (
    current.userId !== payload.sub ||
    current.tokenHash !== tokenHash ||
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
    const payload = verifyRefreshJwt(app, presentedToken);
    if (payload.type !== "refresh" || !payload.jti) return;
    await client.refreshToken.updateMany({
      where: { jti: payload.jti, tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Logout is intentionally idempotent and does not reveal token validity.
  }
}
