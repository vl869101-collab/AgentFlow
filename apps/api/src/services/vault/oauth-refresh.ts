import { prisma } from "../../lib/prisma.js";
import { decryptVaultData, encryptVaultData } from "./crypto.js";
import { getProvider } from "./providers.js";
import { recordAuditEvent } from "../audit-ledger.js";

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
  tokenType?: string;
  error?: string;
}

export const KNOWN_PROVIDER_TOKEN_URLS: Record<string, string> = {
  google: "https://oauth2.googleapis.com/token",
  google_workspace: "https://oauth2.googleapis.com/token",
  google_calendar: "https://oauth2.googleapis.com/token",
  google_docs: "https://oauth2.googleapis.com/token",
  google_drive: "https://oauth2.googleapis.com/token",
  google_gmail: "https://oauth2.googleapis.com/token",
  google_sheets: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  microsoft_teams: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  azure_ad: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  office365: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  slack: "https://slack.com/api/oauth.v2.access",
  github: "https://github.com/login/oauth/access_token",
  salesforce: "https://login.salesforce.com/services/oauth2/token",
  hubspot: "https://api.hubapi.com/oauth/v1/token",
  notion: "https://api.notion.com/v1/oauth/token",
  zoom: "https://zoom.us/oauth/token",
  dropbox: "https://api.dropboxapi.com/oauth2/token",
  spotify: "https://accounts.spotify.com/api/token",
  stripe: "https://connect.stripe.com/oauth/token",
  zendesk: "https://{subdomain}.zendesk.com/oauth/tokens",
};

export function resolveTokenEndpoint(providerId?: string, explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim().length > 0) {
    return explicitUrl.trim();
  }

  if (providerId) {
    const normalized = providerId.toLowerCase().trim();
    if (KNOWN_PROVIDER_TOKEN_URLS[normalized]) {
      return KNOWN_PROVIDER_TOKEN_URLS[normalized];
    }
    const providerDef = getProvider(providerId);
    if (providerDef) {
      const defaultUrl = providerDef.defaultFields?.tokenUrl || providerDef.defaultFields?.token_url;
      if (defaultUrl) return defaultUrl;
    }
  }

  return "https://oauth2.googleapis.com/token"; // Standard default fallback
}

/**
 * On-Demand Token Refresh Interception
 * Ensures the credential has a valid access token before executing any node.
 * If the token expires in less than 5 minutes (default), performs immediate refresh.
 */
export async function ensureFreshOAuth2Token(
  credentialId: string,
  orgId: string,
  bufferMs = 5 * 60 * 1000 // 5 minutes buffer
): Promise<{ accessToken: string; expiresAt?: string; refreshed: boolean; tokenType: string; refreshToken?: string }> {
  const credential = await prisma.credential.findFirst({
    where: { id: credentialId, orgId },
  });

  if (!credential) {
    throw new Error(`Credential ${credentialId} not found in organization ${orgId}`);
  }

  const data = typeof credential.data === "string" ? JSON.parse(credential.data) : (credential.data as Record<string, any>);
  const decrypted = decryptVaultData(credential.bucket ?? "oauth2_managed", data);
  const currentToken = (decrypted.accessToken ?? decrypted.access_token ?? decrypted.token) as string | undefined;
  const expiresAtStr = (decrypted.expiresAt ?? decrypted.expires_at) as string | undefined;
  const tokenType = (decrypted.tokenType ?? decrypted.token_type ?? "Bearer") as string;
  const currentRefreshToken = (decrypted.refreshToken ?? decrypted.refresh_token) as string | undefined;

  let needsRefresh = false;
  if (!currentToken) {
    needsRefresh = true;
  } else if (expiresAtStr) {
    const expiresAt = new Date(expiresAtStr).getTime();
    if (isNaN(expiresAt) || expiresAt - Date.now() < bufferMs) {
      needsRefresh = true;
    }
  }

  if (!needsRefresh && currentToken) {
    return {
      accessToken: currentToken,
      refreshToken: currentRefreshToken,
      expiresAt: expiresAtStr,
      refreshed: false,
      tokenType,
    };
  }

  // Perform on-demand refresh
  const refreshRes = await refreshOAuth2Credential(credentialId, orgId, true);
  if (!refreshRes.success || !refreshRes.accessToken) {
    throw new Error(`OAuth2 on-demand token refresh failed: ${refreshRes.error || "Unknown error"}`);
  }

  return {
    accessToken: refreshRes.accessToken,
    refreshToken: refreshRes.refreshToken,
    expiresAt: refreshRes.expiresAt,
    refreshed: true,
    tokenType: refreshRes.tokenType ?? "Bearer",
  };
}

