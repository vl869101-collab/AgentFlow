process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

import test from "node:test";
import assert from "node:assert/strict";
import {
  isBlockedIpOrHost,
  validateUrl,
  assertSafeDestination,
  safeFetch,
  SsrFSecurityError,
  isAllowedEgressHostname,
} from "../src/lib/ssrf.js";
import { executeCodeInSandbox, detectDangerousPatterns } from "../src/services/nodes/code-sandbox.js";

const [{ buildApp }, { resetStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
]);

test("SSRF: Blocks private, loopback, link-local, and cloud metadata IPv4 addresses", () => {
  const blockedIps = [
    "127.0.0.1",
    "127.0.0.2",
    "127.255.255.255",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.254",
    "169.254.169.254", // Cloud metadata (AWS, GCP, Azure, DO)
    "169.254.170.2",   // AWS ECS task metadata
    "100.100.100.200", // Alibaba Cloud metadata
    "0.0.0.0",
    "255.255.255.255",
    "100.64.0.1",      // Carrier-grade NAT
    "192.0.2.1",       // TEST-NET-1
    "198.51.100.1",    // TEST-NET-2
    "203.0.113.1",     // TEST-NET-3
    "224.0.0.1",       // Multicast
  ];

  for (const ip of blockedIps) {
    assert.equal(isBlockedIpOrHost(ip), true, `Expected IP ${ip} to be blocked`);
    assert.throws(
      () => validateUrl(`http://${ip}/api`),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED",
      `Expected validateUrl to reject http://${ip}/api`,
    );
  }
});

test("SSRF: Blocks IPv6 loopback, link-local, unique-local, and IPv4-mapped addresses", () => {
  const blockedIpv6 = [
    "::1",
    "::",
    "fe80::1",
    "fe80::dead:beef",
    "fc00::1",
    "fd12:3456:789a:1::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
  ];

  for (const ip of blockedIpv6) {
    assert.equal(isBlockedIpOrHost(ip), true, `Expected IPv6 ${ip} to be blocked`);
  }
});

test("SSRF: Blocks internal hostnames, metadata domains, and dot suffixes", () => {
  const blockedHosts = [
    "localhost",
    "subdomain.localhost",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "server.local",
    "cluster.internal",
    "database.lan",
    "router.home",
    "domain.corp",
  ];

  for (const host of blockedHosts) {
    assert.equal(isBlockedIpOrHost(host), true, `Expected host ${host} to be blocked`);
    assert.throws(
      () => validateUrl(`http://${host}/`),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED",
      `Expected validateUrl to reject http://${host}/`,
    );
  }
});

test("SSRF: Blocks unsupported protocols and credentials in URL", () => {
  const invalidUrls = [
    "file:///etc/passwd",
    "gopher://127.0.0.1:6379/_PING",
    "dict://127.0.0.1:11211/stat",
    "ftp://ftp.example.com/file",
    "ldap://127.0.0.1:389/dc=example",
    "data:text/plain;base64,SGVsbG8=",
    "http://user:password@example.com/api",
    "https://admin:secret@api.github.com/",
  ];

  for (const url of invalidUrls) {
    assert.throws(
      () => validateUrl(url),
      (err: any) => err instanceof SsrFSecurityError,
      `Expected validateUrl to reject ${url}`,
    );
  }
});

test("SSRF: Allows valid public internet HTTP/HTTPS URLs", () => {
  const publicUrls = [
    "https://api.github.com/users/octocat",
    "https://hooks.slack.com/services/T00/B00/X00",
    "https://discord.com/api/v10/channels/123",
    "https://api.telegram.org/bot12345/getMe",
    "http://example.com/webhook",
  ];

  for (const url of publicUrls) {
    const parsed = validateUrl(url);
    assert.equal(parsed.protocol.startsWith("http"), true);
  }
});

test("Egress allowlist & blocklist configuration", () => {
  const prevAllow = process.env.EGRESS_ALLOWED_HOSTS;
  const prevBlock = process.env.EGRESS_BLOCKED_HOSTS;

  try {
    process.env.EGRESS_ALLOWED_HOSTS = "api.github.com,*.slack.com,discord.com";
    assert.equal(isAllowedEgressHostname("api.github.com"), true);
    assert.equal(isAllowedEgressHostname("hooks.slack.com"), true);
    assert.equal(isAllowedEgressHostname("discord.com"), true);
    assert.equal(isAllowedEgressHostname("malicious.com"), false);
    assert.equal(isAllowedEgressHostname("evil-slack.com"), false);

    process.env.EGRESS_BLOCKED_HOSTS = "blocked.org,*.badsite.net";
    assert.equal(isAllowedEgressHostname("blocked.org"), false);
    assert.equal(isAllowedEgressHostname("sub.badsite.net"), false);
  } finally {
    if (prevAllow !== undefined) process.env.EGRESS_ALLOWED_HOSTS = prevAllow;
    else delete process.env.EGRESS_ALLOWED_HOSTS;
    if (prevBlock !== undefined) process.env.EGRESS_BLOCKED_HOSTS = prevBlock;
    else delete process.env.EGRESS_BLOCKED_HOSTS;
  }
});

test("Code Sandbox: Blocks dangerous identifiers and patterns before execution", () => {
  const dangerousCodes = [
    "require('fs').readFileSync('/etc/passwd')",
    "process.exit(1)",
    "global.foo = 'bar'",
    "globalThis.secret = 123",
    "import fs from 'fs'",
    "eval('2 + 2')",
    "new Function('return 1')()",
    "fetch('http://evil.com')",
    "Buffer.from('hello')",
    "setTimeout(() => {}, 1000)",
    "setInterval(() => {}, 1000)",
  ];

  for (const code of dangerousCodes) {
    const dangers = detectDangerousPatterns(code);
    assert.ok(dangers.length > 0, `Expected dangerous patterns in: ${code}`);

    assert.rejects(
      async () => executeCodeInSandbox(code, {}),
      (err: any) => err.code === "CODE_SECURITY_BLOCK",
      `Expected executeCodeInSandbox to block: ${code}`,
    );
  }
});

test("Code Sandbox: Executes safe JavaScript computation and handles timeouts", async () => {
  const safeCode = `
    const num = 10;
    const squared = num * num;
    return { squared, greeting: 'hello ' + $input.name };
  `;

  const { result } = await executeCodeInSandbox(safeCode, { $input: { name: "AgentFlow" } });
  assert.equal((result as any).squared, 100);
  assert.equal((result as any).greeting, "hello AgentFlow");

  // Test timeout enforcement
  const infiniteLoop = "while(true) {}";
  await assert.rejects(
    async () => executeCodeInSandbox(infiniteLoop, {}, { timeoutMs: 50 }),
    (err: any) => err.code === "CODE_TIMEOUT",
  );
});

test("Per-route rate limiting: Returns 429 when rate limit is exceeded on sensitive routes", async () => {
  const app = await buildApp({ logger: false });

  // Test rate limiting on auth register (max: 10/hr)
  let hitRateLimit = false;
  for (let i = 0; i < 15; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-forwarded-for": "198.51.100.99" },
      payload: { email: `ratelimit-${i}@test.com`, name: "Rate Tester", password: "Password123!" },
    });

    if (res.statusCode === 429) {
      hitRateLimit = true;
      assert.equal(res.statusCode, 429);
      break;
    }
  }

  assert.ok(hitRateLimit, "Expected rate limit (429) to be triggered on /api/auth/register");
  await app.close();
});
