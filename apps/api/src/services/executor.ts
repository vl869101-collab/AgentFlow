import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { decryptCredential } from "../lib/crypto.js";
import { telemetry } from "../lib/otel.js";
import { httpCircuitBreaker } from "../lib/circuit-breaker.js";
import { applyHttpAuthentication, type HttpAuthConfig } from "../lib/http-auth.js";
import { ensureFreshOAuth2Token } from "./vault/oauth-refresh.js";
import { resolveUniversalCredentials, resolveSingleCredential } from "./vault/universal-resolver.js";
import { UniversalConnectionInjector } from "./vault/universal-injector.js";
import { recordUsageEvent } from "./metering.js";
import { recordAuditEvent, recordWorkflowAuditEvent } from "./audit-ledger.js";
import { publishTelemetryEvent } from "./execution-telemetry.js";
import { createConcurrencyPool } from "./executor/concurrency-pool.js";
import { enqueueExecution } from "./queue.js";

// Native handler (registered via the registry-pending process — Part 2)
import { executeEvaluationTrigger } from "./nodes/evaluationTrigger.js";
import { CodeNodeHandler } from "./nodes/code.js";
import { SwitchNodeHandler } from "./nodes/switch.js";
import { SplitInBatchesNodeHandler } from "./nodes/split-in-batches.js";
import { ChatTriggerNodeHandler } from "./nodes/chat-trigger.js";
import { McpClientNodeHandler } from "./nodes/mcp-client.js";
import { TeamsNodeHandler } from "./nodes/teams.js";
import { WhatsAppNodeHandler } from "./nodes/whatsapp.js";
import { GoogleCalendarNodeHandler } from "./nodes/google-calendar.js";
import { GoogleDocsNodeHandler } from "./nodes/google-docs.js";
import { GoogleSheetsNodeHandler } from "./nodes/google-sheets.js";
import { GoogleDriveNodeHandler } from "./nodes/google-drive.js";
import { GoogleGmailNodeHandler } from "./nodes/google-gmail.js";
import { ErrorTriggerNodeHandler } from "./nodes/error-trigger.js";
import { WaitNodeHandler, calculateWaitMs, isWaitNode, type WaitNodeConfig } from "./nodes/wait.js";
import { MergeNodeHandler } from "./nodes/merge.js";
import { FormNodeHandler } from "./nodes/form.js";
import { AiAgentNodeHandler } from "./nodes/ai-agent.js";
import { LlmModelNodeHandler } from "./nodes/llm-model.js";
import { LlmChainNodeHandler } from "./nodes/llm-chain.js";
import { VectorStoreNodeHandler } from "./nodes/vector-store.js";
import { ExecuteWorkflowNodeHandler } from "./nodes/execute-workflow.js";
import { TwelveLabsNodeHandler } from "./nodes/twelvelabs.js";
import { SwarmNodeHandler, SWARM_NODE_TYPES } from "./nodes/swarm.js";
import {
  wrapItems,
  unwrapItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  extractFieldByPath,
  setFieldByPath,
  isNodeItem,
  NodeItemsSchema,
  NodeItemSchema,
  type NodeItem,
  type NodeExecutionContext,
} from "./nodes/types.js";

export {
  wrapItems,
  unwrapItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  extractFieldByPath,
  setFieldByPath,
  isNodeItem,
  NodeItemsSchema,
  NodeItemSchema,
  type NodeItem,
};

export type ExecutionResult = {
  id: string;
  status: string;
  workflowId: string;
  orgId: string;
  trigger: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt: Date | string;
  finishedAt?: Date | string | null;
  duration?: number | null;
  [key: string]: unknown;
};

type JsonObject = Record<string, any>;

type WorkflowNode = {
  id: string;
  type: string;
  config: JsonObject;
  label?: string;
  name?: string;
};

type WorkflowEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: unknown;
};

