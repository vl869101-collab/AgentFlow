// Google Sheets Node Handler with Google Sheets API v4, Batching, Quota Backoff, and Vault OAuth2 integration.
import { z } from "zod";
import { getValidGoogleToken } from "../../lib/google-oauth.js";
import {
  fetchWithGoogleQuotaBackoff,
  chunkArray,
  GoogleQuotaRetryOptions,
} from "../../lib/google-quota.js";
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
} from "./types.js";
import { isNodeMockEnabled, mergeNodeInput } from "./oauth.js";

export const ValueRangeSchema = z.object({
  range: z.string().min(1),
  majorDimension: z.enum(["ROWS", "COLUMNS"]).optional(),
  values: z.array(z.array(z.unknown())),
});

export const GoogleSheetsInputSchema = z.object({
  operation: z.enum([
    "readRows",
    "appendRow",
    "updateRow",
    "clear",
    "getSpreadsheet",
    "createSpreadsheet",
    "batchUpdate",
    "batchGet",
    "batchClear",
    "batchAppend",
  ]).default("readRows"),
  spreadsheetId: z.string().optional(),
  sheetId: z.string().optional(),
  range: z.string().optional().default("Sheet1!A1:Z100"),
  ranges: z.array(z.string()).optional(),
  values: z.array(z.array(z.unknown())).optional(),
  data: z.array(ValueRangeSchema).optional(),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
  insertDataOption: z.enum(["OVERWRITE", "INSERT_ROWS"]).optional(),
  title: z.string().optional(),
  chunkSize: z.number().int().positive().default(500),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
  retryOptions: z.object({
    maxRetries: z.number().optional(),
    baseDelayMs: z.number().optional(),
    maxDelayMs: z.number().optional(),
  }).optional(),
}).passthrough();

export type GoogleSheetsInput = z.infer<typeof GoogleSheetsInputSchema>;

export async function executeGoogleSheets(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
  retryOpts?: GoogleQuotaRetryOptions,
): Promise<Record<string, unknown>> {
  const merged = mergeNodeInput(config, input);
  const validated = GoogleSheetsInputSchema.parse(merged);

  const isMock = isNodeMockEnabled(validated.mock);
  const auth = await getValidGoogleToken({ credentialId: validated.credentialId, orgId });

  if (isMock || !auth.accessToken || auth.accessToken.startsWith("mock_")) {
    switch (validated.operation) {
      case "readRows":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          range: validated.range,
          values: [
            ["ID", "Name", "Email", "Status"],
            ["1", "Alice", "alice@example.com", "Active"],
            ["2", "Bob", "bob@example.com", "Pending"],
          ],
        };
      case "appendRow":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          tableRange: validated.range,
          updates: {
            updatedRange: validated.range,
            updatedRows: (validated.values?.length ?? 1),
            updatedColumns: 4,
            updatedCells: (validated.values?.length ?? 1) * 4,
          },
        };
      case "updateRow":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          updatedRange: validated.range,
          updatedRows: validated.values?.length ?? 1,
        };
      case "clear":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          clearedRange: validated.range,
        };
      case "createSpreadsheet":
        return {
          mock: true,
          spreadsheetId: `mock_sheet_${Date.now()}`,
          title: validated.title ?? "New Spreadsheet",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/mock_sheet_${Date.now()}/edit`,
        };
      case "batchGet":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          valueRanges: (validated.ranges ?? [validated.range]).map((r) => ({
            range: r,
            majorDimension: "ROWS",
            values: [["Col1", "Col2"], ["Val1", "Val2"]],
          })),
        };
      case "batchUpdate": {
        const batchData = validated.data ?? (validated.values ? [{ range: validated.range, values: validated.values }] : []);
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          totalUpdatedRows: batchData.reduce((acc, curr) => acc + curr.values.length, 0),
          totalUpdatedColumns: 2,
          totalUpdatedCells: batchData.reduce((acc, curr) => acc + curr.values.length * (curr.values[0]?.length || 1), 0),
          totalUpdatedSheets: 1,
          responses: batchData.map((d) => ({
            spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
            updatedRange: d.range,
            updatedRows: d.values.length,
            updatedColumns: d.values[0]?.length || 1,
            updatedCells: d.values.length * (d.values[0]?.length || 1),
          })),
        };
      }
      case "batchClear":
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          clearedRanges: validated.ranges ?? [validated.range],
        };
      case "batchAppend": {
        const rows = validated.values ?? [];
        const chunks = chunkArray(rows, validated.chunkSize);
        return {
          mock: true,
          spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123",
          totalAppendedRows: rows.length,
          batchCount: chunks.length,
          updates: {
            updatedRange: validated.range,
            updatedRows: rows.length,
          },
        };
      }
      default:
        return { mock: true, spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123" };
    }
  }

  const baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };
  const effectiveRetryOpts: GoogleQuotaRetryOptions = {
    ...retryOpts,
    ...(validated.retryOptions ?? {}),
  };

  switch (validated.operation) {
    case "readRows": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1:Z100")}`;
      const res = await fetchWithGoogleQuotaBackoff(url, { headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "appendRow": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}:append?valueInputOption=${validated.valueInputOption}`;
      const res = await fetchWithGoogleQuotaBackoff(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ values: validated.values ?? [] }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "updateRow": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}?valueInputOption=${validated.valueInputOption}`;
      const res = await fetchWithGoogleQuotaBackoff(
        url,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ values: validated.values ?? [] }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "clear": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}:clear`;
      const res = await fetchWithGoogleQuotaBackoff(url, { method: "POST", headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "createSpreadsheet": {
      const res = await fetchWithGoogleQuotaBackoff(
        baseUrl,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ properties: { title: validated.title ?? "New Spreadsheet" } }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "batchGet": {
      const ranges = validated.ranges ?? (validated.range ? [validated.range] : ["Sheet1!A1:Z100"]);
      const queryParams = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values:batchGet?${queryParams}`;
      const res = await fetchWithGoogleQuotaBackoff(url, { headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "batchUpdate": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values:batchUpdate`;
      const dataPayload = validated.data ?? (validated.values ? [{ range: validated.range, values: validated.values }] : []);
      const res = await fetchWithGoogleQuotaBackoff(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            valueInputOption: validated.valueInputOption,
            data: dataPayload,
          }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "batchClear": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values:batchClear`;
      const ranges = validated.ranges ?? (validated.range ? [validated.range] : []);
      const res = await fetchWithGoogleQuotaBackoff(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ranges }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "batchAppend": {
      // Chunked bulk append to prevent HTTP 429 quota exhaustion and payload limits
      const rows = validated.values ?? [];
      const chunks = chunkArray(rows, validated.chunkSize);
      const responses: Record<string, unknown>[] = [];
      let totalAppendedRows = 0;

      for (const chunk of chunks) {
        const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}:append?valueInputOption=${validated.valueInputOption}`;
        const res = await fetchWithGoogleQuotaBackoff(
          url,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ values: chunk }),
          },
          effectiveRetryOpts,
        );
        if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
        const json = (await res.json()) as Record<string, unknown>;
        responses.push(json);
        totalAppendedRows += chunk.length;
      }

      return {
        spreadsheetId: validated.spreadsheetId,
        totalAppendedRows,
        batchCount: chunks.length,
        responses,
      };
    }
    default:
      return { success: true };
  }
}

export class GoogleSheetsNodeHandler implements NodeHandler {
  type = "googleSheets";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeGoogleSheets(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`Google Sheets node: processed ${results.length} item(s)`] };
  }
}
