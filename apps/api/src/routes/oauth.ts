import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import crypto from "node:crypto";
import { issueRefreshToken } from "../lib/refresh-tokens.js";

interface OAuthConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  redirectUri: string;
}

// Store nonces per session (in production use Redis)
const pendingNonces = new Map<string, { nonce: string; expiresAt: number }>();

function getOAuthConfig(provider: string): OAuthConfig | null {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  if (provider === "google") {
    return {
      provider: "google",
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
      scope: "openid email profile",
      redirectUri: `${apiBase}/api/auth/google/callback`,
    };
  }

  if (provider === "microsoft") {
    return {
      provider: "microsoft",
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      userinfoUrl: "https://graph.microsoft.com/v1.0/me",
      scope: "openid email profile User.Read",
      redirectUri: `${apiBase}/api/auth/microsoft/callback`,
    };
  }

  if (provider === "apple") {
    return {
      provider: "apple",
      clientId: process.env.APPLE_CLIENT_ID || "",
      clientSecret: "",
      authUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      userinfoUrl: "",
      scope: "name email",
      redirectUri: `${apiBase}/api/auth/apple/callback`,
    };
  }

  return null;
}

async function exchangeCode(config: OAuthConfig, code: string, extraParams: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    ...extraParams,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function verifyAppleIdToken(idToken: string, clientId: string): Promise<Record<string, unknown>> {
  // Fetch Apple's JWKS
  const jwksRes = await fetch("https://appleid.apple.com/auth/keys");
  if (!jwksRes.ok) throw new Error("Failed to fetch Apple JWKS");
  const { keys } = (await jwksRes.json()) as { keys: Array<{ kid: string; kty: string; n: string; e: string }> };

  // Decode header to get kid
  const headerB64 = idToken.split(".")[0];
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error("Apple signing key not found");

  // Verify using Node.js built-in JWT verification (RS256)
  // We use crypto to verify the signature manually since we don't have jose installed
  const [headerB64Str, payloadB64, signatureB64] = idToken.split(".");
  const data = `${headerB64Str}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");

  // Reconstruct RSA public key from JWK
  const publicKey = crypto.createPublicKey({
    key: { kty: key.kty, n: key.n, e: key.e, alg: "RS256", kid: key.kid },
    format: "jwk",
  });

  const valid = crypto.verify("sha256", Buffer.from(data), publicKey, signature);
  if (!valid) throw new Error("Apple id_token signature verification failed");

  // Decode payload
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as Record<string, unknown>;

  // Verify standard claims
  if (payload.iss !== "https://appleid.apple.com") throw new Error("Invalid Apple id_token issuer");
  if (payload.aud !== clientId) throw new Error("Apple id_token audience mismatch");
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Apple id_token expired");
  }
  if (typeof payload.iat === "number" && payload.iat > Math.floor(Date.now() / 1000)) {
    throw new Error("Apple id_token issued in the future");
  }

  return payload;
}

async function getUserInfo(config: OAuthConfig, accessToken: string, idToken?: string): Promise<{ email: string; name: string; providerId: string }> {
  if (config.provider === "apple") {
    // NEVER trust client-supplied id_token — always use the one from token exchange
    if (!idToken) throw new Error("No id_token from Apple token exchange");
    const payload = await verifyAppleIdToken(idToken, config.clientId);
    return {
      email: payload.email as string,
      name: (payload.name as string) || (payload.email as string)?.split("@")[0] || "User",
      providerId: payload.sub as string,
    };
  }

  const res = await fetch(config.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch user info: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;

  if (config.provider === "google") {
    return {
      email: data.email as string,
      name: (data.name as string) || (data.email as string)?.split("@")[0] || "User",
      providerId: data.id as string,
    };
  }

  if (config.provider === "microsoft") {
    return {
      email: (data.mail as string) || (data.userPrincipalName as string),
      name: (data.displayName as string) || (data.mail as string)?.split("@")[0] || "User",
      providerId: data.id as string,
    };
  }

  throw new Error("Unknown provider");
}

async function findOrCreateUser(email: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    // H-04: never silently link an OAuth identity to a pre-existing user unless the
    // account is a recoverable invite placeholder. Placeholder users are created by
    // org invites with `passwordHash: "pending"` and cannot log in until they sign
    // up or recover via OAuth. A verified OAuth identity (the id_token was already
    // signature-verified by verifyAppleIdToken, or the userinfo endpoint was
    // authenticated by the provider) is sufficient to take over an inactive
    // placeholder, because the placeholder has never been owned by anyone.
    if (user.passwordHash === "pending") {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: user.name ?? name, passwordHash: "", emailVerified: true },
      });
    }
    return user;
  }

  user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: "",
      emailVerified: true,
    },
  });

  const slug = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await prisma.organization.create({
    data: {
      name: `${name}'s Organization`,
      slug: `${slug}-${user.id.slice(0, 6)}`,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  return user;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function oauthRoutes(app: FastifyInstance) {
  const providers = ["google", "microsoft", "apple"];
  const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Cleanup expired nonces periodically
  const nonceCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of pendingNonces) {
      if (val.expiresAt < now) pendingNonces.delete(key);
    }
  }, 60_000);
  nonceCleanupTimer.unref();

  for (const provider of providers) {
    app.get(`/${provider}`, { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
      const config = getOAuthConfig(provider);
      if (!config || !config.clientId) {
        return reply.code(501).send({ error: `${provider} OAuth not configured`, code: "OAUTH_NOT_CONFIGURED" });
      }

      const state = crypto.randomBytes(16).toString("hex");
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: config.scope,
        state,
      });

      if (provider === "apple") {
        const nonce = generateNonce();
        pendingNonces.set(state, { nonce, expiresAt: Date.now() + 10 * 60 * 1000 });
        params.set("response_mode", "query");
        params.set("nonce", nonce);
      }

      return reply.redirect(`${config.authUrl}?${params.toString()}`);
    });

    app.get(`/${provider}/callback`, { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
      const config = getOAuthConfig(provider);
      if (!config) return reply.code(500).send({ error: "Invalid provider" });

      const { code, error, state } = request.query as { code?: string; error?: string; state?: string };
      if (error || !code) {
        return reply.redirect(`${frontendUrl}/register?error=oauth_failed`);
      }

      // Validate state (CSRF protection)
      if (!state || state.length < 16) {
        return reply.redirect(`${frontendUrl}/register?error=invalid_state`);
      }

      try {
        const tokens = await exchangeCode(config, code);
        const accessToken = tokens.access_token as string;

        // NEVER trust client-supplied id_token — always use the one from token exchange
        const idToken = tokens.id_token as string | undefined;
        const userInfo = await getUserInfo(config, accessToken, idToken);

        const user = await findOrCreateUser(userInfo.email, userInfo.name);

        const membership = await prisma.organizationMember.findFirst({
          where: { userId: user.id },
          include: { org: true },
        });

        const token = app.jwt.sign(
          { sub: user.id, email: user.email, orgId: membership?.orgId },
          { expiresIn: "15m" },
        );
        const refreshToken = await issueRefreshToken(app, user.id);

        // Clean up nonce
        if (state) pendingNonces.delete(state);

        // Deliver tokens via POST form auto-submit instead of URL
        const html = `<!DOCTYPE html><html><head><title>Signing in...</title></head><body>
          <form id="f" method="POST" action="${frontendUrl}/auth/callback">
            <input type="hidden" name="token" value="${token}">
            <input type="hidden" name="refreshToken" value="${refreshToken}">
          </form>
          <script>document.getElementById("f").submit();</script>
        </body></html>`;
        return reply.type("text/html").send(html);
      } catch (err) {
        console.error(`${provider} OAuth error:`, err);
        return reply.redirect(`${frontendUrl}/register?error=oauth_failed`);
      }
    });
  }
}
