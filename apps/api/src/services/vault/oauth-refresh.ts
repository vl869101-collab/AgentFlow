import { prisma } from "../../lib/prisma.js";
import { decryptVaultData, encryptVaultData } from "./crypto.js";
import { getProvider } from "./providers.js";

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
  error?: string;
}

export async function refreshOAuth2Credential(
  credentialId: string,
  orgId: string,
  force = false
): Promise<RefreshResult> {
  const credential = await prisma.credential.findFirst({
    where: { id: credentialId, orgId },
  });

  if (!credential) {
    throw new Error(`Credential ${credentialId} not found in org ${orgId}`);
  }

  const data = typeof credential.data === "string" ? JSON.parse(credential.data) : (credential.data as Record<string, any>);
  const decrypted = decryptVaultData(credential.bucket as any, data);
  const refreshToken = (decrypted.refreshToken ?? decrypted.refresh_token) as string | undefined;
  const clientId = (decrypted.clientId ?? decrypted.client_id) as string | undefined;
  const clientSecret = (decrypted.clientSecret ?? decrypted.client_secret) as string | undefined;
  const tokenUrl = (decrypted.tokenUrl ?? decrypted.token_url) as string | undefined;
  const expiresAtStr = (decrypted.expiresAt ?? decrypted.expires_at) as string | undefined;

  // If not expired and not forcing, return current token
  if (!force && expiresAtStr) {
    const expiresAt = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (expiresAt - now > fiveMinutes) {
      return {
        success: true,
        accessToken: (decrypted.accessToken ?? decrypted.access_token) as string,
        refreshToken,
        expiresAt: expiresAtStr,
      };
    }
  }

  if (!refreshToken) {
    return {
      success: false,
      error: "No refresh token available for credential",
    };
  }

  // Determine token endpoint from provider catalog if not explicit
  let endpoint = tokenUrl;
  if (!endpoint && credential.provider) {
    const providerDef = getProvider(credential.provider);
    if (providerDef) {
      endpoint = (providerDef.defaultFields?.tokenUrl ?? (providerDef as any).tokenUrl) as string | undefined;
    }
  }

  if (!endpoint) {
    endpoint = "https://oauth2.googleapis.com/token"; // Fallback default
  }

  try {
    const bodyParams: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
    if (clientId) bodyParams.client_id = clientId;
    if (clientSecret) bodyParams.client_secret = clientSecret;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      // If token revoked, mark status
      if (response.status === 400 || response.status === 401) {
        await prisma.credential.update({
          where: { id: credentialId },
          data: { status: "EXPIRED" as any },
        });
      }
      return {
        success: false,
        error: `OAuth2 refresh failed: ${response.status} ${errText}`,
      };
    }

    const json = (await response.json()) as Record<string, any>;
    const newAccessToken = json.access_token ?? json.accessToken;
    const newRefreshToken = json.refresh_token ?? json.refreshToken ?? refreshToken;
    const expiresIn = Number(json.expires_in ?? 3600);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const updatedData = {
      ...data,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      tokenType: json.token_type ?? "Bearer",
    };

    const reEncrypted = encryptVaultData(credential.bucket as any, updatedData);

    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        data: typeof credential.data === "string" ? JSON.stringify(reEncrypted) : reEncrypted,
        status: "ACTIVE" as any,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      expiresAt: newExpiresAt,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message ?? "Unknown refresh error",
    };
  }
}

export async function scanAndRefreshExpiringCredentials(): Promise<{
  scanned: number;
  refreshed: number;
  failed: number;
}> {
  const credentials = await prisma.credential.findMany({
    where: {
      bucket: { in: ["oauth2_managed", "oauth2_custom", "mcp_oauth2"] as any },
      status: "ACTIVE" as any,
    },
  });

  let scanned = 0;
  let refreshed = 0;
  let failed = 0;

  for (const cred of credentials) {
    scanned++;
    try {
      const data = typeof cred.data === "string" ? JSON.parse(cred.data) : (cred.data as Record<string, any>);
      const decrypted = decryptVaultData(cred.bucket as any, data);
      const expiresAtStr = decrypted.expiresAt ?? decrypted.expires_at;
      if (expiresAtStr) {
        const expiresAt = new Date(expiresAtStr).getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        if (expiresAt - Date.now() < thirtyMinutes) {
          const res = await refreshOAuth2Credential(cred.id, cred.orgId, true);
          if (res.success) refreshed++;
          else failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return { scanned, refreshed, failed };
}
