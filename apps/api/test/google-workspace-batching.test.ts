import assert from "node:assert/strict";
import test from "node:test";

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
process.env.MOCK_SERVICES = "true";

const [
  {
    chunkArray,
    calculateBackoffDelay,
    parseRetryAfterHeader,
    isGoogleQuotaOrTransientError,
    fetchWithGoogleQuotaBackoff,
    GOOGLE_QUOTA_ERROR_REASONS,
  },
  { executeGoogleSheets, GoogleSheetsNodeHandler },
  { executeGoogleDrive, GoogleDriveNodeHandler },
  { executeGoogleDocs, GoogleDocsNodeHandler },
  { executeGoogleCalendar, GoogleCalendarNodeHandler },
  { executeGoogleGmail },
] = await Promise.all([
  import("../src/lib/google-quota.js"),
  import("../src/services/nodes/google-sheets.js"),
  import("../src/services/nodes/google-drive.js"),
  import("../src/services/nodes/google-docs.js"),
  import("../src/services/nodes/google-calendar.js"),
  import("../src/services/nodes/google-gmail.js"),
]);

const context = (nodeConfig: Record<string, unknown>, input: unknown = {}) => ({
  executionId: "exec-test",
  nodeId: "node-test",
  workflowId: "workflow-test",
  orgId: "org-test",
  nodeConfig,
  input,
});

// ─────────────────────────────────────────────────────────────
// 1. CHUNKING & ARRAY UTILITIES
// ─────────────────────────────────────────────────────────────

test("Google Quota: chunkArray splits datasets cleanly into bounded batches", () => {
  assert.deepEqual(chunkArray([], 10), []);
  assert.deepEqual(chunkArray([1, 2, 3], 5), [[1, 2, 3]]);
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.deepEqual(chunkArray([1, 2, 3], 0), [[1], [2], [3]]);
});

// ─────────────────────────────────────────────────────────────
// 2. EXPONENTIAL BACKOFF & DELAY CALCULATIONS
// ─────────────────────────────────────────────────────────────

test("Google Quota: calculateBackoffDelay respects exponential scaling and max ceiling", () => {
  // Without jitter for deterministic validation
  const delay0 = calculateBackoffDelay(0, 100, 1000, false);
  const delay1 = calculateBackoffDelay(1, 100, 1000, false);
  const delay2 = calculateBackoffDelay(2, 100, 1000, false);
  const delay5 = calculateBackoffDelay(5, 100, 1000, false);

  assert.equal(delay0, 100);
  assert.equal(delay1, 200);
  assert.equal(delay2, 400);
  assert.equal(delay5, 1000); // capped at maxDelayMs

  // With jitter: bounded in [baseDelayMs, capped]
  for (let attempt = 0; attempt < 5; attempt++) {
    const jittered = calculateBackoffDelay(attempt, 100, 1000, true);
    assert.ok(jittered >= 100, `Jittered delay ${jittered} must be >= 100`);
    assert.ok(jittered <= 1000, `Jittered delay ${jittered} must be <= 1000`);
  }
});

test("Google Quota: parseRetryAfterHeader parses seconds and HTTP-Date", () => {
  assert.equal(parseRetryAfterHeader(null), null);
  assert.equal(parseRetryAfterHeader("10"), 10000);
  assert.equal(parseRetryAfterHeader("120"), 60000); // Capped at 60s
  assert.equal(parseRetryAfterHeader("invalid-val"), null);

  const futureDate = new Date(Date.now() + 5000).toUTCString();
  const parsedDate = parseRetryAfterHeader(futureDate);
  assert.ok(parsedDate !== null && parsedDate > 0 && parsedDate <= 60000);
});

// ─────────────────────────────────────────────────────────────
// 3. GOOGLE QUOTA ERROR DETECTION
// ─────────────────────────────────────────────────────────────

