import { describe, it, expect } from "vitest";

// crypto.ts throws at module top-level if CREDENTIAL_ENCRYPTION_KEY is missing,
// so we must set the env var before dynamic-importing the module.
const TEST_KEY = "a".repeat(64); // 32 bytes as 64 hex chars
process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

const { encryptCredential, decryptCredential } = await import(
  "../../src/lib/crypto.js"
);

describe("encryptCredential / decryptCredential roundtrip", () => {
  it("encrypts then decrypts back to the original plaintext", () => {
    const plaintext = "sk_test_1234567890abcdef";
    const envelope = encryptCredential(plaintext);
    expect(decryptCredential(envelope)).toBe(plaintext);
  });

  it("rejects empty-string ciphertext as invalid envelope (known edge case)", () => {
    // encryptCredential("") produces an empty base64 ct field, which
    // decodeBase64 rejects. This is a known limitation: empty plaintext
    // cannot roundtrip through the current implementation.
    const envelope = encryptCredential("");
    expect(() => decryptCredential(envelope)).toThrow(
      "Invalid encrypted credential envelope: ct",
    );
  });

  it("roundtrips unicode content", () => {
    const plaintext = "créditos-日本語-🔑";
    const envelope = encryptCredential(plaintext);
    expect(decryptCredential(envelope)).toBe(plaintext);
  });

  it("produces a valid JSON envelope with iv, ct, tag", () => {
    const envelope = JSON.parse(encryptCredential("test"));
    expect(envelope).toHaveProperty("iv");
    expect(envelope).toHaveProperty("ct");
    expect(envelope).toHaveProperty("tag");
    // All should be base64 strings
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.ct).toBe("string");
    expect(typeof envelope.tag).toBe("string");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptCredential("same");
    const b = encryptCredential("same");
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decryptCredential(a)).toBe("same");
    expect(decryptCredential(b)).toBe("same");
  });

  it("throws on tampered ciphertext", () => {
    const envelope = JSON.parse(encryptCredential("secret"));
    // Flip a character in the ciphertext
    const chars = envelope.ct.split("");
    chars[0] = chars[0] === "A" ? "B" : "A";
    envelope.ct = chars.join("");
    expect(() => decryptCredential(JSON.stringify(envelope))).toThrow();
  });

  it("throws on invalid JSON input", () => {
    expect(() => decryptCredential("not-json")).toThrow(
      "Invalid encrypted credential envelope",
    );
  });

  it("throws on missing fields", () => {
    expect(() => decryptCredential(JSON.stringify({ iv: "x" }))).toThrow();
  });
});
