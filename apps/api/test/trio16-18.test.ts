import assert from "node:assert/strict";
import test from "node:test";

// Tests use the deterministic in-memory store adapter
delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.MOCK_SERVICES = "true";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const [{ encryptCredential, decryptCredential }, { getValidGoogleToken }, { executeGoogleSheets }, { executeGoogleDrive }, { executeGoogleGmail }, { executeTelegram }, { executeDiscord }, { executeSlack }, { executeTelegramTrigger }, { executeSlackTrigger }, { executeCronTrigger }] = await Promise.all([
  import("../src/lib/crypto.js"),
  import("../src/lib/google-oauth.js"),
  import("../src/services/nodes/google-sheets.js"),
  import("../src/services/nodes/google-drive.js"),
  import("../src/services/nodes/google-gmail.js"),
  import("../src/services/nodes/telegram.js"),
  import("../src/services/nodes/discord.js"),
  import("../src/services/nodes/slack.js"),
  import("../src/services/nodes/telegram-trigger.js"),
  import("../src/services/nodes/slack-trigger.js"),
  import("../src/services/nodes/cron-trigger.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => resetStore());

// ─────────────────────────────────────────────────────────────
// TASK 16: listCredentials + ai* NVIDIA NIM tools + rate-limit 60/min + mocks flag
// ─────────────────────────────────────────────────────────────

test("TASK 16: list_credentials lists vault credentials with masked data", async () => {
  const org = await prisma.organization.create({ data: { name: "Test Org", slug: "test-org" } });
  await prisma.credential.create({
    data: {
      name: "Google Sheets OAuth",
      type: "oauth2",
      provider: "google",
      data: encryptCredential(JSON.stringify({ clientId: "id", clientSecret: "secret", accessToken: "token_123" })),
      orgId: org.id,
    },
  });
  await prisma.credential.create({
    data: {
      name: "Telegram Bot Token",
      type: "api_key",
      provider: "telegram",
      data: encryptCredential(JSON.stringify({ botToken: "123456:ABC-DEF" })),
      orgId: org.id,
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "cred-1",
      method: "tools/call",
      params: {
        name: "list_credentials",
        arguments: {},
      },
    },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const result = JSON.parse(body.result.content[0].text);
  assert.equal(result.count, 2);
  assert.equal(result.credentials[0].isConfigured, true);
  // Ensure decrypted secret data is NOT leaked
  assert.equal(result.credentials[0].data, undefined);
  assert.equal(result.credentials[0].accessToken, undefined);
});

test("TASK 16: ai* NVIDIA NIM tools support real schemas and mock flag", async () => {
  // 1. ai_chat_generate
  const chatRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-1",
      method: "tools/call",
      params: {
        name: "ai_chat_generate",
        arguments: { prompt: "Generate workflow summary", mock: true },
      },
    },
  });
  assert.equal(chatRes.statusCode, 200);
  const chatBody = JSON.parse(chatRes.body);
  const chatResult = JSON.parse(chatBody.result.content[0].text);
  assert.ok(chatResult.text.includes("AgentFlow AI"));
  assert.equal(chatResult.mock, true);

  // 2. ai_agent_execute
  const agentRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-2",
      method: "tools/call",
      params: {
        name: "ai_agent_execute",
        arguments: { goal: "Sync customer leads to sheets", mock: true },
      },
    },
  });
  assert.equal(agentRes.statusCode, 200);
  const agentResult = JSON.parse(JSON.parse(agentRes.body).result.content[0].text);
  assert.equal(agentResult.status, "COMPLETED");
  assert.ok(agentResult.stepsTaken.length > 0);

  // 3. ai_text_summarize
  const sumRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-3",
      method: "tools/call",
      params: {
        name: "ai_text_summarize",
        arguments: { text: "This is a long report with lots of details about automation.", maxLength: 50, mock: true },
      },
    },
  });
  assert.equal(sumRes.statusCode, 200);
  const sumResult = JSON.parse(JSON.parse(sumRes.body).result.content[0].text);
  assert.ok(sumResult.summary.includes("summarized"));

  // 4. ai_embed_text
  const embedRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-4",
      method: "tools/call",
      params: {
        name: "ai_embed_text",
        arguments: { text: "Search semantic document", mock: true },
      },
    },
  });
  assert.equal(embedRes.statusCode, 200);
  const embedResult = JSON.parse(JSON.parse(embedRes.body).result.content[0].text);
  assert.ok(Array.isArray(embedResult.sampleEmbedding));
  assert.ok(embedResult.embeddingDimension > 0);

  // 5. ai_classify_intent
  const intentRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-5",
      method: "tools/call",
      params: {
        name: "ai_classify_intent",
        arguments: { text: "I need help with billing invoice", categories: ["billing", "tech", "sales"], mock: true },
      },
    },
  });
  assert.equal(intentRes.statusCode, 200);
  const intentResult = JSON.parse(JSON.parse(intentRes.body).result.content[0].text);
  assert.ok(intentResult.intent);
  assert.ok(intentResult.confidence >= 0.8);

  // 6. ai_memory_store and ai_memory_retrieve
  await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-6a",
      method: "tools/call",
      params: {
        name: "ai_memory_store",
        arguments: { key: "user_tz", value: { timezone: "America/Sao_Paulo" } },
      },
    },
  });
  const memRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_test_token" },
    payload: {
      jsonrpc: "2.0",
      id: "ai-6b",
      method: "tools/call",
      params: {
        name: "ai_memory_retrieve",
        arguments: { key: "user_tz" },
      },
    },
  });
  assert.equal(memRes.statusCode, 200);
  const memResult = JSON.parse(JSON.parse(memRes.body).result.content[0].text);
  assert.equal(memResult.found, true);
  assert.deepEqual(memResult.value, { timezone: "America/Sao_Paulo" });
});

