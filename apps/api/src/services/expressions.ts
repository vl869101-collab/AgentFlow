import { parse, type Node as AcornNode } from "acorn";
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

export class ExpressionSecurityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code = "EXPRESSION_SECURITY_ERROR") {
    super(message);
    this.name = "ExpressionSecurityError";
    this.code = code;
    this.statusCode = 400;
  }
}

const ALLOWED_NODE_TYPES = new Set([
  "Program",
  "ExpressionStatement",
  "ParenthesizedExpression",
  "ChainExpression",
  "Identifier",
  "Literal",
  "MemberExpression",
  "CallExpression",
  "BinaryExpression",
  "LogicalExpression",
  "UnaryExpression",
  "ConditionalExpression",
  "ArrayExpression",
  "ObjectExpression",
  "Property",
  "TemplateLiteral",
  "TemplateElement",
]);

const FORBIDDEN_IDENTIFIERS = new Set([
  "process",
  "globalThis",
  "global",
  "eval",
  "Function",
  "fetch",
  "import",
  "require",
  "window",
  "document",
  "this",
]);

const FORBIDDEN_PROPERTIES = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

const SAFE_BUILTINS: Record<string, unknown> = {
  Math,
  JSON,
  Date,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  Object: Object.freeze(
    Object.create(null, {
      keys: { value: Object.keys, enumerable: true },
      values: { value: Object.values, enumerable: true },
      entries: { value: Object.entries, enumerable: true },
      fromEntries: { value: Object.fromEntries, enumerable: true },
      assign: { value: Object.assign, enumerable: true },
    })
  ),
};

const SENSITIVE_KEY_PATTERN =
  /(SECRET|KEY|PASS|PWD|TOKEN|DATABASE|URL|AUTH|PRIVATE|CREDENTIAL|AWS_|OPENAI|ANTHROPIC|NVIDIA|STRIPE|REDIS|SALT|BEARER|CERT|SIGNATURE)/i;

/**
 * Sanitizes environment variables to prevent leaking sensitive secrets in workflow expressions.
 */
export function sanitizeEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
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
    if (FORBIDDEN_PROPERTIES.has(part)) {
      throw new ExpressionSecurityError(`Access to property '${part}' is prohibited`, "FORBIDDEN_PROPERTY");
    }
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
  const json =
    rawItem && typeof rawItem === "object" && "json" in rawItem
      ? (rawItem as NodeItem).json
      : (rawItem as Record<string, any>) ?? {};
  const binary =
    rawItem && typeof rawItem === "object" && "binary" in rawItem
      ? (rawItem as NodeItem).binary
      : undefined;
  const now = new Date();

  const historyMap =
    options.nodeHistory instanceof Map
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
 * Recursively evaluates an AST node against an active execution scope.
 */