/**
 * Performs OAuth2 token refresh with support for token rotation, status marking on failure,
 * and re-encryption via AES-256-GCM in the Vault.
 */
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
  const decrypted = decryptVaultData(credential.bucket ?? "oauth2_managed", data);
  const refreshToken = (decrypted.refreshToken ?? decrypted.refresh_token) as string | undefined;
  const clientId = (decrypted.clientId ?? decrypted.client_id) as string | undefined;
  const clientSecret = (decrypted.clientSecret ?? decrypted.client_secret) as string | undefined;
  const explicitTokenUrl = (decrypted.tokenUrl ?? decrypted.token_url) as string | undefined;
  const expiresAtStr = (decrypted.expiresAt ?? decrypted.expires_at) as string | undefined;
  const provider = credential.provider || decrypted.provider;

  // If not expired and not forced, return existing token
  if (!force && expiresAtStr) {
    const expiresAt = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (!isNaN(expiresAt) && expiresAt - now > fiveMinutes) {
      return {
        success: true,
        accessToken: (decrypted.accessToken ?? decrypted.access_token) as string,
        refreshToken,
        expiresAt: expiresAtStr,
        tokenType: decrypted.tokenType ?? "Bearer",
      };
    }
  }

  if (!refreshToken) {
    return {
      success: false,
      error: "No refresh token available for credential",
    };
  }

  const endpoint = resolveTokenEndpoint(provider, explicitTokenUrl);

  try {
    const bodyParams: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
    if (clientId) bodyParams.client_id = clientId;
    if (clientSecret) bodyParams.client_secret = clientSecret;

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    if (clientId && clientSecret && provider === "github") {
      headers.Accept = "application/json";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: new URLSearchParams(bodyParams).toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      // If token revoked or invalid grant, mark status as EXPIRED / REVOKED
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        await prisma.credential.update({
          where: { id: credentialId },
          data: {
            status: "EXPIRED" as any,
            updatedAt: new Date(),
          },
        });
        // Record audit event and notify organization administrators
        await recordAuditEvent({
          orgId,
          action: "credential.oauth_refresh_failed",
          resource: "credential",
          resourceId: credentialId,
          metadata: {
            provider,
            status: "EXPIRED",
            error: `HTTP ${response.status}: ${errText}`,
          },
        }).catch(() => null);
      }
      return {
        success: false,
        error: `OAuth2 refresh failed: HTTP ${response.status} ${errText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    let json: Record<string, any>;
    if (contentType.includes("application/json")) {
      json = (await response.json()) as Record<string, any>;
    } else {
      const rawText = await response.text();
      try {
        json = JSON.parse(rawText);
      } catch {
        const parsedParams = new URLSearchParams(rawText);
        json = Object.fromEntries(parsedParams.entries());
      }
    }

    // Check for OAuth error responses wrapped inside HTTP 200 (e.g. Slack / some OAuth implementations)
    if (json.ok === false || (json.error && !json.access_token && !json.accessToken)) {
      const errorMsg = json.error_description || json.error || "OAuth provider rejected refresh request";
      const isRevoked = /invalid_grant|invalid_token|revoked|token_expired/i.test(String(json.error));
      if (isRevoked) {
        await prisma.credential.update({
          where: { id: credentialId },
          data: {
            status: "EXPIRED" as any,
            updatedAt: new Date(),
          },
        });
        await recordAuditEvent({
          orgId,
          action: "credential.oauth_refresh_failed",
          resource: "credential",
          resourceId: credentialId,
          metadata: {
            provider,
            status: "EXPIRED",
            error: String(errorMsg),
          },
        }).catch(() => null);
      }
      return {
        success: false,
        error: `OAuth2 refresh failed: ${errorMsg}`,
      };
    }

    const newAccessToken = json.access_token ?? json.accessToken;
    if (!newAccessToken) {
      return {
        success: false,
        error: `OAuth2 response missing access_token: ${JSON.stringify(json)}`,
      };
    }

    // Support token rotation: if provider sends a new refresh token, rotate it
    const newRefreshToken = json.refresh_token ?? json.refreshToken ?? refreshToken;
    const expiresIn = Number(json.expires_in ?? json.expiresIn ?? 3600);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const tokenType = json.token_type ?? json.tokenType ?? "Bearer";

    const updatedData = {
      ...decrypted,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      tokenType,
      lastRefreshedAt: new Date().toISOString(),
    };

    const reEncrypted = encryptVaultData(credential.bucket ?? "oauth2_managed", updatedData);

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
      tokenType,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message ?? "Unknown refresh error",
    };
  }
}

/**
 * Background Scheduled Refresh Worker
 * Proactively scans all active OAuth credentials expiring in < 30 minutes and refreshes them.
 */
export async function scanAndRefreshExpiringCredentials(thresholdMinutes = 30): Promise<{
  scanned: number;
  refreshed: number;
  failed: number;
  results: { id: string; provider?: string; success: boolean; error?: string }[];
}> {
  const credentials = await prisma.credential.findMany({
    where: {
      bucket: { in: ["oauth2_managed", "oauth2_custom", "mcp_oauth2"] as any },
      status: { not: "REVOKED" as any },
    },
  });

  let scanned = 0;
  let refreshed = 0;
  let failed = 0;
  const results: { id: string; provider?: string; success: boolean; error?: string }[] = [];
  const thresholdMs = thresholdMinutes * 60 * 1000;

  for (const cred of credentials) {
    scanned++;
    try {
      const data = typeof cred.data === "string" ? JSON.parse(cred.data) : (cred.data as Record<string, any>);
      const decrypted = decryptVaultData(cred.bucket ?? "oauth2_managed", data);
      const expiresAtStr = decrypted.expiresAt ?? decrypted.expires_at;

      let shouldRefresh = false;
      if (expiresAtStr) {
        const expiresAt = new Date(expiresAtStr).getTime();
        if (isNaN(expiresAt) || expiresAt - Date.now() < thresholdMs) {
          shouldRefresh = true;
        }
      } else if (decrypted.refreshToken || decrypted.refresh_token) {
        // No expiry specified, test proactive refresh if not refreshed recently
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        const res = await refreshOAuth2Credential(cred.id, cred.orgId, true);
        if (res.success) {
          refreshed++;
          results.push({ id: cred.id, provider: cred.provider, success: true });
        } else {
          failed++;
          results.push({ id: cred.id, provider: cred.provider, success: false, error: res.error });
        }
      }
    } catch (err: any) {
      failed++;
      results.push({ id: cred.id, provider: cred.provider, success: false, error: err.message });
    }
  }

  return { scanned, refreshed, failed, results };
}
