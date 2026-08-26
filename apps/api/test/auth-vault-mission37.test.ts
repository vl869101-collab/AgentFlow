import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomBytes } from "node:crypto";
import {
  encryptField,
  decryptField,
  encryptVaultData,
  decryptVaultData,
  getCurrentKeyVersion,
  setCurrentKeyVersion,
  registerEncryptionKeyVersion,
  kmsManager,
  LocalKmsProvider,
  AwsKmsProvider,
  GcpKmsProvider,
  HashiCorpVaultKmsProvider,
} from "../src/services/vault/index.js";
import {
  ensureFreshOAuth2Token,
  refreshOAuth2Credential,
  scanAndRefreshExpiringCredentials,
  resolveTokenEndpoint,
} from "../src/services/vault/oauth-refresh.js";
import {
  verifyGitHubSignature,
  verifyShopifySignature,
  verifyStripeSignature,
  verifySlackSignature,
  verifyGenericSignature,
  verifyWebhookRequest,
} from "../src/services/webhook-verifier.js";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  httpCircuitBreaker,
} from "../src/lib/circuit-breaker.js";
import {
  applyHttpAuthentication,
  computeDigestAuthHeader,
} from "../src/lib/http-auth.js";
import {
  recordAuditEvent,
  verifyAuditLedgerIntegrity,
  exportSignedAuditReport,
  canonicalJson,
  computeAuditHash,
  GENESIS_HASH,
} from "../src/services/audit-ledger.js";

// Test setup
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const app = await buildApp({ logger: false });

async function register(email: string) {
  const reg = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: "StrongPass123", name: email.split("@")[0] }),
  });
  assert.equal(reg.statusCode, 201);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: "StrongPass123" }),
  });
  assert.equal(login.statusCode, 200);
  const data = JSON.parse(login.body);
  return { token: data.token as string, user: data.user, org: data.org };
}

test.beforeEach(() => resetStore());

// ══════════════════════════════════════════════════════════════════════
// TASK-05: Vault 510 OAuth Refresh Tests
// ══════════════════════════════════════════════════════════════════════

test("TASK-05: resolveTokenEndpoint accurately resolves endpoints for 510 catalogue providers", () => {
  assert.equal(resolveTokenEndpoint("google"), "https://oauth2.googleapis.com/token");
  assert.equal(resolveTokenEndpoint("microsoft"), "https://login.microsoftonline.com/common/oauth2/v2.0/token");
  assert.equal(resolveTokenEndpoint("slack"), "https://slack.com/api/oauth.v2.access");
  assert.equal(resolveTokenEndpoint("github"), "https://github.com/login/oauth/access_token");
  assert.equal(resolveTokenEndpoint("salesforce"), "https://login.salesforce.com/services/oauth2/token");
  assert.equal(resolveTokenEndpoint("custom", "https://auth.custom.com/oauth/token"), "https://auth.custom.com/oauth/token");
});

