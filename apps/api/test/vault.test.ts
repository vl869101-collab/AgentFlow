import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptField,
  decryptField,
  isEncryptedField,
  isSensitiveFieldName,
  encryptVaultData,
  decryptVaultData,
  maskVaultData,
  BUCKET_DEFINITIONS,
  ALL_BUCKETS,
  getBucketDefinition,
  validateBucketData,
  getProvider,
  getProviderCount,
  listProviders,
  mapCredentialToBucket,
  getAllProviders,
  getCategories,
  type CredentialBucket,
} from "../src/services/vault/index.js";

// Standard HTTP inject testing
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ buildApp }, { resetStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
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
  return JSON.parse(login.body).token as string;
}

test.beforeEach(() => resetStore());

test("Vault AES-256-GCM: encrypts and decrypts single fields with authentication tag", () => {
  const secret = "sk-live-super-secret-key-123456";
  const encrypted = encryptField(secret);

  assert.notEqual(encrypted, secret);
  assert.equal(isEncryptedField(encrypted), true);

  const parsed = JSON.parse(encrypted);
  assert.equal(parsed.enc, "aes-256-gcm-field");
  assert.ok(parsed.iv);
  assert.ok(parsed.ct);
  assert.ok(parsed.tag);

  // Idempotence test
  const doubleEncrypted = encryptField(encrypted);
  assert.equal(doubleEncrypted, encrypted);

  // Decryption
  const decrypted = decryptField(encrypted);
  assert.equal(decrypted, secret);
});

test("Vault AES-256-GCM: rejects tampered ciphertext or corrupted auth tag", () => {
  const secret = "my-db-password-999";
  const encrypted = encryptField(secret);
  const envelope = JSON.parse(encrypted);

  // Corrupt the tag
  const badTagEnvelope = JSON.stringify({
    ...envelope,
    tag: Buffer.from("0000000000000000").toString("base64"),
  });

  assert.throws(() => {
    decryptField(badTagEnvelope);
  }, /Unable to decrypt credential field/);
});

test("Vault AES-256-GCM: handles sensitive field detection, per-field encryption and masking", () => {
  assert.equal(isSensitiveFieldName("apiKey"), true);
  assert.equal(isSensitiveFieldName("clientSecret"), true);
  assert.equal(isSensitiveFieldName("password"), true);
  assert.equal(isSensitiveFieldName("headerValue"), true);
  assert.equal(isSensitiveFieldName("headerName"), false);
  assert.equal(isSensitiveFieldName("apiUrl"), false);
  assert.equal(isSensitiveFieldName("domains"), false);

  const rawData = {
    apiKey: "ak_live_12345",
    headerName: "X-Custom-Key",
    apiUrl: "https://api.example.com",
    nested: {
      clientSecret: "shh_secret_99",
      publicFlag: true,
    },
  };

  // Encrypt
  const encryptedData = encryptVaultData("api_key", rawData);
  assert.equal(isEncryptedField(encryptedData.apiKey), true);
  assert.equal(encryptedData.headerName, "X-Custom-Key");
  assert.equal(encryptedData.apiUrl, "https://api.example.com");
  assert.equal(isEncryptedField(encryptedData.nested.clientSecret), true);
  assert.equal(encryptedData.nested.publicFlag, true);

  // Decrypt
  const decryptedData = decryptVaultData("api_key", encryptedData);
  assert.deepEqual(decryptedData, rawData);

  // Mask
  const masked = maskVaultData("api_key", rawData);
  assert.equal(masked.apiKey, "••••••••••••••••");
  assert.equal(masked.headerName, "X-Custom-Key");
  assert.equal(masked.apiUrl, "https://api.example.com");
  assert.equal(masked.nested.clientSecret, "••••••••••••••••");
  assert.equal(masked.nested.publicFlag, true);
});

