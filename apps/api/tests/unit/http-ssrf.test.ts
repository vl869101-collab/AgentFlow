import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isBlockedIp,
  isBlockedHostname,
  isAllowedEgressHostname,
  assertSafeUrl,
  readResponse,
  MAX_HTTP_RESPONSE_BYTES,
  MAX_REDIRECTS,
} from "../../src/services/nodes/http.js";

describe("HTTP Node SSRF Guard", () => {
  describe("isBlockedIp", () => {
    it("blocks private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", () => {
      expect(isBlockedIp("10.0.0.1")).toBe(true);
      expect(isBlockedIp("10.255.255.254")).toBe(true);
      expect(isBlockedIp("172.16.0.1")).toBe(true);
      expect(isBlockedIp("172.31.255.255")).toBe(true);
      expect(isBlockedIp("192.168.1.1")).toBe(true);
      expect(isBlockedIp("192.168.0.254")).toBe(true);
    });

    it("blocks loopback IPv4 addresses (127.0.0.0/8)", () => {
      expect(isBlockedIp("127.0.0.1")).toBe(true);
      expect(isBlockedIp("127.0.1.1")).toBe(true);
      expect(isBlockedIp("127.255.255.255")).toBe(true);
    });

    it("blocks link-local and cloud metadata addresses (169.254.0.0/16)", () => {
      expect(isBlockedIp("169.254.169.254")).toBe(true);
      expect(isBlockedIp("169.254.1.1")).toBe(true);
    });

    it("blocks carrier-grade NAT, current network, and multicast/broadcast", () => {
      expect(isBlockedIp("0.0.0.0")).toBe(true);
      expect(isBlockedIp("100.64.0.1")).toBe(true);
      expect(isBlockedIp("100.127.255.255")).toBe(true);
      expect(isBlockedIp("224.0.0.1")).toBe(true);
      expect(isBlockedIp("240.0.0.1")).toBe(true);
    });

    it("blocks private IPv6 ranges (::1, ::, fc00::/7, fe80::/10)", () => {
      expect(isBlockedIp("::1")).toBe(true);
      expect(isBlockedIp("::")).toBe(true);
      expect(isBlockedIp("fc00::1")).toBe(true);
      expect(isBlockedIp("fd00::1234")).toBe(true);
      expect(isBlockedIp("fe80::1")).toBe(true);
    });

    it("blocks IPv4-mapped IPv6 addresses for private ranges (::ffff:10.0.0.1, ::ffff:127.0.0.1)", () => {
      expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
      expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
      expect(isBlockedIp("::ffff:192.168.1.1")).toBe(true);
      expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    });

    it("allows public IPv4 and IPv6 addresses", () => {
      expect(isBlockedIp("8.8.8.8")).toBe(false);
      expect(isBlockedIp("1.1.1.1")).toBe(false);
      expect(isBlockedIp("104.244.42.1")).toBe(false);
      expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
      expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("isBlockedHostname", () => {
    it("blocks localhost and local domain suffixes", () => {
      expect(isBlockedHostname("localhost")).toBe(true);
      expect(isBlockedHostname("app.localhost")).toBe(true);
      expect(isBlockedHostname("service.local")).toBe(true);
      expect(isBlockedHostname("backend.internal")).toBe(true);
      expect(isBlockedHostname("router.lan")).toBe(true);
    });

    it("blocks cloud metadata hostnames", () => {
      expect(isBlockedHostname("metadata.google.internal")).toBe(true);
      expect(isBlockedHostname("instance-data")).toBe(true);
    });

    it("blocks literal private IPs formatted as hostnames", () => {
      expect(isBlockedHostname("127.0.0.1")).toBe(true);
      expect(isBlockedHostname("10.0.0.5")).toBe(true);
      expect(isBlockedHostname("[::1]")).toBe(true);
    });

    it("allows public domain names", () => {
      expect(isBlockedHostname("api.stripe.com")).toBe(false);
      expect(isBlockedHostname("api.github.com")).toBe(false);
      expect(isBlockedHostname("openai.com")).toBe(false);
    });
  });

  describe("assertSafeUrl", () => {
    it("validates valid public HTTP and HTTPS URLs", () => {
      const url = assertSafeUrl("https://api.github.com/users");
      expect(url.hostname).toBe("api.github.com");
      expect(url.protocol).toBe("https:");
    });

    it("rejects non-HTTP protocols (file:, ftp:, gopher:, ws:)", () => {
      expect(() => assertSafeUrl("file:///etc/passwd")).toThrow();
      expect(() => assertSafeUrl("ftp://ftp.example.com")).toThrow();
      expect(() => assertSafeUrl("gopher://example.com")).toThrow();
    });

    it("rejects URLs with embedded credentials (user:pass@host)", () => {
      expect(() => assertSafeUrl("https://admin:secret@api.example.com")).toThrow();
    });

    it("rejects private or local URLs", () => {
      expect(() => assertSafeUrl("http://localhost:3000/api")).toThrow();
      expect(() => assertSafeUrl("http://127.0.0.1:8080")).toThrow();
      expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
      expect(() => assertSafeUrl("http://10.0.0.1/admin")).toThrow();
      expect(() => assertSafeUrl("http://192.168.1.1/setup")).toThrow();
    });
  });

  describe("readResponse 2MB Cap", () => {
    it("reads responses under 2MB successfully", async () => {
      const mockResponse = new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-length": "17" },
      });
      const text = await readResponse(mockResponse);
      expect(JSON.parse(text)).toEqual({ status: "ok" });
    });

    it("rejects responses with content-length > 2MB", async () => {
      const mockResponse = new Response("x", {
        headers: { "content-length": String(MAX_HTTP_RESPONSE_BYTES + 100) },
      });
      await expect(readResponse(mockResponse)).rejects.toThrow("HTTP response is too large");
    });

    it("rejects responses without content-length whose body exceeds 2MB", async () => {
      const largePayload = "a".repeat(MAX_HTTP_RESPONSE_BYTES + 100);
      const mockResponse = new Response(largePayload);
      await expect(readResponse(mockResponse)).rejects.toThrow("HTTP response is too large");
    });
  });
});
