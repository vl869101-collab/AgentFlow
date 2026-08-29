import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalKmsProvider,
  decryptVaultEnvelope,
  encryptVaultEnvelope,
  rewrapVaultEnvelope,
  vaultEnvelopeSchema,
} from "../src/services/vault/index.js";

const keyV1 = "11".repeat(32);
const keyV2 = "22".repeat(32);

test("TASK-19: vault envelope uses a random AES-256-GCM DEK wrapped by the KMS key", () => {
  const kms = new LocalKmsProvider(keyV1);
  const plaintext = { apiKey: "sk_live_envelope", endpoint: "https://example.com" };
  const first = encryptVaultEnvelope(plaintext, kms);
  const second = encryptVaultEnvelope(plaintext, kms);

  assert.equal(vaultEnvelopeSchema.safeParse(first).success, true);
  assert.equal(first.algorithm, "aes-256-gcm");
  assert.equal(first.keyVersion, 1);
  assert.equal(first.wrappedKey.keyVersion, 1);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.wrappedKey.ciphertext, second.wrappedKey.ciphertext);
  assert.deepEqual(decryptVaultEnvelope(first, kms), plaintext);
});

test("TASK-19: KEK rotation rewraps only the DEK and preserves payload ciphertext", () => {
  const kms = new LocalKmsProvider(keyV1);
  const envelopeV1 = encryptVaultEnvelope({ token: "long-lived-token" }, kms, 1);
  kms.rotateKey(keyV2, 2);

  const envelopeV2 = rewrapVaultEnvelope(envelopeV1, kms, 2);
  assert.equal(envelopeV2.keyVersion, 2);
  assert.equal(envelopeV2.wrappedKey.keyVersion, 2);
  assert.equal(envelopeV2.iv, envelopeV1.iv);
  assert.equal(envelopeV2.tag, envelopeV1.tag);
  assert.equal(envelopeV2.ciphertext, envelopeV1.ciphertext);
  assert.notEqual(envelopeV2.wrappedKey.ciphertext, envelopeV1.wrappedKey.ciphertext);
  assert.deepEqual(decryptVaultEnvelope(envelopeV2, kms), { token: "long-lived-token" });
  assert.deepEqual(decryptVaultEnvelope(envelopeV1, kms), { token: "long-lived-token" });
});

test("TASK-19: envelope metadata and GCM integrity are fail-closed", () => {
  const kms = new LocalKmsProvider(keyV1);
  const envelope = encryptVaultEnvelope({ password: "correct horse battery staple" }, kms);

  assert.throws(
    () => decryptVaultEnvelope({ ...envelope, keyVersion: 2 }, kms),
    /key version metadata mismatch/,
  );
  assert.throws(
    () => decryptVaultEnvelope({ ...envelope, tag: Buffer.alloc(16).toString("base64") }, kms),
    /Unable to decrypt vault envelope/,
  );
  assert.equal(vaultEnvelopeSchema.safeParse({ ...envelope, algorithm: "aes-128-cbc" }).success, false);
});
