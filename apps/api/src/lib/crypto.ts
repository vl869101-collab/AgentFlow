import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivLength = 12;
const authTagLength = 16;
function getKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required to start the API");
  }
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

export function encryptCredential(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    ct: ciphertext.toString("base64"),
    tag: authTag.toString("base64"),
  });
}

export function decryptCredential(envelope: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error("Invalid encrypted credential envelope");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid encrypted credential envelope");
  }

  const value = parsed as Record<string, unknown>;
  const iv = decodeBase64(value.iv, "iv");
  const ciphertext = decodeBase64(value.ct, "ct");
  const authTag = decodeBase64(value.tag, "tag");
  if (iv.length !== ivLength || authTag.length !== authTagLength) {
    throw new Error("Invalid encrypted credential envelope");
  }

  try {
    const key = getKey();
    const decipher = createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt credential");
  }
}
