/**
 * Utilitarios de credenciais usando o mecanismo de encriptacao existente (AES-256-GCM).
 *
 * O crypto.ts do apps/api implementa AES-256-GCM com envelope JSON {iv, ct, tag}.
 * Este modulo envolve essa funcionalidade para o contexto da recriacao do WF1,
 * permitindo criar credenciais mock/fake para testes sem OAuth real.
 */
import { encryptCredential, decryptCredential } from "../../apps/api/src/lib/crypto.js";

export interface CredentialData {
  name: string;
  type: "api_key" | "oauth2" | "basic" | "token";
  provider: string;
  data: Record<string, unknown>;
}

export interface EncryptedCredential {
  id: string;
  name: string;
  type: string;
  provider: string;
  orgId: string;
  encryptedData: string;
}

/**
 * Cria uma credencial mock encryptada usando AES-256-GCM.
 * Usado para testes — valores sao fake mas passam pelo mesmo caminho de encriptacao.
 */
export function createMockCredential(
  id: string,
  name: string,
  provider: string,
  data: Record<string, unknown>,
  orgId: string,
): EncryptedCredential {
  const encryptedData = encryptCredential(JSON.stringify(data));
  return {
    id,
    name,
    type: provider.includes("oauth") || provider.includes("gmail") || provider.includes("drive") ? "oauth2" : "api_key",
    provider,
    orgId,
    encryptedData,
  };
}

/** Descriptografa uma credencial e retorna os dados JSON */
export function decryptCredentialData(cred: EncryptedCredential): Record<string, unknown> {
  const plaintext = decryptCredential(cred.encryptedData);
  return JSON.parse(plaintext) as Record<string, unknown>;
}

/**
 * Cria credenciais mock para o WF1: Gmail OAuth2 + Google Drive OAuth2.
 * Os tokens sao fake mas o envelope de encriptacao e real (AES-256-GCM).
 */
export function createWf1Credentials(orgId: string) {
  const gmailCred = createMockCredential(
    "cred-gmail-oauth2-wf1",
    "Gmail OAuth2 (mock)",
    "gmail",
    {
      type: "authorized_user",
      client_id: "mock-gmail-client-id.apps.googleusercontent.com",
      client_secret: "mock-gmail-client-secret",
      refresh_token: "mock-gmail-refresh-token-1-abc123",
      access_token: "mock-gmail-access-token-xyz789",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600_000,
    },
    orgId,
  );

  const driveCred = createMockCredential(
    "cred-google-drive-oauth2-wf1",
    "Google Drive OAuth2 (mock)",
    "google-drive",
    {
      type: "authorized_user",
      client_id: "mock-drive-client-id.apps.googleusercontent.com",
      client_secret: "mock-drive-client-secret",
      refresh_token: "mock-drive-refresh-token-456def",
      access_token: "mock-drive-access-token-uvw456",
      scope: "https://www.googleapis.com/auth/drive.file",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600_000,
    },
    orgId,
  );

  return {
    gmail: gmailCred,
    googleDrive: driveCred,
    // Mapeia credential ID -> decrypted data para uso no runner
    map: new Map([
      ["gmail", decryptCredentialData(gmailCred)],
      ["googleDrive", decryptCredentialData(driveCred)],
    ]),
  };
}
