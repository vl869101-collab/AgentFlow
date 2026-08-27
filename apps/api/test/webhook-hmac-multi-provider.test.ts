import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.ALLOW_MEMORY_DB = "1";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long";

const [
  { buildApp },
  { resetStore },
  { prisma },
  {
    safeCompare,
    verifyGitHubSignature,
    verifyShopifySignature,
    verifyStripeSignature,
    verifySlackSignature,
    verifyGenericSignature,
    verifyWebhookRequest,
  },
] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/services/webhook-verifier.js"),
]);

test("TASK-09: safeCompare timing-safe buffer comparison", () => {
  // Matching strings & buffers
  assert.equal(safeCompare("secret-signature-123", "secret-signature-123"), true);
  assert.equal(safeCompare(Buffer.from("abc"), Buffer.from("abc")), true);

  // Mismatch same length
  assert.equal(safeCompare("secret-signature-123", "secret-signature-456"), false);
  assert.equal(safeCompare(Buffer.from("abc"), Buffer.from("abd")), false);

  // Mismatch different length (executes dummy buffer branch)
  assert.equal(safeCompare("short", "much-longer-string"), false);
  assert.equal(safeCompare(Buffer.from("12"), Buffer.from("123456")), false);

  // Empty / corrupted values
  assert.equal(safeCompare("", "non-empty"), false);
  assert.equal(safeCompare("", ""), true);
});

test("TASK-09: GitHub HMAC-SHA256 signature verification", () => {
  const secret = "gh_secret_super_secure_key";
  const rawBody = JSON.stringify({ action: "opened", issue: { id: 42, title: "Bug in parser" } });

  const validHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const validHeader = `sha256=${validHex}`;

  // Valid with prefix
  assert.equal(verifyGitHubSignature(secret, rawBody, validHeader), true);
  // Valid without prefix
  assert.equal(verifyGitHubSignature(secret, rawBody, validHex), true);
  // Case insensitivity
  assert.equal(verifyGitHubSignature(secret, rawBody, validHeader.toUpperCase()), true);

  // Tampered payload
  const tamperedBody = JSON.stringify({ action: "closed", issue: { id: 42, title: "Bug in parser" } });
  assert.equal(verifyGitHubSignature(secret, tamperedBody, validHeader), false);

  // Wrong secret
  assert.equal(verifyGitHubSignature("wrong_secret", rawBody, validHeader), false);

  // Missing / undefined header
  assert.equal(verifyGitHubSignature(secret, rawBody, undefined), false);
  assert.equal(verifyGitHubSignature("", rawBody, validHeader), false);
});

test("TASK-09: Shopify HMAC-SHA256 Base64 signature verification", () => {
  const secret = "shopify_shpss_secret_key_123";
  const rawBody = JSON.stringify({ order_id: 9999, total_price: "150.00", currency: "USD" });

  const validBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");

  // Valid Base64 signature
  assert.equal(verifyShopifySignature(secret, rawBody, validBase64), true);
  assert.equal(verifyShopifySignature(secret, rawBody, `  ${validBase64}  `), true);

  // Tampered payload
  assert.equal(verifyShopifySignature(secret, rawBody + " ", validBase64), false);

  // Missing / empty parameters
  assert.equal(verifyShopifySignature(secret, rawBody, undefined), false);
  assert.equal(verifyShopifySignature("", rawBody, validBase64), false);
});

