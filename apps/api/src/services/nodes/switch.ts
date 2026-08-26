import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { getByPath, evaluateExpression, buildExpressionContext } from "../expressions.js";

export interface SwitchRule {
  field?: string;
  operator?: string;
  value?: unknown;
  outputIndex?: number;
  outputName?: string;
}

export class SwitchNodeHandler implements NodeHandler {
  type = "switch";
  category = "flow";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const rules = (config.rules as SwitchRule[]) ?? [];
    const fallbackOutput = (config.fallbackOutput as number) ?? 0;
    const items: NodeItem[] = [];

    const inputItems = wrapItems(ctx.input);

    for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
      const item = inputItems[itemIndex];
      const json = item.json;
      const binary = item.binary;

      const exprContext = buildExpressionContext({
        item,
        items: inputItems,
        nodeConfig: config,
        executionId: ctx.executionId,
        workflowId: ctx.workflowId,
      });

      let matchedOutput = fallbackOutput;
      let matchedOutputName: string | undefined = config.fallbackOutputName as string | undefined;
      let matched = false;

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const rawFieldVal = rule.field ? getByPath(json, rule.field) : undefined;
        const op = String(rule.operator ?? "equals").toLowerCase().replace(/[-_]/g, "");
        
        let expected = rule.value;
        if (typeof expected === "string" && expected.includes("{{")) {
          expected = evaluateExpression(expected, exprContext);
        }

        let pass = false;
        switch (op) {
          case "eq":
          case "equals":
            pass = typeof rawFieldVal === "number" && typeof expected === "number"
              ? rawFieldVal === expected
              : String(rawFieldVal ?? "") === String(expected ?? "");
            break;
          case "notequals":
          case "neq":
          case "ne":
            pass = typeof rawFieldVal === "number" && typeof expected === "number"
              ? rawFieldVal !== expected
              : String(rawFieldVal ?? "") !== String(expected ?? "");
            break;
          case "contains":
            pass = Array.isArray(rawFieldVal)
              ? rawFieldVal.includes(expected)
              : String(rawFieldVal ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
            break;
          case "notcontains":
            pass = Array.isArray(rawFieldVal)
              ? !rawFieldVal.includes(expected)
              : !String(rawFieldVal ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
            break;
          case "regex":
          case "matchesregex":
            try {
              pass = new RegExp(String(expected ?? "")).test(String(rawFieldVal ?? ""));
            } catch {
              pass = false;
            }
            break;
          case "greaterthan":
          case "gt":
            pass = Number(rawFieldVal) > Number(expected);
            break;
          case "greaterthanorequal":
          case "gte":
          case "ge":
            pass = Number(rawFieldVal) >= Number(expected);
            break;
          case "lessthan":
          case "lt":
            pass = Number(rawFieldVal) < Number(expected);
            break;
          case "lessthanorequal":
          case "lte":
          case "le":
            pass = Number(rawFieldVal) <= Number(expected);
            break;
          case "isempty":
          case "empty":
            pass = rawFieldVal === undefined || rawFieldVal === null || rawFieldVal === "" || (Array.isArray(rawFieldVal) && rawFieldVal.length === 0);
            break;
          case "isnotempty":
          case "notempty":
            pass = rawFieldVal !== undefined && rawFieldVal !== null && rawFieldVal !== "" && (!Array.isArray(rawFieldVal) || rawFieldVal.length > 0);
            break;
          case "startswith":
            pass = String(rawFieldVal ?? "").toLowerCase().startsWith(String(expected ?? "").toLowerCase());
            break;
          case "endswith":
            pass = String(rawFieldVal ?? "").toLowerCase().endsWith(String(expected ?? "").toLowerCase());
            break;
          case "default":
            pass = true;
            break;
          default:
            pass = false;
        }

        if (pass) {
          matchedOutput = rule.outputIndex ?? i;
          matchedOutputName = rule.outputName;
          matched = true;
          break;
        }
      }

      items.push({
        json: {
          ...json,
          _matchedOutput: matchedOutput,
          _matchedOutputName: matchedOutputName,
          _matched: matched,
        },
        binary,
      });
    }

    return { items };
  }
}
