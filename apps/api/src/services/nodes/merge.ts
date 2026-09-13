import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  PairedItem,
  PairedItemRef,
  wrapItems,
  ensureNodeItem,
  extractFieldByPath,
} from "./types.js";

export type MergeMode =
  | "append"
  | "combineByPosition"
  | "mergeByIndex"
  | "mergeByKey"
  | "multiplex"
  | "cartesian"
  | "waitAll"
  | "chooseBranch"
  | "override";

export interface MergeNodeConfig {
  mode?: MergeMode | string;
  joinMode?: string;
  propertyName1?: string;
  propertyName2?: string;
  key1?: string;
  key2?: string;
  joinKey?: string;
  branchIndex?: number;
  outputFormat?: "merged" | "keepFirst" | "keepSecond";
  clashHandling?: "override" | "preferInput1" | "preferInput2";
  joinType?: "full" | "inner" | "left" | "right" | string;
  inputBranches?: unknown[];
  [key: string]: unknown;
}

function attachBranchToPairedItem(pairedItem: unknown, itemIdx: number, branchIdx: number): PairedItem {
  if (pairedItem === undefined || pairedItem === null) {
    return { item: itemIdx, input: branchIdx };
  }
  if (typeof pairedItem === "number") {
    return { item: pairedItem, input: branchIdx };
  }
  if (Array.isArray(pairedItem)) {
    return pairedItem.map((p) => {
      if (typeof p === "number") return { item: p, input: branchIdx };
      if (p && typeof p === "object") {
        const ref = p as Record<string, any>;
        return {
          ...ref,
          item: ref.item !== undefined ? ref.item : itemIdx,
          input: ref.input !== undefined ? ref.input : branchIdx,
        };
      }
      return { item: itemIdx, input: branchIdx };
    });
  }
  if (typeof pairedItem === "object") {
    const ref = pairedItem as Record<string, any>;
    return {
      ...ref,
      item: ref.item !== undefined ? ref.item : itemIdx,
      input: ref.input !== undefined ? ref.input : branchIdx,
    } as PairedItem;
  }
  return { item: itemIdx, input: branchIdx };
}

function getPairedItemRef(item: NodeItem, defaultIndex: number, defaultInput: number): PairedItemRef {
  if (item && item.pairedItem !== undefined && item.pairedItem !== null) {
    if (typeof item.pairedItem === "number") {
      return { item: item.pairedItem, input: defaultInput };
    }
    if (typeof item.pairedItem === "object" && !Array.isArray(item.pairedItem) && "item" in item.pairedItem) {
      const ref = item.pairedItem as PairedItemRef;
      return {
        ...ref,
        input: ref.input !== undefined ? ref.input : defaultInput,
      };
    }
    if (Array.isArray(item.pairedItem) && item.pairedItem.length > 0) {
      const first = item.pairedItem[0];
      if (typeof first === "number") {
        return { item: first, input: defaultInput };
      }
      if (first && typeof first === "object" && "item" in first) {
        const ref = first as PairedItemRef;
        return {
          ...ref,
          input: ref.input !== undefined ? ref.input : defaultInput,
        };
      }
    }
  }
  return { item: defaultIndex, input: defaultInput };
}

function getAllPairedItemRefs(item: NodeItem, defaultIndex: number, defaultInput: number): PairedItemRef[] {
  if (item && item.pairedItem !== undefined && item.pairedItem !== null) {
    if (Array.isArray(item.pairedItem)) {
      return item.pairedItem.map((p: unknown) => {
        if (typeof p === "number") return { item: p, input: defaultInput };
        if (p && typeof p === "object" && "item" in p) {
          const ref = p as PairedItemRef;
          return { ...ref, input: ref.input !== undefined ? ref.input : defaultInput };
        }
        return { item: defaultIndex, input: defaultInput };
      });
    }
    if (typeof item.pairedItem === "number") {
      return [{ item: item.pairedItem, input: defaultInput }];
    }
    if (typeof item.pairedItem === "object" && "item" in item.pairedItem) {
      const ref = item.pairedItem as PairedItemRef;
      return [{ ...ref, input: ref.input !== undefined ? ref.input : defaultInput }];
    }
  }
  return [{ item: defaultIndex, input: defaultInput }];
}

