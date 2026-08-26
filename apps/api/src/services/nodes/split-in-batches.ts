import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class SplitInBatchesNodeHandler implements NodeHandler {
  type = "splitInBatches";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const batchSize = Math.max(1, Number(config.batchSize ?? 10));
    const batchIndex = Number(config.batchIndex ?? 0);

    const rawInput = ctx.input;
    const inputItems = Array.isArray(rawInput)
      ? rawInput
      : rawInput && typeof rawInput === "object" && "items" in rawInput && Array.isArray((rawInput as any).items)
      ? (rawInput as any).items
      : [rawInput];

    const totalItems = inputItems.length;
    const totalBatches = Math.ceil(totalItems / batchSize);
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalItems);
    const isLastBatch = endIndex >= totalItems;

    const slice = inputItems.slice(startIndex, endIndex);
    const items: NodeItem[] = slice.map((item: any, idx: number) => {
      const json = item && typeof item === "object" && "json" in item ? item.json : (item as Record<string, unknown>) ?? {};
      const binary = item && typeof item === "object" && "binary" in item ? item.binary : undefined;
      return {
        json: {
          ...json,
          _batchContext: {
            batchIndex,
            totalBatches,
            batchSize,
            itemIndex: startIndex + idx,
            totalItems,
            isLastBatch,
          },
        },
        binary,
      };
    });

    return {
      items,
      logs: [`Processed batch ${batchIndex + 1}/${totalBatches || 1} (${items.length} items)`],
    };
  }
}
