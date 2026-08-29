import { z } from "zod";

export type CredentialBucket =
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "oauth2_managed"
  | "oauth2_custom"
  | "header_auth"
  | "query_auth"
  | "mcp_oauth2";

export type FieldType = "text" | "password" | "select" | "textarea" | "number" | "boolean" | "hidden";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: any;
  description?: string;
}

export interface BucketDefinition {
  bucket: CredentialBucket;
  displayName: string;
  description: string;
  fields: FieldDefinition[];
  sensitiveFieldNames: string[];
}

export interface ProviderSpec {
  id: string;
  name: string;
  bucket: CredentialBucket;
  category: string;
  documentationUrl?: string;
  defaultFields?: Record<string, any>;
  fields: FieldDefinition[];
}

export interface EncryptedFieldEnvelope {
  iv: string;
  ct: string;
  tag: string;
  enc: "aes-256-gcm-field";
  kv?: number;
}

const base64Schema = z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/);

/** Metadata stored beside every KMS-wrapped data-encryption key. */
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

/**
 * Versioned envelope persisted in Credential.data. The payload is encrypted
 * with a random 256-bit DEK; only the DEK is wrapped by the versioned KMS key.
 */
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
