import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalKmsProvider,
  AwsKmsProvider,
  HashiCorpVaultKmsProvider,
  GcpKmsProvider,
  MockKmsProvider,
  FallbackKmsProvider,
  KmsManager,
  decryptVaultEnvelope,
  encryptVaultEnvelope,
  rewrapVaultEnvelope,
  vaultEnvelopeSchema,
} from "../src/services/vault/index.js";

const keyV1 = "11".repeat(32);
const keyV2 = "22".repeat(32);
const keyV3 = "33".repeat(32);

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

test("TASK-19: AwsKmsProvider adapter wraps DEK with AWS KMS Key ARN metadata", () => {
  const awsKms = new AwsKmsProvider({
    keyArn: "arn:aws:kms:us-east-1:111122223333:key/agentflow-secret-key",
    region: "us-east-1",
    fallbackHex: keyV1,
  });

  assert.equal(awsKms.type, "aws-kms");
  assert.equal(awsKms.name, "aws-kms");
  assert.equal(awsKms.keyArn, "arn:aws:kms:us-east-1:111122223333:key/agentflow-secret-key");

  const plaintext = { awsSecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
  const env = encryptVaultEnvelope(plaintext, awsKms);

  assert.equal(env.wrappedKey.provider, "aws-kms");
  assert.deepEqual(decryptVaultEnvelope(env, awsKms), plaintext);

  const keys = awsKms.listKeys();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].keyArn, "arn:aws:kms:us-east-1:111122223333:key/agentflow-secret-key");
});

test("TASK-19: HashiCorpVaultKmsProvider adapter wraps DEK with Transit Engine metadata", () => {
  const vaultKms = new HashiCorpVaultKmsProvider({
    transitPath: "transit",
    keyName: "agentflow-prod-key",
    vaultUrl: "https://vault.internal:8200",
    fallbackHex: keyV1,
  });

  assert.equal(vaultKms.type, "hashicorp-vault");
  assert.equal(vaultKms.name, "hashicorp-vault");
  assert.equal(vaultKms.transitPath, "transit");

  const plaintext = { dbPassword: "SuperSecretVaultPassword123!" };
  const env = encryptVaultEnvelope(plaintext, vaultKms);

  assert.equal(env.wrappedKey.provider, "hashicorp-vault");
  assert.deepEqual(decryptVaultEnvelope(env, vaultKms), plaintext);

  const keys = vaultKms.listKeys();
  assert.equal(keys[0].transitPath, "transit/keys/agentflow-prod-key");
});

test("TASK-19: MockKmsProvider supports simulated outages and fault injection", () => {
  const mockKms = new MockKmsProvider(keyV1);
  assert.equal(mockKms.type, "mock");
  assert.equal(mockKms.isHealthy(), true);

  const plaintext = { testToken: "ci-mock-token-xyz" };
  const env = encryptVaultEnvelope(plaintext, mockKms);
  assert.deepEqual(decryptVaultEnvelope(env, mockKms), plaintext);

  // Simulate outage
  mockKms.setSimulatedDown(true);
  assert.equal(mockKms.isHealthy(), false);
  assert.throws(() => encryptVaultEnvelope(plaintext, mockKms), /Simulated KMS Provider outage/);
  assert.throws(() => decryptVaultEnvelope(env, mockKms), /Simulated KMS Provider outage/);

  // Recovery
  mockKms.setSimulatedDown(false);
  assert.equal(mockKms.isHealthy(), true);
  assert.deepEqual(decryptVaultEnvelope(env, mockKms), plaintext);
});

test("TASK-19: FallbackKmsProvider seamless fallback when primary provider is unavailable", () => {
  const primaryMock = new MockKmsProvider(keyV1);
  const fallbackLocal = new LocalKmsProvider(keyV1, "backup-local");

  const resilientKms = new FallbackKmsProvider({
    primary: primaryMock,
    fallback: fallbackLocal,
  });

  assert.equal(resilientKms.type, "fallback");
  assert.equal(resilientKms.isHealthy(), true);

  // 1. Works with primary healthy
  const plaintext = { secretApiKey: "resilient-api-key-999" };
  const env1 = encryptVaultEnvelope(plaintext, resilientKms);
  assert.equal(env1.wrappedKey.provider, "mock-kms");
  assert.deepEqual(decryptVaultEnvelope(env1, resilientKms), plaintext);

  // 2. Primary fails, seamless fallback on encrypt & unwrap
  primaryMock.setSimulatedDown(true);
  const env2 = encryptVaultEnvelope(plaintext, resilientKms);
  assert.equal(env2.wrappedKey.provider, "backup-local");
  assert.deepEqual(decryptVaultEnvelope(env2, resilientKms), plaintext);

  // Fallback unwraps keys created by fallback provider
  assert.deepEqual(decryptVaultEnvelope(env2, fallbackLocal), plaintext);
});

test("TASK-19: KmsManager handles switching providers and multi-version key rotation", () => {
  const manager = new KmsManager(new LocalKmsProvider(keyV1, "kms-primary"));
  assert.equal(manager.getCurrentKeyVersion(), 1);

  const rot1 = manager.rotateMasterKey(keyV2, 2);
  assert.equal(rot1.version, 2);
  assert.equal(manager.getCurrentKeyVersion(), 2);

  const envelope = encryptVaultEnvelope({ payload: "data-v2" }, manager.getProvider());
  assert.equal(envelope.keyVersion, 2);
  assert.deepEqual(decryptVaultEnvelope(envelope, manager.getProvider()), { payload: "data-v2" });

  // Switch to AwsKmsProvider
  const awsProvider = new AwsKmsProvider({ fallbackHex: keyV2 });
  awsProvider.registerKey(2, keyV2);
  awsProvider.registerKey(3, keyV3);
  manager.setProvider(awsProvider);

  const rot2 = manager.rotateMasterKey(keyV3, 3);
  assert.equal(rot2.version, 3);
  assert.equal(manager.getCurrentKeyVersion(), 3);
});
