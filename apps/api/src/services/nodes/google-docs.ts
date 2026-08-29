import { z } from "zod";
import { safeFetch } from "../../lib/ssrf.js";
import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { isNodeMockEnabled, mergeNodeInput, resolveVaultOAuthCredential } from "./oauth.js";

export const GoogleDocsInputSchema = z.object({
  operation: z.enum(["createDocument", "getDocument", "getText", "insertText", "replaceText", "appendParagraph", "batchUpdate"]).default("createDocument"),
  documentId: z.string().min(1).optional(),
  title: z.string().min(1).default("Untitled Document"),
  content: z.string().optional(),
  text: z.string().optional(),
  findText: z.string().min(1).optional(),
  replaceWith: z.string().optional(),
  matchCase: z.boolean().default(false),
  variables: z.record(z.unknown()).default({}),
  requests: z.array(z.record(z.unknown())).max(1000).optional(),
  index: z.number().int().min(1).optional(),
  credentialId: z.string().min(1).optional(),
  mock: z.boolean().optional(),
}).passthrough().superRefine((value, ctx) => {
  if (value.operation !== "createDocument" && !value.documentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: `documentId is required for ${value.operation}` });
  }
  if (value.operation === "replaceText" && !value.findText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["findText"], message: "findText is required for replaceText" });
  }
  if (value.operation === "batchUpdate" && !value.requests?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requests"], message: "requests are required for batchUpdate" });
  }
});

export type GoogleDocsInput = z.infer<typeof GoogleDocsInputSchema>;
export type GoogleDocsPayload = GoogleDocsInput;

export function substituteTemplateVariables(template: string, variables: Record<string, unknown> = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => (
    Object.hasOwn(variables, key) ? String(variables[key]) : `{{${key}}}`
  ));
}

export function extractGoogleDocumentText(document: unknown): string {
  const data = document as { body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> } };
  return (data.body?.content ?? [])
    .flatMap((item) => item.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? "")
    .join("");
}

function mockDocsResult(input: GoogleDocsInput, content: string): Record<string, unknown> {
  const documentId = input.documentId ?? `doc_${Date.now()}`;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  switch (input.operation) {
    case "getText":
      return { operation: input.operation, documentId, title: input.title, text: content || "Sample extracted Google Docs text.\nParagraph 1\nParagraph 2", mock: true };
    case "getDocument":
      return {
        operation: input.operation,
        documentId,
        title: input.title,
        body: { content: [{ paragraph: { elements: [{ textRun: { content: content || "Sample Google Doc body" } }] } }] },
        revisionId: "mock_rev_1",
        documentUrl,
        mock: true,
      };
    case "replaceText":
      return { operation: input.operation, documentId, findText: input.findText, replaceWith: input.replaceWith ?? "", occurrencesChanged: 3, documentUrl, mock: true };
    case "insertText":
    case "appendParagraph":
    case "batchUpdate":
      return { operation: input.operation, documentId, updated: true, contentLength: content.length, documentUrl, mock: true };
    default:
      return { operation: input.operation, documentId, title: input.title, contentLength: content.length, documentUrl, mock: true };
  }
}

function batchRequests(input: GoogleDocsInput, content: string): Array<Record<string, unknown>> {
  switch (input.operation) {
    case "replaceText":
      return [{ replaceAllText: { containsText: { text: input.findText, matchCase: input.matchCase }, replaceText: input.replaceWith ?? "" } }];
    case "insertText":
      return [{ insertText: { location: { index: input.index ?? 1 }, text: content } }];
    case "appendParagraph":
      return [{ insertText: { endOfSegmentLocation: {}, text: `${content}\n` } }];
    case "batchUpdate":
      return input.requests ?? [];
    default:
      return [];
  }
}

export async function executeGoogleDocs(
  config: Record<string, unknown>,
  input: unknown = {},
  orgId = "",
): Promise<Record<string, unknown>> {
  const validated = GoogleDocsInputSchema.parse(mergeNodeInput(config, input));
  const variables = { ...mergeNodeInput({}, input), ...validated.variables };
  const content = substituteTemplateVariables(validated.content ?? validated.text ?? "", variables);
  if (isNodeMockEnabled(validated.mock)) return mockDocsResult(validated, content);

  const oauth = await resolveVaultOAuthCredential({
    credentialId: validated.credentialId,
    orgId,
    providers: ["google", "google_workspace", "google_docs"],
  });
  const accessToken = oauth?.accessToken ?? process.env.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) return mockDocsResult(validated, content);

  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (validated.operation === "createDocument") {
    const createResponse = await safeFetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: validated.title }),
    });
    if (!createResponse.ok) throw new Error(`Google Docs API error (${createResponse.status}): ${await createResponse.text()}`);
    const created = await createResponse.json() as Record<string, unknown>;
    const documentId = String(created.documentId ?? "");
    if (!documentId) throw new Error("Google Docs API response did not include documentId");
    if (content) {
      const insertResponse = await safeFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] }),
      });
      if (!insertResponse.ok) throw new Error(`Google Docs content insert error (${insertResponse.status}): ${await insertResponse.text()}`);
    }
    return { operation: validated.operation, ...created, documentId, title: validated.title, documentUrl: `https://docs.google.com/document/d/${documentId}/edit` };
  }

  const documentId = validated.documentId!;
  if (validated.operation === "getDocument" || validated.operation === "getText") {
    const response = await safeFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, { headers });
    if (!response.ok) throw new Error(`Google Docs API error (${response.status}): ${await response.text()}`);
    const document = await response.json() as Record<string, unknown>;
    return validated.operation === "getText"
      ? { operation: validated.operation, documentId, title: document.title, text: extractGoogleDocumentText(document) }
      : { operation: validated.operation, ...document };
  }

  const response = await safeFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests: batchRequests(validated, content) }),
  });
  if (!response.ok) throw new Error(`Google Docs API error (${response.status}): ${await response.text()}`);
  return {
    operation: validated.operation,
    documentId,
    documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    ...(await response.json() as Record<string, unknown>),
  };
}

export class GoogleDocsNodeHandler implements NodeHandler {
  type = "googleDocs";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeGoogleDocs(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`Google Docs node: processed ${results.length} item(s)`] };
  }
}
