/**
 * Tipos compartilhados para handlers de nodes do AgentFlow.
 * Re-exporta e integra o Items Contract Engine do @agentflow/shared
 */

import {
  type BinaryData,
  type BinaryPayloadMeta,
  type PairedItemRef,
  type PairedItem,
  type NodeItem,
  type NormalizedItem,
  type ItemBatchContext,
  type ItemBatchResult,
  type ItemTransformOptions,
  type ItemExtractionOptions,
  type ItemUnwrapOptions,
  binaryDataSchema,
  binaryPayloadMetaSchema,
  BinaryPayloadMetaSchema,
  pairedItemRefSchema,
  PairedItemRefSchema,
  pairedItemSchema,
  nodeItemSchema,
  NodeItemSchema,
  nodeItemsArraySchema,
  NodeItemsSchema,
  normalizePath,
  extractFieldByPath,
  setFieldByPath,
  isNodeItem,
  ensureNodeItem,
  wrapItems,
  unwrapItems,
  batchItems,
  mapItems,
  filterItems,
  mergeItemBatches,
  createPairedItem,
  linkPairedItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
} from "@agentflow/shared";

export {
  type BinaryData,
  type BinaryPayloadMeta,
  type PairedItemRef,
  type PairedItem,
  type NodeItem,
  type NormalizedItem,
  type ItemBatchContext,
  type ItemBatchResult,
  type ItemTransformOptions,
  type ItemExtractionOptions,
  type ItemUnwrapOptions,
  binaryDataSchema,
  binaryPayloadMetaSchema,
  BinaryPayloadMetaSchema,
  pairedItemRefSchema,
  PairedItemRefSchema,
  pairedItemSchema,
  nodeItemSchema,
  NodeItemSchema,
  nodeItemsArraySchema,
  NodeItemsSchema,
  normalizePath,
  extractFieldByPath,
  setFieldByPath,
  isNodeItem,
  ensureNodeItem,
  wrapItems,
  unwrapItems,
  batchItems,
  mapItems,
  filterItems,
  mergeItemBatches,
  createPairedItem,
  linkPairedItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
};

export interface NodeExecutionContext {
  executionId: string;
  nodeId: string;
  workflowId: string;
  orgId: string;
  nodeConfig: Record<string, unknown>;
  input: unknown;
  inputBranches?: NodeItem[][];
  credentials?: Record<string, unknown>;
  traceparent?: string;
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
