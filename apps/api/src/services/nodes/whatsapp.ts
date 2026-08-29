import { z } from "zod";
import { safeFetch } from "../../lib/ssrf.js";
import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { isNodeMockEnabled, mergeNodeInput, resolveVaultOAuthCredential } from "./oauth.js";

const PhoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "WhatsApp recipient must be an E.164 phone number");
const TemplateSchema = z.object({
  name: z.string().min(1),
  language: z.object({ code: z.string().min(2) }).default({ code: "en_US" }),
  components: z.array(z.object({
    type: z.enum(["header", "body", "button"]),
    sub_type: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
    parameters: z.array(z.object({
      type: z.enum(["text", "currency", "date_time", "image", "document", "video"]),
      text: z.string().optional(),
    }).passthrough()).optional(),
  })).optional(),
});
const MediaSchema = z.object({
  type: z.enum(["image", "document", "audio", "video", "sticker"]),
  link: z.string().url().optional(),
  id: z.string().min(1).optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
}).refine((media) => Boolean(media.link || media.id), { message: "WhatsApp media requires link or id" });

export const WhatsAppInputSchema = z.object({
  operation: z.enum(["sendMessage", "sendTemplate", "sendMedia", "sendInteractiveButtons", "sendLocation", "sendReaction"]).default("sendMessage"),
  phoneNumberId: z.string().min(1).optional(),
  to: PhoneSchema.optional(),
  recipient: PhoneSchema.optional(),
  message: z.string().optional(),
  text: z.string().optional(),
  previewUrl: z.boolean().optional().default(false),
  template: TemplateSchema.optional(),
  media: MediaSchema.optional(),
  buttons: z.array(z.object({
    type: z.literal("reply"),
    reply: z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(20) }),
  })).min(1).max(3).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  reaction: z.object({ message_id: z.string().min(1), emoji: z.string().min(1).max(16) }).optional(),
  credentialId: z.string().min(1).optional(),
  mock: z.boolean().optional(),
}).passthrough().superRefine((value, ctx) => {
  if (!value.to && !value.recipient) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "WhatsApp recipient is required" });
  if (value.operation === "sendTemplate" && !value.template) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["template"], message: "template is required" });
  if (value.operation === "sendMedia" && !value.media) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["media"], message: "media is required" });
  if (value.operation === "sendInteractiveButtons" && !value.buttons) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["buttons"], message: "buttons are required" });
  if (value.operation === "sendLocation" && !value.location) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["location"], message: "location is required" });
  if (value.operation === "sendReaction" && !value.reaction) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reaction"], message: "reaction is required" });
});

export type WhatsAppInput = z.infer<typeof WhatsAppInputSchema>;
export type WhatsAppPayload = WhatsAppInput;
export type WhatsAppTemplatePayload = z.infer<typeof TemplateSchema>;
export type WhatsAppMediaPayload = z.infer<typeof MediaSchema>;
export type WhatsAppInteractiveButton = NonNullable<WhatsAppInput["buttons"]>[number];

function buildMetaPayload(input: WhatsAppInput, to: string): Record<string, unknown> {
  const base: Record<string, unknown> = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, "") };
  const message = input.message ?? input.text ?? "";
  switch (input.operation) {
    case "sendTemplate": return { ...base, type: "template", template: input.template };
    case "sendMedia": {
      const media = input.media!;
      return {
        ...base,
        type: media.type,
        [media.type]: {
          ...(media.link ? { link: media.link } : { id: media.id }),
          ...(media.caption ? { caption: media.caption } : {}),
          ...(media.filename ? { filename: media.filename } : {}),
        },
      };
    }
    case "sendInteractiveButtons":
      return { ...base, type: "interactive", interactive: { type: "button", body: { text: message }, action: { buttons: input.buttons } } };
    case "sendLocation": return { ...base, type: "location", location: input.location };
    case "sendReaction": return { ...base, type: "reaction", reaction: input.reaction };
    default: return { ...base, type: "text", text: { preview_url: input.previewUrl, body: message } };
  }
}

function mockWhatsAppResult(input: WhatsAppInput, to: string): Record<string, unknown> {
  const messageId = `wamid.HBgM${Date.now()}`;
  return {
    operation: input.operation,
    delivered: true,
    to,
    message: input.message ?? input.text ?? "",
    template: input.template ?? null,
    messaging_product: "whatsapp",
    contacts: [{ input: to, wa_id: to.replace(/^\+/, "") }],
    messages: [{ id: messageId, message_status: "accepted" }],
    messageId,
    timestamp: new Date().toISOString(),
    mock: true,
  };
}

export async function executeWhatsApp(
  config: Record<string, unknown>,
  input: unknown = {},
  orgId = "",
): Promise<Record<string, unknown>> {
  const validated = WhatsAppInputSchema.parse(mergeNodeInput(config, input));
  const to = validated.to ?? validated.recipient!;
  if (isNodeMockEnabled(validated.mock)) return mockWhatsAppResult(validated, to);

  const oauth = await resolveVaultOAuthCredential({
    credentialId: validated.credentialId,
    orgId,
    providers: ["whatsapp_business", "whatsapp", "meta", "meta_whatsapp"],
  });
  const accessToken = oauth?.accessToken ?? process.env.WHATSAPP_SYSTEM_USER_TOKEN ?? process.env.META_ACCESS_TOKEN;
  const vaultPhoneNumberId = oauth?.data.phoneNumberId ?? oauth?.data.phone_number_id;
  const phoneNumberId = validated.phoneNumberId
    ?? (vaultPhoneNumberId ? String(vaultPhoneNumberId) : undefined)
    ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken) return mockWhatsAppResult(validated, to);
  if (!phoneNumberId) throw new Error("phoneNumberId is required for WhatsApp Cloud API");

  const response = await safeFetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(buildMetaPayload(validated, to)),
  });
  if (!response.ok) throw new Error(`WhatsApp Cloud API error (${response.status}): ${await response.text()}`);
  const data = await response.json() as Record<string, unknown>;
  return { operation: validated.operation, delivered: true, to, ...data, timestamp: new Date().toISOString() };
}

