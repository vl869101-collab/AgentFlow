import { describe, it, expect, vi, beforeEach } from "vitest";

// getEnv() caches the result in a module-level `_env` variable.
// We use vi.resetModules() + dynamic import to get a fresh module each test.

const BASE_ENV = {
  NODE_ENV: "test",
  PORT: "3001",
  JWT_SECRET: "a".repeat(32), // meets the 32-char minimum
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGIN: "http://localhost:3000",
};

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
    // Restore a valid env before each test
    Object.assign(process.env, BASE_ENV);
  });

  it("returns parsed env when all required vars are present", async () => {
    const { getEnv } = await import("../../src/lib/env.js");
    const env = getEnv();
    expect(env.JWT_SECRET).toBe(BASE_ENV.JWT_SECRET);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("test");
  });

  it("throws when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    const { getEnv } = await import("../../src/lib/env.js");
    expect(() => getEnv()).toThrow("Invalid environment");
  });

  it("throws when JWT_SECRET is too short (< 32 chars)", async () => {
    process.env.JWT_SECRET = "short";
    const { getEnv } = await import("../../src/lib/env.js");
    expect(() => getEnv()).toThrow("Invalid environment");
  });

  it("uses default PORT when not provided", async () => {
    delete process.env.PORT;
    const { getEnv } = await import("../../src/lib/env.js");
    const env = getEnv();
    expect(env.PORT).toBe(3001); // default
  });

  it("rejects invalid NODE_ENV values", async () => {
    process.env.NODE_ENV = "staging" as any;
    const { getEnv } = await import("../../src/lib/env.js");
    expect(() => getEnv()).toThrow("Invalid environment");
  });

  it("coerces PORT from string to number", async () => {
    process.env.PORT = "8080";
    const { getEnv } = await import("../../src/lib/env.js");
    const env = getEnv();
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe("number");
  });

  it("accepts optional DATABASE_URL when provided", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    const { getEnv } = await import("../../src/lib/env.js");
    const env = getEnv();
    expect(env.DATABASE_URL).toBe("postgresql://localhost:5432/test");
  });

  it("works without optional vars (DATABASE_URL, NVIDIA_*, STRIPE_*)", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.NVIDIA_NIM_BASE_URL;
    delete process.env.NVIDIA_NIM_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { getEnv } = await import("../../src/lib/env.js");
    const env = getEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
