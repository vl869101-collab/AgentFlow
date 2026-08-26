import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import {
  decryptField,
  decryptVaultData,
  encryptField,
  encryptVaultData,
  getCurrentKeyVersion,
  isEncryptedField,
  registerEncryptionKeyVersion,
  setCurrentKeyVersion,
} from "./crypto.js";

export interface KmsKeyMetadata {
  version: number;
  algorithm: string;
  createdAt: string;
  provider: string;
  active: boolean;
}

export interface KmsProvider {
  name: string;
  getCurrentKeyVersion(): number;
  getKey(version?: number): Buffer;
  registerKey(version: number, keyHex: string): void;
  rotateKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string };
  getAllVersions(): number[];
  listKeys(): KmsKeyMetadata[];
}

export class LocalKmsProvider implements KmsProvider {
  name = "local-env";
  private keys: Map<number, Buffer> = new Map();
  private currentVersion = 1;
  private metadata: Map<number, KmsKeyMetadata> = new Map();

  constructor(initialKeyHex?: string) {
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
      // If version 1 is requested and exists, fallback
      const v1 = this.keys.get(1);
      if (v1) return v1;
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
}

export class AwsKmsProvider extends LocalKmsProvider {
  override name = "aws-kms";
  readonly keyArn?: string;

  constructor(keyArn?: string, fallbackHex?: string) {
    super(fallbackHex);
    this.keyArn = keyArn || process.env.AWS_KMS_KEY_ARN;
  }
}

export class GcpKmsProvider extends LocalKmsProvider {
  override name = "gcp-cloud-kms";
  readonly keyResourceName?: string;

  constructor(keyResourceName?: string, fallbackHex?: string) {
    super(fallbackHex);
    this.keyResourceName = keyResourceName || process.env.GCP_KMS_KEY_NAME;
  }
}

export class HashiCorpVaultKmsProvider extends LocalKmsProvider {
  override name = "hashicorp-vault";
  readonly transitPath?: string;

  constructor(transitPath?: string, fallbackHex?: string) {
    super(fallbackHex);
    this.transitPath = transitPath || process.env.VAULT_TRANSIT_PATH;
  }
}

export class KmsManager {
  private provider: KmsProvider;

  constructor(provider?: KmsProvider) {
    this.provider = provider || new LocalKmsProvider();
  }

  getProvider(): KmsProvider {
    return this.provider;
  }

  setProvider(provider: KmsProvider): void {
    this.provider = provider;
  }

  getCurrentKeyVersion(): number {
    return this.provider.getCurrentKeyVersion();
  }

  rotateMasterKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string } {
    const result = this.provider.rotateKey(newKeyHex, newVersion);
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
        const rawData =
          typeof cred.data === "string" ? JSON.parse(cred.data) : (cred.data as Record<string, any>);
        
        // Decrypt with whatever version was stored in the envelope/cred
        const decrypted = decryptVaultData(cred.bucket ?? "api_key", rawData);

        // Re-encrypt with the target key version
        const newlyEncrypted = encryptVaultData(cred.bucket ?? "api_key", decrypted, targetVersion);

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
