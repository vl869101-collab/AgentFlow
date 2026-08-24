/**
 * Handler para node type `emailReadImap` (n8n-nodes-base.emailReadImap v2.2)
 *
 * Simula a leitura de emails via IMAP. Em producao, este handler faria
 * conexao real com um servidor IMAP usando a biblioteca `imap` ou `imap-simple`.
 * Para testes, aceita um payload de email simulado e retorna os items
 * parseados no formato compativel com os proximos nodes.
 *
 * Este handler e um TRIGGER (category: "trigger").
 */
import {
  NodeHandler,
  NodeExecutionContext,
  NodeExecutionResult,
  GmailMessageResult,
} from "./types.js";

export interface EmailReadImapParameters {
  options?: {
    mailbox?: string;
    postProcess?: "read" | "unread" | "all";
    markAsRead?: boolean;
    limit?: number;
    stripAttachments?: boolean;
    filterBySubject?: string;
  };
}

export interface ImapCredentialData {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  mailbox?: string;
  type?: "authorized_user" | "service_account" | string;
}

export interface SimulatedEmail {
  id?: string;
  uid?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  date?: string;
  snippet?: string;
  text?: string;
  html?: string;
  attachments?: AttachmentData[];
}

export interface AttachmentData {
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  data?: string;
}

export const EMAIL_READ_IMAP_NATIVE_TYPE = "emailReadImap";
export const EMAIL_READ_IMAP_ORIGINAL_TYPE = "n8n-nodes-base.emailReadImap";

/** Handler emailReadImap — leitura simulada de emails via IMAP */
export class EmailReadImapHandler implements NodeHandler {
  readonly type = EMAIL_READ_IMAP_NATIVE_TYPE;
  readonly category = "trigger";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const params = (ctx.nodeConfig.parameters as EmailReadImapParameters) ?? {};
    const options = params.options ?? {};
    const logs: string[] = [];

    const mailbox = options.mailbox ?? "INBOX";
    const postProcess = options.postProcess ?? "unread";
    const markAsRead = options.markAsRead ?? true;
    const limit = options.limit;
    const filterBySubject = options.filterBySubject;
    const stripAttachments = options.stripAttachments ?? false;

    logs.push(
      `emailReadImap: connecting to IMAP server (mailbox: ${mailbox}, postProcess: ${postProcess})`,
    );

    // Se nao temos dados de entrada (null, undefined, empty object),
    // retorna trigger metadata (simula o polling do IMAP server).
    if (
      !ctx.input ||
      (typeof ctx.input === "object" &&
        !Array.isArray(ctx.input) &&
        Object.keys(ctx.input as object).length === 0)
    ) {
      logs.push("emailReadImap: no input data provided — trigger would poll IMAP server in production");
      return {
        items: [
          {
            json: {
              _trigger: EMAIL_READ_IMAP_NATIVE_TYPE,
              _config: {
                mailbox,
                postProcess,
                markAsRead,
                limit,
                filterBySubject,
                stripAttachments,
              },
              _message:
                "No input data — trigger would poll IMAP server in production",
            },
            binary: {},
          },
        ],
        logs,
      };
    }

    // Normaliza o input para array de emails
    const emails = normalizeInput(ctx.input);

    // Filtra por assunto se especificado
    let filtered = emails;
    if (filterBySubject) {
      const before = filtered.length;
      filtered = filtered.filter(
        (e) =>
          e.subject &&
          e.subject.toLowerCase().includes(filterBySubject.toLowerCase()),
      );
      logs.push(`emailReadImap: filtered by subject "${filterBySubject}" — ${filtered.length}/${before} emails`);
    }

    // Limita o numero de emails se especificado
    if (limit !== undefined && limit > 0) {
      filtered = filtered.slice(0, limit);
      logs.push(`emailReadImap: limited to ${limit} emails`);
    }

    // Marca como lido se configurado
    if (markAsRead && filtered.length > 0) {
      logs.push(`emailReadImap: marked ${filtered.length} email(s) as read`);
    }

    const items = filtered.map((email) => formatEmailItem(email, stripAttachments, logs));

    logs.push(`emailReadImap: processed ${items.length} email(s) from ${mailbox}`);

    return { items, logs };
  }
}

/** Normaliza entrada para array de emails */
function normalizeInput(input: unknown): SimulatedEmail[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .filter((e): e is SimulatedEmail => e && typeof e === "object")
      .map((e) => e as SimulatedEmail);
  }
  if (typeof input === "object" && input !== null) {
    // Se o input e um item n8n (tem .items), extrai
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return obj.items
        .filter((e): e is SimulatedEmail => e && typeof e === "object")
        .map((e) => e as SimulatedEmail);
    }
    return [obj as SimulatedEmail];
  }
  return [];
}

/** Formata um email simulado no formato de output do handler */
function formatEmailItem(
  email: SimulatedEmail,
  stripAttachments: boolean,
  logs: string[],
): { json: Record<string, unknown>; binary?: Record<string, unknown> } {
  const attachments = email.attachments ?? [];
  const normalizedAttachments: AttachmentData[] = [];

  const binary: Record<string, unknown> = {};
  if (!stripAttachments) {
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const filename = att.filename ?? att.name ?? att.id ?? `attachment_${i}`;
      const mimeType = att.mimeType ?? att.contentType ?? "application/octet-stream";
      const size = att.size ?? 0;
      const data = att.data ?? att.content ?? "";

      normalizedAttachments.push({
        id: att.id ?? `att-${i}`,
        filename,
        mimeType,
        size,
        data,
      });

      const safeKey = filename.replace(/\.[^.]+$/, "");
      binary[safeKey] = {
        fileName: filename,
        mimeType,
        size,
        data,
      };
    }
  }

  const json: Record<string, unknown> = {
    id: email.id ?? email.uid ?? `email-${Date.now()}`,
    uid: email.uid ?? email.id,
    subject: email.subject ?? "(no subject)",
    from: email.from ?? "",
    to: email.to ?? "",
    cc: email.cc ?? "",
    bcc: email.bcc ?? "",
    date: email.date ?? new Date().toISOString(),
    snippet: email.snippet ?? "",
    text: email.text ?? "",
    html: email.html ?? "",
    attachments: stripAttachments ? [] : normalizedAttachments,
  };

  if (stripAttachments && attachments.length > 0) {
    logs.push(`emailReadImap: stripped ${attachments.length} attachment(s) from email "${email.subject ?? "(no subject)"}"`);
  }

  return { json, binary: Object.keys(binary).length > 0 ? binary : undefined };
}

/** Extrai anexos do output do emailReadImap para uso no proximo node */
export function extractEmailAttachments(items: unknown): AttachmentData[] {
  if (!items) return [];
  if (!Array.isArray(items)) return [];

  const results: AttachmentData[] = [];
  for (const item of items) {
    const obj = (item as { json?: Record<string, unknown> }).json;
    if (obj?.attachments && Array.isArray(obj.attachments)) {
      for (const att of obj.attachments) {
        results.push(att as AttachmentData);
      }
    }
    if (item && typeof item === "object" && "binary" in item) {
      const binary = (item as { binary?: Record<string, unknown> }).binary;
      if (binary) {
        for (const [key, value] of Object.entries(binary)) {
          const b = value as Record<string, unknown>;
          results.push({
            id: key,
            filename: b.fileName as string,
            mimeType: b.mimeType as string,
            size: b.size as number,
            data: b.data as string,
          });
        }
      }
    }
  }
  return results;
}

/** Tipo de message para uso no handler Gmail */
export type { GmailMessageResult };
