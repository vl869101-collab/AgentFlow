import assert from "node:assert/strict";
import test from "node:test";
import { verifyCredentialConnection } from "../src/services/vault/connection-tester.js";
import { encryptVaultEnvelope } from "../src/services/vault/index.js";
import { prisma } from "../src/lib/prisma.js";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ buildApp }, { resetStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
]);

const app = await buildApp({ logger: false });

async function registerAndLogin(email: string) {
  const reg = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: "StrongPass123!", name: "Test User" }),
  });
  assert.equal(reg.statusCode, 201);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: "StrongPass123!" }),
  });
  assert.equal(login.statusCode, 200);
  return JSON.parse(login.body).token as string;
}

test.beforeEach(() => resetStore());

test("Active Connection Tester: verifies OpenAI with mocked successful API response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.openai.com/v1/models")) {
      assert.equal(init?.headers?.Authorization, "Bearer sk-proj-openai-test-key-12345");
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const result = await verifyCredentialConnection({
      provider: "OpenAI API",
      type: "api_key",
      data: { apiKey: "sk-proj-openai-test-key-12345" },
    });

    assert.equal(result.success, true);
    assert.ok(result.latencyMs >= 0);
    assert.match(result.message, /Successfully connected to OpenAI API/i);
    assert.equal(result.accountDetails?.id, "openai");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Active Connection Tester: verifies Anthropic Claude API with mocked response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.anthropic.com/v1/models")) {
      assert.equal(init?.headers?.["x-api-key"], "sk-ant-test-anthropic-key-789");
      return new Response(
        JSON.stringify({
          data: [{ id: "claude-3-5-sonnet-20241022" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const result = await verifyCredentialConnection({
      provider: "Anthropic",
      type: "api_key",
      data: { apiKey: "sk-ant-test-anthropic-key-789" },
    });

    assert.equal(result.success, true);
    assert.ok(result.latencyMs >= 0);
    assert.match(result.message, /Successfully connected to Anthropic Claude API/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Active Connection Tester: verifies GitHub token extracting account details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.github.com/user")) {
      assert.equal(init?.headers?.Authorization, "Bearer ghp_valid_github_token_abc");
      return new Response(
        JSON.stringify({
          login: "octocat",
          id: 583231,
          name: "The Octocat",
          email: "octocat@github.com",
          company: "GitHub",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const result = await verifyCredentialConnection({
      provider: "GitHub OAuth2 API",
      type: "oauth2",
      data: { token: "ghp_valid_github_token_abc" },
    });

    assert.equal(result.success, true);
    assert.equal(result.accountDetails?.username, "octocat");
    assert.equal(result.accountDetails?.name, "The Octocat");
    assert.equal(result.accountDetails?.email, "octocat@github.com");
    assert.equal(result.accountDetails?.organization, "GitHub");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Active Connection Tester: verifies Slack auth.test response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("slack.com/api/auth.test")) {
      return new Response(
        JSON.stringify({
          ok: true,
          url: "https://agentflow.slack.com/",
          team: "AgentFlow Workspace",
          user: "agentflow_bot",
          team_id: "T12345678",
          user_id: "U12345678",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const result = await verifyCredentialConnection({
      provider: "Slack API",
      type: "oauth2",
      data: { token: "xoxb-test-slack-token" },
    });

    assert.equal(result.success, true);
    assert.equal(result.accountDetails?.username, "agentflow_bot");
    assert.equal(result.accountDetails?.organization, "AgentFlow Workspace");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Active Connection Tester: verifies Telegram bot token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.telegram.org/bot")) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789,
            is_bot: true,
            first_name: "AgentFlowBot",
            username: "agentflow_official_bot",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const result = await verifyCredentialConnection({
      provider: "Telegram API",
      type: "api_key",
      data: { token: "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" },
    });

    assert.equal(result.success, true);
    assert.equal(result.accountDetails?.username, "agentflow_official_bot");
    assert.equal(result.accountDetails?.name, "AgentFlowBot");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API Endpoint: POST /api/credentials/test tests unpersisted draft credential", async () => {
  const token = await registerAndLogin("test-draft@agentflow.com");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.openai.com/v1/models")) {
      return new Response(
        JSON.stringify({ object: "list", data: [{ id: "gpt-4o" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/credentials/test",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        provider: "OpenAI API",
        type: "api_key",
        data: { apiKey: "sk-proj-test-12345" },
      }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.latencyMs >= 0);
    assert.match(body.message, /Successfully connected to OpenAI API/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API Endpoint: POST /api/credentials/:id/test resolves encrypted vault credential and tests connection", async () => {
  const token = await registerAndLogin("test-saved@agentflow.com");

  // Get user's org from membership
  const member = await prisma.organizationMember.findFirst({ where: {} });
  assert.ok(member);
  const orgId = member.orgId;

  // Encrypt and create a GitHub credential
  const encryptedPayload = encryptVaultEnvelope({
    token: "ghp_saved_test_token_456",
    apiUrl: "https://api.github.com",
  });

  const cred = await prisma.credential.create({
    data: {
      name: "My GitHub Account",
      type: "oauth2",
      provider: "GitHub API",
      data: JSON.stringify(encryptedPayload),
      keyVersion: encryptedPayload.keyVersion,
      orgId,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init: any) => {
    if (String(url).includes("api.github.com/user")) {
      assert.equal(init?.headers?.Authorization, "Bearer ghp_saved_test_token_456");
      return new Response(
        JSON.stringify({
          login: "monalisa",
          id: 9999,
          name: "Mona Lisa",
          email: "mona@github.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const res = await app.inject({
      method: "POST",
      url: `/api/credentials/${cred.id}/test`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.accountDetails?.username, "monalisa");
    assert.equal(body.accountDetails?.name, "Mona Lisa");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API Endpoint: POST /api/credentials/:id/test returns 404 for nonexistent credential", async () => {
  const token = await registerAndLogin("test-404@agentflow.com");

  const res = await app.inject({
    method: "POST",
    url: "/api/credentials/nonexistent-id-12345/test",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(res.statusCode, 404);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
  assert.equal(body.error, "NOT_FOUND");
});
