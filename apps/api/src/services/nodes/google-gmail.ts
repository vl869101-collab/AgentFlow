// Google Gmail Node Handler with Gmail API v1 and Vault OAuth2 integration.
import { z } from "zod";
import { getValidGoogleToken } from "../../lib/google-oauth.js";

export const GoogleGmailInputSchema = z.object({
  operation: z.enum([
    "sendMessage",
    "getMessages",
    "getMessage",
    "createDraft",
    "addLabel",
    "deleteMessage",
  ]).default("sendMessage"),
  to: z.string().optional(),
  subject: z.string().optional().default("(No Subject)"),
  body: z.string().optional().default(""),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  messageId: z.string().optional(),
  query: z.string().optional(),
  label: z.string().optional(),
  maxResults: z.number().optional().default(10),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type GoogleGmailInput = z.infer<typeof GoogleGmailInputSchema>;

function makeRawEmail(to: string, subject: string, body: string, cc?: string): string {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
  ].filter(Boolean);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function executeGoogleGmail(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
): Promise<Record<string, unknown>> {
  const merged = { ...config, ...(typeof input === "object" && input !== null ? (input as object) : {}) };
  const validated = GoogleGmailInputSchema.parse(merged);

  const isMock = validated.mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
  const auth = await getValidGoogleToken({ credentialId: validated.credentialId, orgId });

  if (isMock || !auth.accessToken || auth.accessToken.startsWith("mock_")) {
    switch (validated.operation) {
      case "sendMessage":
        return {
          mock: true,
          id: `mock_msg_${Date.now()}`,
          threadId: `mock_thread_${Date.now()}`,
          status: "SENT",
          to: validated.to ?? "recipient@example.com",
          subject: validated.subject,
        };
      case "getMessages":
        return {
          mock: true,
          messages: [
            { id: "msg_1", threadId: "th_1", snippet: "Welcome to AgentFlow automated email sync." },
            { id: "msg_2", threadId: "th_2", snippet: "Invoice #1042 has been generated." },
          ],
          resultSizeEstimate: 2,
        };
      case "getMessage":
        return {
          mock: true,
          id: validated.messageId ?? "msg_123",
          snippet: "This is a detailed message body retrieved from Gmail API.",
          payload: { headers: [{ name: "Subject", value: validated.subject ?? "Workflow Notification" }] },
        };
      case "createDraft":
        return {
          mock: true,
          id: `mock_draft_${Date.now()}`,
          message: { id: `draft_msg_${Date.now()}`, to: validated.to, subject: validated.subject },
        };
      case "addLabel":
        return {
          mock: true,
          id: validated.messageId ?? "msg_123",
          label: validated.label ?? "STARRED",
          updated: true,
        };
      case "deleteMessage":
        return {
          mock: true,
          id: validated.messageId ?? "msg_123",
          deleted: true,
        };
      default:
        return { mock: true, operation: validated.operation };
    }
  }

  const baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };

  switch (validated.operation) {
    case "sendMessage": {
      const raw = makeRawEmail(validated.to ?? "", validated.subject, validated.body, validated.cc);
      const res = await fetch(`${baseUrl}/messages/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "getMessages": {
      const q = validated.query ? `&q=${encodeURIComponent(validated.query)}` : "";
      const url = `${baseUrl}/messages?maxResults=${validated.maxResults}${q}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "getMessage": {
      const url = `${baseUrl}/messages/${encodeURIComponent(validated.messageId ?? "")}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "createDraft": {
      const raw = makeRawEmail(validated.to ?? "", validated.subject, validated.body, validated.cc);
      const res = await fetch(`${baseUrl}/drafts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: { raw } }),
      });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "addLabel": {
      const url = `${baseUrl}/messages/${encodeURIComponent(validated.messageId ?? "")}/modify`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ addLabelIds: [validated.label ?? "STARRED"] }),
      });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "deleteMessage": {
      const url = `${baseUrl}/messages/${encodeURIComponent(validated.messageId ?? "")}/trash`;
      const res = await fetch(url, { method: "POST", headers });
      if (!res.ok) throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
      return { id: validated.messageId, deleted: true };
    }
    default:
      return { success: true };
  }
}
