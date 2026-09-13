import http from "node:http";
import https from "node:https";
import { lookup, resolve4, resolve6 } from "node:dns/promises";
import { Readable } from "node:stream";
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

const BLOCKED_CIDRS: [ipaddr.IPv4 | ipaddr.IPv6, number][] = [
  // IPv4 Private, Loopback, Link-Local, Reserved
  ipaddr.parseCIDR("127.0.0.0/8"),
  ipaddr.parseCIDR("10.0.0.0/8"),
  ipaddr.parseCIDR("172.16.0.0/12"),
  ipaddr.parseCIDR("192.168.0.0/16"),
  ipaddr.parseCIDR("169.254.0.0/16"),
  ipaddr.parseCIDR("0.0.0.0/8"),
  ipaddr.parseCIDR("100.64.0.0/10"), // Carrier-grade NAT
  ipaddr.parseCIDR("192.0.0.0/24"),
  ipaddr.parseCIDR("192.0.2.0/24"),  // TEST-NET-1
  ipaddr.parseCIDR("198.18.0.0/15"),
  ipaddr.parseCIDR("198.51.100.0/24"), // TEST-NET-2
  ipaddr.parseCIDR("203.0.113.0/24"),  // TEST-NET-3
  ipaddr.parseCIDR("224.0.0.0/4"),   // Multicast
  ipaddr.parseCIDR("240.0.0.0/4"),   // Reserved
  ipaddr.parseCIDR("255.255.255.255/32"),

  // IPv6 Loopback, Unspecified, Unique-Local, Link-Local, Multicast
  ipaddr.parseCIDR("::1/128"),
  ipaddr.parseCIDR("::/128"),
  ipaddr.parseCIDR("fc00::/7"),      // Unique-Local
  ipaddr.parseCIDR("fe80::/10"),     // Link-Local
  ipaddr.parseCIDR("ff00::/8"),      // Multicast
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

    // Match explicit CIDR block definitions
    for (const cidr of BLOCKED_CIDRS) {
      if (addr.kind() === cidr[0].kind() && addr.match(cidr)) {
        return true;
      }
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

/**
 * Creates a pinned DNS lookup function that forces the network socket to connect
 * directly to a pre-validated IP address, avoiding DNS rebinding and TOCTOU.
 */
export function createPinnedLookup(pinnedIp: string) {
  const isIpv6 = pinnedIp.includes(":");
  const family = isIpv6 ? 6 : 4;
  return function pinnedLookup(
    _hostname: string,
    options: any,
    callback: (err: NodeJS.ErrnoException | null, address: any, family: number) => void
  ) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options && options.all) {
      callback(null, [{ address: pinnedIp, family }] as any, family);
    } else {
      callback(null, pinnedIp, family);
    }
  };
}

type SafeHeadersInit =
  | Headers
  | Record<string, string>
  | [string, string][]
  | string[][]
  | Iterable<[string, string]>
  | any;

function normalizeHeaders(headers?: SafeHeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    headers.forEach((val, key) => {
      result[key] = val;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, val] of headers) {
      result[key] = val;
    }
  } else if (typeof headers === "object") {
    for (const [key, val] of Object.entries(headers)) {
      if (val !== undefined && val !== null) {
        result[key] = String(val);
      }
    }
  }
  return result;
}

