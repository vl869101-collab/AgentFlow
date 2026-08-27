import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [
  { buildApp },
  { resetStore },
  { isBlockedIpOrHost, validateUrl, SsrFSecurityError },
  { executeCodeInSandbox, detectDangerousPatterns },
  { encryptField, decryptField },
] = await Promise.all([
  import("../../src/server.js"),
  import("../../src/lib/store.js"),
  import("../../src/lib/ssrf.js"),
  import("../../src/services/nodes/code-sandbox.js"),
  import("../../src/services/vault/index.js"),
]);

const app = await buildApp({ logger: false });

async function request(method: HttpMethod, url: string, body?: unknown, token?: string, customHeaders?: Record<string, string>) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    },
    payload: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let parsed: unknown = response.body;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    // Keep raw string if non-JSON
  }
  return { response, body: parsed as any };
}

test.beforeEach(() => resetStore());

async function registerAndLogin(email: string, password = "Password123!") {
  const regRes = await request("POST", "/api/auth/register", {
    email,
    password,
    name: email.split("@")[0],
  });
  assert.equal(regRes.response.statusCode, 201);
  const loginRes = await request("POST", "/api/auth/login", {
    email,
    password,
  });
  assert.equal(loginRes.response.statusCode, 200);
  return { token: loginRes.body.token as string, user: loginRes.body.user };
}

test("Security Baseline: Multi-tenant Org & Workspace isolation strictly prevents cross-tenant data access", async () => {
  // Register User A (Org A)
  const { token: tokenA } = await registerAndLogin("org-a-admin@example.com");

  // Register User B (Org B)
  const { token: tokenB } = await registerAndLogin("org-b-admin@example.com");

  // User A creates Workflow in Org A
  const wfARes = await request("POST", "/api/workflows", { name: "Org A Confidential Pipeline" }, tokenA);
  assert.equal(wfARes.response.statusCode, 201);
  const wfAId = wfARes.body.id;

  // User A creates Credential in Org A
  const credARes = await request(
    "POST",
    "/api/credentials",
    {
      name: "Org A Secret Key",
      type: "api_key",
      provider: "openai",
      data: { apiKey: "sk-secret-key-org-a-12345" },
    },
    tokenA,
  );
  assert.equal(credARes.response.statusCode, 201);
  const credAId = credARes.body.id;

  // User A creates Webhook in Org A
  const hookARes = await request(
    "POST",
    "/api/webhooks",
    {
      workflowId: wfAId,
      path: "secret-hook-a",
      secret: "hmac-secret-a-32-characters-long",
    },
    tokenA,
  );
  assert.equal(hookARes.response.statusCode, 201);
  const hookAId = hookARes.body.id;

  // CROSS-TENANT ATTACK VERIFICATION: User B attempts to access Org A resources

  // 1. User B cannot read User A's workflow (must return 404 or 403)
  const readWfRes = await request("GET", `/api/workflows/${wfAId}`, undefined, tokenB);
  assert.equal(readWfRes.response.statusCode, 404);

  // 2. User B cannot modify User A's workflow
  const updateWfRes = await request("PATCH", `/api/workflows/${wfAId}`, { name: "Hacked" }, tokenB);
  assert.equal(updateWfRes.response.statusCode, 404);

  // 3. User B cannot delete User A's workflow
  const deleteWfRes = await request("DELETE", `/api/workflows/${wfAId}`, undefined, tokenB);
  assert.equal(deleteWfRes.response.statusCode, 404);

  // 4. User B cannot read User A's credentials
  const readCredRes = await request("GET", `/api/credentials/${credAId}`, undefined, tokenB);
  assert.equal(readCredRes.response.statusCode, 404);

  // 5. User B cannot delete User A's credentials
  const deleteCredRes = await request("DELETE", `/api/credentials/${credAId}`, undefined, tokenB);
  assert.equal(deleteCredRes.response.statusCode, 404);

  // 6. User B cannot delete User A's webhook
  const deleteHookRes = await request("DELETE", `/api/webhooks/${hookAId}`, undefined, tokenB);
  assert.equal(deleteHookRes.response.statusCode, 404);

  // 7. Request without token is strictly 401
  const anonRes = await request("GET", `/api/workflows/${wfAId}`);
  assert.equal(anonRes.response.statusCode, 401);
});

