/**
 * Handler para node type `code` (n8n-nodes-base.code v2)
 *
 * Executa codigo JavaScript do usuario dentro de um sandbox seguro usando
 * o modulo nativo `vm` do Node.js. Bloqueia acesso a require, process,
 * filesystem, rede, e outros recursos perigosos.
 *
 * Suporta os modos:
 * - runOnceForEachItem: codigo roda uma vez por item de entrada ($input.item, $json, $binary, $item)
 * - runOnceForAllItems: codigo roda uma vez com todos os items ($input.all(), $input.first(), $input.last(), $input.item)
 */
import { NodeHandler, NodeExecutionContext, NodeExecutionResult, createCodeExecutionError } from "./types.js";
import { executeCodeInSandbox, detectDangerousPatterns, CodeExecutionDisabledError } from "./code-sandbox.js";

export interface CodeNodeParameters {
  mode?: "runOnceForEachItem" | "runOnceForAllItems";
  jsCode?: string;
  code?: string;
  [key: string]: unknown;
}

/** Prepara as variaveis n8n ($input, $json, $binary, etc.) para execucao */
function buildN8nVariables(
  currentItem: { json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown },
  allItems: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown }>,
  params: Record<string, unknown>,
  credentials?: Record<string, unknown>,
  currentIndex: number = 0
): Record<string, unknown> {
  const inputHelper = {
    item: currentItem,
    all: () => allItems,
    first: () => allItems[0],
    last: () => allItems[allItems.length - 1],
    length: allItems.length,
    itemIndex: currentIndex,
    params,
  };

  return {
    $input: inputHelper,
    $json: currentItem.json,
    $item: currentItem,
    $itemIndex: currentIndex,
    $items: allItems,
    $binary: currentItem.binary ?? {},
    $parameter: params,
    $credentials: credentials ?? {},
    $now: new Date().toISOString(),
    $today: new Date().toISOString().split("T")[0],
    $workflow: { id: "wf-code", name: "Code Node Workflow" },
    $node: { name: "Code", type: "n8n-nodes-base.code" },
    $helpers: {
      returnJsonArray: <T>(items: T | T[]): T[] => (Array.isArray(items) ? items : [items]),
      createBinary: (data: string, name: string, mimeType: string) => ({
        data,
        name,
        mimeType,
      }),
    },
  };
}

export class CodeNodeHandler implements NodeHandler {
  readonly type = "code";
  readonly category = "transform";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    if (process.env.EXEC_CODE_DISABLED === "true") {
      throw new CodeExecutionDisabledError();
    }
    const rawConfig = ctx.nodeConfig ?? {};
    const params = (rawConfig.parameters ?? rawConfig) as CodeNodeParameters;
    if (!params) {
      throw createCodeExecutionError("Code node has no parameters", "CODE_MISSING_PARAMS");
    }

    const jsCode = params.jsCode ?? params.code ?? (rawConfig.jsCode as string) ?? (rawConfig.code as string);
    if (!jsCode || typeof jsCode !== "string" || jsCode.trim() === "") {
      throw createCodeExecutionError("Code node has no jsCode", "CODE_MISSING_JS");
    }

    const mode = params.mode ?? (rawConfig.mode as "runOnceForEachItem" | "runOnceForAllItems") ?? "runOnceForEachItem";
    const credentials = ctx.credentials;

    const inputItems = normalizeInputItems(ctx.input);
    const allLogs: string[] = [];
    const results: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown }> = [];

    if (mode === "runOnceForEachItem") {
      // Executa o codigo uma vez por item — $input.item refere-se ao item atual
      if (inputItems.length === 0) {
        inputItems.push({ json: {} });
      }

      for (let idx = 0; idx < inputItems.length; idx++) {
        const item = inputItems[idx];
        const n8nVars = buildN8nVariables(item, inputItems, params as unknown as Record<string, unknown>, credentials, idx);
        const { result, logs } = await executeCodeInSandbox(jsCode, n8nVars);
        allLogs.push(...logs);

        if (result !== undefined && result !== null) {
          const items = Array.isArray(result) ? result : [result];
          for (const r of items) {
            const norm = normalizeCodeResult(r);
            if (norm.pairedItem === undefined) {
              norm.pairedItem = item.pairedItem !== undefined ? item.pairedItem : { item: idx };
            }
            results.push(norm);
          }
        }
      }
    } else {
      // runOnceForAllItems — codigo roda uma vez com todos os items
      const firstItem = inputItems[0] ?? { json: {} };
      const n8nVars = buildN8nVariables(firstItem, inputItems, params as unknown as Record<string, unknown>, credentials, 0);

      const { result, logs } = await executeCodeInSandbox(jsCode, n8nVars);
      allLogs.push(...logs);

      if (result !== undefined && result !== null) {
        const items = Array.isArray(result) ? result : [result];
        for (let i = 0; i < items.length; i++) {
          const r = items[i];
          const norm = normalizeCodeResult(r);
          if (norm.pairedItem === undefined) {
            norm.pairedItem = { item: i };
          }
          results.push(norm);
        }
      }
    }

    return {
      items: results,
      logs: allLogs.length > 0 ? allLogs : ["code: executed successfully (no console output)"],
    };
  }
}

/** Normaliza a entrada do workflow para um array de items */
function normalizeInputItems(
  input: unknown
): Array<{ json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown }> {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item, idx) => normalizeItem(item, idx));
  return [normalizeItem(input, 0)];
}

function normalizeItem(
  item: unknown,
  idx: number = 0
): { json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown } {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    return {
      json: (obj.json ?? obj) as Record<string, unknown>,
      binary: obj.binary as Record<string, unknown> | undefined,
      pairedItem: obj.pairedItem !== undefined ? obj.pairedItem : { item: idx },
    };
  }
  return { json: { value: item }, pairedItem: { item: idx } };
}

/** Normaliza o retorno do codigo do usuario para o formato de item */
function normalizeCodeResult(
  result: unknown
): { json: Record<string, unknown>; binary?: Record<string, unknown>; pairedItem?: unknown } {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    if ("json" in obj || "binary" in obj) {
      return {
        json: (obj.json ?? {}) as Record<string, unknown>,
        binary: obj.binary as Record<string, unknown> | undefined,
        pairedItem: obj.pairedItem,
      };
    }
    return { json: obj as Record<string, unknown> };
  }
  return { json: { result } };
}

// Re-export para uso em testes
export { executeCodeInSandbox, detectDangerousPatterns };
