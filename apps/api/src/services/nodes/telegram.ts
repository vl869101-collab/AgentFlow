// Telegram Node Handler with Telegram Bot API integration and Vault credentials.
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";

import { safeFetch } from "../../lib/ssrf.js";

export const TelegramInputSchema = z.object({
  operation: z.enum([
    "sendMessage",
    "sendPhoto",
    "sendDocument",
    "setWebhook",
    "getMe",
  ]).default("sendMessage"),
  chatId: z.union([z.string(), z.number()]).optional(),
  text: z.string().optional().default(""),
  parseMode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
  photoUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  caption: z.string().optional(),
  webhookUrl: z.string().optional(),
  secretToken: z.string().optional(),
  botToken: z.string().optional(),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type TelegramInput = z.infer<typeof TelegramInputSchema>;

async function getTelegramToken(options: { credentialId?: string; botToken?: string; orgId?: string }): Promise<string | undefined> {
  if (options.botToken) return options.botToken;
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  if (options.credentialId) {
    const cred = await prisma.credential.findUnique({ where: { id: options.credentialId } });
    if (cred) {
      try {
        const decrypted = JSON.parse(decryptCredential(cred.data));
        return decrypted.botToken || decrypted.token || decrypted.apiKey;
      } catch {}
    }
  }

  if (options.orgId) {
    const cred = await prisma.credential.findFirst({
      where: { orgId: options.orgId, provider: "telegram" },
      orderBy: { updatedAt: "desc" },
    });
    if (cred) {
      try {
        const decrypted = JSON.parse(decryptCredential(cred.data));
        return decrypted.botToken || decrypted.token || decrypted.apiKey;
      } catch {}
    }
  }
  return undefined;
}

export async function executeTelegram(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
): Promise<Record<string, unknown>> {
  const merged = { ...config, ...(typeof input === "object" && input !== null ? (input as object) : {}) };
  const validated = TelegramInputSchema.parse(merged);

  const isMock = validated.mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
  const token = await getTelegramToken({ credentialId: validated.credentialId, botToken: validated.botToken, orgId });

  if (isMock || !token || token.startsWith("mock_")) {
    switch (validated.operation) {
      case "sendMessage":
        return {
          mock: true,
          ok: true,
          result: {
            message_id: Math.floor(Math.random() * 100000) + 1,
            chat: { id: validated.chatId ?? 123456, type: "private" },
            date: Math.floor(Date.now() / 1000),
            text: validated.text,
          },
        };
      case "sendPhoto":
        return {
          mock: true,
          ok: true,
          result: {
            message_id: Math.floor(Math.random() * 100000) + 1,
            chat: { id: validated.chatId ?? 123456, type: "private" },
            photo: [{ file_id: "mock_photo_id", width: 800, height: 600 }],
            caption: validated.caption,
          },
        };
      case "sendDocument":
        return {
          mock: true,
          ok: true,
          result: {
            message_id: Math.floor(Math.random() * 100000) + 1,
            chat: { id: validated.chatId ?? 123456, type: "private" },
            document: { file_id: "mock_doc_id", file_name: "document.pdf" },
            caption: validated.caption,
          },
        };
      case "setWebhook":
        return {
          mock: true,
          ok: true,
          result: true,
          description: "Webhook was set successfully",
        };
      case "getMe":
        return {
          mock: true,
          ok: true,
          result: { id: 987654321, is_bot: true, first_name: "AgentFlowBot", username: "AgentFlowBot" },
        };
      default:
        return { mock: true, operation: validated.operation };
    }
  }

  const baseUrl = `https://api.telegram.org/bot${token}`;

  switch (validated.operation) {
    case "sendMessage": {
      const res = await safeFetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: validated.chatId,
          text: validated.text,
          parse_mode: validated.parseMode,
        }),
      });
      if (!res.ok) throw new Error(`Telegram API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "sendPhoto": {
      const res = await safeFetch(`${baseUrl}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: validated.chatId,
          photo: validated.photoUrl,
          caption: validated.caption,
          parse_mode: validated.parseMode,
        }),
      });
      if (!res.ok) throw new Error(`Telegram API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "sendDocument": {
      const res = await safeFetch(`${baseUrl}/sendDocument`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: validated.chatId,
          document: validated.documentUrl,
          caption: validated.caption,
          parse_mode: validated.parseMode,
        }),
      });
      if (!res.ok) throw new Error(`Telegram API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "setWebhook": {
      const res = await safeFetch(`${baseUrl}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: validated.webhookUrl,
          secret_token: validated.secretToken,
        }),
      });
      if (!res.ok) throw new Error(`Telegram API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "getMe": {
      const res = await safeFetch(`${baseUrl}/getMe`);
      if (!res.ok) throw new Error(`Telegram API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    default:
      return { success: true };
  }
}
