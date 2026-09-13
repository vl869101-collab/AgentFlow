import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { randomUUID } from "node:crypto";

export interface WaitNodeConfig {
  mode?: "duration" | "fixedDate" | "webhook" | "callback" | "inline" | string;
  duration?: number;
  unit?: "milliseconds" | "ms" | "seconds" | "minutes" | "hours" | "days" | string;
  fixedDate?: string;
  webhookSuffix?: string;
  suspend?: boolean;
  [key: string]: unknown;
}

export function calculateWaitMs(config: WaitNodeConfig): number {
  const mode = String(config.mode ?? "duration").toLowerCase();
  if (mode === "fixeddate" || mode === "date") {
    if (!config.fixedDate) return 0;
    const targetDate = new Date(config.fixedDate);
    const now = Date.now();
    return Math.max(0, targetDate.getTime() - now);
  }
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
  return Math.max(0, duration * multiplier);
}

export function isWaitNode(type: string): boolean {
  const normalized = String(type ?? "").toLowerCase();
  return normalized === "wait" || normalized === "delay";
}

export class WaitNodeHandler implements NodeHandler {
  type = "wait";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as WaitNodeConfig;
    const mode = String(config.mode ?? "duration").toLowerCase();

    if (mode === "inline") {
      const waitMs = calculateWaitMs(config);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const inputItems = wrapItems(ctx.input);
      const items: NodeItem[] = inputItems.map((item: NodeItem) => ({
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
        logs: [`Wait node: completed inline wait of ${waitMs}ms`],
      };
    }

    if (mode === "webhook" || mode === "callback") {
      const submittedData = (ctx.nodeConfig as any)?._submittedData ?? (ctx as any).submittedData;
      if (submittedData !== undefined) {
        const items = wrapItems(submittedData);
        return {
          items,
          logs: [`Wait node: resumed from webhook callback with payload`],
        };
      }
      const resumeToken = (ctx.nodeConfig as any)?._resumeToken ?? randomUUID();
      const inputItems = wrapItems(ctx.input);
      const items: NodeItem[] = inputItems.map((item: NodeItem) => ({
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
    }

    const waitMs = calculateWaitMs(config);
    const inputItems = wrapItems(ctx.input);
    const items: NodeItem[] = inputItems.map((item: NodeItem) => ({
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
      logs: [`Wait node: completed wait of ${waitMs}ms (mode: ${mode})`],
    };
  }
}
