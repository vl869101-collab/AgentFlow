/**
 * Tipos compartilhados para handlers de nodes do AgentFlow.
 *
 * Estes handlers sao implementacoes independentes da recriacao do WF1 e nao
 * editam o registry compartilhado em apps/api/src/services/executor.ts.
 */

export interface BinaryData {
  data: string;
  mimeType?: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number;
  [key: string]: unknown;
}

export interface NodeItem {
  json: Record<string, any>;
  binary?: Record<string, BinaryData | any>;
}

/** Wraps any raw input data into a standardized NodeItem array */
export function wrapItems(data: unknown): NodeItem[] {
  if (data === undefined || data === null) {
    return [{ json: {} }];
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    return data.map((d) => ensureNodeItem(d));
  }
  if (typeof data === "object") {
    const obj = data as Record<string, any>;
    if ("items" in obj && Array.isArray(obj.items)) {
      return wrapItems(obj.items);
    }
    return [ensureNodeItem(obj)];
  }
  return [{ json: { value: data } }];
}

/** Ensures an individual value satisfies the NodeItem structure */
export function ensureNodeItem(item: unknown): NodeItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { json: { value: item } };
  }
  const obj = item as Record<string, any>;
  if ("json" in obj && typeof obj.json === "object" && obj.json !== null && !Array.isArray(obj.json)) {
    return {
      json: { ...obj.json },
      ...(obj.binary ? { binary: { ...obj.binary } } : {}),
    };
  }
  return {
    json: { ...obj },
  };
}

/** Unwraps NodeItem array into a clean JSON structure */
export function unwrapItems(items: NodeItem[]): unknown {
  if (!items || items.length === 0) return [];
  if (items.length === 1 && !items[0].binary) {
    return items[0].json;
  }
  return items.map((i) => (i.binary ? { json: i.json, binary: i.binary } : i.json));
}

export interface NodeExecutionContext {
  executionId: string;
  nodeId: string;
  workflowId: string;
  orgId: string;
  nodeConfig: Record<string, unknown>;
  input: unknown;
  credentials?: Record<string, unknown>;
}

export interface NodeExecutionResult {
  items: NodeItem[];
  logs?: string[];
}

export interface NodeHandler {
  type: string;
  category: string;
  execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult>;
}

/** Resultado de upload simulado para Google Drive */
export interface GoogleDriveUploadResult {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  downloadLink: string;
}

/** Resultado de envio de email simulado do Gmail trigger */
export interface GmailMessageResult {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  attachments: AttachmentMetadata[];
}

export interface AttachmentMetadata {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface CodeExecutionError extends Error {
  code?: string;
  statusCode?: number;
}

export function createCodeExecutionError(message: string, code?: string): CodeExecutionError {
  const err = new Error(message) as CodeExecutionError;
  err.code = code ?? "CODE_EXECUTION_ERROR";
  err.statusCode = 500;
  return err;
}
