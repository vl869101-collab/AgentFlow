import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.TRUST_PROXY = "true";

const { buildApp } = await import("../../src/server.js");
const { resetStore } = await import("../../src/lib/store.js");

const app = await buildApp({ logger: false });

async function request(method: string, url: string, body?: unknown, forwardedFor?: string) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    response,
    body: response.json() as Record<string, unknown>,
  };
}

function registration(email: string) {
  return {
    email,
    password: "StrongPass123",
    name: "E2E User",
  };
}

describe("authentication API", () => {
  beforeEach(() => resetStore());

  it("registers with a generic response that does not reveal the email", async () => {
    const email = `register-${Date.now()}@example.com`;
    const first = await request("POST", "/api/auth/register", registration(email));
    const duplicate = await request("POST", "/api/auth/register", registration(email));

    for (const { response, body } of [first, duplicate]) {
      expect(response.statusCode).toBe(201);
      expect(body.message).toBe("If registration can be completed, you can sign in with your credentials.");
      expect(JSON.stringify(body)).not.toContain(email);
    }
  });

  it("returns a JWT access token on successful login", async () => {
    const email = `login-${Date.now()}@example.com`;
    await request("POST", "/api/auth/register", registration(email));

    const { response, body } = await request("POST", "/api/auth/login", {
      email,
      password: "StrongPass123",
    });

    expect(response.statusCode).toBe(200);
    expect(body.token).toEqual(expect.any(String));
    expect((body.token as string).split(".")).toHaveLength(3);
  });

  it("rejects protected routes without an access token", async () => {
    const { response, body } = await request("GET", "/api/workflows");

    expect(response.statusCode).toBe(401);
    expect(body.code).toBe("AUTH_FAILED");
  });

  it("rate-limits registration after more than 10 requests", async () => {
    const responses = [];

    for (let index = 0; index < 11; index += 1) {
      // Invalid payloads keep this test focused on the limiter and avoid
      // performing expensive password hashing for every request.
      responses.push(await request("POST", "/api/auth/register", {}, "198.51.100.42"));
    }

    expect(responses.some(({ response }) => response.statusCode === 429)).toBe(true);
  });
});

afterAll(async () => {
  await app.close();
});
