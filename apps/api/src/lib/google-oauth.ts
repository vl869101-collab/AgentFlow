// Google OAuth2 Token Manager with Vault Integration and Automatic Refresh Flow.
import { prisma } from "./prisma.js";
import { decryptCredential, encryptCredential } from "./crypto.js";

export interface GoogleOAuthTokens {
  clientId?: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

export interface GoogleOAuthOptions {
  credentialId?: string;
  orgId?: string;
  forceRefresh?: boolean;
}

export async function refreshGoogleOAuthToken(
  tokens: GoogleOAuthTokens,
  credentialId?: string,
): Promise<GoogleOAuthTokens> {
  const clientId = tokens.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = tokens.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = tokens.refreshToken;

  if (!refreshToken) {
    return tokens;
  }

  if (process.env.MOCK_SERVICES === "true" || !clientId || !clientSecret) {
    const refreshed: GoogleOAuthTokens = {
      ...tokens,
      accessToken: `mock_refreshed_access_token_${Date.now()}`,
      expiresAt: Date.now() + 3600 * 1000,
    };
    if (credentialId) {
      await updateVaultCredential(credentialId, refreshed).catch(() => null);
    }
    return refreshed;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[GoogleOAuth] Token refresh failed HTTP ${res.status}: ${errText}`);
      return tokens;
    }

    const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
    const refreshed: GoogleOAuthTokens = {
      ...tokens,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scopes: data.scope ? data.scope.split(" ") : tokens.scopes,
    };

    if (credentialId) {
      await updateVaultCredential(credentialId, refreshed).catch(() => null);
    }

    return refreshed;
  } catch (error) {
    console.warn("[GoogleOAuth] Token refresh network error:", error);
    return tokens;
  }
}

async function updateVaultCredential(credentialId: string, tokens: GoogleOAuthTokens): Promise<void> {
  const encrypted = encryptCredential(JSON.stringify(tokens));
  await prisma.credential.update({
    where: { id: credentialId },
    data: { data: encrypted, updatedAt: new Date() },
  });
}

export async function getValidGoogleToken(options: GoogleOAuthOptions = {}): Promise<GoogleOAuthTokens> {
  let credentialRow: any = null;

  if (options.credentialId) {
    credentialRow = await (prisma.credential as any).findFirst({
      where: { id: options.credentialId },
    });
  } else if (options.orgId) {
    credentialRow = await prisma.credential.findFirst({
      where: {
        orgId: options.orgId,
        provider: { in: ["google", "google_workspace", "gmail", "sheets", "drive"] },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (credentialRow) {
    try {
      const decrypted = decryptCredential(credentialRow.data);
      const parsed: GoogleOAuthTokens = JSON.parse(decrypted);

      const isExpired = !parsed.expiresAt || parsed.expiresAt <= Date.now() + 60_000;
      if (options.forceRefresh || isExpired) {
        return await refreshGoogleOAuthToken(parsed, credentialRow.id);
      }
      return parsed;
    } catch (err) {
      console.warn(`[GoogleOAuth] Failed to decrypt credential ${credentialRow.id}:`, err);
    }
  }

  // Fallback to environment variables or mock tokens
  const envToken = process.env.GOOGLE_ACCESS_TOKEN;
  const envRefresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (envToken) {
    return {
      accessToken: envToken,
      refreshToken: envRefresh,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      expiresAt: Date.now() + 3600_000,
    };
  }

  return {
    accessToken: "mock_google_access_token_vault",
    refreshToken: "mock_google_refresh_token_vault",
    expiresAt: Date.now() + 3600_000,
    scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/gmail.modify"],
  };
}