test("TASK-09: Stripe HMAC-SHA256 signature with replay defense tolerance", () => {
  const secret = "whsec_test_stripe_webhook_secret_key";
  const rawBody = JSON.stringify({ id: "evt_12345", object: "event", type: "payment_intent.succeeded" });

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payloadToSign = `${nowSeconds}.${rawBody}`;
  const validSigHex = createHmac("sha256", secret).update(payloadToSign).digest("hex");
  const validHeader = `t=${nowSeconds},v1=${validSigHex},v0=old_legacy_sig`;

  // Valid signature and fresh timestamp
  const validResult = verifyStripeSignature(secret, rawBody, validHeader);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.timestamp, nowSeconds);

  // Multiple v1 signatures where one matches
  const multiSigHeader = `t=${nowSeconds},v1=fake_sig_123,v1=${validSigHex}`;
  assert.equal(verifyStripeSignature(secret, rawBody, multiSigHeader).valid, true);

  // Tampered body
  const tamperedResult = verifyStripeSignature(secret, rawBody + "tampered", validHeader);
  assert.equal(tamperedResult.valid, false);
  assert.equal(tamperedResult.code, "INVALID_SIGNATURE");

  // Replay Attack: Timestamp older than 300s (5 minutes)
  const staleTimestamp = nowSeconds - 301;
  const stalePayload = `${staleTimestamp}.${rawBody}`;
  const staleSig = createHmac("sha256", secret).update(stalePayload).digest("hex");
  const staleHeader = `t=${staleTimestamp},v1=${staleSig}`;
  const replayResult = verifyStripeSignature(secret, rawBody, staleHeader);
  assert.equal(replayResult.valid, false);
  assert.equal(replayResult.code, "REPLAY_ATTACK");
  assert.ok(replayResult.error?.includes("too old or in future"));

  // Future Clock Skew > 300s
  const futureTimestamp = nowSeconds + 305;
  const futurePayload = `${futureTimestamp}.${rawBody}`;
  const futureSig = createHmac("sha256", secret).update(futurePayload).digest("hex");
  const futureHeader = `t=${futureTimestamp},v1=${futureSig}`;
  const futureResult = verifyStripeSignature(secret, rawBody, futureHeader);
  assert.equal(futureResult.valid, false);
  assert.equal(futureResult.code, "REPLAY_ATTACK");

  // Missing or malformed header
  assert.equal(verifyStripeSignature(secret, rawBody, undefined).code, "MISSING_SIGNATURE");
  assert.equal(verifyStripeSignature(secret, rawBody, "invalid_no_equal").code, "INVALID_SIGNATURE");
});

test("TASK-09: Slack HMAC-SHA256 signature with timestamp verification", () => {
  const signingSecret = "slack_signing_secret_abcdef123456";
  const rawBody = JSON.stringify({ command: "/deploy", text: "production" });

  const nowSeconds = Math.floor(Date.now() / 1000);
  const sigBasestring = `v0:${nowSeconds}:${rawBody}`;
  const hexSig = createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  const validHeader = `v0=${hexSig}`;
  const timestampHeader = String(nowSeconds);

  // Valid Slack signature and fresh timestamp
  const validResult = verifySlackSignature(signingSecret, rawBody, validHeader, timestampHeader);
  assert.equal(validResult.valid, true);

  // Tampered payload
  const tamperedResult = verifySlackSignature(signingSecret, rawBody + "modified", validHeader, timestampHeader);
  assert.equal(tamperedResult.valid, false);
  assert.equal(tamperedResult.code, "INVALID_SIGNATURE");

  // Stale timestamp (replay attack > 300s)
  const staleTimestamp = String(nowSeconds - 310);
  const staleBasestring = `v0:${staleTimestamp}:${rawBody}`;
  const staleSig = `v0=${createHmac("sha256", signingSecret).update(staleBasestring).digest("hex")}`;
  const replayResult = verifySlackSignature(signingSecret, rawBody, staleSig, staleTimestamp);
  assert.equal(replayResult.valid, false);
  assert.equal(replayResult.code, "REPLAY_ATTACK");

  // Missing headers or secret
  assert.equal(verifySlackSignature(signingSecret, rawBody, undefined, timestampHeader).code, "MISSING_SIGNATURE");
  assert.equal(verifySlackSignature(signingSecret, rawBody, validHeader, undefined).code, "MISSING_SIGNATURE");
  assert.equal(verifySlackSignature(signingSecret, rawBody, validHeader, "not-a-number").code, "INVALID_TIMESTAMP");
});