test("Google Quota: isGoogleQuotaOrTransientError detects 429, 5xx, and quota 403s", async () => {
  // 429 Too Many Requests
  const resp429 = new Response("Too Many Requests", { status: 429 });
  const check429 = await isGoogleQuotaOrTransientError(resp429);
  assert.equal(check429.isRetryable, true);

  // 503 Service Unavailable
  const resp503 = new Response("Backend Error", { status: 503 });
  const check503 = await isGoogleQuotaOrTransientError(resp503);
  assert.equal(check503.isRetryable, true);

  // 403 Rate Limit Exceeded
  const quotaBody = JSON.stringify({
    error: {
      code: 403,
      message: "User Rate Limit Exceeded",
      errors: [{ domain: "usageLimits", reason: "userRateLimitExceeded", message: "User Rate Limit Exceeded" }],
    },
  });
  const resp403Quota = new Response(quotaBody, { status: 403 });
  const check403Quota = await isGoogleQuotaOrTransientError(resp403Quota);
  assert.equal(check403Quota.isRetryable, true);
  assert.match(check403Quota.reason, /Google Quota Exceeded/);

  // 403 Resource Exhausted
  const resourceExhaustedBody = JSON.stringify({
    error: {
      code: 403,
      status: "RESOURCE_EXHAUSTED",
      message: "Quota exceeded for quota metric 'Write requests'",
    },
  });
  const resp403Resource = new Response(resourceExhaustedBody, { status: 403 });
  const check403Resource = await isGoogleQuotaOrTransientError(resp403Resource);
  assert.equal(check403Resource.isRetryable, true);

  // Non-retryable 400 Bad Request
  const resp400 = new Response("Bad Request", { status: 400 });
  const check400 = await isGoogleQuotaOrTransientError(resp400);
  assert.equal(check400.isRetryable, false);

  // Non-retryable 404 Not Found
  const resp404 = new Response("Not Found", { status: 404 });
  const check404 = await isGoogleQuotaOrTransientError(resp404);
  assert.equal(check404.isRetryable, false);
});

// ─────────────────────────────────────────────────────────────
// 4. RETRY MECHANISM WITH SIMULATED FETCH
// ─────────────────────────────────────────────────────────────

test("Google Quota: fetchWithGoogleQuotaBackoff successfully retries after 429 and rate limits", async () => {
  let callCount = 0;
  const retryEvents: Array<{ attempt: number; delayMs: number; reason: string }> = [];

  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response("Too Many Requests", { status: 429, headers: { "retry-after": "1" } });
    }
    if (callCount === 2) {
      const quotaBody = JSON.stringify({
        error: {
          code: 403,
          errors: [{ reason: "rateLimitExceeded", message: "Rate limit exceeded" }],
        },
      });
      return new Response(quotaBody, { status: 403 });
    }
    return new Response(JSON.stringify({ success: true, data: "ok" }), { status: 200 });
  };

  const res = await fetchWithGoogleQuotaBackoff(
    "https://sheets.googleapis.com/v4/spreadsheets/test/values/A1",
    {},
    {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
      jitter: false,
      fetchFn: mockFetch,
      onRetry: (attempt, delayMs, reason) => {
        retryEvents.push({ attempt, delayMs, reason });
      },
    },
  );

  assert.equal(res.status, 200);
  assert.equal(callCount, 3);
  assert.equal(retryEvents.length, 2);
  assert.match(retryEvents[0].reason, /429/);
  assert.match(retryEvents[1].reason, /rateLimitExceeded/);
});

test("Google Quota: fetchWithGoogleQuotaBackoff returns last failed response if maxRetries exceeded", async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response("Service Unavailable", { status: 503 });
  };

  const res = await fetchWithGoogleQuotaBackoff(
    "https://sheets.googleapis.com/v4/spreadsheets/test",
    {},
    {
      maxRetries: 2,
      baseDelayMs: 5,
      maxDelayMs: 20,
      jitter: false,
      fetchFn: mockFetch,
    },
  );

  assert.equal(res.status, 503);
  assert.equal(callCount, 3); // initial + 2 retries
});

// ─────────────────────────────────────────────────────────────
// 5. GOOGLE SHEETS BATCHING OPERATIONS
// ─────────────────────────────────────────────────────────────