test("Vault Buckets: verifies all bucket schemas and validations", () => {
  assert.equal(ALL_BUCKETS.length, 13);
  const expectedBuckets: CredentialBucket[] = [
    "api_key",
    "bearer_token",
    "basic_auth",
    "oauth2_managed",
    "oauth2_custom",
    "header_auth",
    "query_auth",
    "mcp_oauth2",
    "digest_auth",
    "custom_headers",
    "aws_iam",
    "certificate_auth",
    "database_connection",
  ];

  for (const bucket of expectedBuckets) {
    const def = getBucketDefinition(bucket);
    assert.ok(def);
    assert.equal(def.bucket, bucket);
    assert.ok(def.displayName.length > 0);
    assert.ok(def.fields.length > 0);
  }

  // Validation tests
  const validApiKey = validateBucketData("api_key", { apiKey: "test-key" });
  assert.equal(validApiKey.valid, true);

  const invalidApiKey = validateBucketData("api_key", { headerName: "X-Key" });
  assert.equal(invalidApiKey.valid, false);
  assert.ok(invalidApiKey.errors.length > 0);

  const validBasicAuth = validateBucketData("basic_auth", { username: "admin", password: "pwd" });
  assert.equal(validBasicAuth.valid, true);
});

test("Vault 510 Providers: catalog contains >= 510 providers with correct mapping and lookup", () => {
  const count = getProviderCount();
  assert.ok(count >= 510, `Expected at least 510 providers, found ${count}`);

  const all = getAllProviders();
  assert.equal(all.length, count);

  // Test specific major providers
  const openai = getProvider("openai");
  assert.ok(openai);
  assert.equal(openai?.bucket, "api_key");
  assert.equal(openai?.category, "AI & Machine Learning");

  const slack = getProvider("slack");
  assert.ok(slack);
  assert.equal(slack?.bucket, "oauth2_managed");

  const github = getProvider("github");
  assert.ok(github);
  assert.equal(github?.bucket, "oauth2_managed");

  const mcp = getProvider("mcp_generic");
  assert.ok(mcp);
  assert.equal(mcp?.bucket, "mcp_oauth2");

  // Filtering
  const aiList = listProviders({ category: "AI & Machine Learning" });
  assert.ok(aiList.length >= 30);

  const searchResults = listProviders({ search: "Stripe" });
  assert.ok(searchResults.some((p) => p.id === "stripe"));

  // Categories
  const categories = getCategories();
  assert.ok(categories.length >= 8);

  // Bucket mapper helper
  const mapped = mapCredentialToBucket("openai", { token: "sk-openai-123" });
  assert.equal(mapped.bucket, "api_key");
  assert.equal(mapped.data.apiKey, "sk-openai-123");
});

