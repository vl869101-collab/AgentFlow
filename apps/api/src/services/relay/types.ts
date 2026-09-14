import { z } from "zod";

// ═══════════════════════════════════════════
// Frame Types & Protocols (Dia 71)
// ═══════════════════════════════════════════

export const RelayFrameTypeSchema = z.enum([
  "AGENT_REGISTER",
  "CLIENT_PAIR_REQUEST",
  "CLIENT_PAIR_CHALLENGE",
  "TUNNEL_ESTABLISHED",
  "TUNNEL_DATA",
  "VOICE_COMMAND_INPUT",
  "VOICE_FEEDBACK_OUTPUT",
  "OVERCLOCK_IPC_DISPATCH",
  "HEARTBEAT_PING",
  "HEARTBEAT_PONG",
  "ERROR",
]);

export type RelayFrameType = z.infer<typeof RelayFrameTypeSchema>;

export const RelayMessageFrameSchema = z.object({
  version: z.literal("1.0.0").default("1.0.0"),
  id: z.string(), // UUIDv4
  tunnelId: z.string(), // Identificador do nó/túnel
  type: RelayFrameTypeSchema,
  timestamp: z.number(), // Epoch ms
  signature: z.string().optional(), // Assinatura HMAC-SHA256
  payload: z.unknown().default({}),
});

export type RelayMessageFrame<T = unknown> = z.infer<typeof RelayMessageFrameSchema> & {
  payload?: T;
};

// ═══════════════════════════════════════════
// Payload Schemas
// ═══════════════════════════════════════════

export const AgentRegisterPayloadSchema = z.object({
  nodeId: z.string(),
  nodeName: z.string().optional(),
  apiKey: z.string(),
  capabilities: z.array(z.string()).default(["vnc", "pty", "novnc", "jarvis"]),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentRegisterPayload = z.infer<typeof AgentRegisterPayloadSchema>;

export const PairInitRequestSchema = z.object({
  nodeId: z.string().optional(),
  orgId: z.string().optional(),
  userId: z.string().optional(),
  ttlSeconds: z.number().min(30).max(600).default(120),
});
export type PairInitRequest = z.infer<typeof PairInitRequestSchema>;

export const PairInitResponseSchema = z.object({
  otp: z.string(),
  tunnelId: z.string(),
  relayHost: z.string(),
  handshakeToken: z.string(),
  qrPayload: z.string(),
  expiresAt: z.string(),
  ttlSeconds: z.number(),
});
export type PairInitResponse = z.infer<typeof PairInitResponseSchema>;

export const PairConfirmRequestSchema = z.object({
  otp: z.string(),
  handshakeToken: z.string().optional(),
  deviceId: z.string().optional(),
  deviceInfo: z.record(z.unknown()).optional(),
});
export type PairConfirmRequest = z.infer<typeof PairConfirmRequestSchema>;

export const PairConfirmResponseSchema = z.object({
  success: z.boolean(),
  tunnelId: z.string(),
  sessionToken: z.string(),
  relayWsUrl: z.string(),
  nodeId: z.string(),
  expiresAt: z.string(),
});
export type PairConfirmResponse = z.infer<typeof PairConfirmResponseSchema>;

export const TunnelDataPayloadSchema = z.object({
  channel: z.enum(["vnc", "novnc", "pty", "ipc", "audio"]),
  streamId: z.string().optional(),
  data: z.string(), // Base64 ou string de texto (ex: xterm / frames)
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});
export type TunnelDataPayload = z.infer<typeof TunnelDataPayloadSchema>;

export const VoiceCommandInputPayloadSchema = z.object({
  transcription: z.string(),
  confidence: z.number().default(1.0),
  locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
  clientDeviceId: z.string().optional(),
});
export type VoiceCommandInputPayload = z.infer<typeof VoiceCommandInputPayloadSchema>;

export const VoiceFeedbackOutputPayloadSchema = z.object({
  textResponse: string(),
  audioBase64: z.string().optional(),
  actionTaken: z.string(),
  paneIdAffected: z.string().optional(),
});
function string() {
  return z.string();
}
export type VoiceFeedbackOutputPayload = z.infer<typeof VoiceFeedbackOutputPayloadSchema>;

export interface ActiveTunnelSession {
  tunnelId: string;
  nodeId: string;
  nodeName: string;
  orgId: string;
  connectedAt: number;
  lastHeartbeat: number;
  capabilities: string[];
  clientCount: number;
  status: "online" | "paired" | "idle";
}