test("TASK-09: Generic HMAC verification (sha256, sha512, sha1, hex & base64)", () => {
  const secret = "custom_generic_shared_secret";
  const rawBody = "plain-text-or-raw-json-payload-for-generic-webhook";

  // SHA256 hex
  const sha256Hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyGenericSignature(secret, rawBody, sha256Hex, "sha256"), true);
  assert.equal(verifyGenericSignature(secret, rawBody, `sha256=${sha256Hex}`, "sha256"), true);

  // SHA512 hex
  const sha512Hex = createHmac("sha512", secret).update(rawBody).digest("hex");
  assert.equal(verifyGenericSignature(secret, rawBody, sha512Hex, "sha512"), true);
  assert.equal(verifyGenericSignature(secret, rawBody, `sha512=${sha512Hex}`, "sha512"), true);

  // SHA1 hex
  const sha1Hex = createHmac("sha1", secret).update(rawBody).digest("hex");
  assert.equal(verifyGenericSignature(secret, rawBody, sha1Hex, "sha1"), true);
  assert.equal(verifyGenericSignature(secret, rawBody, `sha1=${sha1Hex}`, "sha1"), true);

  // SHA256 Base64
  const sha256Base64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  assert.equal(verifyGenericSignature(secret, rawBody, sha256Base64, "sha256"), true);

  // Tampered payload
  assert.equal(verifyGenericSignature(secret, "different-body", sha256Hex, "sha256"), false);
  // Missing signature
  assert.equal(verifyGenericSignature(secret, rawBody, "", "sha256"), false);
});

test("TASK-09: Master verifyWebhookRequest dispatcher auto-detection", () => {
  const secret = "master_dispatcher_secret_999";
  const rawBody = JSON.stringify({ event: "ping" });

  // GitHub auto-detection via x-hub-signature-256
  const ghSig = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const ghRes = verifyWebhookRequest("generic", secret, rawBody, { "x-hub-signature-256": ghSig });
  assert.equal(ghRes.valid, true);
  assert.equal(ghRes.provider, "github");

  // Shopify auto-detection via x-shopify-hmac-sha256
  const shpSig = createHmac("sha256", secret).update(rawBody).digest("base64");
  const shpRes = verifyWebhookRequest("generic", secret, rawBody, { "x-shopify-hmac-sha256": shpSig });
  assert.equal(shpRes.valid, true);
  assert.equal(shpRes.provider, "shopify");

  // Stripe auto-detection via stripe-signature
  const now = Math.floor(Date.now() / 1000);
  const stripeSig = `t=${now},v1=${createHmac("sha256", secret).update(`${now}.${rawBody}`).digest("hex")}`;
  const stripeRes = verifyWebhookRequest("generic", secret, rawBody, { "stripe-signature": stripeSig });
  assert.equal(stripeRes.valid, true);
  assert.equal(stripeRes.provider, "stripe");

  // Slack auto-detection via x-slack-signature
  const slackSig = `v0=${createHmac("sha256", secret).update(`v0:${now}:${rawBody}`).digest("hex")}`;
  const slackRes = verifyWebhookRequest("generic", secret, rawBody, {
    "x-slack-signature": slackSig,
    "x-slack-request-timestamp": String(now),
  });
  assert.equal(slackRes.valid, true);
  assert.equal(slackRes.provider, "slack");

  // Generic fallback via x-signature-512
  const gen512 = createHmac("sha512", secret).update(rawBody).digest("hex");
  const genRes = verifyWebhookRequest("generic", secret, rawBody, { "x-signature-512": gen512 });
  assert.equal(genRes.valid, true);
  assert.equal(genRes.provider, "generic");
});

