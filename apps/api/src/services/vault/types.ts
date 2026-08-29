import { z } from "zod";
export {
  kmsWrappedKeySchema,
  vaultEnvelopeSchema,
  type KmsWrappedKey,
  type VaultEnvelope,
  type KmsKeyMetadata,
  type KmsKeyProvider,
  type KmsProvider,
} from "@agentflow/shared";

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

