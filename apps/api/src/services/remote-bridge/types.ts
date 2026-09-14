import { z } from "zod";

// ═══════════════════════════════════════════
// OTP & Pairing Schemas (Frente A)
// ═══════════════════════════════════════════

export const OtpRecordSchema = z.object({
  code: z.string().length(6),
  orgId: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  attempts: z.number().default(0),
  maxAttempts: z.number().default(3),
  burned: z.boolean().default(false),
});
export type OtpRecord = z.infer<typeof OtpRecordSchema>;

export const GenerateOtpRequestSchema = z.object({
  orgId: z.string().optional(),
  userId: z.string().optional(),
  deviceLabel: z.string().optional(),
});
export type GenerateOtpRequest = z.infer<typeof GenerateOtpRequestSchema>;

export const VerifyOtpRequestSchema = z.object({
  code: z.string().length(6),
  deviceInfo: z.record(z.unknown()).optional(),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const PairingTokenResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  orgId: z.string(),
  userId: z.string(),
});
export type PairingTokenResult = z.infer<typeof PairingTokenResultSchema>;

// ═══════════════════════════════════════════
// xterm.js & Remote Bridge Protocol Envelopes
// ═══════════════════════════════════════════

export const BridgeClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string(),
  }),
  z.object({
    type: z.literal("pane.subscribe"),
    paneId: z.string(),
    missionId: z.string().optional(),
  }),
  z.object({
    type: z.literal("pane.input"),
    paneId: z.string(),
    data: z.string(),
  }),
  z.object({
    type: z.literal("pane.resize"),
    paneId: z.string(),
    cols: z.number(),
    rows: z.number(),
  }),
  z.object({
    type: z.literal("mission.subscribe"),
    missionId: z.string(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);
export type BridgeClientMessage = z.infer<typeof BridgeClientMessageSchema>;

export const BridgeServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth.success"),
    userId: z.string(),
    orgId: z.string(),
  }),
  z.object({
    type: z.literal("pane.output"),
    paneId: z.string(),
    data: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("mission.status"),
    missionId: z.string(),
    status: z.string(),
    panesCount: z.number(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);
export type BridgeServerMessage = z.infer<typeof BridgeServerMessageSchema>;
