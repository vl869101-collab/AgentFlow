import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerificationResult {
  valid: boolean;
  provider: string;
  error?: string;
  code?: string;
  timestamp?: number;
}

/**
 * Timing-safe buffer comparison to prevent side-channel timing attacks.
 */
export function safeCompare(expected: string | Buffer, actual: string | Buffer): boolean {
  try {
    const expBuf = typeof expected === "string" ? Buffer.from(expected) : expected;
    const actBuf = typeof actual === "string" ? Buffer.from(actual) : actual;

    if (expBuf.length !== actBuf.length) {
      // Execute dummy timingSafeEqual to avoid timing leak on length mismatch
      const dummy = Buffer.alloc(expBuf.length);
      timingSafeEqual(expBuf, dummy);
      return false;
    }

    return timingSafeEqual(expBuf, actBuf);
  } catch {
    return false;
  }
}

/**
 * GitHub HMAC-SHA256 signature verification.
 * Header: X-Hub-Signature-256 (format: sha256=<hex>)
 */
export function verifyGitHubSignature(
  secret: string,
  rawBody: string,
  signatureHeader?: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const normalized = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeCompare(expected.toLowerCase(), normalized.toLowerCase());
}

/**
 * Shopify HMAC-SHA256 signature verification.
 * Header: X-Shopify-Hmac-SHA256 (format: base64(HMAC-SHA256(rawBody)))
 */
export function verifyShopifySignature(
  secret: string,
  rawBody: string,
  signatureHeader?: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expectedBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeCompare(expectedBase64, signatureHeader.trim());
}

/**
 * Stripe HMAC-SHA256 signature verification with 5-minute replay attack tolerance.
 * Header: Stripe-Signature (format: t=1612345678,v1=abc123...,v0=...)
 */
export function verifyStripeSignature(
  secret: string,
  rawBody: string,
  signatureHeader?: string,
  toleranceSeconds = 300 // 5 minutes
): { valid: boolean; timestamp?: number; error?: string; code?: string } {
  if (!signatureHeader || !secret) {
    return { valid: false, error: "Missing Stripe signature or secret", code: "MISSING_SIGNATURE" };
  }

  const items = signatureHeader.split(",").map((s) => s.trim());
  let timestamp: number | undefined;
  const v1Signatures: string[] = [];

  for (const item of items) {
    const [k, v] = item.split("=");
    if (k === "t" && v) {
      timestamp = parseInt(v, 10);
    } else if (k === "v1" && v) {
      v1Signatures.push(v);
    }
  }

  if (timestamp === undefined || isNaN(timestamp) || v1Signatures.length === 0) {
    return { valid: false, error: "Invalid Stripe signature format", code: "INVALID_SIGNATURE" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return {
      valid: false,
      timestamp,
      error: `Webhook timestamp too old or in future (skew > ${toleranceSeconds}s)`,
      code: "REPLAY_ATTACK",
    };
  }

  const payloadToSign = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac("sha256", secret).update(payloadToSign).digest("hex");

  const match = v1Signatures.some((sig) => safeCompare(expectedSig.toLowerCase(), sig.toLowerCase()));
  if (!match) {
    return { valid: false, timestamp, error: "Stripe signature mismatch", code: "INVALID_SIGNATURE" };
  }

  return { valid: true, timestamp };
}

/**
 * Slack HMAC-SHA256 signature verification with version 'v0' and timestamp verification.
 * Headers: X-Slack-Signature (format: v0=<hex>) and X-Slack-Request-Timestamp
 */
export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  signatureHeader?: string,
  timestampHeader?: string,
  toleranceSeconds = 300 // 5 minutes
): { valid: boolean; error?: string; code?: string } {
  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return { valid: false, error: "Missing Slack signature or timestamp headers", code: "MISSING_SIGNATURE" };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid Slack timestamp header", code: "INVALID_TIMESTAMP" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return {
      valid: false,
      error: `Slack request timestamp is stale (skew > ${toleranceSeconds}s)`,
      code: "REPLAY_ATTACK",
    };
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const expectedHex = createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  const expectedSig = `v0=${expectedHex}`;

  if (!safeCompare(expectedSig.toLowerCase(), signatureHeader.toLowerCase())) {
    return { valid: false, error: "Slack signature mismatch", code: "INVALID_SIGNATURE" };
  }

  return { valid: true };
}

