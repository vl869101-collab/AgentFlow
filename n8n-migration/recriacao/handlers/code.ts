/**
 * Handler para node type `code` (n8n-nodes-base.code v2)
 *
 * Executa codigo JavaScript do usuario dentro de um sandbox seguro usando
 * o modulo nativo `vm` do Node.js. Bloqueia acesso a require, process,
 * filesystem, rede, e outros recursos perigosos.
 *
 * Suporta os modos:
 * - runOnceForEachItem: codigo roda uma vez por item de entrada
 * - runOnceForAllItems: codigo roda uma vez com todos os items
 */
import { NodeHandler, NodeExecutionContext, NodeExecutionResult, createCodeExecutionError } from "./types.js";
import { executeCodeInSandbox, detectDangerousPatterns } from "./code-sandbox.js";

export interface CodeNodeParameters {
  mode?: "runOnceForEachItem" | "runOnceForAllItems";
  jsCode: string;
}

/** Prepara as variaveis n8n ($input, $json, etc.) para um item especifico */
function buildN8nVariables(
  item: { json: Record<string, unknown>; binary?: Record<string, unknown> },
  allItems: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>,
  params: Record<string, unknown>,
  credentials?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $input: {
      item,
      all: () => allItems,
      first: () => allItems[0],
      last: () => allItems[allItems.length - 1],
      length: allItems.length,
    },
    $json: item.json,
    $item: item,
    $parameter: params,
    $credentials: credentials ?? {},
    $now: new Date().toISOString(),
    $today: new Date().toISOString().split("T")[0],
    $workflow: { id: "wf1", name: "Save Gmail Attachments to Google Drive" },
    $node: { name: "Code", type: "n8n-nodes-base.code" },
    $binary: item.binary ?? {},
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
    const params = ctx.nodeConfig.parameters as CodeNodeParameters | undefined;
    if (!params) {
      throw createCodeExecutionError("Code node has no parameters", "CODE_MISSING_PARAMS");
    }

    const jsCode = params.jsCode;
    if (!jsCode || typeof jsCode !== "string" || jsCode.trim() === "") {
      throw createCodeExecutionError("Code node has no jsCode", "CODE_MISSING_JS");
    }

    const mode = params.mode ?? "runOnceForEachItem";
    const credentials = ctx.credentials;

    const inputItems = normalizeInputItems(ctx.input);
    const allLogs: string[] = [];
    const results: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> = [];

    if (mode === "runOnceForEachItem") {
      // Executa o codigo uma vez por item — $input.item refere-se ao item atual
      for (const item of inputItems) {
        const n8nVars = buildN8nVariables(item, inputItems, params as unknown as Record<string, unknown>, credentials);
        const { result, logs } = await executeCodeInSandbox(jsCode, n8nVars);
        allLogs.push(...logs);

        if (result !== undefined && result !== null) {
          const items = Array.isArray(result) ? result : [result];
          for (const r of items) {
            results.push(normalizeCodeResult(r));
          }
        }
      }
    } else {
      // runOnceForAllItems — codigo roda uma vez com todos os items
      const n8nVars = {
        $input: {
          all: () => inputItems,
          first: () => inputItems[0],
          last: () => inputItems[inputItems.length - 1],
          length: inputItems.length,
        },
        $parameter: params,
        $credentials: credentials ?? {},
        $now: new Date().toISOString(),
        $workflow: { id: "wf1", name: "Save Gmail Attachments to Google Drive" },
        $node: { name: "Code", type: "n8n-nodes-base.code" },
        $helpers: {
          returnJsonArray: <T>(items: T | T[]): T[] => (Array.isArray(items) ? items : [items]),
        },
      };

      const { result, logs } = await executeCodeInSandbox(jsCode, n8nVars);
      allLogs.push(...logs);

      if (result !== undefined && result !== null) {
        const items = Array.isArray(result) ? result : [result];
        for (const r of items) {
          results.push(normalizeCodeResult(r));
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
function normalizeInputItems(input: unknown): Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => normalizeItem(item));
  return [normalizeItem(input)];
}

function normalizeItem(item: unknown): { json: Record<string, unknown>; binary?: Record<string, unknown> } {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    return {
      json: (obj.json ?? obj) as Record<string, unknown>,
      binary: obj.binary as Record<string, unknown> | undefined,
    };
  }
  return { json: { value: item } };
}

/** Normaliza o retorno do codigo do usuario para o formato de item */
function normalizeCodeResult(result: unknown): { json: Record<string, unknown>; binary?: Record<string, unknown> } {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    if ("json" in obj || "binary" in obj) {
      return {
        json: (obj.json ?? {}) as Record<string, unknown>,
        binary: obj.binary as Record<string, unknown> | undefined,
      };
    }
    return { json: obj as Record<string, unknown> };
  }
  return { json: { result } };
}

// Re-export para uso em testes
export { executeCodeInSandbox, detectDangerousPatterns };
