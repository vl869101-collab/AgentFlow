/**
 * Swarm Node Handler (EXP-DIF-01 / Fase 4.3 Fatia D1-A)
 *
 * Executa enxames de agentes via Overclock sidecar MCP (JSON-RPC 2.0 sobre HTTP).
 *
 * Garantias:
 * - Descoberta dinâmica do sidecar em ~/.overclock-app/sidecar.json (campos mcp/token),
 *   com override por nodeConfig (mcpEndpoint/sidecarUrl/token/sidecarPath) para testes.
 * - Falha limpa quando o sidecar está ausente/corrompido: SWARM_SIDECAR_UNAVAILABLE.
 * - Contrato de 5 campos (job/sources/judgment/output/forbidden/isExternalAction) validado
 *   via validateFiveFieldContract de @agentflow/shared. isExternalAction exige >= 1 forbidden.
 * - Governança: timeout estrito (SWARM_TIMEOUT), orçamento de tokens por nó
 *   (SWARM_TOKEN_BUDGET_EXCEEDED) e cancelamento em voo por execução.
 * - Isolamento de host (Env Bridges): interpolações só acessam o escopo do nó
 *   ($vars/params/nodeConfig.parameters/input). Qualquer acesso a env do host
 *   lança SWARM_ENV_ISOLATION_ERROR.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { validateFiveFieldContract } from "@agentflow/shared";
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  wrapItems,
} from "./types.js";
import { assertExecutionNotCancelled } from "../executor.js";

export const SWARM_NODE_TYPES = ["swarm", "swarmNode", "swarm_node"] as const;

const DEFAULT_SIDECAR_PATH = join(homedir(), ".overclock-app", "sidecar.json");
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RPC_METHOD = "tools/call";
const DEFAULT_RPC_TOOL = "swarm.run";

/** Raízes proibidas em interpolações: bloqueiam acesso ao ambiente do host. */
const BLOCKED_SCOPE_ROOTS = new Set([
  "process",
  "env",
  "$env",
  "global",
  "globalThis",
  "require",
  "module",
  "__dirname",
  "__filename",
  "window",
  "document",
  "Deno",
  "Bun",
]);

export class SwarmNodeError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = "SwarmNodeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SwarmSidecarConfig {
  endpoint?: string;
  token?: string;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

/**
 * Carrega o sidecar do Overclock do disco. Retorna {} quando ausente/corrompido
 * (o chamador decide a política de erro; nunca lança para não travar o processo).
 */
export function loadSidecarConfig(filePath: string = DEFAULT_SIDECAR_PATH): SwarmSidecarConfig {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as JsonObject;
    const mcp = parsed.mcp;
    const endpoint =
      asString(mcp) ??
      asString(asObject(mcp).url) ??
      asString(asObject(mcp).endpoint) ??
      asString(asObject(mcp).httpUrl) ??
      asString(parsed.mcpEndpoint) ??
      asString(parsed.sidecarUrl);
    const token = asString(parsed.token) ?? asString(asObject(mcp).token) ?? asString(parsed.mcpToken);
    return { endpoint, token };
  } catch {
    return {};
  }
}

/**
 * Resolve endpoint + token do sidecar MCP.
 * Precedência: override explícito no nó > arquivo sidecar.json.
 * Lança SWARM_SIDECAR_UNAVAILABLE quando não há endpoint utilizável.
 */
export function resolveSwarmSidecar(overrides: JsonObject = {}): Required<SwarmSidecarConfig> {
  const sidecarPath = asString(overrides.sidecarPath) ?? DEFAULT_SIDECAR_PATH;
  const fromDisk = loadSidecarConfig(sidecarPath);

  const endpoint =
    asString(overrides.mcpEndpoint) ??
    asString(overrides.sidecarUrl) ??
    asString(overrides.mcp) ??
    fromDisk.endpoint;
  const token = asString(overrides.token) ?? fromDisk.token ?? "";

  if (!endpoint) {
    throw new SwarmNodeError(
      `Overclock sidecar MCP unavailable (no endpoint from node config or ${sidecarPath}). ` +
        "Open Overclock or configure mcpEndpoint.",
      "SWARM_SIDECAR_UNAVAILABLE",
      503,
    );
  }

  return { endpoint, token };
}

