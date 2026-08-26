import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";

export type MergeMode = "append" | "combineByPosition" | "mergeByIndex" | "multiplex" | "waitAll" | "chooseBranch";

export interface MergeNodeConfig {
  mode?: MergeMode | string;
  joinMode?: string;
  branchIndex?: number;
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
      case "combinebyposition":
      case "mergebyindex":
      case "zip": {
        // Zip items from each branch by position
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
      logs: [`Merge: combined ${branches.length} branch(es) into ${items.length} item(s) using mode '${mode}'`],
    };
  }
}
