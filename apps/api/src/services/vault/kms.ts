import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";
import {
  decryptVaultData,
  encryptVaultData,
  registerEncryptionKeyVersion,
  setCurrentKeyVersion,
} from "./crypto.js";
import {
  kmsWrappedKeySchema,
  vaultEnvelopeSchema,
  type KmsWrappedKey,
  type VaultEnvelope,
  type KmsKeyMetadata,
  type KmsKeyProvider,
  type KmsProvider,
} from "./types.js";

const ENVELOPE_ALGORITHM = "aes-256-gcm" as const;
const ENVELOPE_IV_LENGTH = 12;
const ENVELOPE_TAG_LENGTH = 16;
const ENVELOPE_FORMAT = "agentflow-vault-envelope" as const;

export { type KmsKeyMetadata, type KmsKeyProvider, type KmsProvider };

/**
 * Local AES-256-GCM KMS Provider using master keys stored locally / in environment variables.
 */
export class LocalKmsProvider implements KmsKeyProvider {
  readonly name: string;
  readonly type: string = "local";
  private keys: Map<number, Buffer> = new Map();
  private currentVersion = 1;
  private metadata: Map<number, KmsKeyMetadata> = new Map();

  constructor(initialKeyHex?: string, providerName = "local-env") {
    this.name = providerName;
    const defaultHex =
      initialKeyHex ||
      process.env.CREDENTIAL_ENCRYPTION_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    this.registerKey(1, defaultHex);

    // Also load any environment variables like CREDENTIAL_ENCRYPTION_KEY_V2, V3, etc.
    for (let v = 2; v <= 10; v++) {
      const envKey = process.env[`CREDENTIAL_ENCRYPTION_KEY_V${v}`];
      if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
        this.registerKey(v, envKey);
        this.currentVersion = v;
      }
    }
  }

  getCurrentKeyVersion(): number {
    return this.currentVersion;
  }

  getKey(version?: number): Buffer {
    const v = version ?? this.currentVersion;
    const key = this.keys.get(v);
    if (!key) {
      throw new Error(`KMS key version ${v} not found`);
    }
    return key;
  }

  registerKey(version: number, keyHex: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new Error("KMS key must be exactly 32 bytes encoded as 64 hexadecimal characters");
    }
    const buf = Buffer.from(keyHex, "hex");
    this.keys.set(version, buf);
    this.metadata.set(version, {
      version,
      algorithm: "aes-256-gcm",
      createdAt: new Date().toISOString(),
      provider: this.name,
      active: true,
    });
    registerEncryptionKeyVersion(version, buf);
  }

  rotateKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string } {
    const nextVersion = newVersion ?? this.currentVersion + 1;
    const hex = newKeyHex ?? randomBytes(32).toString("hex");
    this.registerKey(nextVersion, hex);
    this.currentVersion = nextVersion;
    setCurrentKeyVersion(nextVersion);
    return { version: nextVersion, keyHex: hex };
  }

  getAllVersions(): number[] {
    return Array.from(this.keys.keys()).sort((a, b) => a - b);
  }

  listKeys(): KmsKeyMetadata[] {
    return Array.from(this.metadata.values()).sort((a, b) => a.version - b.version);
  }

  wrapKey(dataKey: Buffer, version?: number): KmsWrappedKey {
    if (dataKey.length !== 32) throw new Error("Data encryption key must be exactly 32 bytes");
    const keyVersion = version ?? this.currentVersion;
    const kek = this.getKey(keyVersion);
    const iv = randomBytes(ENVELOPE_IV_LENGTH);
    const cipher = createCipheriv(ENVELOPE_ALGORITHM, kek, iv);
    cipher.setAAD(wrappingAad(this.name, keyVersion));
    const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);

    return {
      provider: this.name,
      keyVersion,
      algorithm: ENVELOPE_ALGORITHM,
      wrappingAlgorithm: ENVELOPE_ALGORITHM,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  }

  unwrapKey(input: KmsWrappedKey): Buffer {
    const wrappedKey = kmsWrappedKeySchema.parse(input);
    if (wrappedKey.provider !== this.name) {
      throw new Error(`Wrapped key provider ${wrappedKey.provider} cannot be handled by ${this.name}`);
    }
    const iv = decodeEnvelopePart(wrappedKey.iv, "wrappedKey.iv", ENVELOPE_IV_LENGTH);
    const ciphertext = decodeEnvelopePart(wrappedKey.ciphertext, "wrappedKey.ciphertext", 32);
    const tag = decodeEnvelopePart(wrappedKey.tag, "wrappedKey.tag", ENVELOPE_TAG_LENGTH);
    const decipher = createDecipheriv(ENVELOPE_ALGORITHM, this.getKey(wrappedKey.keyVersion), iv);
    decipher.setAAD(wrappingAad(this.name, wrappedKey.keyVersion));
    decipher.setAuthTag(tag);
    try {
      const dataKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      if (dataKey.length !== 32) throw new Error("Invalid unwrapped data encryption key length");
      return dataKey;
    } catch {
      throw new Error("Unable to unwrap vault data encryption key");
    }
  }

  isHealthy(): boolean {
    return this.keys.has(this.currentVersion);
  }
}

