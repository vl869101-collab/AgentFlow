import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class WaitNodeHandler implements NodeHandler {
  type = "wait";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const mode = String(config.mode ?? "duration");
    const duration = Number(config.duration ?? 0);
    const unit = String(config.unit ?? "seconds").toLowerCase();
    const multiplier = unit.startsWith("ms") || unit.startsWith("milli") ? 1 : unit.startsWith("minute") ? 60000 : unit.startsWith("hour") ? 3600000 : 1000;
    const waitMs = Math.min(Math.max(duration * multiplier, 0), 30000);

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const rawInput = ctx.input;
    const item: NodeItem = {
      json: {
        ...(typeof rawInput === "object" && rawInput !== null ? rawInput : { value: rawInput }),
        _resumedAt: new Date().toISOString(),
        _waitedMs: waitMs,
        _mode: mode,
      },
    };

    return {
      items: [item],
      logs: [`Wait node: resumed after ${waitMs}ms`],
    };
  }
}
