import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
  extractFieldByPath,
  setFieldByPath,
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
  [key: string]: unknown;
}

export class MergeNodeHandler implements NodeHandler {
  type = "merge";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as MergeNodeConfig;
    const mode = String(config.mode ?? config.joinMode ?? "append").toLowerCase();
    const rawInput = ctx.input;

    // Determine incoming branches
    let branches: NodeItem[][];
    if (Array.isArray(rawInput) && rawInput.length > 0 && Array.isArray(rawInput[0])) {
      branches = rawInput.map((branch) => wrapItems(branch));
    } else {
      branches = [wrapItems(rawInput)];
    }

    let items: NodeItem[] = [];

    switch (mode) {
      case "mergebykey":
      case "combinebykey":
      case "joinbykey": {
        const branch1 = branches[0] ?? [];
        const branch2 = branches[1] ?? [];
        const key1 = String(config.propertyName1 ?? config.key1 ?? config.joinKey ?? "id");
        const key2 = String(config.propertyName2 ?? config.key2 ?? config.joinKey ?? key1);

        // Build lookup map from branch2
        const branch2Map = new Map<string, NodeItem>();
        for (const item2 of branch2) {
          const val2 = extractFieldByPath(item2.json, key2);
          if (val2 !== undefined && val2 !== null) {
            branch2Map.set(String(val2), item2);
          }
        }

        const matchedKeys = new Set<string>();

        // Merge items from branch1 with matching items from branch2
        for (const item1 of branch1) {
          const val1 = extractFieldByPath(item1.json, key1);
          const keyStr = val1 !== undefined && val1 !== null ? String(val1) : undefined;
          const matchingItem2 = keyStr !== undefined ? branch2Map.get(keyStr) : undefined;

          if (matchingItem2) {
            matchedKeys.add(keyStr!);
            items.push({
              json: { ...matchingItem2.json, ...item1.json },
              binary: {
                ...(matchingItem2.binary ?? {}),
                ...(item1.binary ?? {}),
              },
              pairedItem: item1.pairedItem ?? matchingItem2.pairedItem,
            });
          } else {
            // Unmatched item from branch1
            items.push({
              json: { ...item1.json },
              binary: item1.binary ? { ...item1.binary } : undefined,
              pairedItem: item1.pairedItem,
            });
          }
        }

        // Also include unmatched items from branch2 if specified or append mode is desired
        for (const item2 of branch2) {
          const val2 = extractFieldByPath(item2.json, key2);
          const keyStr = val2 !== undefined && val2 !== null ? String(val2) : undefined;
          if (!keyStr || !matchedKeys.has(keyStr)) {
            items.push({
              json: { ...item2.json },
              binary: item2.binary ? { ...item2.binary } : undefined,
              pairedItem: item2.pairedItem,
            });
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

          for (const branch of branches) {
            const item = branch[i];
            if (item) {
              mergedJson = { ...mergedJson, ...item.json };
              if (item.binary) {
                mergedBinary = { ...mergedBinary, ...item.binary };
              }
            }
          }

          items.push({
            json: mergedJson,
            ...(Object.keys(mergedBinary).length > 0 ? { binary: mergedBinary } : {}),
            pairedItem: { item: i },
          });
        }
        break;
      }

      case "multiplex":
      case "cartesian": {
        // Cartesian product of branch items
        if (branches.length === 0) break;
        items = branches[0];
        for (let b = 1; b < branches.length; b++) {
          const nextBranch = branches[b];
          const nextItems: NodeItem[] = [];
          for (const cur of items) {
            for (const nxt of nextBranch) {
              nextItems.push({
                json: { ...cur.json, ...nxt.json },
                binary: { ...(cur.binary ?? {}), ...(nxt.binary ?? {}) },
              });
            }
          }
          items = nextItems;
        }
        break;
      }

      case "choosebranch":
      case "override": {
        const targetIndex = Number(config.branchIndex ?? 0);
        items = branches[targetIndex] ?? branches[0] ?? [];
        break;
      }

      case "waitall":
      case "append":
      default: {
        // Append all items from all branches
        for (const branch of branches) {
          items.push(...branch);
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