/**
 * Interpolação estritamente escopada ao nó. Tokens suportados: {{ path }}.
 * Raízes permitidas: $vars, params, nodeConfig.parameters, input.
 * Qualquer raiz proibida (process/env/...) lança SWARM_ENV_ISOLATION_ERROR.
 */
export function interpolateNodeScope(template: string, scope: JsonObject): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) => {
    const path = expression.trim();
    const segments = path.split(".").filter((segment) => segment.length > 0);
    const root = segments[0] ?? "";

    if (
      BLOCKED_SCOPE_ROOTS.has(root) ||
      segments.some((segment) => segment === "process" || segment === "env")
    ) {
      throw new SwarmNodeError(
        `Env isolation violation: "${path}" attempts to access host environment`,
        "SWARM_ENV_ISOLATION_ERROR",
        403,
      );
    }

    let current: unknown = scope;
    for (const segment of segments) {
      if (current === null || current === undefined) return "";
      const container = asObject(current);
      if (!(segment in container)) {
        if (root === "$vars" || root === "params" || root === "nodeConfig" || root === "input") return "";
        throw new SwarmNodeError(
          `Env isolation violation: "${path}" is outside the node scope`,
          "SWARM_ENV_ISOLATION_ERROR",
          403,
        );
      }
      current = container[segment];
    }

    if (current === null || current === undefined) return "";
    return typeof current === "string" ? current : JSON.stringify(current);
  });
}

