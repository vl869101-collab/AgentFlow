/**
 * Sandbox isolado para execucao segura de codigo JavaScript em nodes do tipo `code`.
 *
 * Utiliza o modulo de isolamento em nivel de V8 `isolated-vm` com:
 * - Limite estrito de memoria por isolate (padrao 64MB)
 * - Timeout estrito duplo (CPU sincrono via V8 + wall-clock timer para promises pendentes)
 * - Zero acesso a filesystem, rede, processos filhos ou globals do Node.js host (process, require, Buffer, etc.)
 * - Camada adicional pre-compilacao com detectDangerousPatterns (defense in depth)
 * - Bridge bidirecional segura para helpers e variaveis n8n ($input, $helpers, $json, console, etc.)
 */
import ivm from "isolated-vm";
import { createCodeExecutionError } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_MEMORY_LIMIT_MB = 64;

export class CodeExecutionDisabledError extends Error {
  constructor(message = "Code execution is disabled by configuration (EXEC_CODE_DISABLED=true)") {
    super(message);
    this.name = "CodeExecutionDisabledError";
  }
}

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

export interface SandboxResult {
  result: unknown;
  logs: string[];
}

/** Copia dados seguros para dentro do isolate via ExternalCopy */
function copyToIsolate(val: unknown): any {
  if (val === undefined || val === null) return val;
  const t = typeof val;
  if (t === "number" || t === "string" || t === "boolean") return val;
  return new ivm.ExternalCopy(val).copyInto();
}

/** Injeta variaveis n8n e metodos utilitarios no contexto do isolate */
function injectVariablesIntoContext(
  context: ivm.Context,
  jail: ivm.Reference<Record<number | string | symbol, any>>,
  vars: Record<string, unknown>,
): void {
  for (const [key, val] of Object.entries(vars)) {
    if (typeof val === "function") {
      jail.setSync(key, new ivm.Callback((...args: unknown[]) => {
        const res = (val as (...args: unknown[]) => unknown)(...args);
        return copyToIsolate(res);
      }));
    } else if (Array.isArray(val)) {
      jail.setSync(key, copyToIsolate(val));
    } else if (typeof val === "object" && val !== null) {
      const dataProps: Record<string, unknown> = {};
      const functionProps: string[] = [];

      for (const [k, v] of Object.entries(val)) {
        if (typeof v === "function") {
          functionProps.push(k);
        } else {
          dataProps[k] = v;
        }
      }

      jail.setSync(key, copyToIsolate(dataProps));

      for (const fnName of functionProps) {
        const fn = (val as Record<string, (...args: unknown[]) => unknown>)[fnName];
        const bridgeName = `__bridge_${key.replace(/[^a-zA-Z0-9_]/g, "_")}_${fnName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        jail.setSync(bridgeName, new ivm.Callback((...args: unknown[]) => {
          const res = fn(...args);
          return copyToIsolate(res);
        }));
        context.evalSync(`globalThis[${JSON.stringify(key)}][${JSON.stringify(fnName)}] = (...args) => ${bridgeName}(...args);`);
      }
    } else {
      jail.setSync(key, val as any);
    }
  }
}

/**
 * Cria um contexto de sandbox com console capturado e variaveis injetadas.
 */
export function createSandboxContext(
  isolateOrVars: ivm.Isolate | Record<string, unknown>,
  n8nVars?: Record<string, unknown>,
): { context: ivm.Context; logs: string[] } {
  let isolate: ivm.Isolate;
  let vars: Record<string, unknown>;

  if (isolateOrVars instanceof ivm.Isolate) {
    isolate = isolateOrVars;
    vars = n8nVars ?? {};
  } else {
    isolate = new ivm.Isolate({ memoryLimit: DEFAULT_MEMORY_LIMIT_MB });
    vars = isolateOrVars ?? {};
  }

  const context = isolate.createContextSync();
  const jail = context.global;

  const logs: string[] = [];
  jail.setSync("__host_log", new ivm.Callback((...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a))).join(" "));
  }));
  jail.setSync("__host_error", new ivm.Callback((...args: unknown[]) => {
    logs.push(`[ERROR] ${args.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a))).join(" ")}`);
  }));
  jail.setSync("__host_warn", new ivm.Callback((...args: unknown[]) => {
    logs.push(`[WARN] ${args.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a))).join(" ")}`);
  }));

  context.evalSync(`
    globalThis.console = {
      log: (...args) => __host_log(...args),
      error: (...args) => __host_error(...args),
      warn: (...args) => __host_warn(...args),
      info: (...args) => __host_log(...args),
      dir: () => {},
      debug: () => {},
    };
  `);

  injectVariablesIntoContext(context, jail, vars);
  return { context, logs };
}

/**
 * Executa codigo JavaScript dentro de um sandbox V8 isolado (isolated-vm) de forma estritamente segura.
 *
 * - Limite de memoria configuravel (padrao 64MB)
 * - Timeout estrito duplo (CPU sincrono + wall-clock)
 * - Bloqueio de qualquer acesso ao runtime/host do Node.js
 * - Retorno de dados estruturados com serializacao segura
 */
export async function executeCodeInSandbox(
  code: string,
  n8nVariables: Record<string, unknown>,
  options: { timeoutMs?: number; memoryLimitMb?: number } = {},
): Promise<SandboxResult> {
  if (process.env.EXEC_CODE_DISABLED === "true") {
    throw new CodeExecutionDisabledError();
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryLimitMb = options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB;

  // Defense in depth: verifica padroes perigosos antes de compilar
  const dangers = detectDangerousPatterns(code);
  if (dangers.length > 0) {
    throw createCodeExecutionError(
      `CODE_SECURITY_BLOCK: dangerous patterns detected (${dangers.join(", ")})`,
      "CODE_SECURITY_BLOCK",
    );
  }

  const isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb });
  let wallClockTimer: NodeJS.Timeout | undefined;

  try {
    const { context, logs } = createSandboxContext(isolate, n8nVariables);

    let script: ivm.Script;
    try {
      script = isolate.compileScriptSync(`(async function() {\n${code}\n})()`);
    } catch (compileErr: unknown) {
      const msg = compileErr instanceof Error ? compileErr.message : String(compileErr);
      throw createCodeExecutionError(`CODE_RUNTIME_ERROR: ${msg}`, "CODE_RUNTIME_ERROR");
    }

    const runPromise = script.run(context, { timeout: timeoutMs, copy: true, promise: true });
    const timeoutPromise = new Promise((_, reject) => {
      wallClockTimer = setTimeout(() => {
        if (!isolate.isDisposed) isolate.dispose();
        reject(new Error("Script execution timed out."));
      }, timeoutMs + 100);
    });

    const result = await Promise.race([runPromise, timeoutPromise]);
    return { result, logs };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Script execution timed out") || msg.includes("timed out")) {
      throw createCodeExecutionError(
        `CODE_TIMEOUT: code execution timeout after ${timeoutMs}ms`,
        "CODE_TIMEOUT",
      );
    }
    if (msg.includes("memory limit") || msg.includes("Isolate was disposed")) {
      throw createCodeExecutionError(
        `CODE_MEMORY_LIMIT: memory limit of ${memoryLimitMb}MB exceeded`,
        "CODE_MEMORY_LIMIT",
      );
    }
    throw createCodeExecutionError(`CODE_RUNTIME_ERROR: ${msg}`, "CODE_RUNTIME_ERROR");
  } finally {
    if (wallClockTimer) clearTimeout(wallClockTimer);
    if (!isolate.isDisposed) {
      isolate.dispose();
    }
  }
}
