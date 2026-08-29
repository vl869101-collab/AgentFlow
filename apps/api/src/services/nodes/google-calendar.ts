import { z } from "zod";
import { safeFetch } from "../../lib/ssrf.js";
import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { isNodeMockEnabled, mergeNodeInput, resolveVaultOAuthCredential } from "./oauth.js";

const EventDateSchema = z.union([
  z.string().min(1),
  z.object({ dateTime: z.string().min(1).optional(), date: z.string().min(1).optional(), timeZone: z.string().optional() })
    .refine((value) => Boolean(value.dateTime || value.date), { message: "dateTime or date is required" }),
]);

export const GoogleCalendarInputSchema = z.object({
  operation: z.enum(["createEvent", "listEvents", "getEvent", "updateEvent", "deleteEvent", "quickAdd"]).default("createEvent"),
  calendarId: z.string().min(1).default("primary"),
  eventId: z.string().min(1).optional(),
  summary: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().min(1).optional(),
  start: EventDateSchema.optional(),
  endTime: z.string().min(1).optional(),
  end: EventDateSchema.optional(),
  timeZone: z.string().min(1).default("UTC"),
  attendees: z.array(z.union([
    z.string().email(),
    z.object({ email: z.string().email(), displayName: z.string().optional(), responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).optional() }),
  ])).optional(),
  addGoogleMeet: z.boolean().default(false),
  conferenceData: z.record(z.unknown()).optional(),
  reminders: z.object({
    useDefault: z.boolean().optional(),
    overrides: z.array(z.object({ method: z.enum(["email", "popup"]), minutes: z.number().int().nonnegative() })).max(5).optional(),
  }).optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().int().min(1).max(2500).default(50),
  q: z.string().optional(),
  query: z.string().optional(),
  quickAddText: z.string().min(1).optional(),
  credentialId: z.string().min(1).optional(),
  mock: z.boolean().optional(),
}).passthrough().superRefine((value, ctx) => {
  if (["getEvent", "updateEvent", "deleteEvent"].includes(value.operation) && !value.eventId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["eventId"], message: `eventId is required for ${value.operation}` });
  }
  if (value.operation === "quickAdd" && !value.quickAddText && !value.summary && !value.title) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quickAddText"], message: "quickAddText is required for quickAdd" });
  }
});

export type GoogleCalendarInput = z.infer<typeof GoogleCalendarInputSchema>;
export type GoogleCalendarEventPayload = GoogleCalendarInput;
export type GoogleCalendarAttendee = Exclude<NonNullable<GoogleCalendarInput["attendees"]>[number], string>;

function normalizeEventDate(value: GoogleCalendarInput["start"], fallback: string, timeZone: string): Record<string, string> {
  if (typeof value === "string") return { dateTime: value, timeZone };
  if (value?.date) return { date: value.date };
  if (value?.dateTime) return { dateTime: value.dateTime, timeZone: value.timeZone ?? timeZone };
  return { dateTime: fallback, timeZone };
}

