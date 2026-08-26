import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export interface SwitchRule {
  field?: string;
  operator?: string;
  value?: unknown;
  outputIndex?: number;
}

export class SwitchNodeHandler implements NodeHandler {
  type = "switch";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const rules = (config.rules as SwitchRule[]) ?? [];
    const fallbackOutput = (config.fallbackOutput as number) ?? 0;
    const items: NodeItem[] = [];

    const rawInput = ctx.input;
    const inputItems = Array.isArray(rawInput)
      ? rawInput
      : rawInput && typeof rawInput === "object" && "items" in rawInput && Array.isArray((rawInput as any).items)
      ? (rawInput as any).items
      : [rawInput];

    for (const item of inputItems) {
      const json = item && typeof item === "object" && "json" in item ? item.json : (item as Record<string, unknown>) ?? {};
      const binary = item && typeof item === "object" && "binary" in item ? item.binary : undefined;

      let matchedOutput = fallbackOutput;
      let matched = false;

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const fieldVal = rule.field ? (json as any)[rule.field] : undefined;
        const op = (rule.operator ?? "equals").toLowerCase();
        const expected = rule.value;

        let pass = false;
        switch (op) {
          case "eq":
          case "equals":
            pass = String(fieldVal) === String(expected);
            break;
          case "notequals":
          case "neq":
            pass = String(fieldVal) !== String(expected);
            break;
          case "contains":
            pass = String(fieldVal ?? "").includes(String(expected ?? ""));
            break;
          case "regex":
            pass = new RegExp(String(expected)).test(String(fieldVal ?? ""));
            break;
          case "greaterthan":
          case "gt":
            pass = Number(fieldVal) > Number(expected);
            break;
          case "lessthan":
          case "lt":
            pass = Number(fieldVal) < Number(expected);
            break;
          case "isempty":
            pass = fieldVal === undefined || fieldVal === null || fieldVal === "";
            break;
          case "isnotempty":
            pass = fieldVal !== undefined && fieldVal !== null && fieldVal !== "";
            break;
          default:
            pass = false;
        }

        if (pass) {
          matchedOutput = rule.outputIndex ?? i;
          matched = true;
          break;
        }
      }

      items.push({
        json: {
          ...json,
          _matchedOutput: matchedOutput,
          _matched: matched,
        },
        binary,
      });
    }

    return { items };
  }
}
