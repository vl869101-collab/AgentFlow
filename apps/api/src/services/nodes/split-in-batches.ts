import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";

export interface BatchContext {
  batchIndex: number;
  totalBatches: number;
  batchSize: number;
  itemIndex: number;
  totalItems: number;
  isFirstBatch: boolean;
  isLastBatch: boolean;
  done: boolean;
  hasMore: boolean;
}

export interface SplitInBatchesConfig {
  batchSize?: number | string;
  batchIndex?: number | string;
  reset?: boolean;
  options?: {
    reset?: boolean;
    batchSize?: number | string;
  };
  [key: string]: unknown;
}

export class SplitInBatchesNodeHandler implements NodeHandler {
  type = "splitInBatches";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as SplitInBatchesConfig;
    const rawBatchSize = config.options?.batchSize ?? config.batchSize ?? 10;
    const batchSize = Math.max(1, Number(rawBatchSize) || 10);

    const inputItems = wrapItems(ctx.input);
    const totalItems = inputItems.length;

    // Detect if batchIndex was supplied explicitly or if an incoming item already carried context
    let batchIndex = 0;
    if (config.options?.reset || config.reset) {
      batchIndex = 0;
    } else if (config.batchIndex !== undefined) {
      batchIndex = Math.max(0, Number(config.batchIndex) || 0);
    } else if (inputItems.length > 0 && inputItems[0]?.json?._batchContext?.batchIndex !== undefined) {
      const prevContext = inputItems[0].json._batchContext as Partial<BatchContext>;
      // If loop-back with previous batch, advance to next batch index if not done
      if (typeof prevContext.batchIndex === "number" && !prevContext.done) {
        batchIndex = prevContext.batchIndex + 1;
      }
    }

    const totalBatches = totalItems === 0 ? 1 : Math.max(1, Math.ceil(totalItems / batchSize));
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalItems);
    const isFirstBatch = batchIndex === 0;
    const isLastBatch = endIndex >= totalItems || startIndex >= totalItems;
    const done = isLastBatch;
    const hasMore = !isLastBatch;

    const slice = totalItems > 0 && startIndex < totalItems ? inputItems.slice(startIndex, endIndex) : [];

    const items: NodeItem[] = slice.map((item: NodeItem, idx: number) => {
      const itemIdx = startIndex + idx;
      const batchCtx: BatchContext = {
        batchIndex,
        totalBatches,
        batchSize,
        itemIndex: itemIdx,
        totalItems,
        isFirstBatch,
        isLastBatch,
        done,
        hasMore,
      };

      return {
        json: {
          ...item.json,
          _batchContext: batchCtx,
        },
        binary: item.binary ? { ...item.binary } : undefined,
        pairedItem: item.pairedItem !== undefined ? item.pairedItem : { item: itemIdx },
      };
    });

    return {
      items,
      logs: [
        `SplitInBatches: processed batch ${batchIndex + 1}/${totalBatches} (${items.length} items, total: ${totalItems}, isLastBatch: ${isLastBatch}, done: ${done})`,
      ],
    };
  }
}