export interface SwarmNodeConfig {
  mcpEndpoint?: string;
  sidecarUrl?: string;
  mcp?: string;
  token?: string;
  sidecarPath?: string;
  contract?: unknown;
  prompt?: string;
  timeoutMs?: number;
  tokenBudget?: number;
  iterations?: number;
  maxIterations?: number;
  rpcMethod?: string;
  rpcTool?: string;
  variables?: Record<string, unknown>;
  [key: string]: unknown;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal, reason: () => unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(reason());
      return;
    }
    const onAbort = () => reject(reason());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function callMcp(
  endpoint: string,
  token: string,
  method: string,
  params: JsonObject,
  signal: AbortSignal,
  timeoutReason: () => unknown,
): Promise<JsonObject> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const response = await abortable(
    fetch(endpoint, { method: "POST", headers, body, signal }),
    signal,
    timeoutReason,
  );

  if (!response.ok) {
    throw new SwarmNodeError(
      `Swarm MCP request failed with HTTP ${response.status}`,
      "SWARM_RPC_ERROR",
      response.status >= 500 ? 502 : response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as JsonObject | null;
  if (!payload || typeof payload !== "object") {
    throw new SwarmNodeError("Swarm MCP returned a non-JSON-RPC payload", "SWARM_RPC_ERROR", 502);
  }
  if (payload.error) {
    throw new SwarmNodeError(
      `Swarm MCP error: ${JSON.stringify(payload.error)}`,
      "SWARM_RPC_ERROR",
      502,
    );
  }
  return payload;
}

function readTokenUsage(payload: JsonObject): number {
  const result = asObject(payload.result);
  const usage = asObject(result.usage);
  const candidates = [
    usage.totalTokens,
    usage.total_tokens,
    result.totalTokens,
    result.tokens,
    result.tokenUsage,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  // Fallback: accumulate prompt + completion when no pre-summed total is reported.
  const prompt = Number(usage.promptTokens ?? usage.prompt_tokens);
  const completion = Number(usage.completionTokens ?? usage.completion_tokens);
  const summed = (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0);
  return summed > 0 ? summed : 0;
}

export class SwarmNodeHandler implements NodeHandler {
  readonly type = "swarm";
  readonly category = "agents";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const nodeConfig = asObject(ctx.nodeConfig);
    const parameters = asObject(nodeConfig.parameters);
    const config: SwarmNodeConfig = { ...nodeConfig, ...parameters } as SwarmNodeConfig;

    // 1. Contrato de 5 campos (obrigatório antes de qualquer efeito externo)
    const rawContract =
      config.contract ??
      (config.job !== undefined ? config : undefined) ??
      (parameters.job !== undefined ? parameters : undefined);

    if (rawContract === undefined) {
      throw new SwarmNodeError(
        "Swarm node requires a 5-field contract (job/sources/judgment/output/forbidden)",
        "SWARM_CONTRACT_INVALID",
        400,
      );
    }

    let contract;
    try {
      contract = validateFiveFieldContract(rawContract);
    } catch (error) {
      throw new SwarmNodeError(
        `Swarm node contract validation failed: ${error instanceof Error ? error.message : String(error)}`,
        "SWARM_CONTRACT_INVALID",
        400,
      );
    }

    if (contract.isExternalAction && contract.forbidden.length === 0) {
      throw new SwarmNodeError(
        "Swarm node performs an external action and must define at least one 'forbidden' rule",
        "SWARM_CONTRACT_INVALID",
        400,
      );
    }

    // 2. Descoberta do sidecar (override de nó > arquivo)
    const { endpoint, token } = resolveSwarmSidecar(config as JsonObject);

    // 3. Escopo isolado do nó (sem env do host)
    const scope: JsonObject = {
      $vars: asObject(config.variables),
      params: parameters,
      nodeConfig: { parameters },
      input: ctx.input,
    };
    const prompt = interpolateNodeScope(
      asString(config.prompt) ?? contract.job,
      scope,
    );

    // 4. Governança
    const timeoutMs =
      Number.isFinite(Number(config.timeoutMs)) && Number(config.timeoutMs) > 0
        ? Number(config.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
    const tokenBudget = Number.isFinite(Number(config.tokenBudget))
      ? Number(config.tokenBudget)
      : Number.POSITIVE_INFINITY;
    const maxIterations = Math.max(
      1,
      Math.min(
        50,
        Number.isFinite(Number(config.maxIterations ?? config.iterations))
          ? Math.floor(Number(config.maxIterations ?? config.iterations))
          : 1,
      ),
    );

    const controller = new AbortController();
    let timedOut = false;
    const abortReason = () =>
      new SwarmNodeError(`Swarm node timed out after ${timeoutMs}ms`, "SWARM_TIMEOUT", 504);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let totalTokens = 0;
      let output: unknown;
      let iterations = 0;

      await assertExecutionNotCancelled(ctx.executionId);

      for (let i = 0; i < maxIterations; i++) {
        if (i > 0) await assertExecutionNotCancelled(ctx.executionId);

        const payload = await callMcp(
          endpoint,
          token,
          asString(config.rpcMethod) ?? DEFAULT_RPC_METHOD,
          {
            name: asString(config.rpcTool) ?? DEFAULT_RPC_TOOL,
            arguments: {
              prompt,
              job: contract.job,
              sources: contract.sources,
              judgment: contract.judgment,
              output: contract.output,
              forbidden: contract.forbidden,
              isExternalAction: contract.isExternalAction,
              input: ctx.input,
            },
          },
          controller.signal,
          abortReason,
        );

        iterations += 1;
        totalTokens += readTokenUsage(payload);

        if (totalTokens > tokenBudget) {
          throw new SwarmNodeError(
            `Swarm node token budget exceeded (${totalTokens} > ${tokenBudget})`,
            "SWARM_TOKEN_BUDGET_EXCEEDED",
            429,
          );
        }

        const result = asObject(payload.result);
        if (result.output !== undefined) {
          output = result.output;
          break;
        }
        output = result;
      }

      const item = {
        output: output ?? null,
        prompt,
        iterations,
        totalTokens,
        isExternalAction: contract.isExternalAction,
        endpoint,
      };

      return {
        items: wrapItems([item]),
        logs: [
          `[SwarmNode] Converged after ${iterations} iteration(s), ${totalTokens} token(s) via ${endpoint}`,
        ],
      };
    } catch (error) {
      if (timedOut) throw abortReason();
      if (error instanceof SwarmNodeError) throw error;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
