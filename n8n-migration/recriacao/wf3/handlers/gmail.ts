/**
 * Handler para node type `gmail` (n8n-nodes-base.gmail v2.2)
 *
 * Simula a operacao de Gmail API. Em producao, este handler faria chamadas
 * reais a la API do Gmail via OAuth2.
 *
 * Operacoes suportadas:
 * - `addLabels`: adiciona labels a uma mensagem
 * - `removeLabels`: remove labels de uma mensagem
 * - `send`: envia um email
 * - `get`: obtém detalhes de uma mensagem
 *
 * Este handler e uma ACTION (category: "action").
 */
import {
  NodeHandler,
  NodeExecutionContext,
  NodeExecutionResult,
  NodeItem,
} from "./types.js";

export interface GmailParameters {
  operation: string;
  resource?: string;
  messageId?: string;
  labelIds?: string[];
  topicName?: string;
  message?: {
    subject?: string;
    body?: string;
    to?: string;
    cc?: string;
    bcc?: string;
  };
  options?: Record<string, unknown>;
}

export interface GmailCredentialData {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export const GMAIL_NATIVE_TYPE = "gmail";
export const GMAIL_ORIGINAL_TYPE = "n8n-nodes-base.gmail";

/** Handler gmail (addLabels operation) — simula adicao de labels via Gmail API */
export class GmailHandler implements NodeHandler {
  readonly type = GMAIL_NATIVE_TYPE;
  readonly category = "action";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const params = (ctx.nodeConfig.parameters as GmailParameters) ?? {};
    const logs: string[] = [];

    const operation = params.operation ?? "addLabels";

    logs.push(`gmail: executing operation "${operation}"`);

    switch (operation) {
      case "addLabels":
        return this.executeAddLabels(params, ctx, logs);
      case "removeLabels":
        return this.executeRemoveLabels(params, ctx, logs);
      case "send":
        return this.executeSend(params, ctx, logs);
      case "get":
        return this.executeGet(params, ctx, logs);
      default:
        logs.push(`gmail: unknown operation "${operation}" — passing input through`);
        return {
          items: normalizeInputItems(ctx.input),
          logs,
        };
    }
  }

  private async executeAddLabels(
    params: GmailParameters,
    ctx: NodeExecutionContext,
    logs: string[],
  ): Promise<NodeExecutionResult> {
    const labelIds = params.labelIds ?? ["INBOX"];
    const inputItems = normalizeInputItems(ctx.input);

    const results: NodeItem[] = [];

    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      const messageData = extractMessageData(item);

      if (!messageData.id) {
        logs.push(`gmail: item ${i} has no message ID — skipping`);
        results.push({
          json: {
            success: false,
            error: "No message ID in input item",
            index: i,
          },
        });
        continue;
      }

      const appliedLabels = labelIds;
      logs.push(
        `gmail: addLabels to message "${messageData.id}" — labels: [${appliedLabels.join(", ")}]`,
      );

      results.push({
        json: {
          success: true,
          id: messageData.id,
          threadId: messageData.threadId ?? `thread-${messageData.id}`,
          labelIds: appliedLabels,
          labelAdded: appliedLabels.length,
          operation: "addLabels",
          subject: messageData.subject ?? "",
          from: messageData.from ?? "",
        },
      });
    }

    logs.push(`gmail: addLabels completed for ${results.filter((r) => r.json.success === true).length} message(s)`);

