/**
 * Sandbox seguro para execucao de codigo JavaScript em nodes do tipo `code`.
 *
 * Usa o modulo nativo `vm` do Node.js com um contexto restrito que bloqueia
 * acesso a `require`, `process`, `global`, `eval`, `Function`, `fetch`,
 * `fs`, `net`, `child_process` e outros modulos perigosos.
 *
 * Implementacao inspirada nas premissas do reviewer-relatorio.md (secao 6):
 * - Timeout estrito por execucao
 * - Sem acesso a filesystem, rede, ou processos filhos
 * - Apenas globals seguros expostos (JSON, Array, Math, etc.)
 */
import vm from "node:vm";
import { createCodeExecutionError } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_MEMORY_LIMIT_MB = 64;

/**
 * Detecta padroes perigosos no codigo antes da execucao (defense in depth).
 * Retorna a lista de padroes detectados; lista vazia significa codigo seguro.
 */
export function detectDangerousPatterns(code: string): string[] {
  const dangers: string[] = [];
  const patterns: Array<{ regex: RegExp; name: string }> = [
    { regex: /\brequire\s*\(/g, name: "require" },
    { regex: /\bprocess\b/g, name: "process" },
    { regex: /\bglobal\b/g, name: "global" },
    { regex: /\bglobalThis\b/g, name: "globalThis" },
    { regex: /^\s*import\s+/gm, name: "import" },
    { regex: /\bexport\s+/g, name: "export" },
    { regex: /\beval\s*\(/g, name: "eval" },
    { regex: /\bFunction\s*\(/g, name: "Function constructor" },
    { regex: /\bsetTimeout\s*\(/g, name: "setTimeout" },
    { regex: /\bsetInterval\s*\(/g, name: "setInterval" },
    { regex: /\bsetImmediate\s*\(/g, name: "setImmediate" },
    { regex: /\bclearTimeout\s*\(/g, name: "clearTimeout" },
    { regex: /\bclearInterval\s*\(/g, name: "clearInterval" },
    { regex: /\bfetch\s*\(/g, name: "fetch" },
    { regex: /\b__dirname\b/g, name: "__dirname" },
    { regex: /\b__filename\b/g, name: "__filename" },
    { regex: /\bBuffer\b/g, name: "Buffer" },
    { regex: /\bstructuredClone\b/g, name: "structuredClone" },
    { regex: /\bTextEncoder\b/g, name: "TextEncoder" },
    { regex: /\bTextDecoder\b/g, name: "TextDecoder" },
    { regex: /\bimport\.meta\b/g, name: "import.meta" },
  ];

  for (const { regex, name } of patterns) {
    if (regex.test(code)) {
      dangers.push(name);
    }
  }

  return dangers;
}

/**
 * Cria um contexto VM restrito com apenas os globals e variaveis n8n
 * que o codigo do usuario precisa.
 *
 * Tudo o que nao esta explicitamente listado aqui e bloqueado.
 */
export function createSandboxContext(n8nVariables: Record<string, unknown>): vm.Context {
  const logs: string[] = [];

  const sandbox: Record<string, unknown> = {
    // n8n variables injetadas
    ...n8nVariables,

    // JavaScript builtins seguros
    JSON,
    Array,
    Object,
    Math,
    Number,
    String,
    Boolean,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    Promise,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Intl,
    Infinity: Infinity,
    NaN: NaN,
    undefined,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: Number.isNaN,
    isFinite: Number.isFinite,

    // Console capturado — os logs sao recuperados apos a execucao
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
      error: (...args: unknown[]) => {
        logs.push(`[ERROR] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`);
      },
      warn: (...args: unknown[]) => {
        logs.push(`[WARN] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`);
      },
      info: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
      dir: () => {},
      debug: () => {},
    },

    // Buffer e outros Node.js globals bloqueados explicitamente
    require: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    Buffer: undefined,
    __dirname: undefined,
    __filename: undefined,
    fetch: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    structuredClone: undefined,
    TextEncoder: undefined,
    TextDecoder: undefined,

    // Slot para capturar o resultado
    __result: undefined,
    __logs: logs,
  };

  return vm.createContext(sandbox, {
    name: "AgentFlow-code-sandbox",
    code: "allow-async-while-disconnected",
  } as any);
}

export interface SandboxResult {
  result: unknown;
  logs: string[];
}

/**
 * Executa codigo JavaScript dentro de um sandbox VM de forma segura.
 *
 * O codigo do usuario e injetado dentro de uma funcao wrapper para capturar
 * o valor de retorno. Variaveis n8n ($input, $json, etc.) sao injetadas
 * como globals no contexto da VM.
 *
 * Lanca erro se:
 * - O codigo contiver padroes perigosos (require, process, etc.)
 * - O codigo exceder o timeout
 * - O codigo lancar uma excecao
 */
export async function executeCodeInSandbox(
  code: string,
  n8nVariables: Record<string, unknown>,
  options: { timeoutMs?: number; memoryLimitMb?: number } = {},
): Promise<SandboxResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Defense in depth: verifica padroes perigosos antes de compilar
  const dangers = detectDangerousPatterns(code);
  if (dangers.length > 0) {
    throw createCodeExecutionError(
      `CODE_SECURITY_BLOCK: dangerous patterns detected (${dangers.join(", ")})`,
      "CODE_SECURITY_BLOCK",
    );
  }

  const context = createSandboxContext(n8nVariables);

  // Wrap o codigo do usuario em uma funcao para capturar o retorno.
  // O codigo n8n usa `return value;` no formato function node.
  const wrapper = `
    (function() {
      try {
        __result = (function() {
          ${code}
        })();
      } catch (e) {
        __result = { __error: e instanceof Error ? e.message : String(e) };
      }
    })();
  `;

  try {
    vm.runInContext(wrapper, context, {
      filename: "n8n-code-node",
      timeout: timeoutMs,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
       throw createCodeExecutionError(
        `CODE_TIMEOUT: code execution timeout after ${timeoutMs}ms`,
        "CODE_TIMEOUT",
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw createCodeExecutionError(`CODE_EXECUTION_ERROR: ${msg}`, "CODE_EXECUTION_ERROR");
  }

  const result = (context as Record<string, unknown>).__result;
  if (result && typeof result === "object" && "__error" in result) {
     throw createCodeExecutionError(
      `CODE_RUNTIME_ERROR: ${(result as { __error: string }).__error}`,
      "CODE_RUNTIME_ERROR",
    );
  }

  const logs = (context as Record<string, unknown>).__logs as string[];
  return { result, logs };
}