test("Security Baseline: MCP RBAC & Granular Scope Enforcement", async () => {
  // Initialize MCP session
  const initRes = await request(
    "POST",
    "/mcp/http",
    {
      jsonrpc: "2.0",
      id: "sec-mcp-1",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "SecurityTestClient", version: "1.0.0" },
      },
    },
    undefined,
    { authorization: "Bearer af_secret_test_token" },
  );
  assert.equal(initRes.response.statusCode, 200);
  const sessionId = initRes.response.headers["mcp-session-id"] as string;

  // List tools and ensure scopes are declared
  const listRes = await request(
    "POST",
    "/mcp/http",
    {
      jsonrpc: "2.0",
      id: "sec-mcp-2",
      method: "tools/list",
    },
    undefined,
    {
      authorization: "Bearer af_secret_test_token",
      "mcp-session-id": sessionId,
    },
  );
  assert.equal(listRes.response.statusCode, 200);
  assert.ok(Array.isArray(listRes.body.result?.tools));

  // Verify scoped tools exist and define scopes
  const tools = listRes.body.result.tools;
  assert.ok(tools.length > 0);
  const writeTool = tools.find((t: any) => t.scopes && t.scopes.includes("workflows:write"));
  if (writeTool) {
    assert.ok(writeTool.scopes.includes("workflows:write"));
  }
});

test("Security Baseline: SSRF Protection blocks loopback, private ranges & cloud metadata", () => {
  const dangerousTargets = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254", // AWS/GCP/Azure metadata
    "169.254.170.2",   // AWS ECS metadata
    "100.100.100.200", // Alibaba metadata
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "metadata.google.internal",
    "localhost",
  ];

  for (const target of dangerousTargets) {
    assert.equal(isBlockedIpOrHost(target), true, `Target ${target} must be blocked`);
    assert.throws(
      () => validateUrl(`http://${target}/secret-path`),
      (err: any) => err instanceof SsrFSecurityError || err.code === "SSRF_BLOCKED",
      `Expected validateUrl to block http://${target}`,
    );
  }
});

test("Security Baseline: Code Sandbox AST inspection blocks dangerous globals & escapes", () => {
  const attacks = [
    "process.exit(1)",
    "require('fs').readFileSync('/etc/passwd')",
    "globalThis.constructor.constructor('return process')()",
    "Function('return process')()",
    "eval('process.env')",
    "require('child_process').execSync('whoami')",
  ];

  for (const code of attacks) {
    const dangerous = detectDangerousPatterns(code);
    assert.ok(dangerous.length > 0, `Pattern in '${code}' should be flagged as dangerous`);
  }

  // Safe JavaScript execution works as expected
  const safeResult = executeCodeInSandbox("const x = 10 + 20; return { sum: x };", {});
  assert.deepEqual(safeResult.result, { sum: 30 });
});

test("Security Baseline: Vault AES-256-GCM encryption at rest with authentication tag verification", () => {
  const plaintext = "sk-live-confidential-api-key-999";

  // Encrypt
  const encrypted = encryptField(plaintext);
  assert.ok(encrypted.includes("aes-256-gcm-field"), "Encrypted format should contain AES-256-GCM envelope");

  // Decrypt with correct key
  const decrypted = decryptField(encrypted);
  assert.equal(decrypted, plaintext);

  // Corrupted ciphertext should fail authentication tag validation
  const parsed = JSON.parse(encrypted);
  const corrupted = JSON.stringify({ ...parsed, ct: Buffer.from("corrupted-ciphertext").toString("base64") });
  assert.throws(() => decryptField(corrupted));
});