const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const NODE_TIMEOUT_MS = 30 * 1000;
const MAX_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function parseJson(value: unknown, fallback?: unknown): any {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    const error = new Error("Invalid JSON in workflow definition");
    (error as any).code = "VALIDATION_ERROR";
    (error as any).statusCode = 400;
    throw error;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function isExternalActionConfig(config: JsonObject, parameters: JsonObject): boolean {
  const contract = asObject(parameters.contract ?? config.contract);
  const raw =
    parameters.isExternalAction ??
    config.isExternalAction ??
    contract.isExternalAction ??
    false;
  return raw === true || String(raw).toLowerCase() === "true";
}

export function nodeRequiresApproval(node: WorkflowNode): boolean {
  if (node.type === "approval") return true;
  const config = asObject(node.config);
  const parameters = asObject(config.parameters);
  // EXP-DIF-01: autonomous swarm nodes performing external actions require approval.
  if ((SWARM_NODE_TYPES as readonly string[]).includes(node.type) && isExternalActionConfig(config, parameters)) {
    return true;
  }
  if (
    config.requiresApproval === true ||
    parameters.requiresApproval === true ||
    String(config.requiresApproval ?? "").toLowerCase() === "true" ||
    String(parameters.requiresApproval ?? "").toLowerCase() === "true"
  ) {
    return true;
  }

  const action = String(
    config.action ??
    parameters.action ??
    config.operation ??
    parameters.operation ??
    config.method ??
    parameters.method ??
    ""
  ).toLowerCase();

  const irreversibleKeywords = ["delete", "drop", "terminate", "charge", "refund", "destroy", "purge", "revoke"];
  if (action && irreversibleKeywords.some((keyword) => action.includes(keyword))) {
    if (config.requiresApproval !== false && parameters.requiresApproval !== false) {
      return true;
    }
  }

  return false;
}

function normalizeNodes(value: unknown): WorkflowNode[] {
  const nodes = parseJson(value, []);
  if (!Array.isArray(nodes)) throw new Error("Workflow nodes must be an array");

  const result = nodes.map((value, index) => {
    const node = asObject(value);
    const data = asObject(parseJson(node.data, {}));
    const type = String(data.type ?? node.type ?? "");
    if (!type) throw new Error(`Workflow node ${index} has no type`);

    return {
      id: String(node.id ?? node.nodeId ?? `node-${index}`),
      type,
      config: asObject(parseJson(data.config ?? node.config, {})),
      label: (node.label as string) ?? (data.label as string) ?? undefined,
      name: (node.name as string) ?? (data.name as string) ?? undefined,
    };
  });

  const ids = new Set<string>();
  for (const node of result) {
    if (ids.has(node.id)) throw new Error(`Workflow contains duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  return result;
}

function normalizeEdges(value: unknown): WorkflowEdge[] {
  const edges = parseJson(value, []);
  if (!Array.isArray(edges)) throw new Error("Workflow edges must be an array");

  return edges.map((value, index) => {
    const edge = asObject(value);
    const source = edge.sourceNodeId ?? edge.source;
    const target = edge.targetNodeId ?? edge.target;
    if (!source || !target) throw new Error(`Workflow edge ${index} is missing source or target`);
    return {
      id: edge.id !== undefined ? String(edge.id) : undefined,
      source: String(source),
      target: String(target),
      sourceHandle: edge.sourceHandle === undefined ? undefined : String(edge.sourceHandle),
      targetHandle: edge.targetHandle === undefined ? undefined : String(edge.targetHandle),
      label: edge.label === undefined ? undefined : String(edge.label),
      condition: parseJson(edge.condition),
    };
  });
}

function getField(input: unknown, field: string): unknown {
  if (!field) return input;
  const direct = extractFieldByPath(input, field, undefined);
  if (direct !== undefined) return direct;

  if (Array.isArray(input) && input.length > 0) {
    const first = input[0];
    if (first && typeof first === "object") {
      if ("json" in first && first.json && typeof first.json === "object") {
        const jsonVal = extractFieldByPath(first.json, field, undefined);
        if (jsonVal !== undefined) return jsonVal;
      }
      const itemVal = extractFieldByPath(first, field, undefined);
      if (itemVal !== undefined) return itemVal;
    }
  }

  return field.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    return (value as JsonObject)[key];
  }, input);
}

function evaluateCondition(input: unknown, config: JsonObject): boolean {
  const actual = getField(input, String(config.field ?? ""));
  const expected = config.value;
  switch (String(config.operator ?? "eq").toLowerCase()) {
    case "eq":
    case "equals":
      return actual === expected;
    case "neq":
    case "ne":
    case "not_equals":
      return actual !== expected;
    case "gt":
      return (actual as any) > expected;
    case "gte":
      return (actual as any) >= expected;
    case "lt":
      return (actual as any) < expected;
    case "lte":
      return (actual as any) <= expected;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? "").includes(String(expected));
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "exists":
      return actual !== undefined && actual !== null;
    default:
      throw new Error(`Unsupported condition operator: ${config.operator}`);
  }
}

function unpackConditionResult(output: unknown): boolean {
  if (typeof output === "boolean") return output;
  if (!output) return false;
  if (Array.isArray(output)) {
    if (output.length === 0) return false;
    const first = output[0];
    if (first && typeof first === "object" && "json" in first) {
      const json = (first as any).json;
      if (typeof json === "boolean") return json;
      if (json && typeof json === "object") {
        if ("value" in json && typeof json.value === "boolean") return json.value;
        if ("result" in json && typeof json.result === "boolean") return json.result;
        if ("value" in json) return Boolean(json.value);
        if ("result" in json) return Boolean(json.result);
      }
    }
    return Boolean(first);
  }
  if (typeof output === "object" && "json" in (output as any)) {
    const json = (output as any).json;
    if (typeof json === "boolean") return json;
    if (json && typeof json === "object") {
      if ("value" in json && typeof json.value === "boolean") return json.value;
      if ("result" in json && typeof json.result === "boolean") return json.result;
      if ("value" in json) return Boolean(json.value);
      if ("result" in json) return Boolean(json.result);
    }
  }
  return Boolean(output);
}

function followsConditionEdge(edge: WorkflowEdge, output: unknown): boolean {
  const result = unpackConditionResult(output);
  const handle = (edge.sourceHandle ?? edge.label ?? "").toLowerCase();
  if (handle === "true" || handle === "yes") return result;
  if (handle === "false" || handle === "no") return !result;

  if (typeof edge.condition === "boolean") return result === edge.condition;
  if (edge.condition && typeof edge.condition === "object") {
    const condition = asObject(edge.condition);
    if (condition.field !== undefined || condition.operator !== undefined) {
      return evaluateCondition(output, condition);
    }
  }

  return true;
}

function followsSwitchEdge(edge: WorkflowEdge, output: unknown): boolean {
  if (!output || typeof output !== "object") return true;
  const handle = edge.sourceHandle ?? edge.label;
  if (!handle) return true;

  const rawItems = Array.isArray(output)
    ? output
    : "items" in (output as any) && Array.isArray((output as any).items)
    ? (output as any).items
    : [output];

  return rawItems.some((item: any) => {
    const json = item && typeof item === "object" && "json" in item ? item.json : item;
    if (!json || typeof json !== "object") return false;
    const matchedIdx = json._matchedOutput !== undefined ? String(json._matchedOutput) : undefined;
    const matchedName = json._matchedOutputName;
    return (
      handle === matchedIdx ||
      handle === `output_${matchedIdx}` ||
      handle === `output${matchedIdx}` ||
      handle === matchedName ||
      (handle.toLowerCase() === "default" && !json._matched)
    );
  });
}

function followsEdge(node: WorkflowNode, edge: WorkflowEdge, output: unknown): boolean {
  const isErrorEdge = (edge.sourceHandle ?? edge.label ?? "").toLowerCase() === "error";
  if (isErrorEdge) return false;
  if (node.type === "condition") return followsConditionEdge(edge, output);
  if (node.type === "switch") return followsSwitchEdge(edge, output);
  return true;
}

import { validateUrl, safeFetch, SsrFSecurityError, isBlockedIpOrHost, assertSafeDestination } from "../lib/ssrf.js";

function assertSafeUrl(value: unknown): URL {
  try {
    return validateUrl(String(value));
  } catch (err: any) {
    if (err instanceof SsrFSecurityError) {
      if (err.code === "INVALID_URL") throw new Error("HTTP node URL is invalid");
      if (err.code === "UNSUPPORTED_PROTOCOL" || err.code === "CREDENTIALS_IN_URL") {
        throw new Error("HTTP node only supports public HTTP(S) URLs");
      }
      if (err.code === "EGRESS_BLOCKED") throw new Error("HTTP node host is not in the egress allowlist");
      if (err.code === "SSRF_BLOCKED") throw new Error("HTTP node cannot call private or local network addresses");
    }
    throw err;
  }
}

async function fetchWithTimeout(input: string | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await safeFetch(input, { ...init, timeoutMs, maxRedirects: MAX_REDIRECTS, maxResponseBytes: MAX_HTTP_RESPONSE_BYTES });
  } catch (err: any) {
    if (err instanceof SsrFSecurityError) {
      if (err.code === "TIMEOUT") throw new Error(`Request timed out after ${timeoutMs}ms`);
      if (err.code === "SSRF_BLOCKED") throw new Error("HTTP node cannot call private or local network addresses");
      if (err.code === "EGRESS_BLOCKED") throw new Error("HTTP redirect host is not in the egress allowlist");
      if (err.code === "UNSUPPORTED_PROTOCOL") throw new Error("HTTP redirect to non-HTTP(S) URL is not allowed");
      if (err.code === "INVALID_REDIRECT") throw new Error("HTTP redirect response has no Location header");
      if (err.code === "TOO_MANY_REDIRECTS") throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
      if (err.code === "RESPONSE_TOO_LARGE") throw new Error("HTTP response is too large");
    }
    throw err;
  }
}

async function readResponse(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTTP_RESPONSE_BYTES) throw new Error("HTTP response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_HTTP_RESPONSE_BYTES) throw new Error("HTTP response is too large");
  return text;
}

async function executeAi(config: JsonObject, input: unknown): Promise<unknown> {
  const model = config.model;
  if (!model) throw new Error("AI node model is required");

  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA NIM API key not configured");

  const baseUrl = (process.env.NVIDIA_NIM_BASE_URL || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const prompt = config.prompt ? String(config.prompt) : "";
  const inputText = JSON.stringify(input ?? null);
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: String(model),
        messages: [{ role: "user", content: prompt ? `${prompt}\n\nInput:\n${inputText}` : inputText }],
        max_tokens: Math.min(Number(config.maxTokens ?? 2048), 4096),
        temperature: Number(config.temperature ?? 0.2),
      }),
    },
    NODE_TIMEOUT_MS,
  );

  const text = await readResponse(response);
  if (!response.ok) throw new Error(`NIM error: ${response.status}`);
  const data = JSON.parse(text) as JsonObject;
  return data.choices?.[0]?.message?.content ?? data;
}

async function credentialHeaders(config: JsonObject, orgId: string): Promise<Record<string, string>> {
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : undefined;
  if (!credentialId) return {};

  const credential = await prisma.credential.findFirst({ where: { id: credentialId, orgId } });
  if (!credential) throw new Error("Credential not found");

  // OAuth2 auto-refresh
  if (credential.type === "oauth2" || credential.bucket === "oauth2_managed" || credential.bucket === "oauth2_custom") {
    try {
      const fresh = await ensureFreshOAuth2Token(credentialId, orgId);
      return { Authorization: `${fresh.tokenType || "Bearer"} ${fresh.accessToken}` };
    } catch {
      // Fallback to direct decryption if refresh fails
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(decryptCredential(credential.data));
  } catch {
    throw new Error("Credential data is invalid or cannot be decrypted");
  }

  const values = asObject(data);
  const headers = Object.fromEntries(
    Object.entries(asObject(values.headers)).map(([key, value]) => [key, String(value)]),
  );
  const token = values.apiKey ?? values.api_key ?? values.token ?? values.accessToken ?? values.access_token;
  if (token !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${String(token)}`;
  }
  if (values.username !== undefined && values.password !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Basic ${Buffer.from(`${String(values.username)}:${String(values.password)}`).toString("base64")}`;
  }
  return headers;
}

async function executeHttp(
  config: JsonObject,
  input: unknown,
  orgId: string,
  nodeSpan?: import("../lib/otel.js").Span,
): Promise<unknown> {
  let url = assertSafeUrl(config.url);
  const method = String(config.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }

  let headers = Object.fromEntries(
    Object.entries(asObject(config.headers)).map(([key, value]) => [key, String(value)]),
  );
  const storedHeaders = await credentialHeaders(config, orgId);
  for (const [key, value] of Object.entries(storedHeaders)) {
    if (!Object.keys(headers).some((header) => header.toLowerCase() === key.toLowerCase())) headers[key] = value;
  }

  // TASK-11: Apply 6 authentication schemes (Basic, Bearer, API Key, OAuth2, Digest, mTLS)
  const authConfig = (config.auth ?? config.authentication) as HttpAuthConfig | undefined;
  if (authConfig) {
    const authOrgConfig = { ...authConfig, orgId: authConfig.orgId || orgId };
    const prepared = await applyHttpAuthentication(url.toString(), method, authOrgConfig, headers);
    url = new URL(prepared.url);
    headers = prepared.headers;
  }

  // Universal Connection Injector for declared credentials
  if (config.credentialId || config.credentials) {
    try {
      const credRes = await resolveUniversalCredentials(config, orgId);
      if (credRes.primary) {
        const injected = UniversalConnectionInjector.injectHttp(
          { url: url.toString(), method, headers },
          credRes.primary
        );
        url = new URL(injected.url);
        headers = injected.headers || headers;
      }
    } catch {
      // Keep existing headers if universal resolution doesn't match
    }
  }

  const configuredBody = config.body;
  const bodyValue = configuredBody === undefined && method !== "GET" && method !== "HEAD" ? input : configuredBody;
  const body = bodyValue === undefined ? undefined : typeof bodyValue === "string" ? bodyValue : JSON.stringify(bodyValue);
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  // W3C Trace Context propagation for distributed tracing (TASK-10 / WF-ENG Item 7)
  telemetry.injectTraceContext(headers, nodeSpan);

  // TASK-11: Circuit Breaker for HTTP egress
  let hostname = "default-host";
  try {
    hostname = new URL(url).hostname;
  } catch {}

  const timeoutMs = Math.min(Number(config.timeout ?? 30) * 1000, NODE_TIMEOUT_MS);

  const response = await httpCircuitBreaker.execute(hostname, () =>
    fetchWithTimeout(url, { method, headers, body }, timeoutMs)
  );

  const text = await readResponse(response);
  let result: unknown = text;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON response bodies as text.
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return result;
}

class CodeExecutionDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = "EXEC_CODE_DISABLED";

  constructor() {
    super("Code execution is disabled");
    this.name = "CodeExecutionDisabledError";
  }
}

function containsCodeNode(workflow: any): boolean {
  return workflowGraph(workflow).nodes.some((node) => node.type === "code" || node.type === "transform");
}

async function executeNode(
  node: WorkflowNode,
  input: unknown,
  orgId: string,
  executionId?: string,
  workflowId?: string,
  inputBranches?: NodeItem[][],
  nodeSpan?: import("../lib/otel.js").Span,
): Promise<unknown> {
  const nodeConfig = (node.config.parameters as Record<string, unknown>) ?? (node.config as Record<string, unknown>);
  let resolvedCreds: Record<string, any> | undefined;
  try {
    const credResolution = await resolveUniversalCredentials(node.config, orgId);
    resolvedCreds = {
      ...credResolution.byType,
      ...credResolution.byProvider,
      default: credResolution.primary,
      _token: credResolution.token,
      _apiKey: credResolution.apiKey,
      _accessToken: credResolution.accessToken,
    };
  } catch (err) {
    // Non-blocking credential resolution failure fallback
    resolvedCreds = undefined;
  }

  const traceparent = nodeSpan ? telemetry.formatTraceParent(nodeSpan) : undefined;
  const baseContext: NodeExecutionContext = {
    executionId: executionId || "",
    nodeId: node.id,
    workflowId: workflowId || "",
    orgId,
    nodeConfig,
    input,
    inputBranches,
    credentials: resolvedCreds,
    traceparent,
  };

  switch (node.type) {
    case "trigger":
    case "webhook":
    case "cron":
    case "manual":
    case "executeWorkflowTrigger":
      return input;
    case "ai":
      return executeAi(node.config, input);
    case "condition":
      return evaluateCondition(input, node.config);
    case "http":
    case "httpRequest":
      return executeHttp(node.config, input, orgId, nodeSpan);
    case "code": {
      const handler = new CodeNodeHandler();
      return handler.execute(baseContext);
    }
    case "transform":
      if (getEnv().EXEC_CODE_DISABLED) throw new CodeExecutionDisabledError();
      throw new Error(
        "Code/transform nodes are unsupported because user-supplied code execution is disabled for security."
      );
    case "output":
      return input;
    case "approval": {
      const existingApprovals = await prisma.approval.findMany({
        where: { executionId },
      });
      const approval = existingApprovals.find((a: any) => {
        const ctx = asObject(a.context);
        return (ctx.nodeId === node.id || a.id === (node.config as any)?.approvalId) && a.status === "APPROVED";
      });
      if (approval) {
        const ctx = asObject(approval.context);
        if (ctx.submittedData) {
          return {
            ...(typeof input === "object" && input !== null ? (input as any) : {}),
            ...asObject(ctx.submittedData),
            _approved: true,
          };
        }
      }
      return input;
    }
    case "merge": {
      const handler = new MergeNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "filter": {
      // Simple filter: if config has expression, evaluate it; otherwise pass through
      const expr = String(node.config.expression ?? "true").toLowerCase();
      if (expr === "true") return input;
      if (expr === "false") return { filtered: true, skipped: true };
      // Basic expression evaluation for common cases
      if (expr.includes("payload.total") && typeof input === "object" && input !== null) {
        const total = (input as { total?: unknown }).total;
        if (typeof total === "number" && total > 0) return input;
      }
      // Default: pass through
      return input;
    }
    case "set_fields": {
      // Safely spread fields onto input items or input object
      const fields = (node.config ?? {}) as Record<string, unknown>;
      if (Array.isArray(input)) {
        return input.map((item) => {
          if (isNodeItem(item)) {
            const jsonCopy = { ...item.json };
            if (typeof jsonCopy.value === "boolean" && Object.keys(jsonCopy).length === 1) {
              delete jsonCopy.value;
            }
            return {
              ...item,
              json: { ...jsonCopy, ...fields },
            };
          }
          if (typeof item === "object" && item !== null) {
            return { ...item, ...fields };
          }
          return { value: item, ...fields };
        });
      }
      if (isNodeItem(input)) {
        const item = input as NodeItem;
        const jsonCopy = { ...item.json };
        if (typeof jsonCopy.value === "boolean" && Object.keys(jsonCopy).length === 1) {
          delete jsonCopy.value;
        }
        return {
          ...item,
          json: { ...jsonCopy, ...fields },
        };
      }
      const base = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      return { ...base, ...fields };
    }
    case "respond_webhook": {
      const config = node.config as { statusCode?: number; body?: string };
      return { statusCode: config.statusCode ?? 200, body: config.body ?? "OK" };
    }
    case "gmailTrigger": {
      const params = node.config.parameters as Record<string, unknown> | undefined;
      const options = asObject(params?.options);
      const filters = asObject(params?.filters);
      return {
        ...asObject(input),
        _trigger: "gmailTrigger",
        _config: { event: params?.event, filters, options },
      };
    }
    case "googleDrive":
    case "google_drive": {
      const handler = new GoogleDriveNodeHandler();
      return handler.execute(baseContext);
    }
    case "evaluationTrigger":
      return executeEvaluationTrigger(node.config, input);
    case "emailReadImap": {
      const params = node.config.parameters as Record<string, unknown> | undefined;
      const options = asObject(params?.options);
      return {
        ...asObject(input),
        _trigger: "emailReadImap",
        _config: { options },
      };
    }
    case "gmail": {
      const handler = new GoogleGmailNodeHandler();
      return handler.execute(baseContext);
    }
    case "googleSheets":
    case "google_sheets": {
      const handler = new GoogleSheetsNodeHandler();
      return handler.execute(baseContext);
    }
    case "switch": {
      const handler = new SwitchNodeHandler();
      return handler.execute(baseContext);
    }
    case "splitInBatches":
    case "split_in_batches": {
      const handler = new SplitInBatchesNodeHandler();
      return handler.execute(baseContext);
    }
    case "chatTrigger":
    case "chat_trigger": {
      const handler = new ChatTriggerNodeHandler();
      return handler.execute(baseContext);
    }
    case "mcpClient":
    case "mcp_client": {
      const handler = new McpClientNodeHandler();
      return handler.execute(baseContext);
    }
    case "teams": {
      const handler = new TeamsNodeHandler();
      return handler.execute(baseContext);
    }
    case "whatsapp":
    case "whatsappTrigger": {
      const handler = new WhatsAppNodeHandler();
      return handler.execute(baseContext);
    }
    case "googleCalendar":
    case "google_calendar": {
      const handler = new GoogleCalendarNodeHandler();
      return handler.execute(baseContext);
    }
    case "googleDocs":
    case "google_docs": {
      const handler = new GoogleDocsNodeHandler();
      return handler.execute(baseContext);
    }
    case "errorTrigger":
    case "error_trigger": {
      const handler = new ErrorTriggerNodeHandler();
      return handler.execute(baseContext);
    }
    case "wait":
    case "delay": {
      const waitApproval = await prisma.approval.findFirst({
        where: { executionId, nodeId: node.id },
      });
      let submittedData: unknown = undefined;
      let resumeToken: string | undefined = undefined;
      if (waitApproval?.context) {
        const ctx = waitApproval.context as Record<string, unknown>;
        if (ctx.submittedData !== undefined) {
          submittedData = ctx.submittedData;
        }
        if (ctx.resumeToken) {
          resumeToken = String(ctx.resumeToken);
        }
      }
      const handler = new WaitNodeHandler();
      const execContext: NodeExecutionContext = {
        ...baseContext,
        nodeConfig: {
          ...node.config,
          _submittedData: submittedData,
          _resumeToken: resumeToken,
        },
      };
      const res = await handler.execute(execContext);
      return res.items;
    }
    case "form":
    case "formTrigger":
    case "form_trigger": {
      const handler = new FormNodeHandler();
      return handler.execute(baseContext);
    }
    case "aiAgent":
    case "ai_agent": {
      const handler = new AiAgentNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "llmModel":
    case "llm_model":
    case "lmChatOpenAi":
    case "lmChatAnthropic":
    case "lmChatGoogleGemini": {
      const handler = new LlmModelNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "llmChain":
    case "llm_chain":
    case "basicLlmChain": {
      const handler = new LlmChainNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "vectorStore":
    case "vector_store":
    case "vectorStoreQdrant":
    case "vectorStorePinecone":
    case "vectorStorePgvector": {
      const handler = new VectorStoreNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "executeWorkflow":
    case "execute_workflow":
    case "executeWorkflowTrigger":
    case "subworkflow":
    case "sub_workflow": {
      const handler = new ExecuteWorkflowNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "twelveLabs":
    case "twelve_labs":
    case "twelvelabs":
    case "twelveLabsVideoAnalysis": {
      const handler = new TwelveLabsNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    case "swarm":
    case "swarmNode":
    case "swarm_node": {
      const handler = new SwarmNodeHandler();
      const res = await handler.execute(baseContext);
      return res.items;
    }
    default:
      throw new Error(`Unsupported workflow node type: ${node.type}`);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type RetryPolicy = {
  enabled: boolean;
  maxAttempts: number;
  waitBetweenTriesMs: number;
  backoff: "fixed" | "linear" | "exponential";
};

function getNodeRetryPolicy(node: WorkflowNode): RetryPolicy {
  const config = node.config ?? {};
  const parameters = asObject(config.parameters);
  const retryOnFail = config.retryOnFail ?? config.retryOnFailure ?? parameters.retryOnFail ?? parameters.retryOnFailure;
  const enabled = retryOnFail === true || String(retryOnFail ?? "").toLowerCase() === "true";
  const configuredTries = config.maxTries ?? config.maxAttempts ?? parameters.maxTries ?? parameters.maxAttempts;
  const parsedTries = Number(configuredTries);
  const maxAttempts = Math.min(10, Math.max(1, Number.isFinite(parsedTries) ? Math.floor(parsedTries) : enabled ? 3 : 1));
  const configuredDelay = config.waitBetweenTries ?? parameters.waitBetweenTries ?? 0;
  const parsedDelay = Number(configuredDelay);
  const waitBetweenTriesMs = Math.min(60_000, Math.max(0, Number.isFinite(parsedDelay) ? parsedDelay : 0));
  const configuredBackoff = String(config.backoff ?? config.retryBackoff ?? parameters.backoff ?? parameters.retryBackoff ?? "exponential").toLowerCase();
  const backoff = configuredBackoff === "fixed" || configuredBackoff === "linear" ? configuredBackoff : "exponential";

  return { enabled, maxAttempts: enabled ? maxAttempts : 1, waitBetweenTriesMs, backoff };
}

function retryDelay(policy: RetryPolicy, failedAttempt: number): number {
  const multiplier = policy.backoff === "fixed"
    ? 1
    : policy.backoff === "linear"
    ? failedAttempt
    : 2 ** Math.max(0, failedAttempt - 1);
  return Math.min(60_000, policy.waitBetweenTriesMs * multiplier);
}

function isCancellationError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("cancel") || message.includes("abort");
}

export async function assertExecutionNotCancelled(executionId: string): Promise<void> {
  const current = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
  if (current?.status === "CANCELLED") throw new Error("Execution cancelled");
}

async function executeNodeWithRetry(
  node: WorkflowNode,
  input: unknown,
  orgId: string,
  executionId: string,
  nodeExecutionId: string,
  workflowId?: string,
  inputBranches?: NodeItem[][],
  nodeSpan?: import("../lib/otel.js").Span,
): Promise<unknown> {
  const policy = getNodeRetryPolicy(node);
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    await assertExecutionNotCancelled(executionId);
    try {
      const output = await withTimeout(
        executeNode(node, input, orgId, executionId, workflowId, inputBranches, nodeSpan),
        NODE_TIMEOUT_MS,
        "Node execution timed out"
      );

      // Validate and envelop output to strict NodeItem[] contract
      const wrapped = wrapItems(output);
      const validation = NodeItemsSchema.safeParse(wrapped);
      if (!validation.success) {
        throw new Error(
          `Node output contract validation failed for node "${node.id}" (${node.type}): ${validation.error.message}`
        );
      }

      if (attempt > 1) {
        await prisma.nodeExecution.update({
          where: { id: nodeExecutionId },
          data: { retryCount: attempt - 1, error: null },
        });
      }
      return wrapped;
    } catch (error) {
      lastError = error;
      const hasAttemptsLeft = attempt < policy.maxAttempts;
      if (!policy.enabled || !hasAttemptsLeft || isCancellationError(error)) throw error;

      await prisma.nodeExecution.update({
        where: { id: nodeExecutionId },
        data: { retryCount: attempt, error: errorMessage(error) },
      });
      const delayMs = retryDelay(policy, attempt);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));
}

function cleanScopedId(id: unknown, workflowId?: string): string {
  const str = String(id ?? "");
  if (workflowId && str.startsWith(`${workflowId}:`)) {
    return str.slice(workflowId.length + 1);
  }
  return str;
}

function workflowGraph(workflow: any): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const version = Array.isArray(workflow.versions) ? workflow.versions[0] : undefined;
  const snapshot = asObject(parseJson(version?.snapshot, {}));
  const relationNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const relationEdges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const rawNodes = relationNodes.length > 0 ? relationNodes : snapshot.nodes ?? [];
  const rawEdges = relationEdges.length > 0 ? relationEdges : snapshot.edges ?? [];
  const wId = workflow?.id;
  const nodes = normalizeNodes(rawNodes).map((node) => ({
    ...node,
    id: cleanScopedId(node.id, wId),
  }));
  const edges = normalizeEdges(rawEdges).map((edge) => ({
    ...edge,
    source: cleanScopedId(edge.source, wId),
    target: cleanScopedId(edge.target, wId),
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`Workflow edge references unknown node: ${edge.source} -> ${edge.target}`);
    }
  }
  return { nodes, edges };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateExecution(id: string, data: JsonObject): Promise<ExecutionResult> {
  const execution = await prisma.workflowExecution.update({ where: { id }, data });
  return execution as ExecutionResult;
}

async function recordExecutionAudit(
  execution: { id: string; orgId?: string; userId?: string | null; workflowId: string; trigger?: string },
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const normalizedAction =
    action === "execution.started" || action === "execution.start"
      ? "execution.start"
      : action === "execution.succeeded" || action === "execution.finish"
        ? "execution.finish"
        : action === "execution.failed" || action === "execution.error"
          ? "execution.error"
          : action;

  await recordWorkflowAuditEvent({
    executionId: execution.id,
    actor: execution.userId ?? "system",
    action: normalizedAction,
    decision: (metadata.decision as string) ?? (metadata.status as string) ?? null,
    payload: {
      workflowId: execution.workflowId,
      trigger: execution.trigger ?? "api",
      ...metadata,
    },
  }).catch((error) => {
    console.error(`[workflow-audit] Failed to record ${action} for execution ${execution.id}:`, error);
  });

  if (!execution.orgId) return;
  await recordAuditEvent({
    orgId: execution.orgId,
    userId: execution.userId,
    action,
    resource: "execution",
    resourceId: execution.id,
    metadata: {
      workflowId: execution.workflowId,
      trigger: execution.trigger ?? "api",
      ...metadata,
    },
  }).catch((error) => {
    console.error(`[audit-ledger] Failed to append ${action} for execution ${execution.id}:`, error);
  });
}

export async function executeGraph(
  execution: any,
  workflow: any,
  parentSpan?: import("../lib/otel.js").Span,
  options?: { maxParallelNodes?: number },
): Promise<unknown> {
  const { nodes, edges } = workflowGraph(workflow);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);

  const trigger = nodes.find((node) =>
    [
      "trigger",
      "webhook",
      "cron",
      "cronTrigger",
      "cron_trigger",
      "manual",
      "http",
      "httpRequest",
      "chatTrigger",
      "chat_trigger",
      "formTrigger",
      "form_trigger",
      "errorTrigger",
      "error_trigger",
      "slackTrigger",
      "slack_trigger",
      "telegramTrigger",
      "telegram_trigger",
      "evaluationTrigger",
      "gmailTrigger",
      "emailReadImap",
      "executeWorkflowTrigger",
    ].includes(node.type),
  );
  if (!trigger) throw new Error("Workflow has no trigger node");
  const triggerNode = trigger;

  const reachable = new Set<string>();
  const discover = [triggerNode.id];
  while (discover.length) {
    const nodeId = discover.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) discover.push(edge.target);
  }

  const remainingIncoming = new Map<string, number>();
  for (const nodeId of reachable) {
    if (nodeId === triggerNode.id) continue;
    remainingIncoming.set(nodeId, edges.filter((edge) => edge.target === nodeId && reachable.has(edge.source)).length);
  }

  // Pre-calculate deterministic edge branch index mapping per target node
  const edgeBranchIndexMap = new Map<WorkflowEdge, number>();
  const parseHandleIndex = (handle?: string): number | null => {
    if (!handle) return null;
    const match = handle.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  };

  for (const targetId of reachable) {
    if (targetId === triggerNode.id) continue;
    const incoming = edges.filter((e) => e.target === targetId && reachable.has(e.source));
    if (incoming.length === 0) continue;

    const hasTargetHandle = incoming.some(
      (e) => e.targetHandle !== undefined && e.targetHandle.trim() !== "",
    );

    const sorted = [...incoming].sort((a, b) => {
      if (hasTargetHandle) {
        const hA = a.targetHandle;
        const hB = b.targetHandle;
        if (hA !== undefined && hB !== undefined) {
          const numA = parseHandleIndex(hA);
          const numB = parseHandleIndex(hB);
          if (numA !== null && numB !== null) {
            if (numA !== numB) return numA - numB;
          } else if (numA !== null) {
            return -1;
          } else if (numB !== null) {
            return 1;
          } else {
            const comp = hA.localeCompare(hB);
            if (comp !== 0) return comp;
          }
        } else if (hA !== undefined) {
          return -1;
        } else if (hB !== undefined) {
          return 1;
        }
      }
      return edges.indexOf(a) - edges.indexOf(b);
    });

    let currentBranch = 0;
    for (let i = 0; i < sorted.length; i++) {
      const edge = sorted[i];
      if (i > 0 && hasTargetHandle) {
        const prev = sorted[i - 1];
        if (edge.targetHandle && prev.targetHandle && edge.targetHandle === prev.targetHandle) {
          edgeBranchIndexMap.set(edge, edgeBranchIndexMap.get(prev)!);
          continue;
        }
      }
      edgeBranchIndexMap.set(edge, currentBranch++);
    }
  }

  const configuredConcurrency = Number(
    options?.maxParallelNodes ??
    (workflow as any)?.settings?.maxParallelNodes ??
    (workflow as any)?.settings?.maxConcurrency ??
    (workflow as any)?.maxParallelNodes ??
    process.env.EXECUTOR_MAX_PARALLEL_NODES ??
    8,
  );
  const maxConcurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.floor(configuredConcurrency)
    : 8;
  const pool = createConcurrencyPool(maxConcurrency);

  const readyQueue: string[] = [trigger.id];
  const queued = new Set<string>(readyQueue);
  const processed = new Set<string>();
  const active = new Set<string>([trigger.id]);
  const activeIncoming = new Map<string, number>();
  const incomingInputs = new Map<string, unknown[]>();
  const incomingBranchInputs = new Map<string, Map<number, unknown[]>>();
  let finalOutput: unknown = execution.input;
  let returnedOutput = false;

  const pastNodeExecutions = await prisma.nodeExecution.findMany({
    where: {
      executionId: execution.id,
      status: "SUCCESS",
    },
    orderBy: { startedAt: "asc" },
  });

  const successfulNodeExecutions = new Map<string, { output: unknown; id: string }>();
  for (const ne of pastNodeExecutions) {
    if (!successfulNodeExecutions.has(ne.nodeId)) {
      successfulNodeExecutions.set(ne.nodeId, { output: ne.output, id: ne.id });
    }
  }

  let fatalError: Error | null = null;
  let suspendedResult: any = null;
  let inFlight = 0;

  async function executeSingleNode(nodeId: string): Promise<void> {
    const current = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
    if (current?.status === "CANCELLED") {
      throw new Error("Execution cancelled");
    }

    const node = nodeById.get(nodeId)!;

    const values = incomingInputs.get(nodeId) ?? [];
    const branchMap = incomingBranchInputs.get(nodeId);
    let inputBranches: NodeItem[][] | undefined;

    if (branchMap && branchMap.size > 0) {
      const sortedBranchIndices = Array.from(branchMap.keys()).sort((a, b) => a - b);
      const maxBranchIdx = sortedBranchIndices.length > 0 ? Math.max(...sortedBranchIndices) : -1;
      if (maxBranchIdx >= 0) {
        inputBranches = [];
        for (let b = 0; b <= maxBranchIdx; b++) {
          const rawBranchItems = branchMap.get(b) ?? [];
          const branchItems: NodeItem[] = rawBranchItems.flatMap((val) => wrapItems(val));
          inputBranches.push(branchItems);
        }
      }
    }

    let nodeInput: unknown;
    if (nodeId === triggerNode.id) {
      nodeInput = wrapItems(execution.input);
    } else if (node.type === "merge") {
      nodeInput = inputBranches ?? values.map((v) => wrapItems(v));
    } else if (values.length === 0) {
      nodeInput = wrapItems(execution.input ?? {});
    } else if (values.length === 1) {
      nodeInput = wrapItems(values[0]);
    } else {
      nodeInput = values.flatMap((v) => wrapItems(v));
    }

    // Reversibility Approval Line check (EXP-ESS-01)
    if (active.has(nodeId) && nodeRequiresApproval(node)) {
      const existingApprovals = await prisma.approval.findMany({
        where: { executionId: execution.id },
      });
      const approved = existingApprovals.some((a: any) => {
        const ctx = asObject(a.context);
        return (ctx.nodeId === nodeId || a.id === (node.config as any)?.approvalId) && a.status === "APPROVED";
      });

      if (!approved) {
        const rejected = existingApprovals.some((a: any) => {
          const ctx = asObject(a.context);
          return (ctx.nodeId === nodeId || a.id === (node.config as any)?.approvalId) && a.status === "REJECTED";
        });
        if (rejected) {
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: { status: "CANCELLED", error: "Approval was rejected by user" },
          });
          throw new Error("Execution cancelled: Approval was rejected");
        }

        let pendingApproval = existingApprovals.find((a: any) => {
          const ctx = asObject(a.context);
          return ctx.nodeId === nodeId && a.status === "PENDING";
        });

        const config = asObject(node.config);
        const parameters = asObject(config.parameters);
        const timeoutHours = Number(
          config.approvalTimeoutHours ??
          parameters.approvalTimeoutHours ??
          config.timeoutHours ??
          parameters.timeoutHours ??
          24,
        );
        const timeoutMs = (Number.isFinite(timeoutHours) && timeoutHours > 0 ? timeoutHours : 24) * 3600 * 1000;
        const expiresAt = new Date(Date.now() + timeoutMs);

        // Check if existing pending approval has timed out
        if (pendingApproval) {
          const pCtx = asObject(pendingApproval.context);
          const pExpiresAt = pCtx.expiresAt ? new Date(pCtx.expiresAt).getTime() : null;
          if (pExpiresAt && pExpiresAt < Date.now()) {
            await prisma.approval.update({
              where: { id: pendingApproval.id },
              data: { status: "EXPIRED", decidedAt: new Date() },
            });
            await prisma.workflowExecution.update({
              where: { id: execution.id },
              data: { status: "CANCELLED", error: "Approval timed out after configured duration" },
            });
            void recordWorkflowAuditEvent({
              executionId: execution.id,
              nodeId,
              actor: "system",
              action: "approval.expired",
              decision: "CANCELLED",
              payload: {
                approvalId: pendingApproval.id,
                nodeId,
                timeoutHours,
                reason: "Approval timeout reached",
              },
            }).catch(() => {});
            throw new Error("Execution cancelled: Approval timed out");
          }
        }

        if (!pendingApproval) {
          const approvalId = `appr_${randomUUID().replace(/-/g, "")}`;
          pendingApproval = await prisma.approval.create({
            data: {
              id: approvalId,
              executionId: execution.id,
              userId: execution.userId || "system",
              status: "PENDING",
              message: String(config.title ?? parameters.title ?? node.label ?? node.name ?? `Approval required for ${node.type}`),
              context: {
                nodeId,
                nodeType: node.type,
                nodeLabel: node.label ?? node.name ?? nodeId,
                input: nodeInput,
                timeoutHours,
                expiresAt: expiresAt.toISOString(),
              },
            },
          });

          void recordWorkflowAuditEvent({
            executionId: execution.id,
            nodeId,
            actor: execution.userId ?? "system",
            action: "approval.pending",
            decision: "WAITING_APPROVAL",
            payload: {
              approvalId: pendingApproval.id,
              nodeId,
              nodeType: node.type,
              timeoutHours,
              expiresAt: expiresAt.toISOString(),
            },
          }).catch(() => {});
        }

        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { status: "WAITING_APPROVAL" },
        });

        void publishTelemetryEvent({
          executionId: execution.id,
          nodeId,
          eventType: "node_finished",
          status: "WAITING_APPROVAL",
        }).catch(() => {});

        suspendedResult = { _suspended: true, reason: "WAITING_APPROVAL", nodeId, approvalId: pendingApproval.id };
        readyQueue.length = 0;
        pool.clearQueue();
        return;
      }
    }

    // Real Execution Yield / Suspension for Wait & Delay Nodes (WF-ENG Item 4)
    if (active.has(nodeId) && isWaitNode(node.type)) {
      const config = (node.config ?? {}) as WaitNodeConfig;
      const mode = String(config.mode ?? "duration").toLowerCase();

      if (mode !== "inline" && config.suspend !== false) {
        const existingApprovals = await prisma.approval.findMany({
          where: { executionId: execution.id },
        });
        const alreadyApproved = existingApprovals.find((a: any) => {
          const ctx = asObject(a.context);
          return (ctx.nodeId === nodeId || a.id === (node.config as any)?.approvalId) && a.status === "APPROVED";
        });

        if (!alreadyApproved) {

        if (mode === "webhook" || mode === "callback") {
          let pendingWait = existingApprovals.find((a: any) => {
            const ctx = asObject(a.context);
            return ctx.nodeId === nodeId && a.status === "PENDING";
          });

          let resumeToken: string;
          if (pendingWait) {
            resumeToken = pendingWait.id;
          } else {
            resumeToken = randomUUID();
            pendingWait = await prisma.approval.create({
              data: {
                id: resumeToken,
                executionId: execution.id,
                userId: execution.userId || "system",
                status: "PENDING",
                message: `Workflow waiting on webhook callback for node ${node.id}`,
                context: {
                  nodeId,
                  nodeType: node.type,
                  mode: "webhook",
                  waitNode: true,
                  resumeToken,
                  resumeUrl: `/api/webhooks/resume/${resumeToken}`,
                  pausedAt: new Date().toISOString(),
                  input: nodeInput,
                },
              },
            });

            void recordWorkflowAuditEvent({
              executionId: execution.id,
              nodeId,
              actor: execution.userId ?? "system",
              action: "wait.suspended",
              decision: "WAITING",
              payload: {
                resumeToken,
                nodeId,
                mode: "webhook",
                resumeUrl: `/api/webhooks/resume/${resumeToken}`,
              },
            }).catch(() => {});
          }

          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: { status: "WAITING" as any },
          });

          void publishTelemetryEvent({
            executionId: execution.id,
            nodeId,
            eventType: "node_finished",
            status: "WAITING",
          }).catch(() => {});

          suspendedResult = { _suspended: true, reason: "WAITING", nodeId, resumeToken };
          readyQueue.length = 0;
          pool.clearQueue();
          return;
        } else {
          // Duration or fixedDate mode
          const waitMs = calculateWaitMs(config);
          const resumeAt = Date.now() + waitMs;

          let pendingWait = existingApprovals.find((a: any) => {
            const ctx = asObject(a.context);
            return ctx.nodeId === nodeId && a.status === "PENDING";
          });

          if (pendingWait) {
            const ctx = asObject(pendingWait.context);
            const targetResumeAt = typeof ctx.resumeAt === "number" ? ctx.resumeAt : new Date(String(ctx.resumeAt ?? 0)).getTime();
            if (Date.now() >= targetResumeAt) {
              await prisma.approval.update({
                where: { id: pendingWait.id },
                data: { status: "APPROVED", decidedAt: new Date() },
              });
              // Fall through to normal execution of this node
            } else {
              suspendedResult = { _suspended: true, reason: "WAITING", nodeId, waitId: pendingWait.id };
              readyQueue.length = 0;
              pool.clearQueue();
              return;
            }
          } else {
            const waitId = `wait_${randomUUID().replace(/-/g, "")}`;
            pendingWait = await prisma.approval.create({
              data: {
                id: waitId,
                executionId: execution.id,
                userId: execution.userId || "system",
                status: "PENDING",
                message: `Workflow waiting for ${waitMs}ms on node ${node.id}`,
                context: {
                  nodeId,
                  nodeType: node.type,
                  mode,
                  waitNode: true,
                  waitMs,
                  resumeAt,
                  pausedAt: new Date().toISOString(),
                  input: nodeInput,
                },
              },
            });

            void recordWorkflowAuditEvent({
              executionId: execution.id,
              nodeId,
              actor: execution.userId ?? "system",
              action: "wait.suspended",
              decision: "WAITING",
              payload: {
                waitId: pendingWait.id,
                nodeId,
                mode,
                waitMs,
                resumeAt: new Date(resumeAt).toISOString(),
              },
            }).catch(() => {});

            await prisma.workflowExecution.update({
              where: { id: execution.id },
              data: { status: "WAITING" as any },
            });

            void publishTelemetryEvent({
              executionId: execution.id,
              nodeId,
              eventType: "node_finished",
              status: "WAITING",
            }).catch(() => {});

            // Schedule BullMQ delayed job
            const enqueued = await enqueueExecution(
              execution.id,
              { resumeNodeId: nodeId, waitId: pendingWait.id },
              { delay: waitMs, jobId: `resume-${execution.id}-${nodeId}-${Date.now()}` }
            );

            // In test / offline environments where BullMQ queue is disabled, schedule timer fallback
            if (!enqueued && waitMs >= 0) {
              const timer = setTimeout(async () => {
                try {
                  const currentApp = await prisma.approval.findUnique({
                    where: { id: pendingWait!.id },
                  });
                  if (!currentApp || currentApp.status !== "PENDING") {
                    return;
                  }
                  await prisma.approval.update({
                    where: { id: pendingWait!.id },
                    data: { status: "APPROVED", decidedAt: new Date() },
                  });
                  await prisma.workflowExecution.update({
                    where: { id: execution.id },
                    data: { status: "RUNNING" as any },
                  });
                  await runExecution(execution.id);
                } catch (err) {
                  console.error("Error in fallback wait resume timer", err);
                }
              }, Math.min(waitMs, 2147483647));
              if (typeof timer.unref === "function") {
                timer.unref();
              }
            }

            suspendedResult = { _suspended: true, reason: "WAITING", nodeId, waitId: pendingWait.id, waitMs };
            readyQueue.length = 0;
            pool.clearQueue();
            return;
          }
        }
      }
    }
    }

    processed.add(nodeId);
    const nodeExecution = await prisma.nodeExecution.create({
      data: {
        nodeId,
        executionId: execution.id,
        status: "RUNNING",
        input: nodeInput === undefined ? null : nodeInput,
        startedAt: new Date(),
      },
    });
    const nodeStartedAt = Date.now();
    void publishTelemetryEvent({
      executionId: execution.id,
      nodeId,
      eventType: "node_started",
      status: "RUNNING",
    }).catch(() => {});
    const itemsCount = Array.isArray(nodeInput) ? nodeInput.length : nodeInput !== undefined && nodeInput !== null ? 1 : 0;
    const parentContext = parentSpan
      ? { traceId: parentSpan.traceId, spanId: parentSpan.spanId, traceFlags: "01" }
      : undefined;

    const nodeSpan = telemetry.startNodeSpan(
      node.type,
      node.id,
      workflow.id,
      execution.id,
      execution.orgId,
      { "items.count": itemsCount },
      parentContext,
    );

    if (!active.has(nodeId)) {
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "CANCELLED", finishedAt: new Date(), duration: Date.now() - nodeStartedAt },
      });
      void publishTelemetryEvent({
        executionId: execution.id,
        nodeId,
        eventType: "node_finished",
        status: "CANCELLED",
        duration: Date.now() - nodeStartedAt,
      }).catch(() => {});
      nodeSpan.setAttribute("node.status", "CANCELLED");
      nodeSpan.setStatus("OK");
      nodeSpan.end();

      for (const edge of outgoing.get(nodeId) ?? []) {
        const target = edge.target;
        remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
        if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
          queued.add(target);
          if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
          readyQueue.push(target);
        }
      }
      return;
    }

    try {
      const output = await executeNodeWithRetry(
        node,
        nodeInput,
        execution.orgId,
        execution.id,
        nodeExecution.id,
        workflow.id,
        inputBranches,
        nodeSpan,
      );
      const nodeDuration = Date.now() - nodeStartedAt;
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: {
          status: "SUCCESS",
          output: output === undefined ? null : output,
          finishedAt: new Date(),
          duration: nodeDuration,
        },
      });
      void publishTelemetryEvent({
        executionId: execution.id,
        nodeId,
        eventType: "node_finished",
        status: "SUCCESS",
        duration: nodeDuration,
        output,
      }).catch(() => {});
      void recordWorkflowAuditEvent({
        executionId: execution.id,
        nodeId,
        actor: execution.userId ?? "system",
        action: "node.decision",
        decision:
          node.type === "condition"
            ? String(unpackConditionResult(output))
            : output && typeof output === "object" && (output as any).decision
              ? String((output as any).decision)
              : "COMPLETED",
        payload: {
          nodeType: node.type,
          duration: nodeDuration,
          output: output === undefined ? null : output,
        },
      }).catch(() => {});
      nodeSpan.setAttribute("node.status", "SUCCESS");
      nodeSpan.setAttribute("node.duration_ms", nodeDuration);
      nodeSpan.setStatus("OK");
      nodeSpan.end();

      finalOutput = output;
      if (node.type === "output") {
        returnedOutput = true;
        readyQueue.length = 0;
        pool.clearQueue();
        return;
      }

      for (const edge of outgoing.get(nodeId) ?? []) {
        const target = edge.target;
        const follows = followsEdge(node, edge, output);
        remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
        if (follows) {
          activeIncoming.set(target, (activeIncoming.get(target) ?? 0) + 1);
          incomingInputs.set(target, [...(incomingInputs.get(target) ?? []), output]);

          const branchIdx = edgeBranchIndexMap.get(edge) ?? 0;
          let targetBranches = incomingBranchInputs.get(target);
          if (!targetBranches) {
            targetBranches = new Map<number, unknown[]>();
            incomingBranchInputs.set(target, targetBranches);
          }
          const existingBranchItems = targetBranches.get(branchIdx) ?? [];
          targetBranches.set(branchIdx, [...existingBranchItems, output]);
        }
        if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
          queued.add(target);
          if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
          readyQueue.push(target);
        }
      }
    } catch (error) {
      const nodeDuration = Date.now() - nodeStartedAt;
      const onError = String(node.config?.onError ?? node.config?.errorPolicy ?? "stop").toLowerCase();

      if (onError === "continueregularoutput" || onError === "continue" || onError === "ignore") {
        const fallbackOutput = { error: errorMessage(error), _failed: true };
        await prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "SUCCESS", output: fallbackOutput, finishedAt: new Date(), duration: nodeDuration },
        });
        void publishTelemetryEvent({
          executionId: execution.id,
          nodeId,
          eventType: "node_finished",
          status: "SUCCESS",
          duration: nodeDuration,
          output: fallbackOutput,
        }).catch(() => {});
        nodeSpan.setAttribute("node.status", "HANDLED_ERROR");
        nodeSpan.setStatus("OK");
        nodeSpan.end();

        finalOutput = fallbackOutput;
        for (const edge of outgoing.get(nodeId) ?? []) {
          const target = edge.target;
          const isErrorEdge = (edge.sourceHandle ?? edge.label ?? "").toLowerCase() === "error";
          if (!isErrorEdge) {
            remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
            activeIncoming.set(target, (activeIncoming.get(target) ?? 0) + 1);
            incomingInputs.set(target, [...(incomingInputs.get(target) ?? []), fallbackOutput]);

            const branchIdx = edgeBranchIndexMap.get(edge) ?? 0;
            let targetBranches = incomingBranchInputs.get(target);
            if (!targetBranches) {
              targetBranches = new Map<number, unknown[]>();
              incomingBranchInputs.set(target, targetBranches);
            }
            const existingBranchItems = targetBranches.get(branchIdx) ?? [];
            targetBranches.set(branchIdx, [...existingBranchItems, fallbackOutput]);

            if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
              queued.add(target);
              if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
              readyQueue.push(target);
            }
          }
        }
        return;
      }

      if (onError === "routetoerrorbranch" || onError === "errorbranch") {
        const errorOutput = {
          errorMessage: errorMessage(error),
          errorCode: "NODE_ERROR",
          failedNodeId: node.id,
          failedNodeType: node.type,
          inputData: nodeInput,
          timestamp: new Date().toISOString(),
        };
        await prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "SUCCESS", output: errorOutput, finishedAt: new Date(), duration: nodeDuration },
        });
        void publishTelemetryEvent({
          executionId: execution.id,
          nodeId,
          eventType: "node_finished",
          status: "SUCCESS",
          duration: nodeDuration,
          output: errorOutput,
        }).catch(() => {});
        nodeSpan.setAttribute("node.status", "HANDLED_ERROR");
        nodeSpan.setStatus("OK");
        nodeSpan.end();

        finalOutput = errorOutput;
        for (const edge of outgoing.get(nodeId) ?? []) {
          const target = edge.target;
          const isErrorEdge = (edge.sourceHandle ?? edge.label ?? "").toLowerCase() === "error";
          remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
          if (isErrorEdge) {
            activeIncoming.set(target, (activeIncoming.get(target) ?? 0) + 1);
            incomingInputs.set(target, [...(incomingInputs.get(target) ?? []), errorOutput]);

            const branchIdx = edgeBranchIndexMap.get(edge) ?? 0;
            let targetBranches = incomingBranchInputs.get(target);
            if (!targetBranches) {
              targetBranches = new Map<number, unknown[]>();
              incomingBranchInputs.set(target, targetBranches);
            }
            const existingBranchItems = targetBranches.get(branchIdx) ?? [];
            targetBranches.set(branchIdx, [...existingBranchItems, errorOutput]);
          }
          if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
            queued.add(target);
            if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
            readyQueue.push(target);
          }
        }
        return;
      }

      // Check if workflow has an errorTrigger node
      const errorTriggerNode = nodes.find((n) => ["errorTrigger", "error_trigger"].includes(n.type) && n.id !== node.id);
      if (errorTriggerNode && !processed.has(errorTriggerNode.id)) {
        await prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "FAILED", error: errorMessage(error), finishedAt: new Date(), duration: nodeDuration },
        });
        void publishTelemetryEvent({
          executionId: execution.id,
          nodeId,
          eventType: "node_finished",
          status: "FAILED",
          duration: nodeDuration,
          error: errorMessage(error),
        }).catch(() => {});
        nodeSpan.setAttribute("node.status", "FAILED");
        nodeSpan.recordException(error);
        nodeSpan.setStatus("ERROR", errorMessage(error));
        nodeSpan.end();

        const errorPayload = {
          errorMessage: errorMessage(error),
          errorCode: "NODE_EXECUTION_FAILED",
          failedNodeId: node.id,
          failedNodeType: node.type,
          executionId: execution.id,
          workflowId: workflow.id,
          timestamp: new Date().toISOString(),
          inputData: nodeInput,
        };

        queued.add(errorTriggerNode.id);
        active.add(errorTriggerNode.id);
        readyQueue.length = 0;
        pool.clearQueue();
        readyQueue.push(errorTriggerNode.id);
        incomingInputs.set(errorTriggerNode.id, [errorPayload]);
        return;
      }

      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "FAILED", error: errorMessage(error), finishedAt: new Date(), duration: nodeDuration },
      });
      void publishTelemetryEvent({
        executionId: execution.id,
        nodeId,
        eventType: "node_finished",
        status: "FAILED",
        duration: nodeDuration,
        error: errorMessage(error),
      }).catch(() => {});
      nodeSpan.setAttribute("node.status", "FAILED");
      nodeSpan.setAttribute("node.duration_ms", nodeDuration);
      nodeSpan.recordException(error);
      nodeSpan.setStatus("ERROR", errorMessage(error));
      nodeSpan.end();
      void recordWorkflowAuditEvent({
        executionId: execution.id,
        nodeId,
        actor: execution.userId ?? "system",
        action: "node.error",
        decision: "FAILED",
        payload: {
          nodeType: node.type,
          duration: nodeDuration,
          error: errorMessage(error),
        },
      }).catch(() => {});

      if (!fatalError) {
        fatalError = error instanceof Error ? error : new Error(String(error));
        readyQueue.length = 0;
        pool.clearQueue(fatalError);
      }
      throw error;
    }
  }

  // Reactive work-stealing dispatcher
  await new Promise<void>((resolve, reject) => {
    let isDone = false;

    const checkCompletion = () => {
      if (isDone) return;
      if (inFlight > 0) return;

      if (fatalError) {
        isDone = true;
        reject(fatalError);
        return;
      }
      if (suspendedResult || returnedOutput || readyQueue.length === 0) {
        isDone = true;
        resolve();
        return;
      }
    };

    const scheduleNext = () => {
      if (isDone || fatalError || suspendedResult || returnedOutput) {
        checkCompletion();
        return;
      }

      while (
        readyQueue.length > 0 &&
        pool.activeCount < pool.concurrency &&
        !isDone &&
        !fatalError &&
        !suspendedResult &&
        !returnedOutput
      ) {
        const nodeId = readyQueue.shift()!;
        if (processed.has(nodeId)) continue;

        // Checkpoint restoration: replay in-memory if already successfully executed
        if (successfulNodeExecutions.has(nodeId)) {
          const existing = successfulNodeExecutions.get(nodeId)!;
          processed.add(nodeId);
          finalOutput = existing.output;
          const node = nodeById.get(nodeId)!;
          if (node?.type === "output") {
            returnedOutput = true;
            readyQueue.length = 0;
            pool.clearQueue();
            checkCompletion();
            return;
          }
          for (const edge of outgoing.get(nodeId) ?? []) {
            const target = edge.target;
            const follows = followsEdge(node, edge, existing.output);
            remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
            if (follows) {
              activeIncoming.set(target, (activeIncoming.get(target) ?? 0) + 1);
              incomingInputs.set(target, [...(incomingInputs.get(target) ?? []), existing.output]);
              const branchIndex = edgeBranchIndexMap.get(edge) ?? 0;
              const branchMap = incomingBranchInputs.get(target) ?? new Map<number, unknown[]>();
              const existingBranchItems = branchMap.get(branchIndex) ?? [];
              branchMap.set(branchIndex, [...existingBranchItems, existing.output]);
              incomingBranchInputs.set(target, branchMap);
            }
            if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
              queued.add(target);
              if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
              readyQueue.push(target);
            }
          }
          continue;
        }

        inFlight++;
        void pool.run(async () => {
          try {
            await executeSingleNode(nodeId);
          } catch (err: any) {
            if (!fatalError) {
              fatalError = err instanceof Error ? err : new Error(String(err));
              readyQueue.length = 0;
              pool.clearQueue(fatalError);
            }
          } finally {
            inFlight--;
            scheduleNext();
          }
        });
      }

      checkCompletion();
    };

    // Kick off dispatcher
    scheduleNext();
  });

  if (suspendedResult) {
    return suspendedResult;
  }

  if (!returnedOutput && processed.size !== reachable.size) {
    throw new Error("Workflow graph contains a cycle or an unreachable branch");
  }

  return finalOutput;
}

export async function createWorkflowExecution(
  workflowId: string,
  input?: unknown,
  options: { userId?: string; trigger?: string; parentExecutionId?: string } = {},
): Promise<ExecutionResult> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId },
    include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!workflow) throw new Error("Workflow not found");
  if (getEnv().EXEC_CODE_DISABLED && containsCodeNode(workflow)) throw new CodeExecutionDisabledError();
  const created = (await prisma.workflowExecution.create({
    data: {
      workflowId,
      orgId: workflow.orgId,
      userId: options.userId ?? workflow.ownerId ?? undefined,
      status: "PENDING",
      trigger: options.trigger ?? "api",
      input: input === undefined ? null : input,
      startedAt: new Date(),
    },
  })) as ExecutionResult;
  await recordExecutionAudit(created as any, "execution.created", {
    status: "PENDING",
    ...(options.parentExecutionId ? { parentExecutionId: options.parentExecutionId } : {}),
  });
  return created;
}

export async function runExecution(
  executionId: string,
  options: {
    parentContext?: import("../lib/otel.js").TraceContext | null;
    traceparent?: string;
    parentExecutionId?: string;
  } = {}
): Promise<ExecutionResult> {
  const execution = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error("Execution not found");
  if (["SUCCESS", "FAILED", "CANCELLED"].includes(execution.status)) return execution as ExecutionResult;

  const workflow = await prisma.workflow.findFirst({
    where: { id: execution.workflowId },
    include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!workflow) {
    const failed = await updateExecution(executionId, { status: "FAILED", error: "Workflow not found", finishedAt: new Date() });
    await recordExecutionAudit(failed as any, "execution.failed", { status: "FAILED", reason: "workflow_not_found" });
    return failed;
  }

  const parentContext = options.parentContext || telemetry.parseTraceParent(options.traceparent);
  const wfSpan = telemetry.startSpan(`workflow.execution ${workflow.name || workflow.id}`, {
    "workflow.id": workflow.id,
    "workflow.name": workflow.name,
    "execution.id": executionId,
    "execution.trigger": execution.trigger,
    "org.id": execution.orgId,
  }, parentContext);
  telemetry.incActiveExecutions();

  const startedAt = new Date(execution.startedAt ?? Date.now());
  await updateExecution(executionId, { status: "RUNNING" });
  await recordExecutionAudit(execution, "execution.started", { status: "RUNNING" });
  void publishTelemetryEvent({
    executionId,
    eventType: "execution_started",
    status: "RUNNING",
  }).catch(() => {});
  try {
    const output = await withTimeout(executeGraph(execution, workflow, wfSpan), EXECUTION_TIMEOUT_MS, "Execution timed out");
    if (output && typeof output === "object" && (output as any)._suspended === true) {
      const suspendedReason = (output as any).reason || "WAITING";
      wfSpan.setAttribute("execution.status", suspendedReason);
      wfSpan.setStatus("OK");
      wfSpan.end();
      telemetry.decActiveExecutions();
      const waiting = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
      return waiting as ExecutionResult;
    }
    const duration = Date.now() - startedAt.getTime();
    wfSpan.setAttribute("execution.status", "SUCCESS");
    wfSpan.setAttribute("execution.duration_ms", duration);
    wfSpan.setStatus("OK");
    wfSpan.end();
    telemetry.decActiveExecutions();
    telemetry.recordWorkflowExecution("SUCCESS", execution.trigger, execution.orgId, duration);

    // Record usage metering events (TASK-12)
    if (execution.orgId) {
      void recordUsageEvent({
        orgId: execution.orgId,
        userId: execution.userId ?? undefined,
        workflowId: workflow.id,
        executionId,
        metricType: "execution_count",
        value: 1,
      }).catch(() => {});

      void recordUsageEvent({
        orgId: execution.orgId,
        userId: execution.userId ?? undefined,
        workflowId: workflow.id,
        executionId,
        metricType: "execution_duration_ms",
        value: duration,
      }).catch(() => {});
    }

    const unwrappedOutput =
      Array.isArray(output) && output.every(isNodeItem)
        ? unwrapItems(output as NodeItem[], { singleObjectIfOne: true, preserveBinary: false })
        : output;

    const completed = await updateExecution(executionId, {
      status: "SUCCESS",
      output: unwrappedOutput === undefined ? null : unwrappedOutput,
      finishedAt: new Date(),
      duration,
    });
    await recordExecutionAudit(completed as any, "execution.succeeded", { status: "SUCCESS", duration });
    void publishTelemetryEvent({
      executionId,
      eventType: "execution_finished",
      status: "SUCCESS",
      duration,
      output: unwrappedOutput,
    }).catch(() => {});
    return completed;
  } catch (error) {
    const duration = Date.now() - startedAt.getTime();
    const current = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
    if (current?.status === "CANCELLED") {
      wfSpan.setAttribute("execution.status", "CANCELLED");
      wfSpan.setStatus("OK");
      wfSpan.end();
      telemetry.decActiveExecutions();
      telemetry.recordWorkflowExecution("CANCELLED", execution.trigger, execution.orgId, duration);
      await recordExecutionAudit(current as any, "execution.cancelled", { status: "CANCELLED", duration });
      void publishTelemetryEvent({
        executionId,
        eventType: "execution_finished",
        status: "CANCELLED",
        duration,
      }).catch(() => {});
      return current as ExecutionResult;
    }
    wfSpan.setAttribute("execution.status", "FAILED");
    wfSpan.setAttribute("execution.duration_ms", duration);
    wfSpan.recordException(error);
    wfSpan.setStatus("ERROR", errorMessage(error));
    wfSpan.end();
    telemetry.decActiveExecutions();
    telemetry.recordWorkflowExecution("FAILED", execution.trigger, execution.orgId, duration);

    // Record usage metering events for failed execution (TASK-12)
    if (execution.orgId) {
      void recordUsageEvent({
        orgId: execution.orgId,
        userId: execution.userId ?? undefined,
        workflowId: workflow.id,
        executionId,
        metricType: "execution_count",
        value: 1,
      }).catch(() => {});

      void recordUsageEvent({
        orgId: execution.orgId,
        userId: execution.userId ?? undefined,
        workflowId: workflow.id,
        executionId,
        metricType: "execution_duration_ms",
        value: duration,
      }).catch(() => {});
    }

    const failedExecution = await updateExecution(executionId, {
      status: "FAILED",
      error: errorMessage(error),
      finishedAt: new Date(),
      duration,
    });
    await recordExecutionAudit(failedExecution as any, "execution.failed", { status: "FAILED", duration });
    void publishTelemetryEvent({
      executionId,
      eventType: "execution_finished",
      status: "FAILED",
      duration,
      error: errorMessage(error),
    }).catch(() => {});

    // Trigger errorWorkflow if configured in settings or version snapshot
    try {
      // Recursion guard: never trigger error workflow if this execution was already triggered as an error handler
      if (execution.trigger !== "error") {
        const version = Array.isArray(workflow.versions) ? workflow.versions[0] : undefined;
        const snapshot = asObject(parseJson(version?.snapshot, {}));
        const rawSettings = (workflow as any).settings ?? snapshot.settings;
        const settings = asObject(parseJson(rawSettings, {}));
        const errorWorkflowId = (settings.errorWorkflowId ?? settings.errorWorkflow ?? (workflow as any).errorWorkflowId ?? (workflow as any).errorWorkflow) as string | undefined;

        if (errorWorkflowId && typeof errorWorkflowId === "string" && errorWorkflowId !== workflow.id) {
          const errWf = await prisma.workflow.findFirst({
            where: { id: errorWorkflowId, ...(workflow.orgId ? { orgId: workflow.orgId } : {}) },
          });
          if (errWf) {
            const failedNodeExec = await prisma.nodeExecution.findFirst({
              where: { executionId, status: "FAILED" },
              orderBy: { startedAt: "desc" },
            });
            const failedNode = failedNodeExec ? workflow.nodes.find((n: any) => n.id === failedNodeExec.nodeId) : undefined;

            const errPayload = {
              errorMessage: errorMessage(error),
              errorCode: "WORKFLOW_EXECUTION_FAILED",
              failedNodeId: failedNodeExec?.nodeId ?? "unknown_node",
              failedNodeType: failedNode?.type ?? "unknown_type",
              workflowId: workflow.id,
              workflowName: workflow.name,
              executionId,
              inputData: failedNodeExec?.input ?? execution.input,
              stack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString(),
              error: {
                message: errorMessage(error),
                workflowId: workflow.id,
                workflowName: workflow.name,
                executionId,
                failedNodeId: failedNodeExec?.nodeId,
                failedNodeType: failedNode?.type,
                stack: error instanceof Error ? error.stack : undefined,
                inputData: failedNodeExec?.input ?? execution.input,
                timestamp: new Date().toISOString(),
              },
              execution: failedExecution,
            };

            const errExecution = await createWorkflowExecution(errWf.id, errPayload, { userId: execution.userId, trigger: "error" });

            const { enqueueExecution } = await import("./queue.js");
            const enqueued = await enqueueExecution(errExecution.id);
            if (!enqueued) {
              void runExecution(errExecution.id).catch((e) => console.error("[errorWorkflow] Async run error:", e));
            }
          }
        }
      }
    } catch (errWfError) {
      console.error("[errorWorkflow] Failed to trigger error workflow:", errWfError);
    }

    return failedExecution;
  }
}

export async function executeWorkflow(workflowId: string, input?: unknown, trigger = "api"): Promise<ExecutionResult> {
  const execution = await createWorkflowExecution(workflowId, input, { trigger });
  return runExecution(execution.id);
}
