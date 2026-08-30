import type { NodeItem } from "./nodes/types.js";

export interface ExpressionContext {
  $json?: Record<string, any>;
  $binary?: Record<string, any>;
  $item?: (nodeOrIndex?: string | number) => NodeItem | undefined;
  $node?: Record<string, any>;
  $parameter?: Record<string, any>;
  $executionId?: string;
  $workflowId?: string;
  $workflow?: { id?: string; name?: string };
  $now?: string;
  $today?: string;
  $env?: Record<string, string | undefined>;
  [key: string]: unknown;
}

const SENSITIVE_KEY_PATTERN = /(SECRET|KEY|PASS|PWD|TOKEN|DATABASE|URL|AUTH|PRIVATE|CREDENTIAL|AWS_|OPENAI|ANTHROPIC|NVIDIA|STRIPE|REDIS|SALT|BEARER|CERT|SIGNATURE)/i;

/**
 * Sanitizes environment variables to prevent leaking sensitive secrets in workflow expressions.
 */
export function sanitizeEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const sanitized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k && !SENSITIVE_KEY_PATTERN.test(k)) {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Safely extracts a property path from an object or context.
 * Supports dot notation `a.b.c` and bracket notation `a['b']['c']` or `a[0]`.
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (obj === undefined || obj === null || !path) return undefined;
  
  // Normalize bracket notation: a['b'][0] -> a.b.0
  const normalized = path
    .replace(/\[['"`](.*?)['"`]\]/g, ".$1")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");

  const parts = normalized.split(".");
  let current: any = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Builds standard expression context from execution variables.
 */
export function buildExpressionContext(options: {
  item?: NodeItem | Record<string, any>;
  items?: NodeItem[];
  nodeHistory?: Map<string, NodeItem[]> | Record<string, NodeItem[]>;
  nodeConfig?: Record<string, any>;
  executionId?: string;
  workflowId?: string;
  workflowName?: string;
}): ExpressionContext {
  const rawItem = options.item;
  const json = rawItem && typeof rawItem === "object" && "json" in rawItem 
    ? (rawItem as NodeItem).json 
    : (rawItem as Record<string, any>) ?? {};
  const binary = rawItem && typeof rawItem === "object" && "binary" in rawItem 
    ? (rawItem as NodeItem).binary 
    : undefined;
  const now = new Date();

  const historyMap = options.nodeHistory instanceof Map 
    ? options.nodeHistory 
    : new Map(Object.entries(options.nodeHistory ?? {}));

  const itemGetter = (nodeOrIndex?: string | number): NodeItem | undefined => {
    if (typeof nodeOrIndex === "number") {
      const items = options.items ?? (rawItem ? [rawItem as NodeItem] : []);
      return items[nodeOrIndex];
    }
    if (typeof nodeOrIndex === "string") {
      const nodeItems = historyMap.get(nodeOrIndex);
      return nodeItems && nodeItems.length > 0 ? nodeItems[0] : undefined;
    }
    return rawItem ? (rawItem as NodeItem) : undefined;
  };

  const nodeMap: Record<string, any> = {};
  for (const [nodeName, nodeItems] of historyMap.entries()) {
    if (nodeItems && nodeItems.length > 0) {
      nodeMap[nodeName] = {
        json: nodeItems[0].json,
        binary: nodeItems[0].binary,
        items: nodeItems,
      };
    }
  }

  return {
    $json: json,
    $binary: binary,
    $item: itemGetter,
    $node: nodeMap,
    $parameter: options.nodeConfig ?? {},
    $executionId: options.executionId ?? "",
    $workflowId: options.workflowId ?? "",
    $workflow: { id: options.workflowId, name: options.workflowName },
    $now: now.toISOString(),
    $today: now.toISOString().split("T")[0],
    $env: sanitizeEnv(process.env),
  };
}

/**
 * Evaluates a single inner expression snippet safely (without eval or new Function vulnerabilities).
 */
export function evaluateInnerExpression(exprStr: string, context: ExpressionContext): unknown {
  const trimmed = exprStr.trim();
  if (!trimmed) return "";

  // 1. Direct variable reference: $executionId, $workflowId, $now, $today
  if (trimmed === "$executionId") return context.$executionId ?? "";
  if (trimmed === "$workflowId") return context.$workflowId ?? "";
  if (trimmed === "$now") return context.$now ?? new Date().toISOString();
  if (trimmed === "$today") return context.$today ?? new Date().toISOString().split("T")[0];
  if (trimmed === "$json") return context.$json ?? {};

  // 2. $json.path or $json['path']
  if (trimmed.startsWith("$json")) {
    const subPath = trimmed.slice(5).replace(/^\./, "");
    if (!subPath) return context.$json;
    return getByPath(context.$json, subPath);
  }

  // 3. $item("NodeName").json.field or $item(0).json.field
  const itemMatch = trimmed.match(/^\$item\((?:['"]([^'"]+)['"]|(\d+))\)(.*)$/);
  if (itemMatch) {
    const nodeName = itemMatch[1];
    const index = itemMatch[2] !== undefined ? parseInt(itemMatch[2], 10) : undefined;
    const target = nodeName ?? index;
    const item = typeof context.$item === "function" ? context.$item(target) : undefined;
    const remaining = itemMatch[3].replace(/^\./, "");
    if (!remaining) return item;
    return getByPath(item, remaining);
  }

  // 4. $node["NodeName"].json.field or $node.NodeName.json.field
  if (trimmed.startsWith("$node")) {
    const subPath = trimmed.slice(5).replace(/^\./, "");
    return getByPath(context.$node, subPath);
  }

  // 5. $parameter.name
  if (trimmed.startsWith("$parameter")) {
    const subPath = trimmed.slice(10).replace(/^\./, "");
    return getByPath(context.$parameter, subPath);
  }

  // 6. Generic path fallback on context
  return getByPath(context, trimmed);
}

/**
 * Evaluates expressions within a string (e.g. "Hello {{ $json.name }}!").
 * If the string contains ONLY an expression (`{{ $json.age }}`), preserves the resulting type (number, boolean, object).
 */
export function evaluateExpression(template: string, context: ExpressionContext): any {
  if (typeof template !== "string") return template;

  const expressionRegex = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  const matches = [...template.matchAll(expressionRegex)];

  if (matches.length === 0) return template;

  // Single full-match check: "{{ $json.items }}" -> returns actual array/object/number
  if (matches.length === 1 && matches[0][0].trim() === template.trim()) {
    const evaluated = evaluateInnerExpression(matches[0][1], context);
    return evaluated;
  }

  // Multi-expression string interpolation
  return template.replace(expressionRegex, (_match, expr) => {
    const val = evaluateInnerExpression(expr, context);
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

/**
 * Recursively resolves expressions across objects, arrays, and primitive fields.
 */
export function resolveExpressions<T = unknown>(value: T, context: ExpressionContext): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return evaluateExpression(value, context) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, context)) as unknown as T;
  }

  if (typeof value === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      result[key] = resolveExpressions(val, context);
    }
    return result as T;
  }

  return value;
}
