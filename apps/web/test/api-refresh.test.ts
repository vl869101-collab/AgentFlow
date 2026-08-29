import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  rawRequest,
  setToken,
  clearToken,
  getToken,
  getRefreshToken,
  refreshAuthToken,
  resetAuthLock,
  ApiError,
} from "../src/lib/api";

describe("Web API Client & Concurrent Refresh Token Interceptor", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as unknown as { window: unknown }).window;
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    resetAuthLock();

    // Mock window & localStorage
    const mockLocalStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockLocalStorage,
      location: { href: "", pathname: "/dashboard" },
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    resetAuthLock();
  });

  it("manages tokens in storage correctly", () => {
    setToken("access_123", "refresh_456");
    assert.equal(getToken(), "access_123");
    assert.equal(getRefreshToken(), "refresh_456");

    clearToken();
    assert.equal(getToken(), null);
    assert.equal(getRefreshToken(), null);
  });

  it("handles successful rawRequest without auth headers", async () => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      assert.match(url, /\/api\/auth\/login$/);
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ token: "tok_abc", refreshToken: "ref_xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await rawRequest<{ token: string; refreshToken: string }>("/api/auth/login", {
      method: "POST",
      body: { email: "test@example.com", password: "pwd" },
    });

    assert.equal(res.token, "tok_abc");
    assert.equal(res.refreshToken, "ref_xyz");
  });

  it("handles 204 No Content gracefully in rawRequest and api", async () => {
    globalThis.fetch = async () => {
      return new Response(null, { status: 204 });
    };

    const resRaw = await rawRequest<void>("/api/auth/logout", { method: "POST" });
    assert.equal(resRaw, undefined);

    const resApi = await api<void>("/api/workflows/123", { method: "DELETE" });
    assert.equal(resApi, undefined);
  });

  it("refreshes token transparently on 401 and retries original request", async () => {
    setToken("expired_access_token", "valid_refresh_token");

    let apiCallCount = 0;
    let refreshCallCount = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        refreshCallCount++;
        const reqBody = JSON.parse(String(init?.body || "{}"));
        assert.equal(reqBody.refreshToken, "valid_refresh_token");
        return new Response(JSON.stringify({ token: "new_access_token", refreshToken: "new_refresh_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/workflows")) {
        apiCallCount++;
        const authHeader = (init?.headers as Record<string, string>)?.Authorization;
        if (authHeader === "Bearer expired_access_token") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (authHeader === "Bearer new_access_token") {
          return new Response(JSON.stringify([{ id: "wf-1", name: "Workflow 1" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response("Not found", { status: 404 });
    };

    const workflows = await api<Array<{ id: string; name: string }>>("/api/workflows");

    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].id, "wf-1");
    assert.equal(apiCallCount, 2);
    assert.equal(refreshCallCount, 1);
    assert.equal(getToken(), "new_access_token");
    assert.equal(getRefreshToken(), "new_refresh_token");
  });

  it("handles concurrent 401 requests by locking refresh to a single in-flight call and replay", async () => {
    setToken("expired_token", "valid_refresh_token");

    let refreshCallCount = 0;
    let totalApiAttempts = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/auth/refresh")) {
        refreshCallCount++;
        // Simulate network latency for refresh
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(JSON.stringify({ token: "refreshed_jwt", refreshToken: "refreshed_refresh" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/test-endpoint-")) {
        totalApiAttempts++;
        const authHeader = (init?.headers as Record<string, string>)?.Authorization;
        if (authHeader === "Bearer expired_token") {
          return new Response(JSON.stringify({ error: "Token expired" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (authHeader === "Bearer refreshed_jwt") {
          const endpointId = url.split("/api/test-endpoint-")[1];
          return new Response(JSON.stringify({ result: `data_${endpointId}` }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    };

    // Fire 6 simultaneous concurrent requests while token is expired
    const promises = [
      api<{ result: string }>("/api/test-endpoint-1"),
      api<{ result: string }>("/api/test-endpoint-2"),
      api<{ result: string }>("/api/test-endpoint-3"),
      api<{ result: string }>("/api/test-endpoint-4"),
      api<{ result: string }>("/api/test-endpoint-5"),
      api<{ result: string }>("/api/test-endpoint-6"),
    ];

    const results = await Promise.all(promises);

    assert.equal(results.length, 6);
    assert.deepEqual(
      results.map((r) => r.result),
      ["data_1", "data_2", "data_3", "data_4", "data_5", "data_6"]
    );

    // Critical assertion: EXACTLY 1 refresh call was made despite 6 concurrent 401s
    assert.equal(refreshCallCount, 1);
    // 6 initial 401s + 6 retries with new token = 12 total attempts
    assert.equal(totalApiAttempts, 12);
    assert.equal(getToken(), "refreshed_jwt");
  });

  it("clears tokens and redirects to /login if refresh fails", async () => {
    setToken("expired_token", "invalid_refresh_token");

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        return new Response(JSON.stringify({ error: "Invalid refresh token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    await assert.rejects(
      async () => {
        await api("/api/workflows");
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(getToken(), null);
    assert.equal(getRefreshToken(), null);
    const win = (globalThis as unknown as { window: { location: { href: string } } }).window;
    assert.equal(win.location.href, "/login");
  });

  it("throws ApiError on non-401 HTTP errors without attempting refresh", async () => {
    setToken("valid_token", "valid_refresh");
    let refreshTriggered = false;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        refreshTriggered = true;
        return new Response(JSON.stringify({ token: "new" }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Validation error on payload" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    };

    await assert.rejects(
      async () => {
        await api("/api/workflows", { method: "POST", body: {} });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 422);
        assert.equal(err.message, "Validation error on payload");
        return true;
      }
    );

    assert.equal(refreshTriggered, false);
  });
});
