import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  isBlockedIpOrHost,
  validateUrl,
  createPinnedLookup,
  safeFetch,
  SsrFSecurityError,
} from "../src/lib/ssrf.js";

describe("Anti-SSRF Hardening & Socket Pinning", () => {
  it("createPinnedLookup forces socket connection to specified IP", async () => {
    const pinnedIp = "127.0.0.1";
    const lookupFn = createPinnedLookup(pinnedIp);

    await new Promise<void>((resolve, reject) => {
      lookupFn("any-domain.example.com", {}, (err, address, family) => {
        if (err) return reject(err);
        assert.equal(address, pinnedIp);
        assert.equal(family, 4);
        resolve();
      });
    });

    const pinnedIpv6 = "::1";
    const lookupFn6 = createPinnedLookup(pinnedIpv6);

    await new Promise<void>((resolve, reject) => {
      lookupFn6("any-domain.example.com", {}, (err, address, family) => {
        if (err) return reject(err);
        assert.equal(address, pinnedIpv6);
        assert.equal(family, 6);
        resolve();
      });
    });
  });

  it("blocks private IPv4 and IPv6 CIDRs", () => {
    const cidrSamples = [
      // 127.0.0.0/8
      "127.0.0.1",
      "127.255.255.255",
      // 10.0.0.0/8
      "10.0.0.1",
      "10.254.1.1",
      // 172.16.0.0/12
      "172.16.0.1",
      "172.31.255.254",
      // 192.168.0.0/16
      "192.168.1.1",
      "192.168.254.254",
      // 169.254.0.0/16 (Link-local & AWS metadata)
      "169.254.169.254",
      "169.254.170.2",
      // IPv6 Loopback, Link-Local, Unique-Local
      "::1",
      "fe80::1",
      "fc00::1",
      "fd00::1234",
      // IPv4-mapped IPv6
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:192.168.0.1",
    ];

    for (const ip of cidrSamples) {
      assert.equal(isBlockedIpOrHost(ip), true, `Expected ${ip} to be blocked`);
      assert.throws(
        () => validateUrl(`http://${ip.includes(":") ? `[${ip}]` : ip}/api`),
        (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED"
      );
    }
  });

  it("safeFetch blocks requests targeting private addresses", async () => {
    await assert.rejects(
      async () => safeFetch("http://127.0.0.1:9999/api"),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED"
    );

    await assert.rejects(
      async () => safeFetch("http://169.254.169.254/latest/meta-data"),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED"
    );
  });

  it("safeFetch rejects non-http/https schemes", async () => {
    const invalidProtocols = [
      "file:///etc/shadow",
      "ftp://example.com/test",
      "gopher://127.0.0.1:6379",
    ];

    for (const url of invalidProtocols) {
      await assert.rejects(
        async () => safeFetch(url),
        (err: any) => err instanceof SsrFSecurityError && err.code === "UNSUPPORTED_PROTOCOL"
      );
    }
  });

  it("safeFetch blocks redirects to private or local addresses", async () => {
    // Start temporary local HTTP server that redirects to localhost/127.0.0.1
    const server = http.createServer((req, res) => {
      if (req.url === "/redirect-to-private") {
        res.writeHead(302, { Location: "http://127.0.0.1:8080/internal" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as any;
    const port = address.port;

    try {
      // Trying to connect to 127.0.0.1 is directly blocked
      await assert.rejects(
        async () => safeFetch(`http://127.0.0.1:${port}/redirect-to-private`),
        (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED"
      );
    } finally {
      server.close();
    }
  });
});