/**
 * Generic HMAC verification supporting sha256, sha512, sha1 with hex or base64 digest.
 */
export function verifyGenericSignature(
  secret: string,
  rawBody: string,
  signature: string,
  algorithm: "sha256" | "sha512" | "sha1" = "sha256"
): boolean {
  if (!signature || !secret) return false;
  let cleanSig = signature.trim();

  // Strip prefix like sha256=, sha512=, sha1=
  if (cleanSig.startsWith(`${algorithm}=`)) {
    cleanSig = cleanSig.slice(algorithm.length + 1);
  }

  const expectedHex = createHmac(algorithm, secret).update(rawBody).digest("hex");
  if (safeCompare(expectedHex.toLowerCase(), cleanSig.toLowerCase())) {
    return true;
  }

  // Also test base64 in case client sent base64 digest
  const expectedBase64 = createHmac(algorithm, secret).update(rawBody).digest("base64");
  if (safeCompare(expectedBase64, cleanSig)) {
    return true;
  }

  return false;
}

/**
 * Master multi-provider webhook verifier dispatcher.
 */
export function verifyWebhookRequest(
  provider: string,
  secret: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): VerificationResult {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(val)) return val[0];
    return typeof val === "string" ? val : undefined;
  };

  const normalizedProvider = provider.toLowerCase().trim();

  // 1. GitHub
  if (normalizedProvider === "github" || getHeader("x-github-event") || getHeader("x-hub-signature-256")) {
    const sig = getHeader("x-hub-signature-256") || getHeader("x-hub-signature") || getHeader("x-signature-256");
    if (!sig) return { valid: false, provider: "github", error: "Missing GitHub signature header", code: "MISSING_SIGNATURE" };
    const valid = verifyGitHubSignature(secret, rawBody, sig);
    return { valid, provider: "github", code: valid ? undefined : "INVALID_SIGNATURE" };
  }

  // 2. Shopify
  if (normalizedProvider === "shopify" || getHeader("x-shopify-hmac-sha256") || getHeader("x-shopify-topic")) {
    const sig = getHeader("x-shopify-hmac-sha256");
    if (!sig) return { valid: false, provider: "shopify", error: "Missing Shopify signature header", code: "MISSING_SIGNATURE" };
    const valid = verifyShopifySignature(secret, rawBody, sig);
    return { valid, provider: "shopify", code: valid ? undefined : "INVALID_SIGNATURE" };
  }

  // 3. Stripe
  if (normalizedProvider === "stripe" || getHeader("stripe-signature")) {
    const sig = getHeader("stripe-signature");
    if (!sig) return { valid: false, provider: "stripe", error: "Missing Stripe-Signature header", code: "MISSING_SIGNATURE" };
    const res = verifyStripeSignature(secret, rawBody, sig);
    return { valid: res.valid, provider: "stripe", error: res.error, code: res.code, timestamp: res.timestamp };
  }

  // 4. Slack
  if (normalizedProvider === "slack" || getHeader("x-slack-signature")) {
    const sig = getHeader("x-slack-signature");
    const ts = getHeader("x-slack-request-timestamp");
    if (!sig || !ts) return { valid: false, provider: "slack", error: "Missing Slack signature or timestamp", code: "MISSING_SIGNATURE" };
    const res = verifySlackSignature(secret, rawBody, sig, ts);
    return { valid: res.valid, provider: "slack", error: res.error, code: res.code };
  }

  // 5. Generic / Standard HMAC fallback
  const genericSig =
    getHeader("x-webhook-signature") ||
    getHeader("x-signature-256") ||
    getHeader("x-signature-512") ||
    getHeader("x-signature-sha1") ||
    getHeader("x-signature") ||
    getHeader("x-hub-signature-256");

  if (!genericSig) {
    return { valid: false, provider: "generic", error: "Missing webhook signature header", code: "MISSING_SIGNATURE" };
  }

  const alg = getHeader("x-signature-512") ? "sha512" : getHeader("x-signature-sha1") ? "sha1" : "sha256";
  const valid = verifyGenericSignature(secret, rawBody, genericSig, alg);
  return { valid, provider: "generic", code: valid ? undefined : "INVALID_SIGNATURE" };
}
