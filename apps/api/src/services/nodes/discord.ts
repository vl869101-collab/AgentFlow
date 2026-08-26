// Discord Node Handler with Discord Webhooks and REST API v10 integration.
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";

import { safeFetch } from "../../lib/ssrf.js";

export const DiscordInputSchema = z.object({
  operation: z.enum([
    "sendWebhook",
    "sendMessage",
    "createEmbed",
  ]).default("sendWebhook"),
  webhookUrl: z.string().optional(),
  channelId: z.string().optional(),
  content: z.string().optional().default(""),
  username: z.string().optional(),
  avatarUrl: z.string().optional(),
  embeds: z.array(z.record(z.unknown())).optional(),
  botToken: z.string().optional(),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type DiscordInput = z.infer<typeof DiscordInputSchema>;

async function getDiscordToken(options: { credentialId?: string; botToken?: string; orgId?: string }): Promise<string | undefined> {
  if (options.botToken) return options.botToken;
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;

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
      where: { orgId: options.orgId, provider: "discord" },
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

export async function executeDiscord(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
): Promise<Record<string, unknown>> {
  const merged = { ...config, ...(typeof input === "object" && input !== null ? (input as object) : {}) };
  const validated = DiscordInputSchema.parse(merged);

  const isMock = validated.mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
  const token = await getDiscordToken({ credentialId: validated.credentialId, botToken: validated.botToken, orgId });

  if (isMock || (!token && !validated.webhookUrl)) {
    switch (validated.operation) {
      case "sendWebhook":
        return {
          mock: true,
          status: "DELIVERED",
          content: validated.content,
          username: validated.username ?? "AgentFlow Bot",
          webhookUrl: validated.webhookUrl ?? "https://discord.com/api/webhooks/mock/123",
        };
      case "sendMessage":
        return {
          mock: true,
          id: `mock_discord_msg_${Date.now()}`,
          channelId: validated.channelId ?? "1234567890",
          content: validated.content,
          status: "SENT",
        };
      case "createEmbed":
        return {
          mock: true,
          title: (validated as any).title ?? "Workflow Notification",
          description: validated.content || (validated as any).description || "Event triggered",
          color: 0x5865f2,
        };
      default:
        return { mock: true, operation: validated.operation };
    }
  }

  switch (validated.operation) {
    case "sendWebhook": {
      if (!validated.webhookUrl) throw new Error("webhookUrl is required for Discord sendWebhook operation");
      const res = await safeFetch(validated.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: validated.content,
          username: validated.username,
          avatar_url: validated.avatarUrl,
          embeds: validated.embeds,
        }),
      });
      if (!res.ok) throw new Error(`Discord Webhook error (${res.status}): ${await res.text()}`);
      return { status: "DELIVERED", statusCode: res.status };
    }
    case "sendMessage": {
      if (!token) throw new Error("Discord botToken or credential is required for sendMessage");
      if (!validated.channelId) throw new Error("channelId is required for Discord sendMessage");
      const res = await safeFetch(`https://discord.com/api/v10/channels/${validated.channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: validated.content,
          embeds: validated.embeds,
        }),
      });
      if (!res.ok) throw new Error(`Discord API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    default:
      return { success: true };
  }
}
