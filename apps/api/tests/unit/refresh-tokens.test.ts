import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashRefreshToken } from "../../src/lib/refresh-tokens.js";

describe("hashRefreshToken", () => {
  it("returns a consistent SHA-256 hex digest for the same input", () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test";
    const first = hashRefreshToken(token);
    const second = hashRefreshToken(token);
    expect(first).toBe(second);
  });

  it("matches manual SHA-256 computation", () => {
    const token = "some-refresh-token-value";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashRefreshToken(token)).toBe(expected);
  });

  it("produces a 64-character lowercase hex string", () => {
    const hash = hashRefreshToken("anything");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    const a = hashRefreshToken("token-a");
    const b = hashRefreshToken("token-b");
    expect(a).not.toBe(b);
  });

  it("handles empty string without throwing", () => {
    const hash = hashRefreshToken("");
    expect(hash).toHaveLength(64);
  });
});