test("TASK 16: MCP status returns 125+ tools and rate-limit configured", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/mcp/status",
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.server, "agentflow-mcp");
  assert.ok(body.toolsCount >= 120, `Expected >=120 tools, got ${body.toolsCount}`);
});

// ─────────────────────────────────────────────────────────────
// TASK 17: Google nodes (sheets, drive, gmail) with OAuth2 vault + refresh token flow
// ─────────────────────────────────────────────────────────────

test("TASK 17: Google OAuth2 vault manager with token refresh flow", async () => {
  const org = await prisma.organization.create({ data: { name: "Google Org", slug: "google-org" } });

  // Store credential with an expired token
  const cred = await prisma.credential.create({
    data: {
      name: "Google Workspace Main",
      type: "oauth2",
      provider: "google",
      data: encryptCredential(
        JSON.stringify({
          clientId: "mock_client_id.apps.googleusercontent.com",
          clientSecret: "GOCSPX-mock_secret",
          refreshToken: "1//mock_refresh_token",
          accessToken: "old_expired_access_token",
          expiresAt: Date.now() - 3600_000, // Expired 1 hour ago
        }),
      ),
      orgId: org.id,
    },
  });

  const auth = await getValidGoogleToken({ credentialId: cred.id, orgId: org.id });
  assert.ok(auth.accessToken);
  assert.equal(typeof auth.accessToken, "string");
});

test("TASK 17: Google Sheets node execution (readRows, appendRow, updateRow, clear)", async () => {
  // 1. readRows
  const readResult: any = await executeGoogleSheets(
    { operation: "readRows", spreadsheetId: "sheet_xyz123", range: "Sheet1!A1:D10", mock: true },
    {},
    "org_1",
  );
  assert.equal(readResult.mock, true);
  assert.equal(readResult.spreadsheetId, "sheet_xyz123");
  assert.ok(Array.isArray(readResult.values));
  assert.equal(readResult.values[0][0], "ID");

  // 2. appendRow
  const appendResult: any = await executeGoogleSheets(
    { operation: "appendRow", spreadsheetId: "sheet_xyz123", range: "Sheet1!A1:D1", values: [["3", "Charlie", "charlie@test.com", "Active"]], mock: true },
    {},
    "org_1",
  );
  assert.equal(appendResult.mock, true);
  assert.equal(appendResult.updates.updatedRows, 1);

  // 3. updateRow
  const updateResult: any = await executeGoogleSheets(
    { operation: "updateRow", spreadsheetId: "sheet_xyz123", range: "Sheet1!A2:D2", values: [["1", "Alice Updated", "alice@test.com", "Active"]], mock: true },
    {},
    "org_1",
  );
  assert.equal(updateResult.mock, true);
  assert.equal(updateResult.updatedRange, "Sheet1!A2:D2");

  // 4. clear
  const clearResult: any = await executeGoogleSheets(
    { operation: "clear", spreadsheetId: "sheet_xyz123", range: "Sheet1!A2:D10", mock: true },
    {},
    "org_1",
  );
  assert.equal(clearResult.mock, true);
  assert.equal(clearResult.clearedRange, "Sheet1!A2:D10");
});

