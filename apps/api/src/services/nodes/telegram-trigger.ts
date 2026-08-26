// Telegram Trigger node handler for webhook event dispatch.
import { z } from "zod";

export const TelegramTriggerInputSchema = z.object({
  secretToken: z.string().optional(),
  allowedUpdates: z.array(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
}).passthrough();

export type TelegramTriggerInput = z.infer<typeof TelegramTriggerInputSchema>;

export function executeTelegramTrigger(config: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, any>) : {};
  const msg = raw.message || raw.edited_message || raw.channel_post || raw.callback_query?.message || {};
  const from = msg.from || raw.callback_query?.from || {};
  const chat = msg.chat || {};

  return {
    ...raw,
    updateId: raw.update_id ?? raw.updateId ?? 10001,
    messageId: msg.message_id ?? msg.messageId,
    chatId: chat.id ?? raw.chatId,
    text: msg.text ?? msg.caption ?? raw.callback_query?.data ?? raw.text ?? "",
    fromUser: {
      id: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
    },
    chatType: chat.type ?? "private",
    date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
    _trigger: "telegramTrigger",
    _config: config,
  };
}
