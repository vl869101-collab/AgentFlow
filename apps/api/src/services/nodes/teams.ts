import { z } from "zod";
import { safeFetch } from "../../lib/ssrf.js";
import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { isNodeMockEnabled, mergeNodeInput, resolveVaultOAuthCredential } from "./oauth.js";

const AdaptiveCardSchema = z.object({
  type: z.literal("AdaptiveCard").default("AdaptiveCard"),
  version: z.string().min(1).default("1.5"),
  $schema: z.string().url().optional(),
  body: z.array(z.record(z.unknown())).optional(),
  actions: z.array(z.record(z.unknown())).optional(),
  fallbackText: z.string().optional(),
}).passthrough();

export const TeamsInputSchema = z.object({
  operation: z.enum(["sendMessage", "sendAdaptiveCard", "postWebhook", "createChannelMessage", "sendMention"]).default("sendMessage"),
  webhookUrl: z.string().url().optional(),
  channelId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  message: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  themeColor: z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
  adaptiveCard: AdaptiveCardSchema.optional(),
  facts: z.array(z.object({ title: z.string(), value: z.string() })).optional(),
  buttons: z.array(z.object({ title: z.string().min(1), url: z.string().url().optional(), actionType: z.string().optional() })).optional(),
  mentions: z.array(z.object({ name: z.string().min(1), id: z.string().min(1), email: z.string().email().optional() })).max(20).optional(),
  credentialId: z.string().min(1).optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type TeamsInput = z.infer<typeof TeamsInputSchema>;
export type AdaptiveCardPayload = z.infer<typeof AdaptiveCardSchema>;
export type TeamsMessagePayload = TeamsInput;

export function buildAdaptiveCard(options: {
  title?: string;
  text?: string;
  facts?: Array<{ title: string; value: string }>;
  buttons?: Array<{ title: string; url?: string; actionType?: string }>;
}): AdaptiveCardPayload {
  const body: Array<Record<string, unknown>> = [];
  if (options.title) body.push({ type: "TextBlock", size: "Medium", weight: "Bolder", text: options.title, wrap: true });
  if (options.text) body.push({ type: "TextBlock", text: options.text, wrap: true });
  if (options.facts?.length) body.push({ type: "FactSet", facts: options.facts });
  const actions = (options.buttons ?? []).map((button) => ({
    type: button.url ? "Action.OpenUrl" : button.actionType ?? "Action.Submit",
    title: button.title,
    ...(button.url ? { url: button.url } : {}),
  }));
  return {
    type: "AdaptiveCard",
    version: "1.5",
    $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
    body,
    ...(actions.length ? { actions } : {}),
  };
}

function graphMessagePayload(input: TeamsInput, text: string, card?: AdaptiveCardPayload): Record<string, unknown> {
  if (card) {
    return {
      body: { contentType: "html", content: text || card.fallbackText || "Adaptive Card" },
      attachments: [{ id: "1", contentType: "application/vnd.microsoft.card.adaptive", content: JSON.stringify(card) }],
    };
  }
  if (input.operation === "sendMention" && input.mentions?.length) {
    const mentions = input.mentions.map((mention, index) => ({
      id: index,
      mentionText: mention.name,
      mentioned: { user: { id: mention.id, displayName: mention.name } },
    }));
    const tags = input.mentions.map((mention, index) => `<at id="${index}">${mention.name}</at>`).join(" ");
    return { body: { contentType: "html", content: `${tags} ${text}`.trim() }, mentions };
  }
  return { body: { contentType: "html", content: text } };
}

export async function executeTeams(
  config: Record<string, unknown>,
  input: unknown = {},
  orgId = "",
): Promise<Record<string, unknown>> {
  const validated = TeamsInputSchema.parse(mergeNodeInput(config, input));
  const operation = validated.operation;
  const message = validated.message ?? validated.text ?? "";
  const card = validated.adaptiveCard ?? (operation === "sendAdaptiveCard"
    ? buildAdaptiveCard({ title: validated.title ?? "AgentFlow Notification", text: message, facts: validated.facts, buttons: validated.buttons })
    : undefined);

  if (isNodeMockEnabled(validated.mock)) {
    return mockTeamsResult(validated, message, card);
  }

  if (validated.webhookUrl && (operation === "postWebhook" || !validated.channelId)) {
    const payload = card
      ? { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }
      : { text: message, title: validated.title, themeColor: validated.themeColor ?? "0076D7" };
    const response = await safeFetch(validated.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Microsoft Teams webhook error (${response.status}): ${await response.text()}`);
    return { operation, delivered: true, recipient: validated.webhookUrl, message, adaptiveCard: card ?? null, status: "DELIVERED" };
  }

  const oauth = await resolveVaultOAuthCredential({
    credentialId: validated.credentialId,
    orgId,
    providers: ["microsoft", "microsoft_graph", "microsoft_teams", "office365", "azure_ad"],
  });
  if (!oauth) return mockTeamsResult(validated, message, card);
  if (!validated.teamId || !validated.channelId) {
    throw new Error("teamId and channelId are required for Microsoft Graph Teams operations");
  }

  const endpoint = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(validated.teamId)}/channels/${encodeURIComponent(validated.channelId)}/messages`;
  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `${oauth.tokenType} ${oauth.accessToken}` },
    body: JSON.stringify(graphMessagePayload(validated, message, card)),
  });
  if (!response.ok) throw new Error(`Microsoft Graph Teams API error (${response.status}): ${await response.text()}`);
  const data = await response.json() as Record<string, unknown>;
  return { operation, delivered: true, recipient: validated.channelId, message, adaptiveCard: card ?? null, ...data };
}

function mockTeamsResult(input: TeamsInput, message: string, card?: AdaptiveCardPayload): Record<string, unknown> {
  return {
    operation: input.operation,
    delivered: true,
    recipient: input.channelId ?? input.webhookUrl ?? "teams_default",
    message,
    adaptiveCard: card ?? null,
    messageId: `teams_msg_${Date.now()}`,
    timestamp: new Date().toISOString(),
    mock: true,
  };
}

export class TeamsNodeHandler implements NodeHandler {
  type = "teams";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeTeams(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`Teams node: processed ${results.length} item(s)`] };
  }
}