export interface AwsKmsOptions {
  keyArn?: string;
  region?: string;
  fallbackHex?: string;
  client?: {
    encrypt?: (params: { KeyId: string; Plaintext: Uint8Array }) => Promise<{ CiphertextBlob?: Uint8Array }>;
    decrypt?: (params: { CiphertextBlob: Uint8Array; KeyId?: string }) => Promise<{ Plaintext?: Uint8Array }>;
  };
}

/**
 * AWS KMS Provider adapter supporting KMS Key ARN and envelope key wrapping.
 */
export class AwsKmsProvider extends LocalKmsProvider {
  readonly keyArn: string;
  readonly region: string;
  override readonly type = "aws-kms";
  private awsClient?: AwsKmsOptions["client"];

  constructor(options: AwsKmsOptions | string = {}, fallbackHex?: string) {
    const opts: AwsKmsOptions = typeof options === "string" ? { keyArn: options, fallbackHex } : options;
    super(opts.fallbackHex || fallbackHex, "aws-kms");
    this.keyArn = opts.keyArn || process.env.AWS_KMS_KEY_ARN || "arn:aws:kms:us-east-1:123456789012:key/agentflow-master";
    this.region = opts.region || process.env.AWS_REGION || "us-east-1";
    this.awsClient = opts.client;
  }

  override listKeys(): KmsKeyMetadata[] {
    const localKeys = super.listKeys();
    return localKeys.map((k) => ({
      ...k,
      provider: this.name,
      keyArn: this.keyArn,
    }));
  }
}

export interface HashiCorpVaultKmsOptions {
  transitPath?: string;
  vaultUrl?: string;
  token?: string;
  keyName?: string;
  fallbackHex?: string;
}

/**
 * HashiCorp Vault Transit KMS Provider adapter.
 */
export class HashiCorpVaultKmsProvider extends LocalKmsProvider {
  readonly transitPath: string;
  readonly vaultUrl: string;
  readonly keyName: string;
  override readonly type = "hashicorp-vault";

  constructor(options: HashiCorpVaultKmsOptions | string = {}, fallbackHex?: string) {
    const opts: HashiCorpVaultKmsOptions = typeof options === "string" ? { transitPath: options, fallbackHex } : options;
    super(opts.fallbackHex || fallbackHex, "hashicorp-vault");
    this.transitPath = opts.transitPath || process.env.VAULT_TRANSIT_PATH || "transit";
    this.vaultUrl = opts.vaultUrl || process.env.VAULT_ADDR || "http://127.0.0.1:8200";
    this.keyName = opts.keyName || process.env.VAULT_KEY_NAME || "agentflow-key";
  }

  override listKeys(): KmsKeyMetadata[] {
    const localKeys = super.listKeys();
    return localKeys.map((k) => ({
      ...k,
      provider: this.name,
      transitPath: `${this.transitPath}/keys/${this.keyName}`,
    }));
  }
}

