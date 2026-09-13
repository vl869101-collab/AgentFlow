import { z } from "zod";

// ═══════════════════════════════════════════
// 1. Types & Interfaces
// ═══════════════════════════════════════════

export interface BinaryData {
  data: string; // Base64 encoded or buffer string representation / URI
  mimeType?: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number | string;
  id?: string;
  directory?: string;
  [key: string]: unknown;
}

export interface BinaryPayloadMeta {
  /** MIME type verificado (ex: application/pdf, image/png) */
  mimeType: string;
  /** Nome do arquivo original com extensão */
  fileName: string;
  /** Tamanho exato em bytes */
  fileSize: number;
  /** Extensão do arquivo sem ponto */
  fileExtension?: string;
  /** Chave de armazenamento no Vault/S3 (Storage Key) */
  storageKey: string;
  /** Checksum SHA-256 para integridade criptográfica (64 hex characters) */
  checksumSha256: string;
  /** Tamanho do payload em bytes */
  byteLength?: number;
  /** Amostra Base64 para previews ultra-leves (< 16KB), nula caso exceda */
  previewDataUri?: string;
  [key: string]: unknown;
}

export interface PairedItemRef {
  /** Índice do item na entrada do nó atual */
  item: number;
  /** Identificador opcional do nó que gerou o item original */
  sourceNodeId?: string;
  /** Sub-índice para operações de desdobramento (unwind, splitInBatches) */
  subIndex?: number;
  input?: number;
  source?: string;
  [key: string]: unknown;
}

export type PairedItem = PairedItemRef | PairedItemRef[] | number | number[] | Record<string, unknown>;

export interface NodeItem<TJson extends Record<string, any> = Record<string, any>> {
  readonly json: Readonly<TJson>;
  readonly binary?: Readonly<Record<string, BinaryPayloadMeta | BinaryData | any>>;
  readonly pairedItem?: Readonly<PairedItem>;
  readonly _metadata?: Readonly<{
    executionTimeMs?: number;
    iterationIndex?: number;
    sourceBranch?: number;
    [key: string]: unknown;
  }>;
  readonly [key: string]: unknown;
}

export type NormalizedItem<TJson extends Record<string, any> = Record<string, any>> = NodeItem<TJson>;

export interface ItemBatchContext {
  batchIndex: number;
  totalBatches: number;
  batchSize: number;
  itemIndex: number;
  totalItems: number;
  isFirstBatch: boolean;
  isLastBatch: boolean;
}

export interface ItemBatchResult {
  items: NodeItem[];
  context: ItemBatchContext;
}

export interface ItemTransformOptions {
  preserveBinary?: boolean;
  preservePairedItem?: boolean;
  passThroughOnError?: boolean;
}

export interface ItemExtractionOptions {
  fallback?: unknown;
  strict?: boolean;
  arrayFlatten?: boolean;
}

export interface ItemUnwrapOptions {
  singleObjectIfOne?: boolean;
  preserveBinary?: boolean;
  keepItemsWrapper?: boolean;
  unwrapMode?: "auto" | "json_only" | "full" | "raw";
}

// ═══════════════════════════════════════════
// 2. Zod Validation Schemas
// ═══════════════════════════════════════════