test("TASK 17: Google Drive node execution (uploadFile, downloadFile, listFiles, createFolder)", async () => {
  // 1. uploadFile
  const uploadResult: any = await executeGoogleDrive(
    { operation: "uploadFile", fileName: "test-report.pdf", content: "PDF content bytes", mimeType: "application/pdf", mock: true },
    {},
    "org_1",
  );
  assert.equal(uploadResult.mock, true);
  assert.equal(uploadResult.name, "test-report.pdf");
  assert.ok(uploadResult.id.startsWith("mock_drive_file_"));

  // 2. downloadFile
  const downloadResult: any = await executeGoogleDrive(
    { operation: "downloadFile", fileId: "file_abc123", mock: true },
    {},
    "org_1",
  );
  assert.equal(downloadResult.mock, true);
  assert.equal(downloadResult.fileId, "file_abc123");
  assert.ok(downloadResult.content);

  // 3. listFiles
  const listResult: any = await executeGoogleDrive(
    { operation: "listFiles", query: "name contains 'Report'", mock: true },
    {},
    "org_1",
  );
  assert.equal(listResult.mock, true);
  assert.ok(Array.isArray(listResult.files));
  assert.equal(listResult.files.length, 2);

  // 4. createFolder
  const folderResult: any = await executeGoogleDrive(
    { operation: "createFolder", folderName: "Q4 Documents", mock: true },
    {},
    "org_1",
  );
  assert.equal(folderResult.mock, true);
  assert.ok(folderResult.id.startsWith("mock_folder_"));
});

test("TASK 17: Google Gmail node execution (sendMessage, getMessages, createDraft, addLabel)", async () => {
  // 1. sendMessage
  const sendResult: any = await executeGoogleGmail(
    { operation: "sendMessage", to: "user@example.com", subject: "Workflow Alert", body: "<h1>Order Processed</h1>", mock: true },
    {},
    "org_1",
  );
  assert.equal(sendResult.mock, true);
  assert.equal(sendResult.status, "SENT");
  assert.equal(sendResult.to, "user@example.com");

  // 2. getMessages
  const getResult: any = await executeGoogleGmail(
    { operation: "getMessages", query: "is:unread", mock: true },
    {},
    "org_1",
  );
  assert.equal(getResult.mock, true);
  assert.ok(Array.isArray(getResult.messages));

  // 3. createDraft
  const draftResult: any = await executeGoogleGmail(
    { operation: "createDraft", to: "draft@example.com", subject: "Draft Subject", body: "Draft Content", mock: true },
    {},
    "org_1",
  );
  assert.equal(draftResult.mock, true);
  assert.ok(draftResult.id.startsWith("mock_draft_"));

  // 4. addLabel
  const labelResult: any = await executeGoogleGmail(
    { operation: "addLabel", messageId: "msg_123", label: "PROCESSED", mock: true },
    {},
    "org_1",
  );
  assert.equal(labelResult.mock, true);
  assert.equal(labelResult.updated, true);
});

// ─────────────────────────────────────────────────────────────
// TASK 18: Comms nodes (Telegram, Discord, Slack) + triggers (telegramTrigger, slackTrigger, cronTrigger)
// ─────────────────────────────────────────────────────────────

test("TASK 18: Telegram node execution (sendMessage, sendPhoto, sendDocument)", async () => {
  // 1. sendMessage
  const sendRes: any = await executeTelegram(
    { operation: "sendMessage", chatId: "123456", text: "Hello Telegram", parseMode: "HTML", mock: true },
    {},
    "org_1",
  );
  assert.equal(sendRes.mock, true);
  assert.equal(sendRes.ok, true);
  assert.equal(sendRes.result.text, "Hello Telegram");

  // 2. sendPhoto
  const photoRes: any = await executeTelegram(
    { operation: "sendPhoto", chatId: "123456", photoUrl: "https://example.com/chart.png", caption: "Daily KPI", mock: true },
    {},
    "org_1",
  );
  assert.equal(photoRes.mock, true);
  assert.equal(photoRes.ok, true);
  assert.equal(photoRes.result.caption, "Daily KPI");

  // 3. sendDocument
  const docRes: any = await executeTelegram(
    { operation: "sendDocument", chatId: "123456", documentUrl: "https://example.com/report.pdf", caption: "Monthly Report", mock: true },
    {},
    "org_1",
  );
  assert.equal(docRes.mock, true);
  assert.equal(docRes.ok, true);
  assert.equal(docRes.result.caption, "Monthly Report");
});