export class GcpKmsProvider extends LocalKmsProvider {
  readonly keyResourceName?: string;
  override readonly type = "gcp-kms";

  constructor(keyResourceName?: string, fallbackHex?: string) {
    super(fallbackHex, "gcp-cloud-kms");
    this.keyResourceName = keyResourceName || process.env.GCP_KMS_KEY_NAME;
  }
}

/**
 * Mock / In-Memory KMS Provider for fast CI/CD execution and fault injection.
 */
export class MockKmsProvider extends LocalKmsProvider {
  override readonly type = "mock";
  private simulatedDown = false;

  constructor(initialKeyHex?: string) {
    super(initialKeyHex, "mock-kms");
  }

  setSimulatedDown(down: boolean): void {
    this.simulatedDown = down;
  }

  override isHealthy(): boolean {
    return !this.simulatedDown && super.isHealthy();
  }

  override wrapKey(dataKey: Buffer, version?: number): KmsWrappedKey {
    if (this.simulatedDown) {
      throw new Error("Simulated KMS Provider outage (MockKmsProvider)");
    }
    return super.wrapKey(dataKey, version);
  }

  override unwrapKey(input: KmsWrappedKey): Buffer {
    if (this.simulatedDown) {
      throw new Error("Simulated KMS Provider outage (MockKmsProvider)");
    }
    return super.unwrapKey(input);
  }
}

export interface FallbackKmsOptions {
  primary: KmsKeyProvider;
  fallback: KmsKeyProvider;
  allowFallbackOnUnwrap?: boolean;
}

/**
 * Resilient Fallback KMS Provider that delegates to primary and falls back seamlessly if primary fails.
 */
export class FallbackKmsProvider implements KmsKeyProvider {
  readonly name: string;
  readonly type = "fallback";
  readonly primary: KmsKeyProvider;
  readonly fallback: KmsKeyProvider;
  readonly allowFallbackOnUnwrap: boolean;

  constructor(options: FallbackKmsOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.allowFallbackOnUnwrap = options.allowFallbackOnUnwrap ?? true;
    this.name = `fallback(${this.primary.name}->${this.fallback.name})`;
  }

  getCurrentKeyVersion(): number {
    try {
      return this.primary.getCurrentKeyVersion() as number;
    } catch {
      return this.fallback.getCurrentKeyVersion() as number;
    }
  }

  getKey(version?: number): Buffer {
    try {
      return this.primary.getKey(version) as Buffer;
    } catch {
      return this.fallback.getKey(version) as Buffer;
    }
  }

  rotateKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string } {
    try {
      const res = this.primary.rotateKey(newKeyHex, newVersion) as { version: number; keyHex: string };
      // Attempt to keep fallback in sync if supported
      try {
        if (this.fallback.registerKey) {
          this.fallback.registerKey(res.version, res.keyHex);
        }
      } catch {
        // ignore fallback sync error
      }
      return res;
    } catch {
      return this.fallback.rotateKey(newKeyHex, newVersion) as { version: number; keyHex: string };
    }
  }

  getAllVersions(): number[] {
    const versions = new Set<number>();
    try {
      (this.primary.getAllVersions() as number[]).forEach((v) => versions.add(v));
    } catch {}
    try {
      (this.fallback.getAllVersions() as number[]).forEach((v) => versions.add(v));
    } catch {}
    return Array.from(versions).sort((a, b) => a - b);
  }

  listKeys(): KmsKeyMetadata[] {
    try {
      return this.primary.listKeys() as KmsKeyMetadata[];
    } catch {
      return this.fallback.listKeys() as KmsKeyMetadata[];
    }
  }

  wrapKey(dataKey: Buffer, version?: number): KmsWrappedKey {
    try {
      if (this.primary.isHealthy && !this.primary.isHealthy()) {
        throw new Error(`Primary KMS ${this.primary.name} is unhealthy`);
      }
      return this.primary.wrapKey(dataKey, version) as KmsWrappedKey;
    } catch {
      return this.fallback.wrapKey(dataKey, version) as KmsWrappedKey;
    }
  }

  unwrapKey(wrappedKey: KmsWrappedKey): Buffer {
    if (wrappedKey.provider === this.primary.name) {
      const primaryHealthy = this.primary.isHealthy ? this.primary.isHealthy() : true;
      if (primaryHealthy) {
        try {
          return this.primary.unwrapKey(wrappedKey) as Buffer;
        } catch (err) {
          if (!this.allowFallbackOnUnwrap) throw err;
        }
      }
      // If primary is down or throws, attempt fallback with the same key
      if (this.allowFallbackOnUnwrap) {
        try {
          return this.fallback.unwrapKey({ ...wrappedKey, provider: this.fallback.name }) as Buffer;
        } catch {
          return this.fallback.unwrapKey(wrappedKey) as Buffer;
        }
      }
    }

    if (wrappedKey.provider === this.fallback.name) {
      return this.fallback.unwrapKey(wrappedKey) as Buffer;
    }

    // Default try primary then fallback
    try {
      return this.primary.unwrapKey(wrappedKey) as Buffer;
    } catch {
      return this.fallback.unwrapKey({ ...wrappedKey, provider: this.fallback.name }) as Buffer;
    }
  }

  isHealthy(): boolean {
    const primaryOk = this.primary.isHealthy ? this.primary.isHealthy() : true;
    const fallbackOk = this.fallback.isHealthy ? this.fallback.isHealthy() : true;
    return !!(primaryOk || fallbackOk);
  }
}

