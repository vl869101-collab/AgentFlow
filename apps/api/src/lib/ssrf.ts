import { lookup, resolve4, resolve6 } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { getEnv } from "./env.js";

export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
  "169.254.170.2",
  "100.100.100.200",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".example",
  ".invalid",
];

export class SsrFSecurityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code = "SSRF_BLOCKED") {
    super(message);
    this.name = "SsrFSecurityError";
    this.code = code;
    this.statusCode = 400;
  }
}

/**
 * Checks if a literal IP address string or hostname is within a blocked/private range.
 */
export function isBlockedIpOrHost(ipOrHost: string): boolean {
  if (!ipOrHost || typeof ipOrHost !== "string") return true;
  const normalized = ipOrHost.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  for (const suffix of BLOCKED_SUFFIXES) {
    if (normalized.endsWith(suffix)) return true;
  }

  if (!ipaddr.isValid(normalized)) {
    return false; // Hostname to be resolved via DNS
  }

  try {
    let addr = ipaddr.parse(normalized);
    if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    }

    const range = addr.range();
    // Only "unicast" is globally routable public internet IP
    return range !== "unicast";
  } catch {
    return true;
  }
}

/**
 * Resolves all IPv4 and IPv6 addresses for a hostname using DNS.
 */
export async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const normalized = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (ipaddr.isValid(normalized)) {
    return [normalized];
  }

  const results = await Promise.allSettled([
    resolve4(normalized),
    resolve6(normalized),
  ]);

  const addresses = results.flatMap((res) => (res.status === "fulfilled" ? res.value : []));
  const errors = results
    .filter((res): res is PromiseRejectedResult => res.status === "rejected")
    .map((res) => res.reason as NodeJS.ErrnoException);

  const fatalError = errors.find((err) => !["ENOTFOUND", "ENODATA", "ESERVFAIL"].includes(err?.code ?? ""));
  if (fatalError) {
    throw new SsrFSecurityError(`DNS resolution error for host '${hostname}': ${fatalError.message}`);
  }

  if (addresses.length > 0) return addresses;

  try {
    const records = await lookup(normalized, { all: true, verbatim: true });
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

/**
 * Checks if a hostname complies with egress allowlist and blocklist configurations.
 */
export function isAllowedEgressHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  // 1. Check custom blocked hosts
  const blockedHosts = (process.env.EGRESS_BLOCKED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  for (const blocked of blockedHosts) {
    if (blocked.startsWith("*.")) {
      const suffix = blocked.slice(1);
      if (normalized.endsWith(suffix) && normalized.length > suffix.length) return false;
    } else if (normalized === blocked) {
      return false;
    }
  }

  // 2. Check allowlist if configured (dynamic process.env or getEnv())
  const rawAllowed = process.env.EGRESS_ALLOWED_HOSTS;
  let allowedHosts: string[] | undefined;
  if (rawAllowed !== undefined && rawAllowed !== "") {
    allowedHosts = rawAllowed
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean);
  } else {
    try {
      allowedHosts = getEnv().EGRESS_ALLOWED_HOSTS;
    } catch {}
  }

  if (!allowedHosts || allowedHosts.length === 0) return true;

  return allowedHosts.some((allowed) => {
    const normAllowed = allowed.toLowerCase().trim();
    if (normAllowed.startsWith("*.")) {
      const suffix = normAllowed.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === normAllowed;
  });
}

/**
 * Validates that a URL is safe for egress (syntax, protocol, credentials, allowlist, hostname).
 */
export function validateUrl(rawUrl: string | URL): URL {
  let url: URL;
  try {
    url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;
  } catch {
    throw new SsrFSecurityError("Invalid URL syntax", "INVALID_URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SsrFSecurityError("Only HTTP and HTTPS protocols are permitted", "UNSUPPORTED_PROTOCOL");
  }

  if (url.username || url.password) {
    throw new SsrFSecurityError("Embedded URL credentials are not permitted", "CREDENTIALS_IN_URL");
  }

  if (!isAllowedEgressHostname(url.hostname)) {
    throw new SsrFSecurityError(`Host '${url.hostname}' is not in the egress allowlist`, "EGRESS_BLOCKED");
  }

  if (isBlockedIpOrHost(url.hostname)) {
    throw new SsrFSecurityError(`Access to private/local destination '${url.hostname}' is blocked`, "SSRF_BLOCKED");
  }

  return url;
}

export const assertSafeUrl = validateUrl;

/**
 * Resolves DNS and validates all returned IP addresses against private and restricted ranges.
 */
export async function assertSafeDestination(url: URL): Promise<void> {
  validateUrl(url);

  if (ipaddr.isValid(url.hostname)) {
    if (isBlockedIpOrHost(url.hostname)) {
      throw new SsrFSecurityError(`Direct access to private IP '${url.hostname}' is blocked`, "SSRF_BLOCKED");
    }
    return;
  }

  const addresses = await resolveAllAddresses(url.hostname);
  if (addresses.length === 0) {
    throw new SsrFSecurityError(`Unable to resolve hostname '${url.hostname}'`, "DNS_RESOLUTION_FAILED");
  }

  for (const address of addresses) {
    if (isBlockedIpOrHost(address)) {
      throw new SsrFSecurityError(
        `Hostname '${url.hostname}' resolved to blocked/private address '${address}'`,
        "SSRF_BLOCKED"
      );
    }
  }
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

/**
 * Performs a safe HTTP request protected against SSRF, DNS rebinding, and malicious redirects.
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutPerHop = Math.max(Math.floor(timeoutMs / (maxRedirects + 1)), 5_000);

  let currentUrl = typeof input === "string" ? new URL(input) : input;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeDestination(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutPerHop);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...options,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new SsrFSecurityError(`Outbound HTTP request timed out after ${timeoutMs}ms`, "TIMEOUT");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // If not a redirect, validate content length and return
    if (response.status < 300 || response.status >= 400) {
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > maxBytes) {
        throw new SsrFSecurityError(`HTTP response size (${contentLength} bytes) exceeds limit (${maxBytes} bytes)`, "RESPONSE_TOO_LARGE");
      }
      return response;
    }

    // Follow redirect safely
    const location = response.headers.get("location");
    if (!location) {
      throw new SsrFSecurityError("HTTP redirect response is missing Location header", "INVALID_REDIRECT");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new SsrFSecurityError(`Invalid redirect Location: '${location}'`, "INVALID_REDIRECT");
    }

    validateUrl(nextUrl);
    currentUrl = nextUrl;
  }

  throw new SsrFSecurityError(`Too many HTTP redirects (limit: ${maxRedirects})`, "TOO_MANY_REDIRECTS");
}