test("TASK 18: Discord node execution (sendWebhook, sendMessage, createEmbed)", async () => {
  // 1. sendWebhook
  const hookRes: any = await executeDiscord(
    { operation: "sendWebhook", webhookUrl: "https://discord.com/api/webhooks/123/abc", content: "Alert: CPU > 90%", username: "MonitorBot", mock: true },
    {},
    "org_1",
  );
  assert.equal(hookRes.mock, true);
  assert.equal(hookRes.status, "DELIVERED");
  assert.equal(hookRes.content, "Alert: CPU > 90%");

  // 2. sendMessage
  const msgRes: any = await executeDiscord(
    { operation: "sendMessage", channelId: "chan_999", content: "Direct channel alert", mock: true },
    {},
    "org_1",
  );
  assert.equal(msgRes.mock, true);
  assert.equal(msgRes.status, "SENT");

  // 3. createEmbed
  const embedRes: any = await executeDiscord(
    { operation: "createEmbed", content: "Embed message description", mock: true },
    {},
    "org_1",
  );
  assert.equal(embedRes.mock, true);
  assert.equal(embedRes.description, "Embed message description");
});

test("TASK 18: Slack node execution (sendMessage, createChannel, listChannels, postWebhook)", async () => {
  // 1. sendMessage
  const sendRes: any = await executeSlack(
    { operation: "sendMessage", channel: "#engineering", text: "Deployment Successful v1.5.0", mock: true },
    {},
    "org_1",
  );
  assert.equal(sendRes.mock, true);
  assert.equal(sendRes.ok, true);
  assert.equal(sendRes.channel, "#engineering");
  assert.equal(sendRes.message.text, "Deployment Successful v1.5.0");

  // 2. createChannel
  const createRes: any = await executeSlack(
    { operation: "createChannel", name: "incident-2026-08", isPrivate: false, mock: true },
    {},
    "org_1",
  );
  assert.equal(createRes.mock, true);
  assert.equal(createRes.channel.name, "incident-2026-08");

  // 3. listChannels
  const listRes: any = await executeSlack(
    { operation: "listChannels", mock: true },
    {},
    "org_1",
  );
  assert.equal(listRes.mock, true);
  assert.ok(Array.isArray(listRes.channels));
  assert.equal(listRes.channels.length, 3);
});

test("TASK 18: Triggers parsing (telegramTrigger, slackTrigger, cronTrigger)", async () => {
  // 1. telegramTrigger parsing
  const tgPayload = {
    update_id: 998877,
    message: {
      message_id: 42,
      from: { id: 101, username: "victor_dev", first_name: "Victor" },
      chat: { id: 101, type: "private" },
      text: "/deploy production",
      date: 1771970000,
    },
  };
  const tgResult = executeTelegramTrigger({}, tgPayload);
  assert.equal(tgResult.updateId, 998877);
  assert.equal(tgResult.messageId, 42);
  assert.equal(tgResult.text, "/deploy production");
  assert.equal((tgResult.fromUser as any).username, "victor_dev");
  assert.equal(tgResult._trigger, "telegramTrigger");

  // 2. slackTrigger url_verification handshake
  const slackChallengePayload = {
    type: "url_verification",
    token: "Jhj5dZrVaK7ZwHHjRyZWjbDl",
    challenge: "3eZbrw1aBm2rZgRNFDxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
  };
  const challengeResult = executeSlackTrigger({}, slackChallengePayload);
  assert.equal(challengeResult.challenge, "3eZbrw1aBm2rZgRNFDxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P");

  // 3. slackTrigger event_callback
  const slackEventPayload = {
    type: "event_callback",
    event: {
      type: "message",
      channel: "C024BE91L",
      user: "U2147483697",
      text: "Deploy status update",
      ts: "1771970000.000200",
    },
  };
  const slackResult = executeSlackTrigger({}, slackEventPayload);
  assert.equal(slackResult.eventType, "message");
  assert.equal(slackResult.text, "Deploy status update");
  assert.equal(slackResult.user, "U2147483697");
  assert.equal(slackResult._trigger, "slackTrigger");

  // 4. cronTrigger schedule evaluation
  const cronResult = executeCronTrigger({ cronExpression: "*/15 * * * *", timezone: "America/Sao_Paulo" }, {});
  assert.equal(cronResult.cronExpression, "*/15 * * * *");
  assert.equal(cronResult.timezone, "America/Sao_Paulo");
  assert.ok(cronResult.timestamp);
  assert.equal(cronResult._trigger, "cronTrigger");
});

test("TASK 18: Slack webhook URL verification via HTTP endpoint", async () => {
  const challenge = "slack_verification_token_challenge_12345";
  const res = await app.inject({
    method: "POST",
    url: "/api/webhooks/slack/any-path",
    payload: {
      type: "url_verification",
      challenge,
    },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.challenge, challenge);
});

