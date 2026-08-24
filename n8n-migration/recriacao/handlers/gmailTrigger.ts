/**
 * Handler para node type `gmailTrigger` (n8n-nodes-base.gmailTrigger v1.4)
 *
 * Simula o polling de novas mensagens do Gmail com anexos.
 * Em producao, este handler faria polling via Gmail API (OAuth2).
 * Para testes, aceita um payload de email simulado.
 */
import { NodeHandler, NodeExecutionContext, NodeExecutionResult, GmailMessageResult } from "./types.js";

export interface GmailTriggerParameters {
  event: string;
  simple?: boolean;
  pollTimes?: { item: Array<{ mode: string }> };
  filters?: { q?: string; readStatus?: string };
  options?: {
    downloadAttachments?: boolean;
    dataPropertyAttachmentsPrefixName?: string;
  };
}

/** Handler gmailTrigger — pass-through + metadata, com suporte a mock email payload */
export class GmailTriggerHandler implements NodeHandler {
  readonly type = "gmailTrigger";
  readonly category = "trigger";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const params = (ctx.nodeConfig.parameters as GmailTriggerParameters) ?? {};
    const options = params.options ?? {};
    const filters = params.filters ?? {};

    // O input pode ser um payload de email simulado (para testes) ou
    // vazio (para execucao real onde o trigger faz polling do Gmail).
    const inputData = ctx.input;

    // Se temos dados de entrada (simulados), usa-os diretamente.
    // Caso contrario, retorna item vazio que o executor preenche.
    if (inputData && typeof inputData === "object" && !Array.isArray(inputData)) {
      const emailObj = inputData as Record<string, unknown>;
      const attachments = extractAttachments(emailObj, options);
      const prefix = options.dataPropertyAttachmentsPrefixName ?? "attachment_";

      // Popula o campo binary com os anexos usando o prefixo do n8n
      // (ex: attachment_invoice, attachment_report). O code node itera sobre
      // as keys de $input.item.binary para separar cada anexo.
      const binary: Record<string, unknown> = {};
      for (const att of attachments) {
        const safeKey = prefix + (att.filename ? att.filename.replace(/\.[^.]+$/, "") : att.id);
        binary[safeKey] = {
          fileName: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          data: att.data,
        };
      }

      const message: GmailMessageResult = {
        id: String(emailObj.id ?? "msg-simulated"),
        threadId: String(emailObj.threadId ?? "thread-simulated"),
        labelIds: (emailObj.labelIds as string[]) ?? ["INBOX", "UNREAD"],
        snippet: String(emailObj.snippet ?? ""),
        subject: String(emailObj.subject ?? "No subject"),
        from: String(emailObj.from ?? ""),
        to: String(emailObj.to ?? ""),
        date: String(emailObj.date ?? new Date().toISOString()),
        attachments,
      };

      return {
        items: [
          {
            json: {
              id: message.id,
              threadId: message.threadId,
              labelIds: message.labelIds,
              snippet: message.snippet,
              subject: message.subject,
              from: message.from,
              to: message.to,
              date: message.date,
              attachments: message.attachments,
            },
            binary,
          },
        ],
        logs: [`gmailTrigger: received email "${message.subject}" with ${message.attachments.length} attachment(s)`],
      };
    }

    // Sem dados de entrada — trigger vazio (execucao real faria polling)
    return {
      items: [
        {
          json: {
            _trigger: "gmailTrigger",
            _config: {
              event: params.event,
              filters,
              options,
            },
            _message: "No input data — trigger would poll Gmail API in production",
          },
          binary: {},
        },
      ],
      logs: ["gmailTrigger: no input data provided"],
    };
  }
}

/** Extrai anexos do payload de email simulado */
function extractAttachments(
  emailObj: Record<string, unknown>,
  options: { downloadAttachments?: boolean; dataPropertyAttachmentsPrefixName?: string },
): GmailMessageResult["attachments"] {
  const attachments: GmailMessageResult["attachments"] = [];
  const prefix = options.dataPropertyAttachmentsPrefixName ?? "attachment_";

  // Anexos podem estar em: emailObj.attachments (array) ou
  // em propriedades prefixadas (attachment_<name>)
  if (Array.isArray(emailObj.attachments)) {
    for (let i = 0; i < emailObj.attachments.length; i++) {
      const att = emailObj.attachments[i] as Record<string, unknown>;
      attachments.push({
        id: String(att.id ?? `att-${i}`),
        filename: String(att.filename ?? att.name ?? `attachment_${i}`),
        mimeType: String(att.mimeType ?? att.contentType ?? "application/octet-stream"),
        size: Number(att.size ?? 0),
        data: String(att.data ?? att.content ?? ""),
      });
    }
  } else {
    // Tenta propriedades prefixadas
    for (const [key, value] of Object.entries(emailObj)) {
      if (key.startsWith(prefix) && typeof value === "object" && value !== null) {
        const att = value as Record<string, unknown>;
        attachments.push({
          id: String(att.id ?? key),
          filename: String(att.filename ?? key),
          mimeType: String(att.mimeType ?? att.contentType ?? "application/octet-stream"),
          size: Number(att.size ?? 0),
          data: String(att.data ?? att.content ?? ""),
        });
      }
    }
  }

  return attachments;
}