export interface WhatsAppStatusEvent {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string;
  recipientId: string;
  conversation?: {
    id?: string;
    origin?: { type?: string };
    expirationTimestamp?: string;
  };
  pricing?: {
    pricingModel?: string;
    billable?: boolean;
    category?: string;
  };
  errors?: Array<{ code: number; title: string; message?: string; errorData?: Record<string, unknown> }>;
  raw?: Record<string, unknown>;
}

export interface WhatsAppInboundMessage {
  messageId: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "document" | "audio" | "video" | "interactive" | "location" | "reaction" | string;
  text?: string;
  buttonPayload?: { id?: string; title?: string };
  media?: { id?: string; mimeType?: string; sha256?: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { messageId: string; emoji: string };
  raw?: Record<string, unknown>;
}

export interface ParsedWhatsAppWebhook {
  entryType: "status_update" | "inbound_message" | "mixed" | "unknown";
  statuses: WhatsAppStatusEvent[];
  messages: WhatsAppInboundMessage[];
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  raw: Record<string, unknown>;
}

/**
 * Parses and normalizes incoming Meta / WhatsApp Cloud API webhook payloads.
 * Supports DLR (Delivery Status Reports: sent, delivered, read, failed) & inbound messages.
 */
export function parseWhatsAppWebhookPayload(body: unknown): ParsedWhatsAppWebhook {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const statuses: WhatsAppStatusEvent[] = [];
  const messages: WhatsAppInboundMessage[] = [];
  let phoneNumberId: string | undefined;
  let displayPhoneNumber: string | undefined;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const val = change?.value;
      if (!val || typeof val !== "object") continue;

      if (val.metadata) {
        phoneNumberId = val.metadata.phone_number_id ? String(val.metadata.phone_number_id) : phoneNumberId;
        displayPhoneNumber = val.metadata.display_phone_number ? String(val.metadata.display_phone_number) : displayPhoneNumber;
      }

      // 1. Process Status Events (DLR: sent, delivered, read, failed)
      if (Array.isArray(val.statuses)) {
        for (const st of val.statuses) {
          if (!st || typeof st !== "object") continue;
          const statusEvent: WhatsAppStatusEvent = {
            messageId: String(st.id ?? ""),
            status: String(st.status ?? "unknown").toLowerCase(),
            timestamp: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
            recipientId: String(st.recipient_id ?? ""),
            conversation: st.conversation ? {
              id: st.conversation.id ? String(st.conversation.id) : undefined,
              origin: st.conversation.origin,
              expirationTimestamp: st.conversation.expiration_timestamp,
            } : undefined,
            pricing: st.pricing ? {
              pricingModel: st.pricing.pricing_model,
              billable: Boolean(st.pricing.billable),
              category: st.pricing.category,
            } : undefined,
            errors: Array.isArray(st.errors) ? st.errors.map((e: any) => ({
              code: Number(e.code ?? 0),
              title: String(e.title ?? ""),
              message: e.message ? String(e.message) : undefined,
              errorData: e.error_data,
            })) : undefined,
            raw: st,
          };
          statuses.push(statusEvent);
        }
      }

      // 2. Process Inbound Messages
      if (Array.isArray(val.messages)) {
        for (const msg of val.messages) {
          if (!msg || typeof msg !== "object") continue;
          const type = String(msg.type ?? "text");
          const inbound: WhatsAppInboundMessage = {
            messageId: String(msg.id ?? ""),
            from: String(msg.from ?? ""),
            timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
            type,
            text: msg.text?.body ? String(msg.text.body) : undefined,
            buttonPayload: msg.interactive?.button_reply ? {
              id: msg.interactive.button_reply.id,
              title: msg.interactive.button_reply.title,
            } : undefined,
            media: msg[type]?.id ? {
              id: String(msg[type].id),
              mimeType: msg[type].mime_type,
              sha256: msg[type].sha256,
              caption: msg[type].caption,
            } : undefined,
            location: msg.location ? {
              latitude: Number(msg.location.latitude ?? 0),
              longitude: Number(msg.location.longitude ?? 0),
              name: msg.location.name,
              address: msg.location.address,
            } : undefined,
            reaction: msg.reaction ? {
              messageId: String(msg.reaction.message_id ?? ""),
              emoji: String(msg.reaction.emoji ?? ""),
            } : undefined,
            raw: msg,
          };
          messages.push(inbound);
        }
      }
    }
  }

  let entryType: ParsedWhatsAppWebhook["entryType"] = "unknown";
  if (statuses.length > 0 && messages.length > 0) entryType = "mixed";
  else if (statuses.length > 0) entryType = "status_update";
  else if (messages.length > 0) entryType = "inbound_message";

  return {
    entryType,
    statuses,
    messages,
    phoneNumberId,
    displayPhoneNumber,
    raw: root,
  };
}

export class WhatsAppNodeHandler implements NodeHandler {
  type = "whatsapp";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeWhatsApp(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`WhatsApp node: processed ${results.length} item(s)`] };
  }
}
