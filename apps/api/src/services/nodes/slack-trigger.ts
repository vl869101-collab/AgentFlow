// Slack Trigger node handler for webhook event dispatch and url_verification handshake.
import { z } from "zod";

export const SlackTriggerInputSchema = z.object({
  signingSecret: z.string().optional(),
  events: z.array(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
}).passthrough();

export type SlackTriggerInput = z.infer<typeof SlackTriggerInputSchema>;

export function executeSlackTrigger(config: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, any>) : {};

  // Slack url_verification challenge handshake
  if (raw.type === "url_verification" && typeof raw.challenge === "string") {
    return {
      challenge: raw.challenge,
      type: "url_verification",
      _trigger: "slackTrigger",
    };
  }

  // Slack event_callback
  if (raw.type === "event_callback" && raw.event) {
    const ev = raw.event;
    return {
      ...raw,
      eventType: ev.type,
      user: ev.user,
      channel: ev.channel,
      text: ev.text ?? "",
      ts: ev.ts,
      eventTs: ev.event_ts,
      threadTs: ev.thread_ts,
      _trigger: "slackTrigger",
      _config: config,
    };
  }

  // Slack slash command / webhook payload
  return {
    ...raw,
    command: raw.command,
    text: raw.text ?? raw.message?.text ?? "",
    userId: raw.user_id ?? raw.user,
    channelId: raw.channel_id ?? raw.channel,
    _trigger: "slackTrigger",
    _config: config,
  };
}
