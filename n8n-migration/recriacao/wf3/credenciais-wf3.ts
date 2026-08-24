/**
 * Credenciais mock para o WF3 — IMAP Email + Gmail OAuth2.
 *
 * Usa o mecanismo de encriptacao existente (AES-256-GCM via crypto.ts)
 * do apps/api. Os valores sao fake mas o envelope de encriptacao e real.
 *
 * Reusa createMockCredential / decryptCredentialData do
 * n8n-migration/recriacao/credenciais.ts compartilhado pelo WF1.
 */
import { createMockCredential, decryptCredentialData, EncryptedCredential } from "../credenciais.js";

/** Cria credenciais mock para o WF3 */
export function createWf3Credentials(orgId: string) {
  const imapCred = createMockCredential(
    "cred-imap-wf3",
    "IMAP Email (mock)",
    "imap",
    {
      host: "imap.gmail.com",
      port: 993,
      user: "user@example.com",
      password: "mock-imap-password-123",
      secure: true,
      mailbox: "INBOX",
    },
    orgId,
  );

  const gmailCred = createMockCredential(
    "cred-gmail-oauth2-wf3",
    "Gmail OAuth2 (mock)",
    "gmail",
    {
      type: "authorized_user",
      client_id: "mock-gmail-client-id.apps.googleusercontent.com",
      client_secret: "mock-gmail-client-secret",
      refresh_token: "mock-gmail-refresh-token-wf3-abc123",
      access_token: "mock-gmail-access-token-wf3-xyz789",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600_000,
    },
    orgId,
  );

  return {
    imap: imapCred,
    gmail: gmailCred,
    map: new Map([
      ["imap", decryptCredentialData(imapCred)],
      ["gmail", decryptCredentialData(gmailCred)],
    ]),
  };
}

export type { EncryptedCredential };
