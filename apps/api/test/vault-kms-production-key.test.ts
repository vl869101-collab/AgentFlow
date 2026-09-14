import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  assertKmsKeySecurity,
  resetKeyRing,
  getEncryptionKey,
  DEFAULT_KEY_HEX,
} from "../src/services/vault/crypto.js";
import { LocalKmsProvider } from "../src/services/vault/kms.js";
import { buildApp } from "../src/server.js";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.ALLOW_MEMORY_DB = "1";

test("GAP-06: Production KMS key security and fail-closed startup", async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const originalAllowMemory = process.env.ALLOW_MEMORY_DB;

  t.afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalKey !== undefined) {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    }
    if (originalAllowMemory !== undefined) {
      process.env.ALLOW_MEMORY_DB = originalAllowMemory;
    } else {
      delete process.env.ALLOW_MEMORY_DB;
    }
    resetKeyRing();
  });

  await t.test("fails startup in production if CREDENTIAL_ENCRYPTION_KEY is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    resetKeyRing();

    assert.throws(
      () => assertKmsKeySecurity(),
      /CREDENTIAL_ENCRYPTION_KEY is required in production/
    );

    assert.throws(
      () => new LocalKmsProvider(),
      /CREDENTIAL_ENCRYPTION_KEY is required in production/
    );

    await assert.rejects(
      async () => buildApp({ logger: false }),
      /CREDENTIAL_ENCRYPTION_KEY is required in production/
    );
  });

  await t.test("fails in production if key equals DEFAULT_KEY_HEX", () => {
    process.env.NODE_ENV = "production";
    process.env.CREDENTIAL_ENCRYPTION_KEY = DEFAULT_KEY_HEX;
    resetKeyRing();

    assert.throws(
      () => assertKmsKeySecurity(),
      /cannot use the default insecure fallback key in production/
    );

    assert.throws(
      () => new LocalKmsProvider(DEFAULT_KEY_HEX),
      /cannot use the default insecure fallback key in production/
    );
  });

  await t.test("fails in production if key has low entropy or repeating patterns", () => {
    process.env.NODE_ENV = "production";
    const repeatingKey = "01".repeat(32);
    process.env.CREDENTIAL_ENCRYPTION_KEY = repeatingKey;
    resetKeyRing();

    assert.throws(
      () => assertKmsKeySecurity(),
      /insufficient entropy/
    );

    const patternedKey = "01234567".repeat(8);
    assert.throws(
      () => assertKmsKeySecurity(patternedKey),
      /insufficient entropy/
    );
  });

  await t.test("succeeds in production when strong high-entropy 32-byte hex key is provided", () => {
    process.env.NODE_ENV = "production";
    const strongKey = randomBytes(32).toString("hex");
    process.env.CREDENTIAL_ENCRYPTION_KEY = strongKey;
    resetKeyRing();

    assert.doesNotThrow(() => assertKmsKeySecurity());
    const provider = new LocalKmsProvider(strongKey);
    assert.equal(provider.isHealthy(), true);
    assert.equal(getEncryptionKey().toString("hex"), strongKey);
  });

  await t.test("preserves synthetic mock fallback key in non-production environments", () => {
    process.env.NODE_ENV = "test";
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    resetKeyRing();

    assert.doesNotThrow(() => assertKmsKeySecurity());
    const provider = new LocalKmsProvider();
    assert.equal(provider.isHealthy(), true);
    assert.equal(getEncryptionKey().toString("hex"), DEFAULT_KEY_HEX);
  });
});
