import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";
import { decryptCredential } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

export interface WhatsAppTemplatePayload {
  name: string;
  language: { code: string };
  components?: Array<{
    type: "header" | "body" | "button";
    sub_type?: string;
    index?: number;
    parameters?: Array<{
      type: "text" | "currency" | "date_time" | "image" | "document" | "video";
      text?: string;
      [key: string]: unknown;
    }>;
  }>;
}

export interface WhatsAppMediaPayload {
  type: "image" | "document" | "audio" | "video" | "sticker";
  link?: string;
  id?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppInteractiveButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

export interface WhatsAppPayload {
  operation?: "sendMessage" | "sendTemplate" | "sendMedia" | "sendInteractiveButtons" | "sendLocation" | "sendReaction";
  phoneNumberId?: string;
  to?: string;
  recipient?: string;
  message?: string;
  text?: string;
  previewUrl?: boolean;
  template?: WhatsAppTemplatePayload;
  media?: WhatsAppMediaPayload;
  buttons?: WhatsAppInteractiveButton[];
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  credentialId?: string;
  systemUserToken?: string;
  mock?: boolean;
  [key: string]: unknown;
}

export async function executeWhatsApp(
  config: WhatsAppPayload,
  input: unknown = {},
  orgId: string = ""
): Promise<Record<string, unknown>> {
  const operation = config.operation ?? "sendMessage";
  const rawTo = String(config.to ?? config.recipient ?? (input as any)?.to ?? (input as any)?.recipient ?? "");
  const to = rawTo.replace(/[^0-9+]/g, "");
  const messageText = String(config.message ?? config.text ?? (input as any)?.message ?? (input as any)?.text ?? "");
  const isMock =
    config.mock === true ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  // Resolve token and phone number ID
  let token = config.systemUserToken ?? process.env.WHATSAPP_SYSTEM_USER_TOKEN ?? process.env.META_ACCESS_TOKEN ?? "";
  let phoneNumberId = config.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "100000000000000";

  if (config.credentialId && orgId) {
    try {
      const cred = await prisma.credential.findFirst({
        where: { id: config.credentialId, orgId },
      });
      if (cred) {
        const data = JSON.parse(decryptCredential(cred.data));
        token = data.accessToken ?? data.token ?? data.systemUserToken ?? token;
        phoneNumberId = data.phoneNumberId ?? phoneNumberId;
      }
    } catch {
      // offline / mock fallback
    }
  }

  // Construct Meta Graph API payload
  let metaPayload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  switch (operation) {
    case "sendTemplate": {
      const template = config.template ?? {
        name: "hello_world",
        language: { code: "en_US" },
      };
      metaPayload.type = "template";
      metaPayload.template = template;
      break;
    }
    case "sendMedia": {
      const media = config.media ?? { type: "image", link: "https://example.com/image.jpg" };
      metaPayload.type = media.type;
      metaPayload[media.type] = {
        ...(media.link ? { link: media.link } : { id: media.id }),
        ...(media.caption ? { caption: media.caption } : {}),
        ...(media.filename ? { filename: media.filename } : {}),
      };
      break;
    }
    case "sendInteractiveButtons": {
      const buttons = config.buttons ?? [
        { type: "reply", reply: { id: "btn_1", title: "Confirm" } },
        { type: "reply", reply: { id: "btn_2", title: "Cancel" } },
      ];
      metaPayload.type = "interactive";
      metaPayload.interactive = {
        type: "button",
        body: { text: messageText || "Please choose an option:" },
        action: { buttons },
      };
      break;
    }
    case "sendLocation": {
      const loc = config.location ?? { latitude: -23.5505, longitude: -46.6333, name: "Office", address: "Av. Paulista" };
      metaPayload.type = "location";
      metaPayload.location = loc;
      break;
    }
    case "sendReaction": {
      const rx = config.reaction ?? { message_id: `wamid.HBgM${Date.now()}`, emoji: "👍" };
      metaPayload.type = "reaction";
      metaPayload.reaction = rx;
      break;
    }
    case "sendMessage":
    default: {
      metaPayload.type = "text";
      metaPayload.text = {
        preview_url: Boolean(config.previewUrl),
        body: messageText || "Hello from AgentFlow WhatsApp integration",
      };
      break;
    }
  }

  // Mock execution
  if (isMock || !token) {
    const mockMessageId = `wamid.HBgM${Date.now()}`;
    return {
      operation,
      delivered: true,
      to,
      message: messageText,
      template: config.template ?? null,
      messaging_product: "whatsapp",
      contacts: [{ input: to, wa_id: to.replace("+", "") }],
      messages: [{ id: mockMessageId, message_status: "accepted" }],
      messageId: mockMessageId,
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }

  // Live Meta WhatsApp Cloud API v20.0
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(metaPayload),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp Cloud API error (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    operation,
    delivered: true,
    to,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

export class WhatsAppNodeHandler implements NodeHandler {
  type = "whatsapp";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as WhatsAppPayload;
    const input = ctx.input;

    const items = Array.isArray(input) ? input : [input];
    const results: NodeItem[] = [];
    const logs: string[] = [];

    for (const item of items) {
      const itemData = (typeof item === "object" && item !== null && "json" in item ? (item as NodeItem).json : item) ?? {};
      const res = await executeWhatsApp(config, itemData, ctx.orgId);
      results.push({ json: res });
      logs.push(`WhatsApp Cloud API: sent ${config.operation ?? "sendMessage"} to ${res.to ?? config.to}`);
    }

    return { items: results, logs };
  }
}
