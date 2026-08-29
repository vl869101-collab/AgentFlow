import { prisma } from "../../lib/prisma.js";
import { ensureFreshOAuth2Token } from "../vault/oauth-refresh.js";
import { decryptVaultData } from "../vault/crypto.js";

export interface VaultOAuthCredential {
  accessToken: string;
  tokenType: string;
  credentialId: string;
  provider: string;
  data: Record<string, unknown>;
}

interface ResolveVaultOAuthOptions {
  credentialId?: string;
  orgId: string;
  providers: readonly string[];
}

/** Resolve an organization-scoped OAuth credential and refresh it in the vault. */
export async function resolveVaultOAuthCredential(
  options: ResolveVaultOAuthOptions,
): Promise<VaultOAuthCredential | undefined> {
  if (!options.orgId) {
    if (options.credentialId) throw new Error("Organization is required to resolve an OAuth credential");
    return undefined;
  }

  const acceptedProviders = options.providers.map((provider) => provider.toLowerCase());
  const credential = options.credentialId
    ? await prisma.credential.findFirst({ where: { id: options.credentialId, orgId: options.orgId } })
    : await prisma.credential.findFirst({
        where: { orgId: options.orgId, provider: { in: [...options.providers] } },
        orderBy: { updatedAt: "desc" },
      });

  if (!credential) {
    if (options.credentialId) {
      throw new Error(`OAuth credential ${options.credentialId} was not found in organization ${options.orgId}`);
    }
    return undefined;
  }

  const provider = String(credential.provider ?? "").toLowerCase();
  if (provider && !acceptedProviders.includes(provider)) {
    throw new Error(`Credential ${credential.id} uses unsupported provider ${credential.provider}`);
  }

  const rawData = typeof credential.data === "string"
    ? JSON.parse(credential.data)
    : credential.data as Record<string, unknown>;
  const data = decryptVaultData(credential.bucket ?? "oauth2_managed", rawData);
  const fresh = await ensureFreshOAuth2Token(credential.id, options.orgId);

  return {
    accessToken: fresh.accessToken,
    tokenType: fresh.tokenType || "Bearer",
    credentialId: credential.id,
    provider: String(credential.provider ?? ""),
    data,
  };
}

export function isNodeMockEnabled(mock?: boolean): boolean {
  return mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
}

export function nodeInputRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  return record.json && typeof record.json === "object" && !Array.isArray(record.json)
    ? record.json as Record<string, unknown>
    : record;
}

export function mergeNodeInput(config: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const merged = { ...config, ...nodeInputRecord(input) };
  if (Object.hasOwn(config, "credentialId")) merged.credentialId = config.credentialId;
  if (Object.hasOwn(config, "mock")) merged.mock = config.mock;
  return merged;
}
