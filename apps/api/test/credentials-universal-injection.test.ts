import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCredentialReferences,
  resolveSingleCredential,
  resolveUniversalCredentials,
} from "../src/services/vault/universal-resolver.js";
import {
  refreshOAuth2Credential,
  ensureFreshOAuth2Token,
  KNOWN_PROVIDER_TOKEN_URLS,
} from "../src/services/vault/oauth-refresh.js";
import { encryptVaultData } from "../src/services/vault/crypto.js";
import { prisma } from "../src/lib/prisma.js";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ resetStore }] = await Promise.all([
  import("../src/lib/store.js"),
]);

test.beforeEach(() => resetStore());

test("Universal Credential Resolver: extracts credentials declared in n8n formats", () => {
  // 1. config.credentials object
  const config1 = {
    credentials: {
      googleSheetsOAuth2Api: { id: "cred_google_123" },
      slackApi: { id: "cred_slack_456" },
      openAiApi: "cred_openai_789",
    },
  };
  const refs1 = extractCredentialReferences(config1);
  assert.equal(refs1.length, 3);
  assert.deepEqual(refs1, [
    { key: "googleSheetsOAuth2Api", credentialId: "cred_google_123" },
    { key: "slackApi", credentialId: "cred_slack_456" },
    { key: "openAiApi", credentialId: "cred_openai_789" },
  ]);

  // 2. config.credentialId legacy
  const config2 = {
    credentialId: "cred_default_999",
  };
  const refs2 = extractCredentialReferences(config2);
  assert.equal(refs2.length, 1);
  assert.deepEqual(refs2, [
    { key: "default", credentialId: "cred_default_999" },
  ]);

  // 3. parameters.credentials (nested parameters structure)
  const config3 = {
    parameters: {
      credentials: {
        githubOAuth2: { id: "cred_gh_1" },
      },
    },
  };
  const refs3 = extractCredentialReferences(config3);
  assert.equal(refs3.length, 1);
  assert.deepEqual(refs3, [
    { key: "githubOAuth2", credentialId: "cred_gh_1" },
  ]);
});

test("Universal Credential Resolver: resolves and decrypts credentials with provider categorization", async () => {
  const org = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-org-${Date.now()}`,
    },
  });

  const encryptedData = encryptVaultData("api_key", {
    apiKey: "sk-ant-test-api-key-value",
    endpoint: "https://api.anthropic.com",
  });

  const cred = await prisma.credential.create({
    data: {
      name: "Anthropic Claude API",
      type: "api_key",
      provider: "anthropic",
      data: JSON.stringify(encryptedData),
      orgId: org.id,
    },
  });

  const resolved = await resolveSingleCredential(cred.id, org.id);
  assert.ok(resolved);
  assert.equal(resolved.id, cred.id);
  assert.equal(resolved.provider, "anthropic");
  assert.equal(resolved.data.apiKey, "sk-ant-test-api-key-value");
  assert.equal(resolved.apiKey, "sk-ant-test-api-key-value");
  assert.equal(resolved.token, "sk-ant-test-api-key-value");
  // Check that maskedData contains masked secrets
  assert.equal(resolved.maskedData.apiKey, "••••••••••••••••");

  // Universal resolution for node config
  const universal = await resolveUniversalCredentials(
    {
      credentials: {
        anthropicApi: { id: cred.id },
      },
    },
    org.id
  );

  assert.ok(universal.byType.anthropicApi);
  assert.equal(universal.byType.anthropicApi.apiKey, "sk-ant-test-api-key-value");
  assert.ok(universal.byProvider.anthropic);
  assert.equal(universal.apiKey, "sk-ant-test-api-key-value");
});

test("OAuth2 Single-Flight Refresh Lock: deduplicates concurrent refresh calls", async () => {
  const org = await prisma.organization.create({
    data: {
      name: "OAuth Org",
      slug: `oauth-org-${Date.now()}`,
    },
  });

  // Create an expired OAuth2 credential
  const expiredDate = new Date(Date.now() - 10000).toISOString();
  const encryptedData = encryptVaultData("oauth2_managed", {
    accessToken: "old_expired_access_token",
    refreshToken: "valid_refresh_token_xyz",
    expiresAt: expiredDate,
    tokenType: "Bearer",
    clientId: "mock_client_id",
    clientSecret: "mock_client_secret",
  });

  const cred = await prisma.credential.create({
    data: {
      name: "Google Sheets OAuth2",
      type: "oauth2",
      provider: "google_sheets",
      data: JSON.stringify(encryptedData),
      orgId: org.id,
    },
  });

  let networkCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("oauth2.googleapis.com") || String(url).includes("token")) {
      networkCallCount++;
      // Artificial delay to test concurrency single-flight locking
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(
        JSON.stringify({
          access_token: "new_refreshed_access_token_123",
          refresh_token: "rotated_refresh_token_456",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    // Launch 5 parallel refresh requests for the same credential
    const promises = [
      ensureFreshOAuth2Token(cred.id, org.id),
      ensureFreshOAuth2Token(cred.id, org.id),
      ensureFreshOAuth2Token(cred.id, org.id),
      ensureFreshOAuth2Token(cred.id, org.id),
      ensureFreshOAuth2Token(cred.id, org.id),
    ];

    const results = await Promise.all(promises);

    // All 5 must receive the new fresh access token
    for (const res of results) {
      assert.equal(res.accessToken, "new_refreshed_access_token_123");
      assert.equal(res.refreshed, true);
    }

    // Single-flight lock ensures exactly 1 network call occurred, preventing race conditions
    assert.equal(networkCallCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
