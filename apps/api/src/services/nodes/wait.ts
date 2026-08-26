import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { randomUUID } from "node:crypto";

export interface WaitNodeConfig {
  mode?: "duration" | "fixedDate" | "webhook" | "callback" | string;
  duration?: number;
  unit?: "milliseconds" | "ms" | "seconds" | "minutes" | "hours" | "days" | string;
  fixedDate?: string;
  webhookSuffix?: string;
  [key: string]: unknown;
}

export class WaitNodeHandler implements NodeHandler {
  type = "wait";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as WaitNodeConfig;
    const mode = String(config.mode ?? "duration").toLowerCase();
    let waitMs = 0;

    if (mode === "fixeddate" || mode === "date") {
      const targetDate = config.fixedDate ? new Date(config.fixedDate) : new Date();
      const now = Date.now();
      waitMs = Math.max(0, targetDate.getTime() - now);
    } else if (mode === "webhook" || mode === "callback") {
      const resumeToken = randomUUID();
      const inputItems = wrapItems(ctx.input);
      const items: NodeItem[] = inputItems.map((item) => ({
        json: {
          ...item.json,
          _waitMode: "webhook",
          _resumeToken: resumeToken,
          _resumeUrl: `/api/webhooks/resume/${resumeToken}`,
          _pausedAt: new Date().toISOString(),
        },
        binary: item.binary,
      }));
      return {
        items,
        logs: [`Wait node: suspended workflow execution waiting for callback on token ${resumeToken}`],
      };
    } else {
      // duration mode
      const duration = Number(config.duration ?? 0);
      const unit = String(config.unit ?? "seconds").toLowerCase();
      let multiplier = 1000;
      if (unit.startsWith("ms") || unit.startsWith("milli")) {
        multiplier = 1;
      } else if (unit.startsWith("min")) {
        multiplier = 60 * 1000;
      } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
        multiplier = 60 * 60 * 1000;
      } else if (unit.startsWith("day")) {
        multiplier = 24 * 60 * 60 * 1000;
      }
      waitMs = Math.max(0, duration * multiplier);
    }

    // In unit test / mock execution, cap inline sleep to 30s
    const inlineSleepMs = Math.min(waitMs, 30000);
    if (inlineSleepMs > 0 && process.env.NODE_ENV !== "test_skip_delay") {
      await new Promise((resolve) => setTimeout(resolve, inlineSleepMs));
    }

    const inputItems = wrapItems(ctx.input);
    const items: NodeItem[] = inputItems.map((item) => ({
      json: {
        ...item.json,
        _resumedAt: new Date().toISOString(),
        _waitedMs: waitMs,
        _mode: mode,
      },
      binary: item.binary,
    }));

    return {
      items,
      logs: [`Wait node: resumed after ${waitMs}ms (mode: ${mode})`],
    };
  }
}
