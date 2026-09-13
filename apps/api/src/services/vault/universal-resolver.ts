import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";
import { kmsManager, decryptVaultEnvelope, isVaultEnvelope } from "./kms.js";
import { decryptVaultData, maskVaultData } from "./crypto.js";
import { ensureFreshOAuth2Token } from "./oauth-refresh.js";

export interface ResolvedCredentialItem {
  id: string;
  name?: string;
  type: string;
  provider: string;
  data: Record<string, any>;
  maskedData: Record<string, any>;
  token?: string;
  accessToken?: string;
  apiKey?: string;
  tokenType?: string;
  expiresAt?: string;
  refreshed?: boolean;
}

export interface UniversalCredentialResolution {
  byType: Record<string, Record<string, any>>;
  byId: Record<string, Record<string, any>>;
  byProvider: Record<string, Record<string, any>>;
  primary?: Record<string, any>;
  token?: string;
  accessToken?: string;
  apiKey?: string;
}

/**
 * Normaliza e extrai os IDs de credenciais declarados na configuracao de um no.
 * Suporta padroes n8n como:
 * - credentials: { googleSheetsOAuth2Api: { id: "cred_123" } }
 * - credentials: { googleSheetsOAuth2Api: "cred_123" }
 * - credentialId: "cred_123"
 * - parameters: { credentials: ... }
 */
export function extractCredentialReferences(
  config: Record<string, unknown> | null | undefined
): Array<{ key: string; credentialId: string }> {
  if (!config || typeof config !== "object") return [];

  const refs: Array<{ key: string; credentialId: string }> = [];
  const seenIds = new Set<string>();

  const addRef = (key: string, id: unknown) => {
    if (typeof id === "string" && id.trim().length > 0) {
      const trimmed = id.trim();
      refs.push({ key, credentialId: trimmed });
      seenIds.add(trimmed);
    }
  };

  // 1. config.credentialId
  if (config.credentialId) {
    addRef("default", config.credentialId);
  }

  // 2. config.credentials (n8n style)
  if (config.credentials && typeof config.credentials === "object") {
    for (const [credKey, val] of Object.entries(config.credentials as Record<string, unknown>)) {
      if (typeof val === "string") {
        addRef(credKey, val);
      } else if (val && typeof val === "object" && "id" in val) {
        addRef(credKey, (val as { id: unknown }).id);
      }
    }
  }

  // 3. config.parameters?.credentials ou config.parameters?.credentialId
  const params = config.parameters as Record<string, unknown> | undefined;
  if (params && typeof params === "object") {
    if (params.credentialId) {
      addRef("default", params.credentialId);
    }
    if (params.credentials && typeof params.credentials === "object") {
      for (const [credKey, val] of Object.entries(params.credentials as Record<string, unknown>)) {
        if (typeof val === "string") {
          addRef(credKey, val);
        } else if (val && typeof val === "object" && "id" in val) {
          addRef(credKey, (val as { id: unknown }).id);
        }
      }
    }
  }

  return refs;
}

/**
 * Descriptografa e resolve uma credencial individual do banco de dados,
 * gerenciando KMS, envelopes Vault e auto-refresh OAuth2.
 */
export async function resolveSingleCredential(
  credentialId: string,
  orgId?: string
): Promise<ResolvedCredentialItem | null> {
  if (!credentialId) return null;

  try {
    const cred = await prisma.credential.findFirst({
      where: {
        id: credentialId,
        ...(orgId ? { orgId } : {}),
      },
    });

    if (!cred) return null;

    let decryptedData: Record<string, any> = {};
    const rawData = typeof cred.data === "string" ? JSON.parse(cred.data) : (cred.data as Record<string, any>);

    // Descriptografa com base no formato (Vault Envelope KMS ou AES-256-GCM / Legacy)
    if (isVaultEnvelope(rawData)) {
      decryptedData = decryptVaultEnvelope(rawData, kmsManager.getProvider());
    } else if (typeof cred.data === "string" && !cred.data.startsWith("{")) {
      try {
        decryptedData = JSON.parse(decryptCredential(cred.data));
      } catch {
        decryptedData = rawData;
      }
    } else {
      decryptedData = decryptVaultData(cred.bucket ?? cred.type ?? "api_key", rawData);
    }

    let accessToken: string | undefined =
      decryptedData.accessToken ?? decryptedData.access_token ?? decryptedData.token;
    let tokenType: string | undefined = decryptedData.tokenType ?? decryptedData.token_type ?? "Bearer";
    let expiresAt: string | undefined = decryptedData.expiresAt ?? decryptedData.expires_at;
    let refreshed = false;

    // Verificacao de OAuth2 e auto-refresh de token
    const isOAuth =
      cred.type === "oauth2" ||
      cred.bucket === "oauth2_managed" ||
      cred.bucket === "oauth2_custom" ||
      Boolean(decryptedData.refreshToken ?? decryptedData.refresh_token);

    if (isOAuth && orgId) {
      try {
        const fresh = await ensureFreshOAuth2Token(cred.id, orgId);
        accessToken = fresh.accessToken;
        tokenType = fresh.tokenType;
        expiresAt = fresh.expiresAt;
        refreshed = fresh.refreshed;

        decryptedData.accessToken = accessToken;
        decryptedData.access_token = accessToken;
        if (fresh.refreshToken) {
          decryptedData.refreshToken = fresh.refreshToken;
          decryptedData.refresh_token = fresh.refreshToken;
        }
        decryptedData.expiresAt = expiresAt;
        decryptedData.tokenType = tokenType;
      } catch (refreshErr) {
        console.warn(`[VaultResolver] OAuth2 token auto-refresh failed for credential ${cred.id}:`, refreshErr);
      }
    }

    const apiKey =
      decryptedData.apiKey ??
      decryptedData.api_key ??
      decryptedData.secret ??
      decryptedData.token ??
      decryptedData.botToken;

    const maskedData = maskVaultData(cred.bucket ?? cred.type ?? "api_key", decryptedData);

    return {
      id: cred.id,
      name: cred.name,
      type: cred.type,
      provider: cred.provider,
      data: decryptedData,
      maskedData,
      token: accessToken ?? apiKey,
      accessToken,
      apiKey,
      tokenType,
      expiresAt,
      refreshed,
    };
  } catch (err) {
    console.error(`[VaultResolver] Failed to resolve credential ${credentialId}:`, err);
    return null;
  }
}

/**
 * Resolve todas as credenciais declaradas no no e retorna uma estrutura universal.
 */
export async function resolveUniversalCredentials(
  config: Record<string, unknown> | null | undefined,
  orgId: string
): Promise<UniversalCredentialResolution> {
  const refs = extractCredentialReferences(config);
  const result: UniversalCredentialResolution = {
    byType: {},
    byId: {},
    byProvider: {},
  };

  for (const ref of refs) {
    const resolved = await resolveSingleCredential(ref.credentialId, orgId);
    if (resolved) {
      result.byId[resolved.id] = resolved.data;
      result.byType[ref.key] = resolved.data;
      if (resolved.provider) {
        result.byProvider[resolved.provider] = resolved.data;
      }

      if (!result.primary) {
        result.primary = resolved.data;
        result.token = resolved.token;
        result.accessToken = resolved.accessToken;
        result.apiKey = resolved.apiKey;
      }
    }
  }

  return result;
}