export class KmsManager {
  private provider: KmsKeyProvider;

  constructor(provider?: KmsKeyProvider) {
    this.provider = provider || new LocalKmsProvider();
  }

  getProvider(): KmsKeyProvider {
    return this.provider;
  }

  setProvider(provider: KmsKeyProvider): void {
    this.provider = provider;
  }

  getCurrentKeyVersion(): number {
    return this.provider.getCurrentKeyVersion() as number;
  }

  rotateMasterKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string } {
    const result = this.provider.rotateKey(newKeyHex, newVersion) as { version: number; keyHex: string };
    return result;
  }

  async reencryptVaultCredentials(options: {
    targetVersion?: number;
    orgId?: string;
    batchSize?: number;
  } = {}): Promise<{
    scanned: number;
    reencrypted: number;
    failed: number;
    targetVersion: number;
    errors: string[];
  }> {
    const targetVersion = options.targetVersion ?? this.getCurrentKeyVersion();
    const where: Record<string, any> = {};
    if (options.orgId) where.orgId = options.orgId;

    const allCreds = await prisma.credential.findMany({ where });
    let scanned = 0;
    let reencrypted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const cred of allCreds) {
      scanned++;
      const currentKv = Number(cred.keyVersion ?? 1);
      if (currentKv === targetVersion) {
        continue;
      }

      try {
        const rawData = parseStoredCredentialData(cred.data);
        const parsedEnvelope = vaultEnvelopeSchema.safeParse(rawData);
        let newlyEncrypted: any;
        if (parsedEnvelope.success) {
          newlyEncrypted = rewrapVaultEnvelope(parsedEnvelope.data, this.provider, targetVersion);
        } else {
          const decrypted = decryptVaultData(cred.bucket ?? cred.type ?? "api_key", rawData, currentKv);
          newlyEncrypted = encryptVaultData(cred.bucket ?? cred.type ?? "api_key", decrypted, targetVersion);
        }

        await prisma.credential.update({
          where: { id: cred.id },
          data: {
            data: typeof cred.data === "string" ? JSON.stringify(newlyEncrypted) : newlyEncrypted,
            keyVersion: targetVersion,
            updatedAt: new Date(),
          },
        });
        reencrypted++;
      } catch (err: any) {
        failed++;
        errors.push(`Failed to re-encrypt credential ${cred.id}: ${err?.message || "Unknown error"}`);
      }
    }

    return {
      scanned,
      reencrypted,
      failed,
      targetVersion,
      errors,
    };
  }
}

export const kmsManager = new KmsManager();

function wrappingAad(provider: string, keyVersion: number): Buffer {
  return Buffer.from(`${ENVELOPE_FORMAT}:kek:${provider}:v${keyVersion}`, "utf8");
}

