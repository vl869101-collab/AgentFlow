import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CredentialBucket, EncryptedFieldEnvelope } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const DEFAULT_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY || DEFAULT_KEY_HEX;
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hexadecimal characters");
  }
  return Buffer.from(keyHex, "hex");
}

function decodeBase64(value: unknown, field: string): Buffer {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`Invalid encrypted credential envelope: ${field}`);
  }
  return Buffer.from(value, "base64");
}

export function isEncryptedField(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("{") || !value.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(value);
    return Boolean(
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      parsed.enc === "aes-256-gcm-field" &&
      typeof parsed.iv === "string" &&
      typeof parsed.ct === "string" &&
      typeof parsed.tag === "string"
    );
  } catch {
    return false;
  }
}

export function encryptField(plaintext: string): string {
  if (typeof plaintext !== "string") plaintext = String(plaintext ?? "");
  if (isEncryptedField(plaintext)) return plaintext;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope: EncryptedFieldEnvelope = {
    iv: iv.toString("base64"),
    ct: ciphertext.toString("base64"),
    tag: authTag.toString("base64"),
    enc: "aes-256-gcm-field",
  };

  return JSON.stringify(envelope);
}

export function decryptField(envelope: string): string {
  if (typeof envelope !== "string" || !isEncryptedField(envelope)) {
    return envelope;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    return envelope;
  }

  const value = parsed as Record<string, unknown>;
  const iv = decodeBase64(value.iv, "iv");
  const ciphertext = decodeBase64(value.ct, "ct");
  const authTag = decodeBase64(value.tag, "tag");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted credential envelope lengths");
  }

  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt credential field");
  }
}

const DEFAULT_SENSITIVE_FIELDS = new Set([
  "apikey",
  "api_key",
  "secret",
  "secretkey",
  "secret_key",
  "password",
  "pass",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "clientsecret",
  "client_secret",
  "headervalue",
  "header_value",
  "paramvalue",
  "param_value",
  "pat",
  "value",
  "privatekey",
  "private_key",
  "credentials",
  "certificate",
  "client_id",
  "bot_token",
  "webhook_secret",
  "auth_token",
]);

export function isSensitiveFieldName(fieldName: string): boolean {
  if (!fieldName || typeof fieldName !== "string") return false;
  const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (DEFAULT_SENSITIVE_FIELDS.has(normalized)) return true;

  return (
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("token") ||
    (normalized.includes("key") &&
      !normalized.includes("headername") &&
      !normalized.includes("paramname") &&
      !normalized.includes("public") &&
      !normalized.includes("keyname"))
  );
}

export function encryptVaultData(bucket: CredentialBucket | string, data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === "object" ? encryptVaultData(bucket, item) : item)) as any;
  }

  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) {
      result[key] = val;
    } else if (typeof val === "string" && isSensitiveFieldName(key)) {
      result[key] = isEncryptedField(val) ? val : encryptField(val);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      result[key] = encryptVaultData(bucket, val);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) => (typeof item === "object" && item !== null ? encryptVaultData(bucket, item) : item));
    } else {
      result[key] = val;
    }
  }

  return result;
}

export function decryptVaultData(bucket: CredentialBucket | string, data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === "object" ? decryptVaultData(bucket, item) : item)) as any;
  }

  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) {
      result[key] = val;
    } else if (typeof val === "string" && isEncryptedField(val)) {
      result[key] = decryptField(val);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      result[key] = decryptVaultData(bucket, val);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) => (typeof item === "object" && item !== null ? decryptVaultData(bucket, item) : item));
    } else {
      result[key] = val;
    }
  }

  return result;
}

export function maskVaultData(
  bucket: CredentialBucket | string,
  data: Record<string, any>,
  maskString = "••••••••••••••••"
): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === "object" ? maskVaultData(bucket, item, maskString) : item)) as any;
  }

  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) {
      result[key] = val;
    } else if (isSensitiveFieldName(key) && val) {
      result[key] = maskString;
    } else if (typeof val === "object" && !Array.isArray(val)) {
      result[key] = maskVaultData(bucket, val, maskString);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) => (typeof item === "object" && item !== null ? maskVaultData(bucket, item, maskString) : item));
    } else {
      result[key] = val;
    }
  }

  return result;
}
