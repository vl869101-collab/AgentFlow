// Google Workspace API Quota Management & Exponential Backoff Retry Utility.
import { safeFetch } from "./ssrf.js";

export interface GoogleQuotaRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
  fetchFn?: typeof fetch;
}

export interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{
      message?: string;
      domain?: string;
      reason?: string;
    }>;
  };
}

/**
 * Known Google API rate limit error reasons returned in HTTP 403/429 responses.
 */
export const GOOGLE_QUOTA_ERROR_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
  "concurrentRequestLimitExceeded",
  "userRequestsPerMinutePerUserExceeded",
  "resourceExhausted",
]);

/**
 * Splits an array into chunks of a maximum size.
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (!items || items.length === 0) return [];
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Calculates exponential backoff delay with optional full jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 16000,
  useJitter = true,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  if (!useJitter) return capped;
  // Full jitter: uniformly distributed between baseDelayMs and capped
  return Math.floor(Math.random() * (capped - baseDelayMs + 1)) + baseDelayMs;
}

/**
 * Parses Retry-After header if present (in seconds or HTTP-Date).
 */
export function parseRetryAfterHeader(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60000);
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return Math.max(0, Math.min(diff, 60000));
  }
  return null;
}

/**
 * Determines whether a response or error from Google API indicates a quota/rate limit condition or transient failure.
 */
export async function isGoogleQuotaOrTransientError(
  response: Response,
): Promise<{ isRetryable: boolean; reason: string }> {
  // HTTP 429 Too Many Requests
  if (response.status === 429) {
    return { isRetryable: true, reason: "HTTP 429 (Too Many Requests)" };
  }

  // HTTP 500, 502, 503, 504 (Server / Gateway / Backend errors)
  if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
    return { isRetryable: true, reason: `HTTP ${response.status} (Transient Server Error)` };
  }

  // HTTP 403 Rate Limit Exceeded
  if (response.status === 403) {
    try {
      const cloned = response.clone();
      const bodyText = await cloned.text();
      try {
        const json = JSON.parse(bodyText) as GoogleApiErrorResponse;
        const reasons = json.error?.errors?.map((e) => e.reason).filter(Boolean) as string[] | undefined;
        if (reasons && reasons.some((r) => GOOGLE_QUOTA_ERROR_REASONS.has(r))) {
          return { isRetryable: true, reason: `Google Quota Exceeded (${reasons.join(", ")})` };
        }
        if (json.error?.status === "RESOURCE_EXHAUSTED" || json.error?.message?.toLowerCase().includes("quota")) {
          return { isRetryable: true, reason: `Google Resource Exhausted: ${json.error.message}` };
        }
      } catch {
        if (bodyText.toLowerCase().includes("ratelimit") || bodyText.toLowerCase().includes("quota")) {
          return { isRetryable: true, reason: "Google Quota Text Match in 403" };
        }
      }
    } catch {
      // Ignore clone/read errors
    }
  }

  return { isRetryable: false, reason: `HTTP ${response.status}` };
}

/**
 * Performs fetch against Google API with automated exponential backoff and rate limit handling.
 */
export async function fetchWithGoogleQuotaBackoff(
  url: string,
  options: RequestInit = {},
  retryOpts: GoogleQuotaRetryOptions = {},
): Promise<Response> {
  const maxRetries = retryOpts.maxRetries ?? 4;
  const baseDelayMs = retryOpts.baseDelayMs ?? 500;
  const maxDelayMs = retryOpts.maxDelayMs ?? 16000;
  const useJitter = retryOpts.jitter ?? true;
  const fetchFn = retryOpts.fetchFn ?? safeFetch;

  let lastResponse: Response | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn(url, options);
      if (response.ok) {
        return response;
      }

      lastResponse = response;
      const { isRetryable, reason } = await isGoogleQuotaOrTransientError(response);

      if (!isRetryable || attempt === maxRetries) {
        return response;
      }

      // Calculate backoff
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = parseRetryAfterHeader(retryAfterHeader);
      const delayMs = retryAfterMs ?? calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, useJitter);

      if (retryOpts.onRetry) {
        retryOpts.onRetry(attempt + 1, delayMs, reason);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) {
        throw lastError;
      }

      const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, useJitter);
      if (retryOpts.onRetry) {
        retryOpts.onRetry(attempt + 1, delayMs, `Network/Fetch Error: ${lastError.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Google API request failed with unknown error");
}