function validateChronology(start: Record<string, string>, end: Record<string, string>): void {
  if (!start.dateTime || !end.dateTime) return;
  const startMs = Date.parse(start.dateTime);
  const endMs = Date.parse(end.dateTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error("Calendar start and end must be valid ISO date-times");
  if (endMs <= startMs) throw new Error("Calendar end must be later than start");
}

function mockCalendarResult(input: GoogleCalendarInput, start: Record<string, string>, end: Record<string, string>): Record<string, unknown> {
  const eventId = input.eventId ?? `event_${Date.now()}`;
  const summary = input.summary ?? input.title ?? "New Calendar Event";
  const meetUrl = `https://meet.google.com/mock-${Math.random().toString(36).slice(2, 10)}`;
  if (input.operation === "listEvents") {
    return {
      operation: input.operation,
      kind: "calendar#events",
      summary: "Primary Calendar",
      items: [
        { id: "evt_sample_1", summary: "Sprint Planning", start, end, status: "confirmed" },
        { id: "evt_sample_2", summary: "Architecture Review", start, end, status: "confirmed" },
      ],
      totalResults: 2,
      mock: true,
    };
  }
  if (input.operation === "deleteEvent") return { operation: input.operation, id: eventId, deleted: true, calendarId: input.calendarId, mock: true };
  return {
    operation: input.operation,
    id: eventId,
    summary,
    description: input.description ?? "",
    location: input.location ?? "",
    startTime: start.dateTime ?? start.date,
    endTime: end.dateTime ?? end.date,
    start,
    end,
    attendees: (input.attendees ?? []).map((attendee) => typeof attendee === "string" ? { email: attendee } : attendee),
    htmlLink: `https://calendar.google.com/event?eid=${eventId}`,
    ...(input.addGoogleMeet ? { hangoutLink: meetUrl, conferenceData: { entryPoints: [{ entryPointType: "video", uri: meetUrl }] } } : {}),
    status: "confirmed",
    mock: true,
  };
}

export async function executeGoogleCalendar(
  config: Record<string, unknown>,
  input: unknown = {},
  orgId = "",
): Promise<Record<string, unknown>> {
  const validated = GoogleCalendarInputSchema.parse(mergeNodeInput(config, input));
  const startFallback = validated.startTime ?? new Date().toISOString();
  const start = normalizeEventDate(validated.start, startFallback, validated.timeZone);
  const endFallback = validated.endTime ?? new Date(Date.parse(start.dateTime ?? startFallback) + 3_600_000).toISOString();
  const end = normalizeEventDate(validated.end, endFallback, validated.timeZone);
  validateChronology(start, end);
  if (isNodeMockEnabled(validated.mock)) return mockCalendarResult(validated, start, end);

  const oauth = await resolveVaultOAuthCredential({
    credentialId: validated.credentialId,
    orgId,
    providers: ["google", "google_workspace", "google_calendar"],
  });
  const accessToken = oauth?.accessToken ?? process.env.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) return mockCalendarResult(validated, start, end);

  const calendarId = encodeURIComponent(validated.calendarId);
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  let endpoint = baseUrl;
  let method = "POST";
  let body: Record<string, unknown> | undefined;

  if (validated.operation === "listEvents") {
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: String(validated.maxResults) });
    if (validated.timeMin) params.set("timeMin", validated.timeMin);
    if (validated.timeMax) params.set("timeMax", validated.timeMax);
    if (validated.q ?? validated.query) params.set("q", validated.q ?? validated.query ?? "");
    endpoint = `${baseUrl}?${params}`;
    method = "GET";
  } else if (validated.operation === "quickAdd") {
    const params = new URLSearchParams({ text: validated.quickAddText ?? validated.summary ?? validated.title ?? "" });
    endpoint = `${baseUrl}/quickAdd?${params}`;
  } else if (validated.operation === "getEvent") {
    endpoint = `${baseUrl}/${encodeURIComponent(validated.eventId!)}`;
    method = "GET";
  } else if (validated.operation === "deleteEvent") {
    endpoint = `${baseUrl}/${encodeURIComponent(validated.eventId!)}`;
    method = "DELETE";
  } else {
    if (validated.operation === "updateEvent") {
      endpoint = `${baseUrl}/${encodeURIComponent(validated.eventId!)}`;
      method = "PATCH";
    }
    const attendees = (validated.attendees ?? []).map((attendee) => typeof attendee === "string" ? { email: attendee } : attendee);
    body = {
      summary: validated.summary ?? validated.title ?? "New Calendar Event",
      description: validated.description,
      location: validated.location,
      start,
      end,
      attendees: attendees.length ? attendees : undefined,
      reminders: validated.reminders,
      conferenceData: validated.conferenceData ?? (validated.addGoogleMeet ? {
        createRequest: { requestId: `agentflow-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
      } : undefined),
    };
    if (validated.addGoogleMeet || validated.conferenceData) endpoint += `${endpoint.includes("?") ? "&" : "?"}conferenceDataVersion=1`;
  }

  const response = await safeFetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Google Calendar API error (${response.status}): ${await response.text()}`);
  if (method === "DELETE") return { operation: validated.operation, eventId: validated.eventId, deleted: true };
  return { operation: validated.operation, ...(await response.json() as Record<string, unknown>) };
}

export class GoogleCalendarNodeHandler implements NodeHandler {
  type = "googleCalendar";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeGoogleCalendar(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`Google Calendar node: processed ${results.length} item(s)`] };
  }
}
