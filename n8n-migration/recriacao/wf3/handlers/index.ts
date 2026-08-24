/**
 * Index de handlers do WF3 — re-exporta todos os handlers criados.
 * NAO edita o registry compartilhado de apps/api.
 */
export { EmailReadImapHandler, EMAIL_READ_IMAP_NATIVE_TYPE } from "./email-read-imap.js";
export type {
  EmailReadImapParameters,
  ImapCredentialData,
  SimulatedEmail,
  AttachmentData,
} from "./email-read-imap.js";

export { GmailHandler, GMAIL_NATIVE_TYPE } from "./gmail.js";
export type { GmailParameters, GmailCredentialData } from "./gmail.js";

export type {
  NodeHandler,
  NodeExecutionContext,
  NodeExecutionResult,
  NodeItem,
} from "./types.js";
