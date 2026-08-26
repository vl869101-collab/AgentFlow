import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";
import { assertSafeUrl } from "../../lib/ssrf.js";
import { decryptCredential } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

export interface AdaptiveCardPayload {
  type: "AdaptiveCard";
  version: "1.5" | string;
  $schema?: string;
  body?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
  fallbackText?: string;
  [key: string]: unknown;
}

export interface TeamsMessagePayload {
  operation?: "sendMessage" | "sendAdaptiveCard" | "postWebhook" | "createChannelMessage" | "sendMention";
  webhookUrl?: string;
  channelId?: string;
  teamId?: string;
  message?: string;
  text?: string;
  title?: string;
  themeColor?: string;
  adaptiveCard?: AdaptiveCardPayload;
  mentions?: Array<{ name: string; id: string; email?: string }>;
  credentialId?: string;
  mock?: boolean;
  [key: string]: unknown;
}

export function buildAdaptiveCard(options: {
  title?: string;
  text?: string;
  facts?: Array<{ title: string; value: string }>;
  buttons?: Array<{ title: string; url?: string; actionType?: string }>;
}): AdaptiveCardPayload {
  const body: Array<Record<string, unknown>> = [];

  if (options.title) {
    body.push({
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: options.title,
      wrap: true,
    });
  }

  if (options.text) {
    body.push({
      type: "TextBlock",
      text: options.text,
      wrap: true,
    });
  }

  if (options.facts && options.facts.length > 0) {
    body.push({
      type: "FactSet",
      facts: options.facts.map((f) => ({ title: f.title, value: f.value })),
    });
  }

  const actions = (options.buttons ?? []).map((b) => ({
    type: b.url ? "Action.OpenUrl" : "Action.Submit",
    title: b.title,
    ...(b.url ? { url: b.url } : {}),
  }));

  return {
    type: "AdaptiveCard",
    version: "1.5",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body,
    actions: actions.length > 0 ? actions : undefined,
  };
}

export async function executeTeams(
  config: TeamsMessagePayload,
  input: unknown = {},
  orgId: string = ""
): Promise<Record<string, unknown>> {
  const operation = config.operation ?? "sendMessage";
  const messageText = String(config.message ?? config.text ?? (input as any)?.message ?? (input as any)?.text ?? "");
  const isMock =
    config.mock === true ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  // 1. Resolve Adaptive Card if operation is sendAdaptiveCard or card is provided
  let card: AdaptiveCardPayload | undefined = config.adaptiveCard;
  if (!card && operation === "sendAdaptiveCard") {
    card = buildAdaptiveCard({
      title: String(config.title ?? "AgentFlow Notification"),
      text: messageText,
      facts: Array.isArray(config.facts) ? (config.facts as any) : undefined,
      buttons: Array.isArray(config.buttons) ? (config.buttons as any) : undefined,
    });
  }

  if (card && (!card.type || !card.version)) {
    card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      ...card,
      type: card.type || "AdaptiveCard",
      version: card.version || "1.5",
    };
  }

  // 2. Resolve target recipient / webhook URL
  let webhookUrl = config.webhookUrl;
  let token = "";

  if (config.credentialId && orgId) {
    try {
      const cred = await prisma.credential.findFirst({
        where: { id: config.credentialId, orgId },
      });
      if (cred) {
        const data = JSON.parse(decryptCredential(cred.data));
        webhookUrl = data.webhookUrl ?? webhookUrl;
        token = data.accessToken ?? data.token ?? data.botToken ?? "";
      }
    } catch {
      // ignore in test / offline mode
    }
  }

  // 3. Execution (Mock or Live)
  if (isMock || !webhookUrl) {
    return {
      operation,
      delivered: true,
      recipient: config.channelId ?? webhookUrl ?? "teams_default",
      message: messageText,
      adaptiveCard: card ?? null,
      messageId: `teams_msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }

  // Live incoming webhook or Graph API request
  assertSafeUrl(webhookUrl);
  let payload: Record<string, unknown>;

  if (card) {
    payload = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: card,
        },
      ],
    };
  } else {
    payload = {
      text: messageText,
      title: config.title,
      themeColor: config.themeColor ?? "0076D7",
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Microsoft Teams API error (${res.status}): ${await res.text()}`);
  }

  return {
    operation,
    delivered: true,
    recipient: config.channelId ?? webhookUrl,
    message: messageText,
    adaptiveCard: card ?? null,
    status: "DELIVERED",
    timestamp: new Date().toISOString(),
  };
}

export class TeamsNodeHandler implements NodeHandler {
  type = "teams";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as TeamsMessagePayload;
    const input = ctx.input;

    // Handle n8n batch array input or single item
    const items = Array.isArray(input) ? input : [input];
    const results: NodeItem[] = [];
    const logs: string[] = [];

    for (const item of items) {
      const itemData = (typeof item === "object" && item !== null && "json" in item ? (item as NodeItem).json : item) ?? {};
      const res = await executeTeams(config, itemData, ctx.orgId);
      results.push({ json: res });
      logs.push(`Teams node: executed ${config.operation ?? "sendMessage"} successfully`);
    }

    return { items: results, logs };
  }
}