/**
 * Normalizes any incoming context input into a deterministic 2D branch array: NodeItem[][]
 */
export function normalizeBranches(ctx: NodeExecutionContext): NodeItem[][] {
  // 1. Explicit inputBranches in ctx
  if (Array.isArray(ctx.inputBranches)) {
    return ctx.inputBranches.map((branch, bIdx) =>
      wrapItems(branch).map((item: NodeItem, iIdx: number) => ({
        ...item,
        pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
      }))
    );
  }

  const raw = ctx.input;

  // 2. Explicit inputBranches property in raw object or nodeConfig
  const explicit =
    (raw && typeof raw === "object" && !Array.isArray(raw) && "inputBranches" in raw && Array.isArray((raw as any).inputBranches)
      ? (raw as any).inputBranches
      : undefined) ??
    (ctx.nodeConfig && typeof ctx.nodeConfig === "object" && "inputBranches" in ctx.nodeConfig && Array.isArray((ctx.nodeConfig as any).inputBranches)
      ? (ctx.nodeConfig as any).inputBranches
      : undefined);

  if (Array.isArray(explicit)) {
    return explicit.map((branch: unknown, bIdx: number) =>
      wrapItems(branch).map((item: NodeItem, iIdx: number) => ({
        ...item,
        pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
      }))
    );
  }

  if (raw === undefined || raw === null) {
    return [];
  }

  // 3. Array of branches or items
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];

    // If every element is an array: canonical 2D matrix NodeItem[][]
    const allArrays = raw.every((el) => Array.isArray(el));
    if (allArrays) {
      return raw.map((branch, bIdx) =>
        wrapItems(branch).map((item: NodeItem, iIdx: number) => ({
          ...item,
          pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
        }))
      );
    }

    // If at least one element is an array (e.g. [[item1], item2])
    const someArrays = raw.some((el) => Array.isArray(el));
    if (someArrays) {
      return raw.map((branchOrItem, bIdx) =>
        wrapItems(branchOrItem).map((item: NodeItem, iIdx: number) => ({
          ...item,
          pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
        }))
      );
    }

    // Check if items have branch containers like { items: [...] } or { branch: [...] }
    const hasBranchContainers = raw.every(
      (el) => el && typeof el === "object" && ("items" in el || "branch" in el)
    );
    if (hasBranchContainers) {
      return raw.map((bObj, bIdx) => {
        const content = (bObj as any).items ?? (bObj as any).branch ?? bObj;
        return wrapItems(content).map((item: NodeItem, iIdx: number) => ({
          ...item,
          pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
        }));
      });
    }

    // Check if items have _metadata.sourceBranch
    const hasSourceBranches = raw.some(
      (el) => el && typeof el === "object" && el._metadata?.sourceBranch !== undefined
    );
    if (hasSourceBranches) {
      const branchMap = new Map<number, NodeItem[]>();
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const bIdx = Number(item?._metadata?.sourceBranch ?? 0);
        const list = branchMap.get(bIdx) ?? [];
        list.push(ensureNodeItem(item, i));
        branchMap.set(bIdx, list);
      }
      const sortedKeys = Array.from(branchMap.keys()).sort((a, b) => a - b);
      return sortedKeys.map((key, bIdx) =>
        branchMap.get(key)!.map((item: NodeItem, iIdx: number) => ({
          ...item,
          pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
        }))
      );
    }

    // Flat array of items -> treated as a single branch
    return [
      wrapItems(raw).map((item: NodeItem, iIdx: number) => ({
        ...item,
        pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, 0),
      })),
    ];
  }

  // 4. Object with keyed branches { input1: [...], input2: [...] }
  if (typeof raw === "object") {
    const keys = Object.keys(raw);
    const branchKeyRegex = /^(input|branch|port|in)?[_-]?\d+$/i;
    const isKeyedBranches = keys.length > 0 && keys.every((k) => branchKeyRegex.test(k));
    if (isKeyedBranches) {
      const sortedKeys = [...keys].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });
      return sortedKeys.map((k, bIdx) =>
        wrapItems((raw as any)[k]).map((item: NodeItem, iIdx: number) => ({
          ...item,
          pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, bIdx),
        }))
      );
    }

    return [
      wrapItems(raw).map((item: NodeItem, iIdx: number) => ({
        ...item,
        pairedItem: attachBranchToPairedItem(item.pairedItem, iIdx, 0),
      })),
    ];
  }

  return [wrapItems(raw)];
}

