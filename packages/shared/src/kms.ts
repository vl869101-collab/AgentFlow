import { z } from "zod";

const base64Schema = z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const kmsWrappedKeySchema = z.object({
  provider: z.string().min(1),
  keyVersion: z.number().int().positive(),
  algorithm: z.literal("aes-256-gcm"),
  wrappingAlgorithm: z.literal("aes-256-gcm"),
  iv: base64Schema,
  ciphertext: base64Schema,
  tag: base64Schema,
});

export type KmsWrappedKey = z.infer<typeof kmsWrappedKeySchema>;

export const vaultEnvelopeSchema = z.object({
  format: z.literal("agentflow-vault-envelope"),
  version: z.literal(1),
  keyVersion: z.number().int().positive(),
  algorithm: z.literal("aes-256-gcm"),
  iv: base64Schema,
  ciphertext: base64Schema,
  tag: base64Schema,
  wrappedKey: kmsWrappedKeySchema,
  createdAt: z.string().datetime(),
});

export type VaultEnvelope = z.infer<typeof vaultEnvelopeSchema>;

export interface KmsKeyMetadata {
  version: number;
  algorithm: string;
  createdAt: string;
  provider: string;
  active: boolean;
  keyArn?: string;
  transitPath?: string;
  alias?: string;
}

/**
 * Interface definition for pluggable KMS Key Providers.
 * Supports Local AES-256-GCM, AWS KMS, HashiCorp Vault, and Mock/CI adapters.
 */
export interface KmsKeyProvider {
  readonly name: string;
  readonly type: "local" | "aws-kms" | "hashicorp-vault" | "gcp-kms" | "azure-keyvault" | "mock" | string;

  getCurrentKeyVersion(): number | Promise<number>;
  getKey(version?: number): Buffer | Promise<Buffer>;
  registerKey?(version: number, keyHex: string): void | Promise<void>;
  rotateKey(newKeyHex?: string, newVersion?: number): { version: number; keyHex: string } | Promise<{ version: number; keyHex: string }>;
  getAllVersions(): number[] | Promise<number[]>;
  listKeys(): KmsKeyMetadata[] | Promise<KmsKeyMetadata[]>;
  wrapKey(dataKey: Buffer, version?: number): KmsWrappedKey | Promise<KmsWrappedKey>;
  unwrapKey(wrappedKey: KmsWrappedKey): Buffer | Promise<Buffer>;

  /** Health check or readiness verify */
  isHealthy?(): Promise<boolean> | boolean;
}

export type KmsProvider = KmsKeyProvider;
