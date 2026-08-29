import assert from "node:assert/strict";
import test from "node:test";

process.env.MOCK_SERVICES = "true";

const [
  { TeamsNodeHandler, buildAdaptiveCard },
  { WhatsAppNodeHandler, WhatsAppInputSchema },
  { GoogleCalendarNodeHandler, GoogleCalendarInputSchema },
  { GoogleDocsNodeHandler, GoogleDocsInputSchema, substituteTemplateVariables },
] = await Promise.all([
  import("../src/services/nodes/teams.js"),
  import("../src/services/nodes/whatsapp.js"),
  import("../src/services/nodes/google-calendar.js"),
  import("../src/services/nodes/google-docs.js"),
]);

const context = (nodeConfig: Record<string, unknown>, input: unknown = {}) => ({
  executionId: "exec-p2",
  nodeId: "node-p2",
  workflowId: "workflow-p2",
  orgId: "org-p2",
  nodeConfig,
  input,
});

test("TASK-16: Teams builds and sends Adaptive Card batches", async () => {
  const card = buildAdaptiveCard({ title: "Release", text: "Ready" });
  const result = await new TeamsNodeHandler().execute(context(
    { operation: "sendAdaptiveCard", adaptiveCard: card, channelId: "channel-1" },
    [{ json: { text: "one" } }, { json: { text: "two" } }],
  ));

  assert.equal(card.version, "1.5");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].json.delivered, true);
});

test("TASK-16: WhatsApp validates E.164 and operation payloads", async () => {
  assert.equal(WhatsAppInputSchema.safeParse({ operation: "sendMessage", to: "invalid" }).success, false);
  assert.equal(WhatsAppInputSchema.safeParse({ operation: "sendTemplate", to: "+5511999999999" }).success, false);

  const result = await new WhatsAppNodeHandler().execute(context({
    operation: "sendTemplate",
    to: "+5511999999999",
    template: { name: "release_ready", language: { code: "pt_BR" } },
  }));
  assert.equal(result.items[0].json.delivered, true);
});

test("TASK-17: Google Calendar validates CRUD inputs and chronology", async () => {
  assert.equal(GoogleCalendarInputSchema.safeParse({ operation: "deleteEvent" }).success, false);
  const result = await new GoogleCalendarNodeHandler().execute(context({
    operation: "createEvent",
    summary: "Release",
    startTime: "2026-08-29T12:00:00.000Z",
    endTime: "2026-08-29T13:00:00.000Z",
    attendees: ["owner@example.com"],
    addGoogleMeet: true,
  }));
  assert.equal(result.items[0].json.status, "confirmed");
  assert.match(String(result.items[0].json.hangoutLink), /meet\.google\.com/);
});

test("TASK-17: Google Docs validates operations and renders templates", async () => {
  assert.equal(GoogleDocsInputSchema.safeParse({ operation: "getDocument" }).success, false);
  assert.equal(substituteTemplateVariables("Hello {{name}}", { name: "Victor" }), "Hello Victor");

  const result = await new GoogleDocsNodeHandler().execute(context({
    operation: "createDocument",
    title: "Release notes",
    content: "Version {{version}}",
    variables: { version: "1.0" },
  }));
  assert.equal(result.items[0].json.title, "Release notes");
  assert.match(String(result.items[0].json.documentUrl), /docs\.google\.com\/document/);
});