test("Vault Routes Integration: buckets, providers, credential creation & reveal", async () => {
  const token = await register("vault_tester@example.com");

  // 1. List buckets
  const bucketsRes = await app.inject({
    method: "GET",
    url: "/api/credentials/buckets",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(bucketsRes.statusCode, 200);
  const buckets = JSON.parse(bucketsRes.body);
  assert.equal(buckets.length, 13);

  // 2. List providers
  const providersRes = await app.inject({
    method: "GET",
    url: "/api/credentials/providers?search=github",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(providersRes.statusCode, 200);
  const providers = JSON.parse(providersRes.body);
  assert.ok(providers.length >= 1);
  assert.equal(providers[0].id, "github");

  // 3. Create a credential with per-field AES-256-GCM encryption
  const createRes = await app.inject({
    method: "POST",
    url: "/api/credentials",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      name: "My OpenAI Key",
      type: "api_key",
      provider: "openai",
      data: {
        apiKey: "sk-live-1234567890abcdef",
        headerName: "Authorization",
      },
    }),
  });
  assert.equal(createRes.statusCode, 201);
  const created = JSON.parse(createRes.body);
  assert.ok(created.id);
  assert.equal(created.name, "My OpenAI Key");
  // Sensitive field is masked
  assert.equal(created.data.apiKey, "••••••••••••••••");
  assert.equal(created.data.headerName, "Authorization");

  // 4. Reveal credential (authorized admin/owner)
  const revealRes = await app.inject({
    method: "GET",
    url: `/api/credentials/${created.id}/reveal`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(revealRes.statusCode, 200);
  const revealed = JSON.parse(revealRes.body);
  assert.equal(revealed.data.apiKey, "sk-live-1234567890abcdef");
  assert.equal(revealed.data.headerName, "Authorization");

  // 5. SEC-05: Validação Anti-SSRF no connection tester
  const { validateSafeDestinationHost } = await import("../src/services/vault/connection-tester.js");
  await assert.rejects(
    async () => validateSafeDestinationHost("127.0.0.1"),
    /SSRF Security Error/
  );
  await assert.rejects(
    async () => validateSafeDestinationHost("http://169.254.169.254/latest/meta-data"),
    /SSRF Security Error/
  );
  await assert.rejects(
    async () => validateSafeDestinationHost("localhost"),
    /SSRF Security Error/
  );
  await assert.rejects(
    async () => validateSafeDestinationHost("10.0.0.1"),
    /SSRF Security Error/
  );
});

test("FINDING-F2-04 & FINDING-F2-05: Single credential retrieval and in-place secret rotation via PATCH", async () => {
  const token = await register("vault_f2_owner@example.com");
  const otherToken = await register("vault_f2_other@example.com");

  // 1. Create initial credential
  const createRes = await app.inject({
    method: "POST",
    url: "/api/credentials",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      name: "Stripe Production Key",
      type: "api_key",
      provider: "stripe",
      data: {
        apiKey: "sk_live_stripe_initial_secret_12345",
      },
    }),
  });
  assert.equal(createRes.statusCode, 201);
  const created = JSON.parse(createRes.body);

  // 2. FINDING-F2-04: GET /api/credentials/:id (Owner gets masked credential)
  const getRes = await app.inject({
    method: "GET",
    url: `/api/credentials/${created.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(getRes.statusCode, 200);
  const got = JSON.parse(getRes.body);
  assert.equal(got.id, created.id);
  assert.equal(got.name, "Stripe Production Key");
  assert.equal(got.data.apiKey, "••••••••••••••••");
  assert.equal(got.data.hasValue, true);

  // 3. FINDING-F2-04: GET /api/credentials/:id Cross-org returns strict 404
  const crossGetRes = await app.inject({
    method: "GET",
    url: `/api/credentials/${created.id}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(crossGetRes.statusCode, 404);
  assert.equal(JSON.parse(crossGetRes.body).code, "NOT_FOUND");

  // 4. FINDING-F2-05: PATCH /api/credentials/:id Renaming preserves existing secret
  const patchNameRes = await app.inject({
    method: "PATCH",
    url: `/api/credentials/${created.id}`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      name: "Stripe Rotated Label",
    }),
  });
  assert.equal(patchNameRes.statusCode, 200);
  const renamed = JSON.parse(patchNameRes.body);
  assert.equal(renamed.name, "Stripe Rotated Label");
  assert.equal(renamed.data.apiKey, "••••••••••••••••");

  // Reveal to verify secret unchanged
  const revealAfterRename = await app.inject({
    method: "GET",
    url: `/api/credentials/${created.id}/reveal`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(revealAfterRename.statusCode, 200);
  assert.equal(JSON.parse(revealAfterRename.body).data.apiKey, "sk_live_stripe_initial_secret_12345");

  // 5. FINDING-F2-05: PATCH /api/credentials/:id In-place secret rotation
  const patchSecretRes = await app.inject({
    method: "PATCH",
    url: `/api/credentials/${created.id}`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      data: {
        apiKey: "sk_live_stripe_NEW_ROTATED_SECRET_67890",
      },
    }),
  });
  assert.equal(patchSecretRes.statusCode, 200);
  const rotated = JSON.parse(patchSecretRes.body);
  assert.equal(rotated.data.apiKey, "••••••••••••••••");

  // Reveal to verify secret was rotated with new envelope
  const revealAfterRotate = await app.inject({
    method: "GET",
    url: `/api/credentials/${created.id}/reveal`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(revealAfterRotate.statusCode, 200);
  assert.equal(JSON.parse(revealAfterRotate.body).data.apiKey, "sk_live_stripe_NEW_ROTATED_SECRET_67890");

  // 6. FINDING-F2-05: PATCH /api/credentials/:id Cross-org returns strict 404
  const crossPatchRes = await app.inject({
    method: "PATCH",
    url: `/api/credentials/${created.id}`,
    headers: {
      authorization: `Bearer ${otherToken}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      name: "Hacked Name",
    }),
  });
  assert.equal(crossPatchRes.statusCode, 404);
  assert.equal(JSON.parse(crossPatchRes.body).code, "NOT_FOUND");
});

test.after(async () => {
  await app.close();
});
