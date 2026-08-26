import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";

export interface BatchContext {
  batchIndex: number;
  totalBatches: number;
  batchSize: number;
  itemIndex: number;
  totalItems: number;
  isLastBatch: boolean;
}

export class SplitInBatchesNodeHandler implements NodeHandler {
  type = "splitInBatches";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const batchSize = Math.max(1, Number(config.batchSize ?? 10));
    const batchIndex = Math.max(0, Number(config.batchIndex ?? 0));

    const inputItems = wrapItems(ctx.input);
    const totalItems = inputItems.length;
    const totalBatches = Math.max(1, Math.ceil(totalItems / batchSize));
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalItems);
    const isLastBatch = endIndex >= totalItems || startIndex >= totalItems;

    const slice = startIndex < totalItems ? inputItems.slice(startIndex, endIndex) : [];
    const items: NodeItem[] = slice.map((item: NodeItem, idx: number) => {
      const itemIdx = startIndex + idx;
      const batchCtx: BatchContext = {
        batchIndex,
        totalBatches,
        batchSize,
        itemIndex: itemIdx,
        totalItems,
        isLastBatch,
      };

      return {
        json: {
          ...item.json,
          _batchContext: batchCtx,
        },
        binary: item.binary ? { ...item.binary } : undefined,
      };
    });

    return {
      items,
      logs: [`SplitInBatches: processed batch ${batchIndex + 1}/${totalBatches} (${items.length} items, isLastBatch: ${isLastBatch})`],
    };
  }
}
