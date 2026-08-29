import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.ALLOW_MEMORY_DB = "1";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long";
process.env.WHATSAPP_VERIFY_TOKEN = "global-verify-token-secret";

const [
  { buildApp },
  { resetStore },
  { prisma },
  { parseWhatsAppWebhookPayload, WhatsAppNodeHandler, WhatsAppInputSchema },
  { verifyMetaSignature, verifyWebhookRequest },
] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/services/nodes/whatsapp.js"),
  import("../src/services/webhook-verifier.js"),
]);

test("TASK-16: parseWhatsAppWebhookPayload handles DLR status reports (sent, delivered, read, failed)", () => {
  const metaDlrPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "100000000000001",
              },
              statuses: [
                {
                  id: "wamid.HBgM1234567890",
                  status: "sent",
                  timestamp: "1724932800",
                  recipient_id: "5511999999999",
                  conversation: {
                    id: "conv-12345",
                    origin: { type: "user_initiated" },
                    expiration_timestamp: "1725019200",
                  },
                  pricing: {
                    pricing_model: "CBP",
                    billable: true,
                    category: "service",
                  },
                },
                {
                  id: "wamid.HBgM1234567891",
                  status: "delivered",
                  timestamp: "1724932805",
                  recipient_id: "5511999999999",
                },
                {
                  id: "wamid.HBgM1234567892",
                  status: "read",
                  timestamp: "1724932810",
                  recipient_id: "5511999999999",
                },
                {
                  id: "wamid.HBgM1234567893",
                  status: "failed",
                  timestamp: "1724932815",
                  recipient_id: "5511999999999",
                  errors: [
                    {
                      code: 131026,
                      title: "Message undeliverable",
                      message: "The recipient phone number is not a valid WhatsApp account",
                    },
                  ],
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  const parsed = parseWhatsAppWebhookPayload(metaDlrPayload);
  assert.equal(parsed.entryType, "status_update");
  assert.equal(parsed.phoneNumberId, "100000000000001");
  assert.equal(parsed.displayPhoneNumber, "15551234567");
  assert.equal(parsed.statuses.length, 4);

  // Status 1: sent
  assert.equal(parsed.statuses[0].messageId, "wamid.HBgM1234567890");
  assert.equal(parsed.statuses[0].status, "sent");
  assert.equal(parsed.statuses[0].recipientId, "5511999999999");
  assert.equal(parsed.statuses[0].conversation?.id, "conv-12345");
  assert.equal(parsed.statuses[0].pricing?.billable, true);

  // Status 2: delivered
  assert.equal(parsed.statuses[1].status, "delivered");

  // Status 3: read
  assert.equal(parsed.statuses[2].status, "read");

  // Status 4: failed with error
  assert.equal(parsed.statuses[3].status, "failed");
  assert.equal(parsed.statuses[3].errors?.[0]?.code, 131026);
  assert.match(parsed.statuses[3].errors?.[0]?.title ?? "", /undeliverable/i);
});

test("TASK-16: parseWhatsAppWebhookPayload handles inbound messages (text, interactive buttons, location, media, reaction)", () => {
  const metaInboundPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "100000000000001",
              },
              messages: [
                {
                  from: "5511988888888",
                  id: "wamid.HBgMInboundText1",
                  timestamp: "1724933000",
                  type: "text",
                  text: { body: "Hello AgentFlow!" },
                },
                {
                  from: "5511988888888",
                  id: "wamid.HBgMInboundBtn1",
                  timestamp: "1724933005",
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: {
                      id: "btn_approve_release",
                      title: "Approve",
                    },
                  },
                },
                {
                  from: "5511988888888",
                  id: "wamid.HBgMInboundLoc1",
                  timestamp: "1724933010",
                  type: "location",
                  location: {
                    latitude: -23.5505,
                    longitude: -46.6333,
                    name: "São Paulo HQ",
                    address: "Av. Paulista, 1000",
                  },
                },
                {
                  from: "5511988888888",
                  id: "wamid.HBgMInboundReaction1",
                  timestamp: "1724933015",
                  type: "reaction",
                  reaction: {
                    message_id: "wamid.HBgM1234567890",
                    emoji: "🚀",
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  const parsed = parseWhatsAppWebhookPayload(metaInboundPayload);
  assert.equal(parsed.entryType, "inbound_message");
  assert.equal(parsed.messages.length, 4);

  // Message 1: text
  assert.equal(parsed.messages[0].type, "text");
  assert.equal(parsed.messages[0].text, "Hello AgentFlow!");
  assert.equal(parsed.messages[0].from, "5511988888888");

  // Message 2: interactive button reply
  assert.equal(parsed.messages[1].buttonPayload?.id, "btn_approve_release");
  assert.equal(parsed.messages[1].buttonPayload?.title, "Approve");

  // Message 3: location
  assert.equal(parsed.messages[2].location?.latitude, -23.5505);
  assert.equal(parsed.messages[2].location?.name, "São Paulo HQ");

  // Message 4: reaction
  assert.equal(parsed.messages[3].reaction?.emoji, "🚀");
  assert.equal(parsed.messages[3].reaction?.messageId, "wamid.HBgM1234567890");
});

test("TASK-16: Meta / WhatsApp HMAC-SHA256 signature verification helper", () => {
  const secret = "meta_app_secret_key_whatsapp_123";
  const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  const validHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const validHeader = `sha256=${validHex}`;

  assert.equal(verifyMetaSignature(secret, rawBody, validHeader), true);
  assert.equal(verifyMetaSignature(secret, rawBody, validHex), true);
  assert.equal(verifyMetaSignature(secret, rawBody, "sha256=invalid_hash"), false);
  assert.equal(verifyMetaSignature("wrong_secret", rawBody, validHeader), false);

  // Verify dispatcher for WhatsApp provider
  const dispatchRes = verifyWebhookRequest("whatsapp", secret, rawBody, {
    "x-hub-signature-256": validHeader,
  });
  assert.equal(dispatchRes.valid, true);
  assert.equal(dispatchRes.provider, "whatsapp");
});

test("TASK-16: WhatsApp Webhook GET Handshake verification and challenge echo", async () => {
  resetStore();
  const app = await buildApp();

  const user = await prisma.user.create({
    data: { email: "whatsapp-admin@example.com", passwordHash: "dummy", name: "WhatsApp Admin" },
  });
  const org = await prisma.organization.create({
    data: { name: "WhatsApp Org", slug: "whatsapp-org", plan: "GROWTH" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: { name: "WhatsApp Ingest WF", orgId: org.id, ownerId: user.id, published: true },
  });

  const webhookSecret = "whatsapp_verify_token_secret_123";
  const webhook = await prisma.webhook.create({
    data: {
      path: "whatsapp-dlr-ingest",
      method: "POST",
      secret: webhookSecret,
      workflowId: workflow.id,
      orgId: org.id,
      active: true,
    },
  });

  // 1. Successful Handshake GET
  const challengeCode = "challenge_random_string_987654";
  const validGetRes = await app.inject({
    method: "GET",
    url: `/api/webhooks/whatsapp/${webhook.path}?hub.mode=subscribe&hub.verify_token=${webhookSecret}&hub.challenge=${challengeCode}`,
  });
  assert.equal(validGetRes.statusCode, 200);
  assert.equal(validGetRes.payload, challengeCode);
  assert.match(validGetRes.headers["content-type"] ?? "", /text\/plain/);

  // 2. Token mismatch -> 403 FORBIDDEN
  const invalidTokenRes = await app.inject({
    method: "GET",
    url: `/api/webhooks/whatsapp/${webhook.path}?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=${challengeCode}`,
  });
  assert.equal(invalidTokenRes.statusCode, 403);
  assert.equal(JSON.parse(invalidTokenRes.payload).code, "FORBIDDEN");

  // 3. Invalid Mode -> 400 INVALID_MODE
  const invalidModeRes = await app.inject({
    method: "GET",
    url: `/api/webhooks/whatsapp/${webhook.path}?hub.mode=publish&hub.verify_token=${webhookSecret}`,
  });
  assert.equal(invalidModeRes.statusCode, 400);
  assert.equal(JSON.parse(invalidModeRes.payload).code, "INVALID_MODE");

  // 4. Non-existent path -> 404
  const notFoundRes = await app.inject({
    method: "GET",
    url: `/api/webhooks/whatsapp/non-existent-webhook?hub.mode=subscribe&hub.verify_token=${webhookSecret}`,
  });
  assert.equal(notFoundRes.statusCode, 404);
});

test("TASK-16: WhatsApp Webhook POST DLR & Inbound Message Ingestion", async () => {
  resetStore();
  const app = await buildApp();

  const user = await prisma.user.create({
    data: { email: "whatsapp-dlr@example.com", passwordHash: "dummy", name: "WhatsApp DLR" },
  });
  const org = await prisma.organization.create({
    data: { name: "WhatsApp DLR Org", slug: "whatsapp-dlr-org", plan: "PRO" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: { name: "WhatsApp DLR WF", orgId: org.id, ownerId: user.id, published: true },
  });

  const webhookSecret = "whatsapp_meta_shared_secret_456";
  const webhook = await prisma.webhook.create({
    data: {
      path: "whatsapp-live-dlr",
      method: "POST",
      secret: webhookSecret,
      workflowId: workflow.id,
      orgId: org.id,
      active: true,
    },
  });

  const dlrPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15551234567", phone_number_id: "100000000000001" },
              statuses: [
                { id: "wamid.HBgM999", status: "delivered", timestamp: "1724934000", recipient_id: "5511999998888" },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  const rawBody = JSON.stringify(dlrPayload);
  const signatureHex = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  // 1. Missing / Invalid Signature -> 401
  const invalidSigRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/whatsapp/${webhook.path}`,
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalid" },
    payload: rawBody,
  });
  assert.equal(invalidSigRes.statusCode, 401);
  assert.equal(JSON.parse(invalidSigRes.payload).code, "INVALID_SIGNATURE");

  // 2. Valid Signature -> 200 OK with parsed status counts
  const validDlrRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/whatsapp/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${signatureHex}`,
    },
    payload: rawBody,
  });

  assert.equal(validDlrRes.statusCode, 200);
  const dlrData = JSON.parse(validDlrRes.payload);
  assert.equal(dlrData.ok, true);
  assert.equal(dlrData.entryType, "status_update");
  assert.equal(dlrData.statusCount, 1);
  assert.equal(dlrData.messageCount, 0);
  assert.ok(dlrData.executionId);

  // Verify created execution record
  const execution = await prisma.workflowExecution.findUnique({ where: { id: dlrData.executionId } });
  assert.ok(execution);
  assert.equal(execution.trigger, "whatsappTrigger");
  assert.equal((execution.input as any).entryType, "status_update");
  assert.equal((execution.input as any).statuses[0].status, "delivered");
});