function createByteLimitStream(maxBytes: number) {
  let bytesCount = 0;
  return new TransformStream({
    transform(chunk, controller) {
      bytesCount += chunk.byteLength || chunk.length || 0;
      if (bytesCount > maxBytes) {
        controller.error(
          new SsrFSecurityError(
            `HTTP response size (${bytesCount} bytes) exceeds limit (${maxBytes} bytes)`,
            "RESPONSE_TOO_LARGE"
          )
        );
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

/**
 * Performs a safe HTTP request protected against SSRF, DNS rebinding, and malicious redirects.
 * Pins connection sockets to pre-validated IP addresses.
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutPerHop = Math.max(Math.floor(timeoutMs / (maxRedirects + 1)), 5_000);

  let currentUrl = typeof input === "string" ? new URL(input) : input;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    validateUrl(currentUrl);

    let addresses: string[];
    const host = currentUrl.hostname.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (ipaddr.isValid(host)) {
      if (isBlockedIpOrHost(host)) {
        throw new SsrFSecurityError(`Direct access to private IP '${host}' is blocked`, "SSRF_BLOCKED");
      }
      addresses = [host];
    } else {
      addresses = await resolveAllAddresses(host);
      if (addresses.length === 0) {
        throw new SsrFSecurityError(`Unable to resolve hostname '${host}'`, "DNS_RESOLUTION_FAILED");
      }
      for (const address of addresses) {
        if (isBlockedIpOrHost(address)) {
          throw new SsrFSecurityError(
            `Hostname '${host}' resolved to blocked/private address '${address}'`,
            "SSRF_BLOCKED"
          );
        }
      }
    }

    const pinnedIp = addresses[0];
    const pinnedLookup = createPinnedLookup(pinnedIp);

    const isHttps = currentUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const requestHeaders = normalizeHeaders(options.headers);
    if (!requestHeaders["host"] && !requestHeaders["Host"]) {
      requestHeaders["Host"] = currentUrl.host;
    }

    const port = currentUrl.port ? Number(currentUrl.port) : isHttps ? 443 : 80;
    const method = (options.method ?? "GET").toUpperCase();

    const response = await new Promise<Response>((resolve, reject) => {
      let isDone = false;
      let req: http.ClientRequest;

      const done = (fn: () => void) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        if (req) req.destroy();
        done(() => reject(new SsrFSecurityError(`Outbound HTTP request timed out after ${timeoutMs}ms`, "TIMEOUT")));
      }, timeoutPerHop);

      if (options.signal) {
        if (options.signal.aborted) {
          done(() => reject(new SsrFSecurityError("Outbound HTTP request aborted", "TIMEOUT")));
          return;
        }
        options.signal.addEventListener("abort", () => {
          if (req) req.destroy();
          done(() => reject(new SsrFSecurityError("Outbound HTTP request aborted", "TIMEOUT")));
        });
      }

      req = transport.request(
        {
          protocol: currentUrl.protocol,
          hostname: currentUrl.hostname,
          port,
          path: currentUrl.pathname + currentUrl.search,
          method,
          headers: requestHeaders,
          lookup: pinnedLookup,
          servername: currentUrl.hostname,
        },
        (res) => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) headers.append(key, v);
            } else if (value !== undefined) {
              headers.set(key, value);
            }
          }

          const statusCode = res.statusCode ?? 200;
          const statusText = res.statusMessage ?? "OK";

          const byteLimiter = createByteLimitStream(maxBytes);
          const webStream = (Readable.toWeb(res) as any).pipeThrough(byteLimiter);

          const whatwgResponse = new Response(webStream, {
            status: statusCode,
            statusText,
            headers,
          });

          done(() => resolve(whatwgResponse));
        }
      );

      req.on("error", (err) => {
        done(() => reject(err));
      });

      if (options.body) {
        if (typeof options.body === "string" || Buffer.isBuffer(options.body)) {
          req.write(options.body);
        } else if (typeof (options.body as any).pipe === "function") {
          (options.body as any).pipe(req);
          return;
        } else {
          req.write(String(options.body));
        }
      }

      req.end();
    });

    // Handle HTTP Redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SsrFSecurityError("HTTP redirect response has no Location header", "INVALID_REDIRECT");
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new SsrFSecurityError(`Invalid redirect Location: '${location}'`, "INVALID_REDIRECT");
      }

      validateUrl(nextUrl);
      currentUrl = nextUrl;
      continue;
    }

    // Non-redirect response: check content-length
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes) {
      throw new SsrFSecurityError(
        `HTTP response size (${contentLength} bytes) exceeds limit (${maxBytes} bytes)`,
        "RESPONSE_TOO_LARGE"
      );
    }

    return response;
  }

  throw new SsrFSecurityError(`Too many redirects (max ${maxRedirects})`, "TOO_MANY_REDIRECTS");
}
