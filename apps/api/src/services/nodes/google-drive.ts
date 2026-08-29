// Google Drive Node Handler with Google Drive API v3, Quota Backoff, and Vault OAuth2 integration.
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

export const GoogleDriveInputSchema = z.object({
  operation: z.enum([
    "uploadFile",
    "downloadFile",
    "listFiles",
    "createFolder",
    "deleteFile",
    "getFileMetadata",
    "batchDelete",
  ]).default("listFiles"),
  fileId: z.string().optional(),
  fileIds: z.array(z.string()).optional(),
  fileName: z.string().optional(),
  name: z.string().optional(),
  folderName: z.string().optional(),
  folderId: z.string().optional(),
  mimeType: z.string().optional(),
  content: z.string().optional(),
  query: z.string().optional(),
  pageSize: z.number().optional().default(20),
  credentialId: z.string().optional(),
  mock: z.boolean().optional(),
  retryOptions: z.object({
    maxRetries: z.number().optional(),
    baseDelayMs: z.number().optional(),
    maxDelayMs: z.number().optional(),
  }).optional(),
}).passthrough();

export type GoogleDriveInput = z.infer<typeof GoogleDriveInputSchema>;

export async function executeGoogleDrive(
  config: Record<string, unknown>,
  input: unknown,
  orgId: string,
  retryOpts?: GoogleQuotaRetryOptions,
): Promise<Record<string, unknown>> {
  const merged = mergeNodeInput(config, input);
  const validated = GoogleDriveInputSchema.parse(merged);

  const isMock = isNodeMockEnabled(validated.mock);
  const auth = await getValidGoogleToken({ credentialId: validated.credentialId, orgId });

  if (isMock || !auth.accessToken || auth.accessToken.startsWith("mock_")) {
    switch (validated.operation) {
      case "uploadFile":
        return {
          mock: true,
          id: `mock_drive_file_${Date.now()}`,
          name: validated.fileName ?? validated.name ?? "uploaded-file.txt",
          mimeType: validated.mimeType ?? "text/plain",
          size: validated.content ? String(validated.content.length) : "1024",
          webViewLink: `https://drive.google.com/file/d/mock_drive_file_${Date.now()}/view`,
        };
      case "downloadFile":
        return {
          mock: true,
          fileId: validated.fileId ?? "mock_file_123",
          content: "Mock file content from Google Drive storage",
          mimeType: "text/plain",
        };
      case "listFiles":
        return {
          mock: true,
          files: [
            { id: "file_1", name: "Report-2026.pdf", mimeType: "application/pdf", size: "204800" },
            { id: "file_2", name: "Quarterly-Data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: "51200" },
          ],
        };
      case "createFolder":
        return {
          mock: true,
          id: `mock_folder_${Date.now()}`,
          name: validated.folderName ?? validated.name ?? "New Folder",
          mimeType: "application/vnd.google-apps.folder",
        };
      case "deleteFile":
        return {
          mock: true,
          fileId: validated.fileId ?? "mock_file_123",
          deleted: true,
        };
      case "batchDelete": {
        const ids = validated.fileIds ?? (validated.fileId ? [validated.fileId] : ["mock_file_123"]);
        return {
          mock: true,
          deletedCount: ids.length,
          deletedFileIds: ids,
        };
      }
      case "getFileMetadata":
        return {
          mock: true,
          id: validated.fileId ?? "mock_file_123",
          name: "Report-2026.pdf",
          mimeType: "application/pdf",
        };
      default:
        return { mock: true, operation: validated.operation };
    }
  }

  const baseUrl = "https://www.googleapis.com/drive/v3/files";
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const effectiveRetryOpts: GoogleQuotaRetryOptions = {
    ...retryOpts,
    ...(validated.retryOptions ?? {}),
  };

  switch (validated.operation) {
    case "listFiles": {
      const q = validated.query ? `&q=${encodeURIComponent(validated.query)}` : "";
      const url = `${baseUrl}?pageSize=${validated.pageSize}${q}&fields=files(id,name,mimeType,size,webViewLink)`;
      const res = await fetchWithGoogleQuotaBackoff(url, { headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "createFolder": {
      const res = await fetchWithGoogleQuotaBackoff(
        baseUrl,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: validated.folderName ?? validated.name ?? "New Folder",
            mimeType: "application/vnd.google-apps.folder",
            parents: validated.folderId ? [validated.folderId] : undefined,
          }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "deleteFile": {
      const url = `${baseUrl}/${encodeURIComponent(validated.fileId ?? "")}`;
      const res = await fetchWithGoogleQuotaBackoff(url, { method: "DELETE", headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      return { fileId: validated.fileId, deleted: true };
    }
    case "batchDelete": {
      const ids = validated.fileIds ?? (validated.fileId ? [validated.fileId] : []);
      const deletedFileIds: string[] = [];
      for (const id of ids) {
        const url = `${baseUrl}/${encodeURIComponent(id)}`;
        const res = await fetchWithGoogleQuotaBackoff(url, { method: "DELETE", headers }, effectiveRetryOpts);
        if (res.ok || res.status === 404) {
          deletedFileIds.push(id);
        } else {
          throw new Error(`Drive API batchDelete error (${res.status}) on file ${id}: ${await res.text()}`);
        }
      }
      return {
        deletedCount: deletedFileIds.length,
        deletedFileIds,
      };
    }
    case "getFileMetadata": {
      const url = `${baseUrl}/${encodeURIComponent(validated.fileId ?? "")}?fields=id,name,mimeType,size,webViewLink`;
      const res = await fetchWithGoogleQuotaBackoff(url, { headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    case "downloadFile": {
      const url = `${baseUrl}/${encodeURIComponent(validated.fileId ?? "")}?alt=media`;
      const res = await fetchWithGoogleQuotaBackoff(url, { headers }, effectiveRetryOpts);
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      const content = await res.text();
      return { fileId: validated.fileId, content };
    }
    case "uploadFile": {
      const res = await fetchWithGoogleQuotaBackoff(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: validated.fileName ?? validated.name ?? "upload.txt",
            mimeType: validated.mimeType ?? "text/plain",
            parents: validated.folderId ? [validated.folderId] : undefined,
          }),
        },
        effectiveRetryOpts,
      );
      if (!res.ok) throw new Error(`Drive API error (${res.status}): ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    }
    default:
      return { success: true };
  }
}

export class GoogleDriveNodeHandler implements NodeHandler {
  type = "googleDrive";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const results: NodeItem[] = [];
    for (const item of wrapItems(ctx.input)) {
      results.push({ json: await executeGoogleDrive(ctx.nodeConfig, item.json, ctx.orgId) });
    }
    return { items: results, logs: [`Google Drive node: processed ${results.length} item(s)`] };
  }
}