    return { items: results, logs };
  }

  private async executeRemoveLabels(
    params: GmailParameters,
    ctx: NodeExecutionContext,
    logs: string[],
  ): Promise<NodeExecutionResult> {
    const labelIds = params.labelIds ?? [];
    const inputItems = normalizeInputItems(ctx.input);

    const results: NodeItem[] = [];

    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      const messageData = extractMessageData(item);

      if (!messageData.id) {
        logs.push(`gmail: item ${i} has no message ID — skipping`);
        results.push({
          json: { success: false, error: "No message ID", index: i },
        });
        continue;
      }

      logs.push(`gmail: removeLabels from "${messageData.id}" — labels: [${labelIds.join(", ")}]`);

      results.push({
        json: {
          success: true,
          id: messageData.id,
          labelRemoved: labelIds.length,
          operation: "removeLabels",
        },
      });
    }

    return { items: results, logs };
  }

  private async executeSend(
    params: GmailParameters,
    ctx: NodeExecutionContext,
    logs: string[],
  ): Promise<NodeExecutionResult> {
    const msg = params.message ?? {};
    const inputItems = normalizeInputItems(ctx.input);

    const results: NodeItem[] = [];

    // Se params.message existe, envia como novo email
    if (msg.subject || msg.to) {
      const messageId = `msg-${Date.now()}`;
      logs.push(`gmail: send email to "${msg.to}" — subject: "${msg.subject}"`);
      results.push({
        json: {
          success: true,
          id: messageId,
          threadId: messageId,
          labelIds: ["SENT"],
          to: msg.to ?? "",
          subject: msg.subject ?? "(no subject)",
          operation: "send",
        },
      });
    }

    // Tambem processa items de entrada (caso o send seja um action de um item anterior)
    for (const item of inputItems) {
      const messageData = extractMessageData(item);
      if (messageData.subject || messageData.from) {
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        logs.push(`gmail: send email to "${messageData.to ?? messageData.to}" — subject: "${messageData.subject}"`);
        results.push({
          json: {
            success: true,
            id: messageId,
            threadId: messageId,
            labelIds: ["SENT"],
            to: messageData.to ?? "",
            subject: messageData.subject ?? "(no subject)",
            operation: "send",
          },
        });
      }
    }

    const sentCount = results.filter((r) => r.json.success === true).length;
    if (sentCount === 0) {
      results.push({
        json: {
          success: false,
          error: "No message data found in parameters or input",
          operation: "send",
        },
      });
    }

    logs.push(`gmail: send completed — ${sentCount} message(s) sent`);

    return { items: results, logs };
  }

  private async executeGet(
    params: GmailParameters,
    ctx: NodeExecutionContext,
    logs: string[],
  ): Promise<NodeExecutionResult> {
    const inputItems = normalizeInputItems(ctx.input);

    const results: NodeItem[] = [];

    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      const messageData = extractMessageData(item);

      if (!messageData.id) {
        logs.push(`gmail: item ${i} has no message ID — skipping`);
        results.push({ json: { success: false, error: "No message ID", index: i } });
        continue;
      }

      logs.push(`gmail: get message "${messageData.id}"`);

      results.push({
        json: {
          success: true,
          id: messageData.id,
          threadId: messageData.threadId ?? `thread-${messageData.id}`,
          subject: messageData.subject ?? "(no subject)",
          from: messageData.from ?? "",
          snippet: messageData.snippet ?? "",
          internalDate: messageData.date ?? new Date().toISOString(),
          operation: "get",
          labelIds: messageData.labelIds ?? [],
        },
      });
    }

    return { items: results, logs };
  }
}

/** Normaliza entrada para array de items */
function normalizeInputItems(input: unknown): NodeItem[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => normalizeItem(item));
  return [normalizeItem(input)];
}

function normalizeItem(item: unknown): NodeItem {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    return {
      json: (obj.json ?? obj) as Record<string, unknown>,
      binary: obj.binary as Record<string, unknown> | undefined,
    };
  }
  return { json: { value: item } };
}

/** Extrai dados da mensagem do input item */
function extractMessageData(item: NodeItem): Record<string, unknown> {
  const json = item.json;

  // O input pode vir do emailReadImap (tem .json.id) ou de outro node
  const result: Record<string, unknown> = {
    id: json.id ?? json.messageId ?? json.messageID ?? json.uid,
    threadId: json.threadId,
    subject: json.subject,
    from: json.from,
    to: json.to,
    cc: json.cc,
    snippet: json.snippet,
    date: json.date,
    labelIds: json.labelIds,
  };

  return result;
}
