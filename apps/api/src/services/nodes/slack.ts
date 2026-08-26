// Slack Node Handler with Slack Web API and Incoming Webhooks integration.
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";

import { safeFetch } from "../../lib/ssrf.js";

export const SlackInputSchema = z.object({
  operation: z.enum([
    "sendMessage",
    "createChannel",
    "listChannels",
    "postWebhook",
  ]).default("sendMessage"),
  channel: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional().default(""),
  blocks: z.array(z.record(z.unknown())).optional(),
  webhookUrl: z.string().optional(),
  isPrivate: z.boolean().optional().default(false),
  botToken: z.string().optional(),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type SlackInput = z.infer<typeof SlackInputSchema>;

async function getSlackToken(options: { credentialId?: string; botToken?: string; orgId?: string }): Promise<string | undefined> {
  if (options.botToken) return options.botToken;
  if (process.env.SLACK_BOT_TOKEN) return process.env.SLACK_BOT_TOKEN;

  if (options.credentialId) {
    const cred = await prisma.credential.findUnique({ where: { id: options.credentialId } });
    if (cred) {
      try {
        const decrypted = JSON.parse(decryptCredential(cred.data));
        return decrypted.botToken || decrypted.token || decrypted.accessToken || decrypted.apiKey;
      } catch {}
    }
  }

  if (options.orgId) {
    const cred = await prisma.credential.findFirst({
      where: { orgId: options.orgId, provider: "slack" },
      orderBy: { updatedAt: "desc" },
    });
    if (cred) {
      try {
        const decrypted = JSON.parse(decryptCredential(cred.data));
        return decrypted.botToken || decrypted.token || decrypted.accessToken || decrypted.apiKey;
      } catch {}
    }
  }
  return undefined;
}

export async function executeSlack(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
): Promise<Record<string, unknown>> {
  const merged = { ...config, ...(typeof input === "object" && input !== null ? (input as object) : {}) };
  const validated = SlackInputSchema.parse(merged);

  const isMock = validated.mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
  const token = await getSlackToken({ credentialId: validated.credentialId, botToken: validated.botToken, orgId });

  if (isMock || (!token && !validated.webhookUrl)) {
    switch (validated.operation) {
      case "sendMessage":
        return {
          mock: true,
          ok: true,
          channel: validated.channel ?? "C1234567890",
          ts: String(Date.now() / 1000),
          message: { text: validated.text, bot_id: "B_MOCK_123" },
        };
      case "createChannel":
        return {
          mock: true,
          ok: true,
          channel: { id: `C_MOCK_${Date.now()}`, name: validated.name ?? "new-channel", is_private: validated.isPrivate },
        };
      case "listChannels":
        return {
          mock: true,
          ok: true,
          channels: [
            { id: "C01", name: "general", is_channel: true },
            { id: "C02", name: "random", is_channel: true },
            { id: "C03", name: "alerts", is_channel: true },
          ],
        };
      case "postWebhook":
        return {
          mock: true,
          ok: true,
          status: "DELIVERED",
          webhookUrl: validated.webhookUrl ?? "https://hooks.slack.com/services/mock/123",
        };
      default:
        return { mock: true, operation: validated.operation };
    }
  }

  if (validated.operation === "postWebhook" || (validated.operation === "sendMessage" && validated.webhookUrl && !token)) {
    const hookUrl = validated.webhookUrl!;
    const res = await safeFetch(hookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: validated.text, blocks: validated.blocks }),
    });
    if (!res.ok) throw new Error(`Slack webhook error (${res.status}): ${await res.text()}`);
    return { ok: true, status: "DELIVERED" };
  }

  const baseUrl = "https://slack.com/api";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  };

  switch (validated.operation) {
    case "sendMessage": {
      const res = await safeFetch(`${baseUrl}/chat.postMessage`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          channel: validated.channel,
          text: validated.text,
          blocks: validated.blocks,
        }),
      });
      if (!res.ok) throw new Error(`Slack API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "createChannel": {
      const res = await safeFetch(`${baseUrl}/conversations.create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: validated.name,
          is_private: validated.isPrivate,
        }),
      });
      if (!res.ok) throw new Error(`Slack API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "listChannels": {
      const res = await safeFetch(`${baseUrl}/conversations.list?types=public_channel,private_channel&limit=100`, {
        headers,
      });
      if (!res.ok) throw new Error(`Slack API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    default:
      return { success: true };
  }
}
