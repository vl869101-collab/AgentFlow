const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(process.cwd(), 'apps', 'api', 'src', 'services', 'vault', 'oauth-refresh.ts');

const content = `import { prisma } from "../../lib/prisma.js";
import { decryptCredentialData, encryptCredentialData } from "./crypto.js";
import { getVaultProvider } from "./providers.js";

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
    throw new Error(\`Credential \${credentialId} not found in org \${orgId}\`);
  }

  const data = decryptCredentialData(credential.data, credential.bucket as any);
  const refreshToken = (data.refreshToken ?? data.refresh_token) as string | undefined;
  const clientId = (data.clientId ?? data.client_id) as string | undefined;
  const clientSecret = (data.clientSecret ?? data.client_secret) as string | undefined;
  const tokenUrl = (data.tokenUrl ?? data.token_url) as string | undefined;
  const expiresAtStr = (data.expiresAt ?? data.expires_at) as string | undefined;

  // If not expired and not forcing, return current token
  if (!force && expiresAtStr) {
    const expiresAt = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (expiresAt - now > fiveMinutes) {
      return {
        success: true,
        accessToken: (data.accessToken ?? data.access_token) as string,
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
    const providerDef = getVaultProvider(credential.provider);
    if (providerDef && providerDef.oauth2Urls?.tokenUrl) {
      endpoint = providerDef.oauth2Urls.tokenUrl;
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
        error: \`OAuth2 refresh failed: \${response.status} \${errText}\`,
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

    const reEncrypted = encryptCredentialData(updatedData, credential.bucket as any);

    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        data: reEncrypted,
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
      const data = decryptCredentialData(cred.data, cred.bucket as any);
      const expiresAtStr = data.expiresAt ?? data.expires_at;
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
`;

fs.writeFileSync(targetFile, content.trim() + '\n', 'utf8');
console.log('Successfully written oauth-refresh.ts');