test("Google Sheets Node: batchGet retrieves multiple ranges", async () => {
  const result: any = await executeGoogleSheets(
    {
      operation: "batchGet",
      spreadsheetId: "sheet_batch_1",
      ranges: ["Sheet1!A1:B10", "Sheet2!C1:D10"],
      mock: true,
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.spreadsheetId, "sheet_batch_1");
  assert.equal(result.valueRanges.length, 2);
  assert.equal(result.valueRanges[0].range, "Sheet1!A1:B10");
  assert.equal(result.valueRanges[1].range, "Sheet2!C1:D10");
});

test("Google Sheets Node: batchUpdate applies multi-range updates", async () => {
  const result: any = await executeGoogleSheets(
    {
      operation: "batchUpdate",
      spreadsheetId: "sheet_batch_2",
      data: [
        { range: "Sheet1!A1:B2", values: [["Header1", "Header2"], ["Val1", "Val2"]] },
        { range: "Sheet1!C1:D2", values: [["Header3", "Header4"], ["Val3", "Val4"]] },
      ],
      mock: true,
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.spreadsheetId, "sheet_batch_2");
  assert.equal(result.totalUpdatedRows, 4);
  assert.equal(result.responses.length, 2);
  assert.equal(result.responses[0].updatedRange, "Sheet1!A1:B2");
});

test("Google Sheets Node: batchClear clears multiple ranges", async () => {
  const result: any = await executeGoogleSheets(
    {
      operation: "batchClear",
      spreadsheetId: "sheet_batch_3",
      ranges: ["Sheet1!A2:Z100", "Sheet2!A2:Z100"],
      mock: true,
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.spreadsheetId, "sheet_batch_3");
  assert.deepEqual(result.clearedRanges, ["Sheet1!A2:Z100", "Sheet2!A2:Z100"]);
});

test("Google Sheets Node: batchAppend chunks large row arrays to prevent quota saturation", async () => {
  // Generate 25 rows with chunkSize = 10 -> 3 batches
  const rows = Array.from({ length: 25 }, (_, i) => [`ID_${i}`, `User_${i}`, `user${i}@example.com`]);

  const result: any = await executeGoogleSheets(
    {
      operation: "batchAppend",
      spreadsheetId: "sheet_batch_4",
      range: "Sheet1!A1",
      values: rows,
      chunkSize: 10,
      mock: true,
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.totalAppendedRows, 25);
  assert.equal(result.batchCount, 3);
});

test("Google Sheets NodeHandler executes via NodeExecutionContext", async () => {
  const handler = new GoogleSheetsNodeHandler();
  const res = await handler.execute(
    context(
      {
        operation: "batchGet",
        spreadsheetId: "sheet_handler_1",
        ranges: ["Sheet1!A1:A5"],
        mock: true,
      },
      [{ json: { itemIndex: 1 } }, { json: { itemIndex: 2 } }],
    ),
  );

  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].json.mock, true);
  assert.equal(res.items[0].json.spreadsheetId, "sheet_handler_1");
  assert.ok(res.logs && res.logs.length > 0);
});

// ─────────────────────────────────────────────────────────────
// 6. GOOGLE DRIVE BATCH OPERATIONS & QUOTA HANDLING
// ─────────────────────────────────────────────────────────────

test("Google Drive Node: batchDelete removes multiple files", async () => {
  const result: any = await executeGoogleDrive(
    {
      operation: "batchDelete",
      fileIds: ["file_101", "file_102", "file_103"],
      mock: true,
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.deletedCount, 3);
  assert.deepEqual(result.deletedFileIds, ["file_101", "file_102", "file_103"]);
});

test("Google Drive NodeHandler executes via NodeExecutionContext", async () => {
  const handler = new GoogleDriveNodeHandler();
  const res = await handler.execute(
    context({
      operation: "listFiles",
      pageSize: 10,
      mock: true,
    }),
  );

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].json.mock, true);
  assert.ok(Array.isArray(res.items[0].json.files));
});

// ─────────────────────────────────────────────────────────────
// 7. GOOGLE DOCS & CALENDAR & GMAIL RESILIENCE
// ─────────────────────────────────────────────────────────────

test("Google Docs NodeHandler executes batchUpdate and operations with quota backoff", async () => {
  const handler = new GoogleDocsNodeHandler();
  const res = await handler.execute(
    context({
      operation: "batchUpdate",
      documentId: "doc_batch_1",
      requests: [{ insertText: { location: { index: 1 }, text: "Batch Header\n" } }],
      mock: true,
    }),
  );

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].json.mock, true);
  assert.equal(res.items[0].json.documentId, "doc_batch_1");
  assert.equal(res.items[0].json.updated, true);
});

test("Google Calendar NodeHandler executes CRUD with quota resilience", async () => {
  const handler = new GoogleCalendarNodeHandler();
  const res = await handler.execute(
    context({
      operation: "createEvent",
      summary: "High Throughput Sync",
      startTime: "2026-08-29T15:00:00.000Z",
      endTime: "2026-08-29T16:00:00.000Z",
      addGoogleMeet: true,
      mock: true,
    }),
  );

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].json.mock, true);
  assert.equal(res.items[0].json.summary, "High Throughput Sync");
  assert.equal(res.items[0].json.status, "confirmed");
});

test("Google Gmail executes with retry configuration and mock fallback", async () => {
  const result: any = await executeGoogleGmail(
    {
      operation: "sendMessage",
      to: "client@example.com",
      subject: "Automated Report",
      body: "<p>Report details</p>",
      mock: true,
      retryOptions: { maxRetries: 2, baseDelayMs: 10 },
    },
    {},
    "org-test",
  );

  assert.equal(result.mock, true);
  assert.equal(result.status, "SENT");
  assert.equal(result.to, "client@example.com");
});