export class MergeNodeHandler implements NodeHandler {
  type = "merge";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as MergeNodeConfig;
    const mode = String(config.mode ?? config.joinMode ?? "append").toLowerCase();

    // Determine incoming branches via robust 2D branch normalization
    const branches = normalizeBranches(ctx);

    let items: NodeItem[] = [];

    switch (mode) {
      case "mergebykey":
      case "combinebykey":
      case "joinbykey": {
        const branch1 = branches[0] ?? [];
        const branch2 = branches[1] ?? [];
        const key1 = String(config.propertyName1 ?? config.key1 ?? config.joinKey ?? "id");
        const key2 = String(config.propertyName2 ?? config.key2 ?? config.joinKey ?? key1);
        const outputFormat = config.outputFormat ?? "merged";
        const clashHandling = config.clashHandling ?? "preferInput1";
        const joinType = String(config.joinType ?? "full").toLowerCase();

        // Build lookup map from branch2
        const branch2Map = new Map<string, { item: NodeItem; index: number }>();
        for (let idx2 = 0; idx2 < branch2.length; idx2++) {
          const item2 = branch2[idx2];
          const val2 = extractFieldByPath(item2.json, key2);
          if (val2 !== undefined && val2 !== null) {
            branch2Map.set(String(val2), { item: item2, index: idx2 });
          }
        }

        const matchedKeys = new Set<string>();

        // Process branch1
        for (let idx1 = 0; idx1 < branch1.length; idx1++) {
          const item1 = branch1[idx1];
          const val1 = extractFieldByPath(item1.json, key1);
          const keyStr = val1 !== undefined && val1 !== null ? String(val1) : undefined;
          const match = keyStr !== undefined ? branch2Map.get(keyStr) : undefined;

          if (match) {
            matchedKeys.add(keyStr!);
            const item2 = match.item;
            const idx2 = match.index;

            let mergedJson: Record<string, any>;
            if (outputFormat === "keepFirst") {
              mergedJson = { ...item1.json };
            } else if (outputFormat === "keepSecond") {
              mergedJson = { ...item2.json };
            } else if (clashHandling === "preferInput2" || clashHandling === "override") {
              mergedJson = { ...item1.json, ...item2.json };
            } else {
              // Default preferInput1: item1 overwrites item2 on conflicting fields
              mergedJson = { ...item2.json, ...item1.json };
            }

            const refs1 = getAllPairedItemRefs(item1, idx1, 0);
            const refs2 = getAllPairedItemRefs(item2, idx2, 1);

            items.push({
              json: mergedJson,
              binary: {
                ...(item2.binary ?? {}),
                ...(item1.binary ?? {}),
              },
              pairedItem: [...refs1, ...refs2],
            });
          } else if (joinType === "full" || joinType === "left") {
            // Unmatched item from branch1
            const refs1 = getAllPairedItemRefs(item1, idx1, 0);
            items.push({
              json: { ...item1.json },
              binary: item1.binary ? { ...item1.binary } : undefined,
              pairedItem: refs1.length === 1 ? refs1[0] : refs1,
            });
          }
        }

        // Include unmatched items from branch2 for full or right joins
        if (joinType === "full" || joinType === "right") {
          for (let idx2 = 0; idx2 < branch2.length; idx2++) {
            const item2 = branch2[idx2];
            const val2 = extractFieldByPath(item2.json, key2);
            const keyStr = val2 !== undefined && val2 !== null ? String(val2) : undefined;
            if (!keyStr || !matchedKeys.has(keyStr)) {
              const refs2 = getAllPairedItemRefs(item2, idx2, 1);
              items.push({
                json: { ...item2.json },
                binary: item2.binary ? { ...item2.binary } : undefined,
                pairedItem: refs2.length === 1 ? refs2[0] : refs2,
              });
            }
          }
        }
        break;
      }

      case "combinebyposition":
      case "mergebyindex":
      case "zip": {
        // Zip items from each branch by position / index
        const maxLen = Math.max(...branches.map((b) => b.length), 0);
        for (let i = 0; i < maxLen; i++) {
          let mergedJson: Record<string, any> = {};
          let mergedBinary: Record<string, any> = {};
          const pairedRefs: PairedItemRef[] = [];

          for (let b = 0; b < branches.length; b++) {
            const item = branches[b][i];
            if (item) {
              mergedJson = { ...mergedJson, ...item.json };
              if (item.binary) {
                mergedBinary = { ...mergedBinary, ...item.binary };
              }
              const refs = getAllPairedItemRefs(item, i, b);
              pairedRefs.push(...refs);
            }
          }

          items.push({
            json: mergedJson,
            ...(Object.keys(mergedBinary).length > 0 ? { binary: mergedBinary } : {}),
            pairedItem: pairedRefs.length === 1 ? pairedRefs[0] : pairedRefs,
          });
        }
        break;
      }

      case "multiplex":
      case "cartesian": {
        // Cartesian product across all branches
        if (branches.length === 0) break;
        let currentItems: NodeItem[] = branches[0].map((item, idx) => ({
          json: { ...item.json },
          ...(item.binary ? { binary: { ...item.binary } } : {}),
          pairedItem: item.pairedItem !== undefined ? item.pairedItem : { item: idx, input: 0 },
        }));

        for (let b = 1; b < branches.length; b++) {
          const nextBranch = branches[b];
          const nextItems: NodeItem[] = [];

          for (let curIdx = 0; curIdx < currentItems.length; curIdx++) {
            const cur = currentItems[curIdx];
            for (let nxtIdx = 0; nxtIdx < nextBranch.length; nxtIdx++) {
              const nxt = nextBranch[nxtIdx];

              const curRefs = getAllPairedItemRefs(cur, curIdx, 0);
              const nxtRefs = getAllPairedItemRefs(nxt, nxtIdx, b);

              nextItems.push({
                json: { ...cur.json, ...nxt.json },
                binary: { ...(cur.binary ?? {}), ...(nxt.binary ?? {}) },
                pairedItem: [...curRefs, ...nxtRefs],
              });
            }
          }
          currentItems = nextItems;
        }
        items = currentItems;
        break;
      }

      case "choosebranch":
      case "override": {
        const targetIndex = Number(config.branchIndex ?? 0);
        const selected = branches[targetIndex] ?? branches[0] ?? [];
        items = selected.map((item, idx) => ({
          json: { ...item.json },
          ...(item.binary ? { binary: { ...item.binary } } : {}),
          pairedItem: attachBranchToPairedItem(item.pairedItem, idx, targetIndex),
          ...(item._metadata ? { _metadata: { ...item._metadata, sourceBranch: targetIndex } } : {}),
        }));
        break;
      }

      case "waitall":
      case "append":
      default: {
        // Append all items from all branches in deterministic branch order
        for (let b = 0; b < branches.length; b++) {
          const branch = branches[b];
          for (let i = 0; i < branch.length; i++) {
            const item = branch[i];
            items.push({
              json: { ...item.json },
              ...(item.binary ? { binary: { ...item.binary } } : {}),
              pairedItem: attachBranchToPairedItem(item.pairedItem, i, b),
              _metadata: {
                ...(item._metadata ?? {}),
                sourceBranch: b,
              },
            });
          }
        }
        break;
      }
    }

    return {
      items,
      logs: [
        `Merge: combined ${branches.length} branch(es) into ${items.length} item(s) using mode '${mode}'`,
      ],
    };
  }
}
