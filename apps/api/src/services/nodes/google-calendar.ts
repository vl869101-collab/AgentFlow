import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";
import { getValidGoogleToken } from "../../lib/google-oauth.js";

export interface GoogleCalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
}

export interface GoogleCalendarEventPayload {
  operation?: "createEvent" | "listEvents" | "getEvent" | "updateEvent" | "deleteEvent" | "quickAdd";
  calendarId?: string;
  eventId?: string;
  summary?: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  start?: string | { dateTime?: string; date?: string; timeZone?: string };
  endTime?: string;
  end?: string | { dateTime?: string; date?: string; timeZone?: string };
  timeZone?: string;
  attendees?: Array<string | GoogleCalendarAttendee>;
  addGoogleMeet?: boolean;
  conferenceData?: Record<string, unknown>;
  reminders?: { useDefault?: boolean; overrides?: Array<{ method: string; minutes: number }> };
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
  query?: string;
  quickAddText?: string;
  credentialId?: string;
  mock?: boolean;
  [key: string]: unknown;
}

export async function executeGoogleCalendar(
  config: GoogleCalendarEventPayload,
  input: unknown = {},
  orgId: string = ""
): Promise<Record<string, unknown>> {
  const operation = config.operation ?? "createEvent";
  const calendarId = encodeURIComponent(config.calendarId ?? "primary");
  const summary = String(
    config.summary ??
    config.title ??
    (input as any)?.summary ??
    (input as any)?.title ??
    "New Calendar Event"
  );
  const timeZone = config.timeZone ?? "UTC";
  const isMock =
    config.mock === true ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  // Parse start / end ISO timestamps
  let startIso: string;
  if (typeof config.start === "object" && config.start?.dateTime) {
    startIso = config.start.dateTime;
  } else if (typeof config.start === "string") {
    startIso = config.start;
  } else {
    startIso = String(config.startTime ?? (input as any)?.startTime ?? new Date().toISOString());
  }

  let endIso: string;
  if (typeof config.end === "object" && config.end?.dateTime) {
    endIso = config.end.dateTime;
  } else if (typeof config.end === "string") {
    endIso = config.end;
  } else {
    endIso = String(
      config.endTime ?? (input as any)?.endTime ?? new Date(new Date(startIso).getTime() + 3600000).toISOString()
    );
  }

  // Format attendees
  const attendeesList: GoogleCalendarAttendee[] = (config.attendees ?? []).map((att) =>
    typeof att === "string" ? { email: att } : att
  );

  let token = "";
  if (config.credentialId && orgId) {
    try {
      const auth = await getValidGoogleToken({ credentialId: config.credentialId, orgId });
      token = auth.accessToken;
    } catch {
      // offline / mock mode fallback
    }
  }

  // Mock execution
  if (isMock || !token) {
    const mockEventId = config.eventId ?? `event_${Date.now()}`;
    const meetCode = `mock-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
    const meetUrl = `https://meet.google.com/${meetCode}`;

    if (operation === "listEvents") {
      return {
        operation,
        kind: "calendar#events",
        summary: "Primary Calendar",
        items: [
          {
            id: `evt_sample_1`,
            summary: "Sprint Planning",
            start: { dateTime: new Date().toISOString(), timeZone },
            end: { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone },
            hangoutLink: meetUrl,
            status: "confirmed",
          },
          {
            id: `evt_sample_2`,
            summary: "Product Architecture Review",
            start: { dateTime: new Date(Date.now() + 86400000).toISOString(), timeZone },
            end: { dateTime: new Date(Date.now() + 90000000).toISOString(), timeZone },
            status: "confirmed",
          },
        ],
        totalResults: 2,
        mock: true,
      };
    }

    if (operation === "getEvent") {
      return {
        operation,
        id: mockEventId,
        summary,
        description: config.description ?? "Mock event details",
        start: { dateTime: startIso, timeZone },
        end: { dateTime: endIso, timeZone },
        hangoutLink: meetUrl,
        status: "confirmed",
        mock: true,
      };
    }

    if (operation === "deleteEvent") {
      return {
        operation,
        id: mockEventId,
        deleted: true,
        calendarId: decodeURIComponent(calendarId),
        timestamp: new Date().toISOString(),
        mock: true,
      };
    }

    return {
      operation,
      id: mockEventId,
      summary,
      description: config.description ?? "",
      location: config.location ?? "",
      startTime: startIso,
      endTime: endIso,
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      attendees: attendeesList,
      htmlLink: `https://calendar.google.com/event?eid=${mockEventId}`,
      hangoutLink: meetUrl,
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: meetUrl, label: meetUrl }],
        conferenceSolution: { key: { type: "hangoutsMeet" }, name: "Google Meet" },
      },
      status: "confirmed",
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }

  // Live Google Calendar API v3
  let endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  let method = "POST";
  let body: Record<string, unknown> | undefined;

  if (operation === "listEvents") {
    const qParams = new URLSearchParams();
    if (config.timeMin) qParams.set("timeMin", config.timeMin);
    if (config.timeMax) qParams.set("timeMax", config.timeMax);
    if (config.maxResults) qParams.set("maxResults", String(config.maxResults));
    if (config.q ?? config.query) qParams.set("q", String(config.q ?? config.query));
    qParams.set("singleEvents", "true");
    qParams.set("orderBy", "startTime");
    endpoint = `${endpoint}?${qParams.toString()}`;
    method = "GET";
  } else if (operation === "getEvent") {
    endpoint = `${endpoint}/${encodeURIComponent(config.eventId!)}`;
    method = "GET";
  } else if (operation === "deleteEvent") {
    endpoint = `${endpoint}/${encodeURIComponent(config.eventId!)}`;
    method = "DELETE";
  } else if (operation === "updateEvent") {
    endpoint = `${endpoint}/${encodeURIComponent(config.eventId!)}`;
    method = "PATCH";
    body = {
      summary,
      description: config.description,
      location: config.location,
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      attendees: attendeesList.length > 0 ? attendeesList : undefined,
    };
  } else {
    // createEvent / quickAdd
    body = {
      summary,
      description: config.description,
      location: config.location,
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      attendees: attendeesList.length > 0 ? attendeesList : undefined,
      conferenceData: config.addGoogleMeet !== false ? {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      } : undefined,
    };
    endpoint = `${endpoint}?conferenceDataVersion=1`;
  }

  const res = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Google Calendar API error (${res.status}): ${await res.text()}`);
  }

  if (method === "DELETE") {
    return { operation, deleted: true, eventId: config.eventId };
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    operation,
    ...data,
    timestamp: new Date().toISOString(),
  };
}

export class GoogleCalendarNodeHandler implements NodeHandler {
  type = "googleCalendar";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as GoogleCalendarEventPayload;
    const input = ctx.input;

    const items = Array.isArray(input) ? input : [input];
    const results: NodeItem[] = [];
    const logs: string[] = [];

    for (const item of items) {
      const itemData = (typeof item === "object" && item !== null && "json" in item ? (item as NodeItem).json : item) ?? {};
      const res = await executeGoogleCalendar(config, itemData, ctx.orgId);
      results.push({ json: res });
      logs.push(`Google Calendar: ${config.operation ?? "createEvent"} completed (${res.summary ?? res.id})`);
    }

    return { items: results, logs };
  }
}