export const binaryDataSchema = z.object({
  data: z.string(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  fileExtension: z.string().optional(),
  fileSize: z.union([z.number(), z.string()]).optional(),
  id: z.string().optional(),
  directory: z.string().optional(),
}).passthrough();

export const binaryPayloadMetaSchema = z.object({
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  checksumSha256: z
    .string()
    .length(64, "Must be a 64-character hex SHA-256 digest")
    .regex(/^[a-fA-F0-9]{64}$/, "Must be a 64-character hex SHA-256 digest"),
  fileExtension: z.string().optional(),
  byteLength: z.number().int().nonnegative().optional(),
  previewDataUri: z.string().optional(),
}).passthrough();
export const BinaryPayloadMetaSchema = binaryPayloadMetaSchema;

export const pairedItemRefSchema = z.object({
  item: z.number().int().nonnegative(),
  sourceNodeId: z.string().optional(),
  subIndex: z.number().int().nonnegative().optional(),
  input: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
}).passthrough();
export const PairedItemRefSchema = pairedItemRefSchema;

export const pairedItemSchema = z.union([
  pairedItemRefSchema,
  z.array(pairedItemRefSchema),
  z.number().int().nonnegative(),
  z.array(z.number().int().nonnegative()),
]);

export const nodeItemSchema = z.object({
  json: z.record(z.any()),
  binary: z.record(z.union([binaryPayloadMetaSchema, binaryDataSchema])).optional(),
  pairedItem: pairedItemSchema.optional(),
  _metadata: z.record(z.unknown()).optional(),
}).passthrough();
export const NodeItemSchema = nodeItemSchema;

export const nodeItemsArraySchema = z.array(nodeItemSchema);
export const NodeItemsSchema = nodeItemsArraySchema;

// ═══════════════════════════════════════════
// 3. Extraction & Dot Notation / JSONPath Engine
// ═══════════════════════════════════════════

/**
 * Normalizes string path by converting bracket notation `a['b'][0]` to dot-separated `a.b.0`
 */
export function normalizePath(path: string): string[] {
  if (!path || typeof path !== "string") return [];
  const normalized = path
    .trim()
    .replace(/\[['"`](.*?)['"`]\]/g, ".$1") // a['key'] -> a.key
    .replace(/\[(\d+)\]/g, ".$1")           // a[0] -> a.0
    .replace(/\[\*\]/g, ".*")               // a[*] -> a.* (wildcard array map)
    .replace(/^\./, "");                    // remove leading dot

  if (!normalized) return [];
  return normalized.split(".").filter((seg) => seg.length > 0);
}

/**
 * Safely extracts a nested property using dot-notation, bracket notation, array indices and wildcards.
 * Supports: `a.b.c`, `users[0].name`, `items[*].id`, `data['field']`
 */
export function extractFieldByPath(
  obj: unknown,
  path: string,
  options?: ItemExtractionOptions | unknown
): unknown {
  const fallback = typeof options === "object" && options !== null && "fallback" in options
    ? (options as ItemExtractionOptions).fallback
    : options;

  if (obj === undefined || obj === null || path === undefined || path === null) {
    return fallback;
  }

  const segments = normalizePath(path);
  if (segments.length === 0) return obj;

  let current: any = obj;

  for (let i = 0; i < segments.length; i++) {
    if (current === undefined || current === null) {
      return fallback;
    }

    const segment = segments[i];

    // Wildcard mapping across array elements: e.g. `users.*.name` or `items.*`
    if (segment === "*") {
      if (!Array.isArray(current)) {
        return fallback;
      }
      const remainingPath = segments.slice(i + 1).join(".");
      if (!remainingPath) {
        return current;
      }
      const mapped = current.map((item) => extractFieldByPath(item, remainingPath, fallback));
      return mapped;
    }

    if (typeof current === "object") {
      current = current[segment];
    } else {
      return fallback;
    }
  }

  return current !== undefined ? current : fallback;
}

/**
 * Immutable setter that produces a new object with the value set at the specified dot/bracket path.
 */
export function setFieldByPath<T extends Record<string, any> = Record<string, any>>(
  target: T,
  path: string,
  value: unknown
): T {
  const segments = normalizePath(path);
  if (segments.length === 0) return { ...(target as object) } as T;

  function setRecursive(curr: any, index: number): any {
    if (index >= segments.length) return value;
    const key = segments[index];
    const nextKey = segments[index + 1];
    const isNextArray = nextKey !== undefined && /^\d+$/.test(nextKey);

    if (Array.isArray(curr)) {
      const idx = parseInt(key, 10);
      const copy = [...curr];
      const child = idx < copy.length && copy[idx] !== undefined ? copy[idx] : isNextArray ? [] : {};
      copy[idx] = setRecursive(child, index + 1);
      return copy;
    }

    const currentObj = curr && typeof curr === "object" ? curr : {};
    const child = currentObj[key] !== undefined ? currentObj[key] : isNextArray ? [] : {};

    return {
      ...currentObj,
      [key]: setRecursive(child, index + 1),
    };
  }

  return setRecursive(target, 0) as T;
}

// ═══════════════════════════════════════════
// 4. Item Normalization & Conversion Utilities
// ═══════════════════════════════════════════

/**
 * Checks if a candidate is already a valid NodeItem shape ({ json: Record<string, any> })
 */
export function isNodeItem(candidate: unknown): candidate is NodeItem {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }
  const obj = candidate as Record<string, any>;
  return "json" in obj && typeof obj.json === "object" && obj.json !== null && !Array.isArray(obj.json);
}

/**
 * Ensures an individual item conforms strictly to the NodeItem contract.
 */
export function ensureNodeItem<TJson extends Record<string, any> = Record<string, any>>(
  item: unknown,
  defaultIndex?: number
): NodeItem<TJson> {
  if (item === null || item === undefined) {
    const res: NodeItem<TJson> = { json: {} as TJson };
    if (defaultIndex !== undefined) {
      return { ...res, pairedItem: { item: defaultIndex } };
    }
    return res;
  }

  // Already a valid NodeItem
  if (isNodeItem(item)) {
    const existing = item as NodeItem<TJson>;
    return {
      json: { ...existing.json },
      ...(existing.binary ? { binary: { ...existing.binary } } : {}),
      ...(existing.pairedItem !== undefined
        ? { pairedItem: existing.pairedItem }
        : defaultIndex !== undefined
        ? { pairedItem: { item: defaultIndex } }
        : {}),
      ...(existing._metadata ? { _metadata: { ...existing._metadata } } : {}),
    };
  }

  // If item is a primitive or array, package it in json.value
  if (typeof item !== "object" || Array.isArray(item)) {
    const res: NodeItem<TJson> = { json: { value: item } as unknown as TJson };
    if (defaultIndex !== undefined) {
      return { ...res, pairedItem: { item: defaultIndex } };
    }
    return res;
  }

  // If item is a plain dictionary object
  const obj = item as Record<string, any>;
  const { pairedItem, binary, _metadata, ...rest } = obj;
  const extractedPaired =
    pairedItem !== undefined
      ? pairedItem
      : defaultIndex !== undefined
      ? { item: defaultIndex }
      : undefined;

  return {
    json: rest as TJson,
    ...(binary ? { binary } : {}),
    ...(extractedPaired !== undefined ? { pairedItem: extractedPaired } : {}),
    ...(_metadata ? { _metadata } : {}),
  };
}

/**
 * Wraps any arbitrary raw payload (single object, array of items, legacy { items: [...] },
 * array of primitives, null/undefined) into a standardized multi-item array: NodeItem[].
 */
export function wrapItems<TJson extends Record<string, any> = Record<string, any>>(data: unknown): NodeItem<TJson>[] {
  if (data === undefined || data === null) {
    return [{ json: {} as TJson }];
  }

  // Already an array
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    return data.map((entry, idx) => ensureNodeItem<TJson>(entry, idx));
  }

  if (typeof data === "object") {
    const obj = data as Record<string, any>;

    // Handle legacy container patterns like `{ items: [...] }` or `{ data: [...] }`
    if ("items" in obj && Array.isArray(obj.items)) {
      return wrapItems<TJson>(obj.items);
    }

    if (isNodeItem(obj)) {
      return [ensureNodeItem<TJson>(obj, 0)];
    }

    // Single dictionary object
    return [ensureNodeItem<TJson>(obj, 0)];
  }

  // Primitive value (string, number, boolean)
  return [{ json: { value: data } as unknown as TJson, pairedItem: { item: 0 } }];
}

/**
 * Unwraps standardized NodeItem[] into consumer-friendly data formats (legacy backwards-compatible or clean payload).
 */
export function unwrapItems<T = unknown>(
  items: NodeItem[],
  options?: ItemUnwrapOptions | boolean
): T {
  const opts: ItemUnwrapOptions = typeof options === "boolean"
    ? { singleObjectIfOne: options }
    : options ?? {};

  const {
    singleObjectIfOne = true,
    preserveBinary = true,
    unwrapMode = "auto",
  } = opts;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return [] as unknown as T;
  }

  if (unwrapMode === "raw") {
    return items as unknown as T;
  }

  if (unwrapMode === "json_only") {
    const jsonList = items.map((i) => (i?.json ? { ...i.json } : {}));
    if (jsonList.length === 1 && singleObjectIfOne) {
      return jsonList[0] as unknown as T;
    }
    return jsonList as unknown as T;
  }

  // Legacy format: strips pairedItem and returns clean JSON objects / array
  if (preserveBinary === false) {
    const jsonList = items.map((i) => (i?.json ? { ...i.json } : {}));
    if (jsonList.length === 1 && singleObjectIfOne) {
      return jsonList[0] as unknown as T;
    }
    return jsonList as unknown as T;
  }

  // Auto / Full mode:
  // If single item without binary or pairedItem, return just item.json for ergonomic compatibility
  if (items.length === 1 && singleObjectIfOne) {
    const single = items[0];
    if (!single.binary && single.pairedItem === undefined) {
      return { ...single.json } as unknown as T;
    }
  }

  const res = items.map((item) => {
    if (!item) return {};
    const hasBinary = preserveBinary && item.binary && Object.keys(item.binary).length > 0;
    const hasPaired = item.pairedItem !== undefined;

    if (!hasBinary && !hasPaired) {
      return { ...item.json };
    }

    return {
      json: { ...item.json },
      ...(hasBinary ? { binary: { ...item.binary } } : {}),
      ...(hasPaired ? { pairedItem: item.pairedItem } : {}),
    };
  });
  return res as unknown as T;
}

// ═══════════════════════════════════════════
// 5. Multi-Item Batching, Mapping & Linking
// ═══════════════════════════════════════════

/**
 * Splits items into deterministic batches with rich execution context metadata.
 */
export function batchItems(items: NodeItem[], batchSize: number = 10): ItemBatchResult[] {
  const safeSize = Math.max(1, Math.floor(batchSize));
  const normalized = wrapItems(items);
  const totalItems = normalized.length;
  if (totalItems === 0) return [];

  const totalBatches = Math.max(1, Math.ceil(totalItems / safeSize));
  const results: ItemBatchResult[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * safeSize;
    const endIndex = Math.min(startIndex + safeSize, totalItems);
    const slice = normalized.slice(startIndex, endIndex);

    const isFirstBatch = batchIndex === 0;
    const isLastBatch = batchIndex === totalBatches - 1;

    const enrichedItems: NodeItem[] = slice.map((item, idxInBatch) => {
      const itemIndex = startIndex + idxInBatch;
      const ctx: ItemBatchContext = {
        batchIndex,
        totalBatches,
        batchSize: safeSize,
        itemIndex,
        totalItems,
        isFirstBatch,
        isLastBatch,
      };

      return {
        json: {
          ...item.json,
          _batchContext: ctx,
        },
        ...(item.binary ? { binary: { ...item.binary } } : {}),
        pairedItem: item.pairedItem !== undefined ? item.pairedItem : { item: itemIndex },
      };
    });

    results.push({
      items: enrichedItems,
      context: {
        batchIndex,
        totalBatches,
        batchSize: safeSize,
        itemIndex: startIndex,
        totalItems,
        isFirstBatch,
        isLastBatch,
      },
    });
  }

  return results;
}

/**
 * Maps over items maintaining or generating paired item references.
 */
export async function mapItems(
  items: NodeItem[],
  mapper: (item: NodeItem, index: number, all: NodeItem[]) => NodeItem | Promise<NodeItem>
): Promise<NodeItem[]> {
  const normalized = wrapItems(items);
  const out: NodeItem[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const mapped = await mapper(current, i, normalized);
    const ensured = ensureNodeItem(mapped);
    const pairedItem =
      ensured.pairedItem !== undefined
        ? ensured.pairedItem
        : current.pairedItem !== undefined
        ? current.pairedItem
        : { item: i };
    out.push({
      ...ensured,
      pairedItem,
    });
  }

  return out;
}

/**
 * Filters items while preserving item integrity and paired references.
 */
export async function filterItems(
  items: NodeItem[],
  predicate: (item: NodeItem, index: number, all: NodeItem[]) => boolean | Promise<boolean>
): Promise<NodeItem[]> {
  const normalized = wrapItems(items);
  const out: NodeItem[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const keep = await predicate(current, i, normalized);
    if (keep) {
      out.push({
        json: { ...current.json },
        ...(current.binary ? { binary: { ...current.binary } } : {}),
        pairedItem: current.pairedItem !== undefined ? current.pairedItem : { item: i },
      });
    }
  }

  return out;
}

/**
 * Merges multiple item batches back into a flat continuous items array.
 */
export function mergeItemBatches(batches: NodeItem[][]): NodeItem[] {
  if (!batches || !Array.isArray(batches)) return [];
  const merged: NodeItem[] = [];
  for (const batch of batches) {
    if (Array.isArray(batch)) {
      for (const item of batch) {
        merged.push(ensureNodeItem(item));
      }
    }
  }
  return merged;
}

/**
 * Creates a paired item reference structure.
 */
export function createPairedItem(
  itemIndex: number,
  inputIndex: number = 0,
  sourceNode?: string,
  subIndex?: number
): PairedItemRef {
  return {
    item: Math.max(0, itemIndex),
    input: Math.max(0, inputIndex),
    ...(sourceNode ? { source: sourceNode, sourceNodeId: sourceNode } : {}),
    ...(subIndex !== undefined ? { subIndex } : {}),
  };
}

/**
 * Links a list of output items to their source input items by index or custom mapping.
 */
export function linkPairedItems(
  sourceItems: NodeItem[],
  outputItems: NodeItem[],
  sourceNodeId?: string
): NodeItem[] {
  const wrappedSource = wrapItems(sourceItems);
  const wrappedOutput = wrapItems(outputItems);

  return wrappedOutput.map((outItem, idx) => {
    let paired: PairedItemRef;
    if (wrappedSource.length === 1) {
      paired = createPairedItem(0, 0, sourceNodeId);
    } else if (idx < wrappedSource.length) {
      paired = createPairedItem(idx, 0, sourceNodeId);
    } else {
      // Fan-out / generated items reference the last source item or all items
      paired = createPairedItem(Math.min(idx, wrappedSource.length - 1), 0, sourceNodeId);
    }

    return {
      json: { ...outItem.json },
      ...(outItem.binary ? { binary: { ...outItem.binary } } : {}),
      pairedItem: paired,
    };
  });
}

/**
 * Bidirectional normalization adapter: convert any raw input or legacy output to standard items contract.
 */
export function normalizeToItemsContract(input: unknown): NodeItem[] {
  return wrapItems(input);
}

/**
 * Bidirectional normalization adapter: convert standard items contract to target output format.
 */
export function normalizeFromItemsContract(
  items: NodeItem[],
  targetFormat: "legacy" | "items" | "auto" | "raw" = "auto"
): unknown {
  if (targetFormat === "raw") return items;
  if (targetFormat === "items") return wrapItems(items);
  if (targetFormat === "legacy") return unwrapItems(items, { singleObjectIfOne: true, preserveBinary: false });
  return unwrapItems(items, { singleObjectIfOne: true, preserveBinary: true });
}