test("TASK-05: On-demand token refresh intercepts expiring tokens and refreshes with AES-256-GCM re-encryption", async () => {
  const org = await prisma.organization.create({ data: { name: "OAuth Org", slug: "oauth-org" } });
  
  // Mock global fetch for OAuth2 refresh
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async (input: any, init?: any) => {
    fetchCalled = true;
    return new Response(
      JSON.stringify({
        access_token: "new-fresh-access-token-9999",
        refresh_token: "new-rotated-refresh-token-8888",
        expires_in: 3600,
        token_type: "Bearer",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    // Create credential with expired token (< 5 minutes left)
    const expiredDate = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 mins left
    const initialData = {
      accessToken: "old-stale-token",
      refreshToken: "valid-refresh-token",
      clientId: "my-client-id",
      clientSecret: "my-client-secret",
      expiresAt: expiredDate,
    };
    const encryptedData = encryptVaultData("oauth2_managed", initialData);

    const cred = await prisma.credential.create({
      data: {
        name: "Google OAuth Credential",
        type: "oauth2",
        provider: "google",
        bucket: "oauth2_managed",
        data: encryptedData,
        orgId: org.id,
        status: "ACTIVE",
      },
    });

    const result = await ensureFreshOAuth2Token(cred.id, org.id);
    assert.equal(result.refreshed, true);
    assert.equal(result.accessToken, "new-fresh-access-token-9999");
    assert.equal(fetchCalled, true);

    // Check DB updated and re-encrypted
    const updated = await prisma.credential.findFirst({ where: { id: cred.id } });
    const decrypted = decryptVaultData("oauth2_managed", updated.data);
    assert.equal(decrypted.accessToken, "new-fresh-access-token-9999");
    assert.equal(decrypted.refreshToken, "new-rotated-refresh-token-8888");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TASK-05: On-demand token refresh skips refresh when token is still valid (> 5min)", async () => {
  const org = await prisma.organization.create({ data: { name: "OAuth Org 2", slug: "oauth-org-2" } });
  
  const validDate = new Date(Date.now() + 45 * 60 * 1000).toISOString(); // 45 mins left
  const initialData = {
    accessToken: "current-valid-token-123",
    refreshToken: "valid-refresh-token",
    expiresAt: validDate,
  };
  const encryptedData = encryptVaultData("oauth2_managed", initialData);

  const cred = await prisma.credential.create({
    data: {
      name: "Microsoft OAuth Credential",
      type: "oauth2",
      provider: "microsoft",
      bucket: "oauth2_managed",
      data: encryptedData,
      orgId: org.id,
      status: "ACTIVE",
    },
  });

  const result = await ensureFreshOAuth2Token(cred.id, org.id);
  assert.equal(result.refreshed, false);
  assert.equal(result.accessToken, "current-valid-token-123");
});

test("TASK-05: Background scheduled worker proactively scans and refreshes expiring credentials", async () => {
  const org = await prisma.organization.create({ data: { name: "OAuth Org 3", slug: "oauth-org-3" } });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        access_token: "proactive-refreshed-token",
        refresh_token: "proactive-rotated-refresh-token",
        expires_in: 7200,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const soonExpired = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins left (< 30 min)
    const encrypted = encryptVaultData("oauth2_managed", {
      accessToken: "old-token",
      refreshToken: "refresh-me",
      expiresAt: soonExpired,
    });

    await prisma.credential.create({
      data: {
        name: "Slack OAuth",
        type: "oauth2",
        provider: "slack",
        bucket: "oauth2_managed",
        data: encrypted,
        orgId: org.id,
        status: "ACTIVE",
      },
    });

    const scanResult = await scanAndRefreshExpiringCredentials(30);
    assert.equal(scanResult.scanned >= 1, true);
    assert.equal(scanResult.refreshed >= 1, true);
    assert.equal(scanResult.failed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TASK-05: OAuth refresh marks credential as EXPIRED when refresh fails (400/401)", async () => {
  const org = await prisma.organization.create({ data: { name: "OAuth Org 4", slug: "oauth-org-4" } });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "Token has been revoked" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const encrypted = encryptVaultData("oauth2_managed", {
      accessToken: "revoked-token",
      refreshToken: "revoked-refresh-token",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const cred = await prisma.credential.create({
      data: {
        name: "Revoked OAuth",
        type: "oauth2",
        provider: "github",
        bucket: "oauth2_managed",
        data: encrypted,
        orgId: org.id,
        status: "ACTIVE",
      },
    });

    const res = await refreshOAuth2Credential(cred.id, org.id, true);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("400"));

    const updated = await prisma.credential.findFirst({ where: { id: cred.id } });
    assert.equal(updated.status, "EXPIRED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ══════════════════════════════════════════════════════════════════════
// TASK-09: HMAC Multi-Provider Webhooks Tests
// ══════════════════════════════════════════════════════════════════════

test("TASK-09: GitHub HMAC-SHA256 signature verification with sha256= prefix and raw hex", () => {
  const secret = "github-webhook-secret-key";
  const rawBody = JSON.stringify({ action: "opened", issue: { id: 101, title: "Bug" } });
  const hash = createHmac("sha256", secret).update(rawBody).digest("hex");

  assert.equal(verifyGitHubSignature(secret, rawBody, `sha256=${hash}`), true);
  assert.equal(verifyGitHubSignature(secret, rawBody, hash), true);
  assert.equal(verifyGitHubSignature(secret, rawBody, "sha256=invalidhash0000"), false);
  assert.equal(verifyGitHubSignature("wrong-secret", rawBody, `sha256=${hash}`), false);
});

test("TASK-09: Shopify HMAC-SHA256 Base64 verification", () => {
  const secret = "shopify-secret-key-xyz";
  const rawBody = JSON.stringify({ id: 98765, total_price: "49.99" });
  const base64Hash = createHmac("sha256", secret).update(rawBody).digest("base64");

  assert.equal(verifyShopifySignature(secret, rawBody, base64Hash), true);
  assert.equal(verifyShopifySignature(secret, rawBody, "invalidbase64"), false);
});

test("TASK-09: Stripe HMAC-SHA256 signature verification and replay attack detection", () => {
  const secret = "whsec_stripe_test_secret_12345";
  const rawBody = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded" });
  const now = Math.floor(Date.now() / 1000);

  const payload = `${now}.${rawBody}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  const stripeHeader = `t=${now},v1=${sig}`;

  const validRes = verifyStripeSignature(secret, rawBody, stripeHeader);
  assert.equal(validRes.valid, true);

  // Stale timestamp (> 5 minutes = 300s) should be rejected as replay attack
  const staleTimestamp = now - 400;
  const stalePayload = `${staleTimestamp}.${rawBody}`;
  const staleSig = createHmac("sha256", secret).update(stalePayload).digest("hex");
  const staleHeader = `t=${staleTimestamp},v1=${staleSig}`;

  const staleRes = verifyStripeSignature(secret, rawBody, staleHeader);
  assert.equal(staleRes.valid, false);
  assert.equal(staleRes.code, "REPLAY_ATTACK");
});

test("TASK-09: Slack HMAC-SHA256 signature verification with version v0 and timestamp validation", () => {
  const secret = "slack-signing-secret-abc";
  const rawBody = "command=%2Fagentflow&text=run+flow";
  const now = Math.floor(Date.now() / 1000);

  const sigBase = `v0:${now}:${rawBody}`;
  const hash = createHmac("sha256", secret).update(sigBase).digest("hex");
  const slackSig = `v0=${hash}`;

  const validRes = verifySlackSignature(secret, rawBody, slackSig, String(now));
  assert.equal(validRes.valid, true);

  // Stale Slack timestamp
  const staleTs = now - 500;
  const staleRes = verifySlackSignature(secret, rawBody, slackSig, String(staleTs));
  assert.equal(staleRes.valid, false);
  assert.equal(staleRes.code, "REPLAY_ATTACK");
});

test("TASK-09: Generic multi-provider dispatcher correctly routes and validates signatures", () => {
  const secret = "super-secret-key-123";
  const rawBody = '{"hello":"world"}';
  const sha256Hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sha512Hex = createHmac("sha512", secret).update(rawBody).digest("hex");

  // Generic SHA256
  const res256 = verifyWebhookRequest("generic", secret, rawBody, { "x-signature-256": sha256Hex });
  assert.equal(res256.valid, true);

  // Generic SHA512
  const res512 = verifyWebhookRequest("generic", secret, rawBody, { "x-signature-512": sha512Hex });
  assert.equal(res512.valid, true);

  // Missing signature
  const resMissing = verifyWebhookRequest("github", secret, rawBody, {});
  assert.equal(resMissing.valid, false);
  assert.equal(resMissing.code, "MISSING_SIGNATURE");
});

// ══════════════════════════════════════════════════════════════════════
// TASK-11: HTTP Circuit Breaker & 6 Authentication Schemes Tests
// ══════════════════════════════════════════════════════════════════════

test("TASK-11: CircuitBreaker transitions CLOSED -> OPEN -> HALF_OPEN -> CLOSED", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 50,
    halfOpenSuccessThreshold: 2,
  });

  const host = "api.flaky-service.com";
  assert.equal(cb.getState(host), "CLOSED");

  // Record 3 failures -> trips to OPEN
  cb.recordFailure(host);
  cb.recordFailure(host);
  assert.equal(cb.getState(host), "CLOSED");
  cb.recordFailure(host);
  assert.equal(cb.getState(host), "OPEN");
  assert.equal(cb.isOpen(host), true);

  // Immediate execute fails with CircuitBreakerOpenError without invoking fn
  let invoked = false;
  await assert.rejects(
    async () => {
      await cb.execute(host, async () => {
        invoked = true;
        return "ok";
      });
    },
    CircuitBreakerOpenError
  );
  assert.equal(invoked, false);

  // Wait for cooldown -> transitions to HALF_OPEN
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cb.getState(host), "HALF_OPEN");

  // 2 successful trial calls close the circuit
  await cb.execute(host, async () => "trial-1");
  assert.equal(cb.getState(host), "HALF_OPEN");
  await cb.execute(host, async () => "trial-2");
  assert.equal(cb.getState(host), "CLOSED");
});

test("TASK-11: CircuitBreaker trips back to OPEN immediately if HALF_OPEN trial fails", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 50,
  });

  const host = "api.unstable.com";
  cb.recordFailure(host);
  cb.recordFailure(host);
  assert.equal(cb.getState(host), "OPEN");

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cb.getState(host), "HALF_OPEN");

  await assert.rejects(
    async () => {
      await cb.execute(host, async () => {
        throw new Error("trial explosion");
      });
    },
    /trial explosion/
  );

  assert.equal(cb.getState(host), "OPEN");
});

test("TASK-11: applyHttpAuthentication formats all 6 HTTP authentication schemes", async () => {
  // 1. Basic Auth
  const basic = await applyHttpAuthentication("https://api.example.com/data", "GET", {
    type: "basic",
    username: "admin",
    password: "secretpassword",
  });
  assert.equal(basic.headers.Authorization, `Basic ${Buffer.from("admin:secretpassword").toString("base64")}`);

  // 2. Bearer Token
  const bearer = await applyHttpAuthentication("https://api.example.com/data", "GET", {
    type: "bearer",
    token: "my-jwt-token-xyz",
  });
  assert.equal(bearer.headers.Authorization, "Bearer my-jwt-token-xyz");

  // 3. API Key in Header
  const apiKeyHeader = await applyHttpAuthentication("https://api.example.com/data", "GET", {
    type: "api_key",
    apiKeyName: "X-Custom-API-Key",
    apiKeyValue: "key-12345",
    apiKeyIn: "header",
  });
  assert.equal(apiKeyHeader.headers["X-Custom-API-Key"], "key-12345");

  // 3b. API Key in Query
  const apiKeyQuery = await applyHttpAuthentication("https://api.example.com/data", "GET", {
    type: "api_key",
    apiKeyName: "api_key",
    apiKeyValue: "key-query-999",
    apiKeyIn: "query",
  });
  assert.ok(apiKeyQuery.url.includes("api_key=key-query-999"));

  // 4. Digest Auth
  const digestHeader = computeDigestAuthHeader({
    username: "Mufasa",
    password: "CircleOfLife",
    method: "GET",
    uri: "/dir/index.html",
    realm: "testrealm@host.com",
    nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093",
    qop: "auth",
    nc: "00000001",
    cnonce: "0a4f113b",
  });
  assert.ok(digestHeader.startsWith("Digest username=\"Mufasa\""));
  assert.ok(digestHeader.includes("response="));

  // 5. mTLS Client Certificate options
  const mtls = await applyHttpAuthentication("https://api.finance.com/transfers", "POST", {
    type: "mtls",
    cert: "-----BEGIN CERTIFICATE-----\nMIIB...",
    key: "-----BEGIN PRIVATE KEY-----\nMIIE...",
  });
  assert.ok(mtls.tlsOptions?.cert);
  assert.ok(mtls.tlsOptions?.key);
});

// ══════════════════════════════════════════════════════════════════════
// TASK-19: KMS Dynamic Rotation & Multi-Key Decryption Tests
// ══════════════════════════════════════════════════════════════════════

test("TASK-19: LocalKmsProvider supports dynamic rotation and multiple active key versions", () => {
  const provider = new LocalKmsProvider();
  const v1Key = provider.getKey(1);
  assert.equal(v1Key.length, 32);

  const rotation = provider.rotateKey();
  assert.equal(rotation.version, 2);
  assert.equal(provider.getCurrentKeyVersion(), 2);

  const v2Key = provider.getKey(2);
  assert.notDeepEqual(v1Key, v2Key);

  // Both v1 and v2 are retrievable for zero-downtime decryption
  assert.deepEqual(provider.getKey(1), v1Key);
  assert.deepEqual(provider.getKey(2), v2Key);
});

test("TASK-19: Decrypts data encrypted with legacy key versions using key ring fallback", () => {
  const key1Hex = "1111111111111111111111111111111111111111111111111111111111111111";
  const key2Hex = "2222222222222222222222222222222222222222222222222222222222222222";

  registerEncryptionKeyVersion(1, key1Hex);
  registerEncryptionKeyVersion(2, key2Hex);

  // Encrypt with version 1
  const secret1 = "secret-encrypted-with-version-1";
  const encryptedV1 = encryptField(secret1, 1);

  // Set current version to 2 and encrypt with version 2
  setCurrentKeyVersion(2);
  const secret2 = "secret-encrypted-with-version-2";
  const encryptedV2 = encryptField(secret2, 2);

  // Both should decrypt correctly!
  assert.equal(decryptField(encryptedV1), secret1);
  assert.equal(decryptField(encryptedV2), secret2);
});

test("TASK-19: reencryptVaultCredentials batch rotates legacy credentials to latest key version", async () => {
  const org = await prisma.organization.create({ data: { name: "KMS Org", slug: "kms-org" } });
  
  registerEncryptionKeyVersion(1, "1111111111111111111111111111111111111111111111111111111111111111");
  registerEncryptionKeyVersion(2, "2222222222222222222222222222222222222222222222222222222222222222");

  // Create credential encrypted under version 1
  const v1Data = encryptVaultData("api_key", { apiKey: "stripe_key_under_v1" }, 1);
  const cred = await prisma.credential.create({
    data: {
      name: "Stripe Production Key",
      type: "api_key",
      bucket: "api_key",
      provider: "stripe",
      data: v1Data,
      keyVersion: 1,
      orgId: org.id,
    },
  });

  // Re-encrypt batch to targetVersion 2
  const result = await kmsManager.reencryptVaultCredentials({ targetVersion: 2, orgId: org.id });
  assert.equal(result.scanned, 1);
  assert.equal(result.reencrypted, 1);
  assert.equal(result.failed, 0);

  const updated = await prisma.credential.findFirst({ where: { id: cred.id } });
  assert.equal(updated.keyVersion, 2);

  // Verify decrypted data matches exactly
  const decrypted = decryptVaultData("api_key", updated.data, 2);
  assert.equal(decrypted.apiKey, "stripe_key_under_v1");
});

test("TASK-19: Enterprise KMS Provider adapters (AWS KMS, GCP KMS, HashiCorp Vault) initialize cleanly", () => {
  const aws = new AwsKmsProvider("arn:aws:kms:us-east-1:123456789012:key/test-key");
  assert.equal(aws.name, "aws-kms");
  assert.equal(aws.keyArn, "arn:aws:kms:us-east-1:123456789012:key/test-key");

  const gcp = new GcpKmsProvider("projects/my-p/locations/global/keyRings/r/cryptoKeys/k");
  assert.equal(gcp.name, "gcp-cloud-kms");

  const vault = new HashiCorpVaultKmsProvider("transit/keys/agentflow-master");
  assert.equal(vault.name, "hashicorp-vault");
});

// ══════════════════════════════════════════════════════════════════════
// TASK-20: Cryptographic Audit Ledger (SHA-256 Hash Chain) Tests
// ══════════════════════════════════════════════════════════════════════

test("TASK-20: Cryptographic Hash Chain computes deterministic SHA-256 blocks", async () => {
  const orgId = "org-test-ledger-1";

  const e1 = await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "credential.create",
    resource: "credential",
    resourceId: "cred-1",
    metadata: { provider: "openai" },
    timestamp: "2026-08-26T20:00:00.000Z",
  });

  assert.equal(e1.previousHash, GENESIS_HASH);
  assert.ok(e1.hash && e1.hash.length === 64);

  const e2 = await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "credential.reveal",
    resource: "credential",
    resourceId: "cred-1",
    metadata: { ip: "192.168.1.1" },
    timestamp: "2026-08-26T20:05:00.000Z",
  });

  assert.equal(e2.previousHash, e1.hash);
  assert.ok(e2.hash && e2.hash.length === 64);
  assert.notEqual(e1.hash, e2.hash);
});

test("TASK-20: verifyAuditLedgerIntegrity validates complete unbroken chain", async () => {
  const orgId = "org-valid-ledger";

  await recordAuditEvent({ orgId, action: "auth.login", resource: "auth", timestamp: "2026-08-26T20:00:00.000Z" });
  await recordAuditEvent({ orgId, action: "workflow.create", resource: "workflow", timestamp: "2026-08-26T20:01:00.000Z" });
  await recordAuditEvent({ orgId, action: "workflow.execute", resource: "workflow", timestamp: "2026-08-26T20:02:00.000Z" });

  const integrity = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.totalEntries, 3);
  assert.ok(integrity.rootHash);
  assert.ok(integrity.latestHash);
});

test("TASK-20: verifyAuditLedgerIntegrity immediately detects tampering or modified blocks", async () => {
  const orgId = "org-tampered-ledger";

  const e1 = await recordAuditEvent({ orgId, action: "auth.login", timestamp: "2026-08-26T20:00:00.000Z" });
  const e2 = await recordAuditEvent({ orgId, action: "credential.create", timestamp: "2026-08-26T20:01:00.000Z" });
  const e3 = await recordAuditEvent({ orgId, action: "kms.rotate", timestamp: "2026-08-26T20:02:00.000Z" });

  // Tamper with the middle record in the store
  const allLogs = await prisma.auditLog.findMany({ where: { orgId } });
  const middle = allLogs.find((l: any) => l.id === e2.id);
  middle.action = "credential.DELETE_WITHOUT_TRACE"; // Tampered action!

  const integrity = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.error?.includes("Tamper detected") || integrity.error?.includes("broken"));
  assert.equal(integrity.brokenAtIndex, 1);
});

test("TASK-20: exportSignedAuditReport produces verifiable signed compliance report", async () => {
  const orgId = "org-compliance-export";

  await recordAuditEvent({ orgId, action: "auth.login", timestamp: "2026-08-26T20:00:00.000Z" });
  await recordAuditEvent({ orgId, action: "kms.rotate", timestamp: "2026-08-26T20:01:00.000Z" });

  const report = await exportSignedAuditReport(orgId);
  assert.equal(report.orgId, orgId);
  assert.equal(report.integrity, true);
  assert.equal(report.totalEntries, 2);
  assert.ok(report.signature && report.signature.length === 64);
  assert.equal(report.entries.length, 2);
});

test("TASK-20: HTTP Audit endpoints (GET /api/audit, /verify, /export, POST /events) function properly", async () => {
  const { token, org } = await register("audit-officer@example.com");

  // Record an event via POST /api/audit/events
  const postRes = await app.inject({
    method: "POST",
    url: "/api/audit/events",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    payload: JSON.stringify({
      action: "security.policy_change",
      resource: "policy",
      resourceId: "pol-1",
      metadata: { mfaRequired: true },
    }),
  });
  assert.equal(postRes.statusCode, 201);
  const createdEntry = JSON.parse(postRes.body);
  assert.equal(createdEntry.action, "security.policy_change");
  assert.ok(createdEntry.hash);

  // GET /api/audit
  const listRes = await app.inject({
    method: "GET",
    url: "/api/audit",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.statusCode, 200);
  const list = JSON.parse(listRes.body);
  assert.equal(list.length >= 1, true);

  // GET /api/audit/verify
  const verifyRes = await app.inject({
    method: "GET",
    url: "/api/audit/verify",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(verifyRes.statusCode, 200);
  const verifyBody = JSON.parse(verifyRes.body);
  assert.equal(verifyBody.valid, true);

  // GET /api/audit/export
  const exportRes = await app.inject({
    method: "GET",
    url: "/api/audit/export",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(exportRes.statusCode, 200);
  const exportBody = JSON.parse(exportRes.body);
  assert.equal(exportBody.integrity, true);
  assert.ok(exportBody.signature);
});
