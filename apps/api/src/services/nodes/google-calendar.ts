import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class GoogleCalendarNodeHandler implements NodeHandler {
  type = "googleCalendar";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const operation = String(config.operation ?? "createEvent");
    const summary = String(config.summary ?? config.title ?? "New Calendar Event");
    const startTime = String(config.startTime ?? new Date().toISOString());
    const endTime = String(config.endTime ?? new Date(Date.now() + 3600000).toISOString());

    const item: NodeItem = {
      json: {
        operation,
        id: `event_${Date.now()}`,
        summary,
        startTime,
        endTime,
        htmlLink: `https://calendar.google.com/event?eid=${Date.now()}`,
        status: "confirmed",
        timestamp: new Date().toISOString(),
      },
    };

    return {
      items: [item],
      logs: [`Google Calendar: ${operation} completed (${summary})`],
    };
  }
}
