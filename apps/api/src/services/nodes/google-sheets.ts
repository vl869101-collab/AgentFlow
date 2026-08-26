// Google Sheets Node Handler with Google Sheets API v4 and Vault OAuth2 integration.
import { z } from "zod";
import { getValidGoogleToken } from "../../lib/google-oauth.js";

export const GoogleSheetsInputSchema = z.object({
  operation: z.enum([
    "readRows",
    "appendRow",
    "updateRow",
    "clear",
    "getSpreadsheet",
    "createSpreadsheet",
  ]).default("readRows"),
  spreadsheetId: z.string().optional(),
  sheetId: z.string().optional(),
  range: z.string().optional().default("Sheet1!A1:Z100"),
  values: z.array(z.array(z.unknown())).optional(),
  title: z.string().optional(),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
}).passthrough();

export type GoogleSheetsInput = z.infer<typeof GoogleSheetsInputSchema>;

export async function executeGoogleSheets(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
): Promise<Record<string, unknown>> {
  const merged = { ...config, ...(typeof input === "object" && input !== null ? (input as object) : {}) };
  const validated = GoogleSheetsInputSchema.parse(merged);

  const isMock = validated.mock === true || process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true";
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
      default:
        return { mock: true, spreadsheetId: validated.spreadsheetId ?? "mock_sheet_123" };
    }
  }

  const baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };

  switch (validated.operation) {
    case "readRows": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1:Z100")}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "appendRow": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}:append?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ values: validated.values ?? [] }),
      });
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "updateRow": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ values: validated.values ?? [] }),
      });
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "clear": {
      const url = `${baseUrl}/${encodeURIComponent(validated.spreadsheetId ?? "")}/values/${encodeURIComponent(validated.range ?? "Sheet1!A1")}:clear`;
      const res = await fetch(url, { method: "POST", headers });
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "createSpreadsheet": {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ properties: { title: validated.title ?? "New Spreadsheet" } }),
      });
      if (!res.ok) throw new Error(`Sheets API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    default:
      return { success: true };
  }
}