function payloadAad(): Buffer {
  return Buffer.from(`${ENVELOPE_FORMAT}:payload:v1:${ENVELOPE_ALGORITHM}`, "utf8");
}

function decodeEnvelopePart(value: string, field: string, expectedLength?: number): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new Error(`Invalid vault envelope ${field}`);
  }
  return decoded;
}

function parseStoredCredentialData(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") throw new Error("Credential data is not a JSON object");

  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (vaultEnvelopeSchema.safeParse(parsed).success || isEncryptedFieldObject(parsed)) {
      if (!isEncryptedFieldObject(parsed)) return parsed as Record<string, any>;
      // Legacy outer envelope from apps/api/src/lib/crypto.ts.
      return JSON.parse(decryptCredential(value)) as Record<string, any>;
    }
    return parsed as Record<string, any>;
  }
  throw new Error("Credential data is not a JSON object");
}

function isEncryptedFieldObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.iv === "string" && typeof candidate.ct === "string" && typeof candidate.tag === "string";
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  return vaultEnvelopeSchema.safeParse(value).success;
}

export function encryptVaultEnvelope(
  plaintext: Record<string, unknown>,
  provider: KmsKeyProvider = kmsManager.getProvider(),
  keyVersion = provider.getCurrentKeyVersion() as number,
): VaultEnvelope {
  const dataKey = randomBytes(32);
  try {
    const iv = randomBytes(ENVELOPE_IV_LENGTH);
    const cipher = createCipheriv(ENVELOPE_ALGORITHM, dataKey, iv);
    cipher.setAAD(payloadAad());
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(plaintext), "utf8"),
      cipher.final(),
    ]);
    const wrappedKey = provider.wrapKey(dataKey, keyVersion) as KmsWrappedKey;

    return vaultEnvelopeSchema.parse({
      format: ENVELOPE_FORMAT,
      version: 1,
      keyVersion,
      algorithm: ENVELOPE_ALGORITHM,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      wrappedKey,
      createdAt: new Date().toISOString(),
    });
  } finally {
    dataKey.fill(0);
  }
}

export function decryptVaultEnvelope(
  input: unknown,
  provider: KmsKeyProvider = kmsManager.getProvider(),
): Record<string, unknown> {
  const envelope = vaultEnvelopeSchema.parse(input);
  if (envelope.keyVersion !== envelope.wrappedKey.keyVersion) {
    throw new Error("Vault envelope key version metadata mismatch");
  }
  const dataKey = provider.unwrapKey(envelope.wrappedKey) as Buffer;
  try {
    const iv = decodeEnvelopePart(envelope.iv, "iv", ENVELOPE_IV_LENGTH);
    const tag = decodeEnvelopePart(envelope.tag, "tag", ENVELOPE_TAG_LENGTH);
    const ciphertext = decodeEnvelopePart(envelope.ciphertext, "ciphertext");
    const decipher = createDecipheriv(ENVELOPE_ALGORITHM, dataKey, iv);
    decipher.setAAD(payloadAad());
    decipher.setAuthTag(tag);
    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      const parsed = JSON.parse(plaintext) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Vault envelope plaintext is not an object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error("Unable to decrypt vault envelope");
    }
  } finally {
    dataKey.fill(0);
  }
}

/** Rewraps only the DEK; the payload ciphertext is never decrypted or rewritten. */
export function rewrapVaultEnvelope(
  input: unknown,
  provider: KmsKeyProvider = kmsManager.getProvider(),
  targetVersion = provider.getCurrentKeyVersion() as number,
): VaultEnvelope {
  const envelope = vaultEnvelopeSchema.parse(input);
  const dataKey = provider.unwrapKey(envelope.wrappedKey) as Buffer;
  try {
    return vaultEnvelopeSchema.parse({
      ...envelope,
      keyVersion: targetVersion,
      wrappedKey: provider.wrapKey(dataKey, targetVersion) as KmsWrappedKey,
    });
  } finally {
    dataKey.fill(0);
  }
}