test("TASK-09: E2E Webhook Trigger verification with all providers against /api/webhooks/trigger/*", async () => {
  resetStore();
  const app = await buildApp();

  const user = await prisma.user.create({
    data: { email: "webhook-tester@example.com", passwordHash: "dummy", name: "Webhook Tester" },
  });
  const org = await prisma.organization.create({
    data: { name: "Webhook Org", slug: "webhook-org", plan: "PRO" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Webhook Ingestion WF",
      orgId: org.id,
      ownerId: user.id,
      published: true,
    },
  });

  const triggerNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Webhook Trigger",
      type: "webhook",
      config: JSON.stringify({}),
      position: JSON.stringify({ x: 0, y: 0 }),
    },
  });
  const outputNode = await (prisma as any).workflowNode.create({
    data: {
      workflowId: workflow.id,
      name: "Output",
      type: "output",
      config: JSON.stringify({}),
      position: JSON.stringify({ x: 200, y: 0 }),
    },
  });
  await (prisma as any).workflowEdge.create({
    data: {
      workflowId: workflow.id,
      source: triggerNode.id,
      target: outputNode.id,
    },
  });

  const webhookSecret = "super_secret_webhook_key_for_e2e_tests_123";
  const webhook = await prisma.webhook.create({
    data: {
      path: "ingest-multi-provider",
      method: "POST",
      secret: webhookSecret,
      workflowId: workflow.id,
      orgId: org.id,
      active: true,
    },
  });

  const payload = { event_type: "order.created", order: { id: "ORD-999", amount: 250 } };
  const rawBody = JSON.stringify(payload);

  // 1. Missing Signature -> 401 MISSING_SIGNATURE
  const missingSigRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: { "content-type": "application/json" },
    payload: rawBody,
  });
  assert.equal(missingSigRes.statusCode, 401);
  const missingData = JSON.parse(missingSigRes.payload);
  assert.equal(missingData.code, "MISSING_SIGNATURE");

  // 2. GitHub Valid Signature -> 202 Accepted
  const ghSignature = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  const ghRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": ghSignature,
      "x-github-event": "push",
      "x-idempotency-key": "gh-event-001",
    },
    payload: rawBody,
  });
  assert.equal(ghRes.statusCode, 202);
  const ghData = JSON.parse(ghRes.payload);
  assert.ok(ghData.executionId, "Should return executionId");

  // 3. GitHub Tampered Payload -> 401 INVALID_SIGNATURE
  const ghTamperedRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": ghSignature,
      "x-github-event": "push",
    },
    payload: JSON.stringify({ ...payload, tampered: true }),
  });
  assert.equal(ghTamperedRes.statusCode, 401);
  assert.equal(JSON.parse(ghTamperedRes.payload).code, "INVALID_SIGNATURE");

  // 4. Shopify Valid Signature -> 202 Accepted
  const shopifySig = createHmac("sha256", webhookSecret).update(rawBody).digest("base64");
  const shopifyRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": shopifySig,
      "x-shopify-topic": "orders/create",
      "x-idempotency-key": "shp-order-001",
    },
    payload: rawBody,
  });
  assert.equal(shopifyRes.statusCode, 202);

  // 5. Stripe Valid Signature -> 202 Accepted
  const now = Math.floor(Date.now() / 1000);
  const stripeSig = `t=${now},v1=${createHmac("sha256", webhookSecret).update(`${now}.${rawBody}`).digest("hex")}`;
  const stripeRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSig,
      "x-idempotency-key": "stripe-evt-001",
    },
    payload: rawBody,
  });
  assert.equal(stripeRes.statusCode, 202);

  // 6. Stripe Replay Attack (Old Timestamp) -> 401 REPLAY_ATTACK
  const staleTime = now - 400; // > 300s tolerance
  const staleStripeSig = `t=${staleTime},v1=${createHmac("sha256", webhookSecret).update(`${staleTime}.${rawBody}`).digest("hex")}`;
  const stripeReplayRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "stripe-signature": staleStripeSig,
    },
    payload: rawBody,
  });
  assert.equal(stripeReplayRes.statusCode, 401);
  assert.equal(JSON.parse(stripeReplayRes.payload).code, "REPLAY_ATTACK");

  // 7. Slack Valid Signature -> 202 Accepted
  const slackSig = `v0=${createHmac("sha256", webhookSecret).update(`v0:${now}:${rawBody}`).digest("hex")}`;
  const slackRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-slack-signature": slackSig,
      "x-slack-request-timestamp": String(now),
      "x-idempotency-key": "slack-msg-001",
    },
    payload: rawBody,
  });
  assert.equal(slackRes.statusCode, 202);

  // 8. Slack Stale Request Timestamp -> 401 REPLAY_ATTACK
  const staleSlackTime = String(now - 350);
  const staleSlackSig = `v0=${createHmac("sha256", webhookSecret).update(`v0:${staleSlackTime}:${rawBody}`).digest("hex")}`;
  const slackReplayRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-slack-signature": staleSlackSig,
      "x-slack-request-timestamp": staleSlackTime,
    },
    payload: rawBody,
  });
  assert.equal(slackReplayRes.statusCode, 401);
  assert.equal(JSON.parse(slackReplayRes.payload).code, "REPLAY_ATTACK");

  // 9. Generic HMAC-SHA512 Signature -> 202 Accepted
  const sha512Sig = createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
  const genericRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${webhook.path}`,
    headers: {
      "content-type": "application/json",
      "x-signature-512": sha512Sig,
      "x-idempotency-key": "generic-sha512-001",
    },
    payload: rawBody,
  });
  assert.equal(genericRes.statusCode, 202);
});
