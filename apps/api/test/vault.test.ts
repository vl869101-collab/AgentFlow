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

test("Vault 8 Buckets: verifies all 8 bucket schemas and validations", () => {
  assert.equal(ALL_BUCKETS.length, 8);
  const expectedBuckets: CredentialBucket[] = [
    "api_key",
    "bearer_token",
    "basic_auth",
    "oauth2_managed",
    "oauth2_custom",
    "header_auth",
    "query_auth",
    "mcp_oauth2",
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
  assert.equal(buckets.length, 8);

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
});

test.after(async () => {
  await app.close();
});