function evaluateNode(node: any, scope: Record<string, unknown>): unknown {
  if (!node) return undefined;

  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    throw new ExpressionSecurityError(
      `Syntax type '${node.type}' is not allowed in expressions`,
      "DISALLOWED_SYNTAX"
    );
  }

  switch (node.type) {
    case "Program": {
      if (!node.body || node.body.length === 0) return undefined;
      if (node.body.length > 1) {
        throw new ExpressionSecurityError(
          "Multiple statements are not permitted in expressions",
          "MULTIPLE_STATEMENTS"
        );
      }
      return evaluateNode(node.body[0], scope);
    }

    case "ExpressionStatement":
    case "ParenthesizedExpression":
    case "ChainExpression":
      return evaluateNode(node.expression, scope);

    case "Literal":
      return node.value;

    case "TemplateElement":
      return node.value.cooked;

    case "TemplateLiteral": {
      let str = "";
      for (let i = 0; i < node.quasis.length; i++) {
        str += node.quasis[i].value.cooked ?? "";
        if (i < node.expressions.length) {
          const val = evaluateNode(node.expressions[i], scope);
          str += val !== undefined && val !== null ? String(val) : "";
        }
      }
      return str;
    }

    case "Identifier": {
      if (FORBIDDEN_IDENTIFIERS.has(node.name)) {
        throw new ExpressionSecurityError(
          `Access to identifier '${node.name}' is prohibited`,
          "FORBIDDEN_IDENTIFIER"
        );
      }
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
        return scope[node.name];
      }
      if (node.name === "undefined") return undefined;
      if (node.name === "NaN") return NaN;
      if (node.name === "Infinity") return Infinity;
      return undefined;
    }

    case "MemberExpression": {
      const obj = evaluateNode(node.object, scope);
      let propName: unknown;
      if (node.computed) {
        propName = evaluateNode(node.property, scope);
      } else {
        propName = node.property.name;
      }

      if (typeof propName === "string" && FORBIDDEN_PROPERTIES.has(propName)) {
        throw new ExpressionSecurityError(
          `Access to property '${propName}' is prohibited`,
          "FORBIDDEN_PROPERTY"
        );
      }

      if (obj === null || obj === undefined) {
        return undefined;
      }

      return (obj as any)[propName as any];
    }

    case "CallExpression": {
      let fn: unknown;
      let thisArg: unknown = null;

      if (node.callee.type === "MemberExpression") {
        const obj = evaluateNode(node.callee.object, scope);
        let propName: unknown;
        if (node.callee.computed) {
          propName = evaluateNode(node.callee.property, scope);
        } else {
          propName = node.callee.property.name;
        }

        if (typeof propName === "string" && FORBIDDEN_PROPERTIES.has(propName)) {
          throw new ExpressionSecurityError(
            `Access to property '${propName}' is prohibited`,
            "FORBIDDEN_PROPERTY"
          );
        }

        if (obj === null || obj === undefined) {
          return undefined;
        }

        fn = (obj as any)[propName as any];
        thisArg = obj;
      } else {
        fn = evaluateNode(node.callee, scope);
      }

      if (fn === undefined || fn === null) {
        return undefined;
      }

      if (typeof fn !== "function") {
        throw new ExpressionSecurityError(
          "Target of invocation is not a function",
          "INVALID_CALL"
        );
      }

      if (fn === Function || fn === eval) {
        throw new ExpressionSecurityError(
          "Calling forbidden function is prohibited",
          "FORBIDDEN_CALL"
        );
      }

      const args = node.arguments.map((arg: any) => evaluateNode(arg, scope));
      return Reflect.apply(fn as (...callArgs: unknown[]) => unknown, thisArg, args);
    }

    case "BinaryExpression": {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);
      switch (node.operator) {
        case "+":
          return (left as any) + (right as any);
        case "-":
          return (left as any) - (right as any);
        case "*":
          return (left as any) * (right as any);
        case "/":
          return (left as any) / (right as any);
        case "%":
          return (left as any) % (right as any);
        case "**":
          return (left as any) ** (right as any);
        case "==":
          return (left as any) == (right as any);
        case "===":
          return (left as any) === (right as any);
        case "!=":
          return (left as any) != (right as any);
        case "!==":
          return (left as any) !== (right as any);
        case "<":
          return (left as any) < (right as any);
        case "<=":
          return (left as any) <= (right as any);
        case ">":
          return (left as any) > (right as any);
        case ">=":
          return (left as any) >= (right as any);
        case "in":
          if (right === null || right === undefined) return false;
          return (left as any) in (right as any);
        case "instanceof":
          if (typeof right !== "function") return false;
          return (left as any) instanceof (right as any);
        default:
          throw new ExpressionSecurityError(
            `Binary operator '${node.operator}' is not supported`,
            "UNSUPPORTED_OPERATOR"
          );
      }
    }

    case "LogicalExpression": {
      if (node.operator === "&&") {
        const left = evaluateNode(node.left, scope);
        return left ? evaluateNode(node.right, scope) : left;
      }
      if (node.operator === "||") {
        const left = evaluateNode(node.left, scope);
        return left ? left : evaluateNode(node.right, scope);
      }
      if (node.operator === "??") {
        const left = evaluateNode(node.left, scope);
        return left !== null && left !== undefined ? left : evaluateNode(node.right, scope);
      }
      throw new ExpressionSecurityError(
        `Logical operator '${node.operator}' is not supported`,
        "UNSUPPORTED_OPERATOR"
      );
    }

    case "UnaryExpression": {
      const arg = evaluateNode(node.argument, scope);
      switch (node.operator) {
        case "!":
          return !arg;
        case "-":
          return -(arg as any);
        case "+":
          return +(arg as any);
        case "~":
          return ~(arg as any);
        case "typeof":
          return typeof arg;
        case "void":
          return void arg;
        default:
          throw new ExpressionSecurityError(
            `Unary operator '${node.operator}' is not supported`,
            "UNSUPPORTED_OPERATOR"
          );
      }
    }

    case "ConditionalExpression": {
      const test = evaluateNode(node.test, scope);
      return test ? evaluateNode(node.consequent, scope) : evaluateNode(node.alternate, scope);
    }

    case "ArrayExpression":
      return node.elements.map((el: any) => evaluateNode(el, scope));

    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property") {
          throw new ExpressionSecurityError(
            "Only standard properties are allowed in object literals",
            "DISALLOWED_SYNTAX"
          );
        }
        const key = prop.computed
          ? evaluateNode(prop.key, scope)
          : prop.key.name ?? prop.key.value;

        if (typeof key === "string" && FORBIDDEN_PROPERTIES.has(key)) {
          throw new ExpressionSecurityError(
            `Setting property '${key}' is prohibited`,
            "FORBIDDEN_PROPERTY"
          );
        }
        obj[String(key)] = evaluateNode(prop.value, scope);
      }
      return obj;
    }

    default:
      throw new ExpressionSecurityError(
        `Syntax type '${node.type}' is not allowed in expressions`,
        "DISALLOWED_SYNTAX"
      );
  }
}

/**
 * Evaluates a single inner expression snippet safely using Acorn AST parsing.
 */
export function evaluateInnerExpression(exprStr: string, context: ExpressionContext): unknown {
  const trimmed = exprStr.trim();
  if (!trimmed) return "";

  // Combine safe built-ins and user expression context
  const scope: Record<string, unknown> = {
    ...SAFE_BUILTINS,
    ...context,
  };

  let ast: AcornNode;
  try {
    ast = parse("(" + trimmed + ")", {
      ecmaVersion: "latest",
      sourceType: "script",
    });
  } catch (err: any) {
    throw new ExpressionSecurityError(
      `Invalid expression syntax: ${err?.message || "parse error"}`,
      "SYNTAX_ERROR"
    );
  }

  return evaluateNode(ast, scope);
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
    return evaluateInnerExpression(matches[0][1], context);
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
