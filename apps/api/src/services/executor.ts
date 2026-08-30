import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { decryptCredential } from "../lib/crypto.js";
import { telemetry } from "../lib/otel.js";
import { httpCircuitBreaker } from "../lib/circuit-breaker.js";
import { applyHttpAuthentication, type HttpAuthConfig } from "../lib/http-auth.js";
import { ensureFreshOAuth2Token } from "./vault/oauth-refresh.js";
import { recordUsageEvent } from "./metering.js";
import { recordAuditEvent } from "./audit-ledger.js";

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
import { ErrorTriggerNodeHandler } from "./nodes/error-trigger.js";
import { WaitNodeHandler } from "./nodes/wait.js";
import { MergeNodeHandler } from "./nodes/merge.js";
import { FormNodeHandler } from "./nodes/form.js";
import {
  wrapItems,
  unwrapItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  extractFieldByPath,
  setFieldByPath,
  type NodeItem,
} from "./nodes/types.js";

export {
  wrapItems,
  unwrapItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  extractFieldByPath,
  setFieldByPath,
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
};

type WorkflowEdge = {
  source: string;
  target: string;
  sourceHandle?: string;
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
      source: String(source),
      target: String(target),
      sourceHandle: edge.sourceHandle === undefined ? undefined : String(edge.sourceHandle),
      label: edge.label === undefined ? undefined : String(edge.label),
      condition: parseJson(edge.condition),
    };
  });
}

function getField(input: unknown, field: string): unknown {
  if (!field) return input;
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

function followsConditionEdge(edge: WorkflowEdge, output: unknown): boolean {
  const result = Boolean(output);
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

async function executeHttp(config: JsonObject, input: unknown, orgId: string): Promise<unknown> {
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

  const configuredBody = config.body;
  const bodyValue = configuredBody === undefined && method !== "GET" && method !== "HEAD" ? input : configuredBody;
  const body = bodyValue === undefined ? undefined : typeof bodyValue === "string" ? bodyValue : JSON.stringify(bodyValue);
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  // W3C Trace Context propagation for distributed tracing (TASK-10)
  telemetry.injectTraceContext(headers);

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

async function executeNode(node: WorkflowNode, input: unknown, orgId: string): Promise<unknown> {
  switch (node.type) {
    case "trigger":
    case "webhook":
    case "cron":
    case "manual":
      return input;
    case "ai":
    case "ai_agent":
      return executeAi(node.config, input);
    case "condition":
      return evaluateCondition(input, node.config);
    case "http":
    case "httpRequest":
      return executeHttp(node.config, input, orgId);
    case "code": {
      const handler = new CodeNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "transform":
      if (getEnv().EXEC_CODE_DISABLED) throw new CodeExecutionDisabledError();
      throw new Error(
        "Code/transform nodes are unsupported because user-supplied code execution is disabled for security."
      );
    case "output":
      return input;
    case "delay": {
      const duration = Number(node.config.duration ?? 0);
      const unit = String(node.config.unit ?? "seconds").toLowerCase();
      const multiplier = unit.startsWith("minute") ? 60_000 : unit.startsWith("hour") ? 3_600_000 : 1_000;
      const waitMs = Math.min(Math.max(duration * multiplier, 0), NODE_TIMEOUT_MS);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return input;
    }
    case "merge": {
      const handler = new MergeNodeHandler();
      const res = await handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
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
      // Safely spread fields onto input
      const fields = node.config as Record<string, unknown>;
      if (typeof input !== "object" || input === null) return { ...(input as object), ...fields };
      return { ...input, ...fields } as Record<string, unknown>;
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
    case "googleDrive": {
      const params = node.config.parameters as Record<string, unknown> | undefined;
      return {
        ...asObject(input),
        _action: "googleDrive",
        _config: { resource: params?.resource, operation: params?.operation, name: params?.name },
      };
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
      const params = node.config.parameters as Record<string, unknown> | undefined;
      return {
        ...asObject(input),
        _action: "gmail",
        _config: { operation: params?.operation },
      };
    }
    case "switch": {
      const handler = new SwitchNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "splitInBatches":
    case "split_in_batches": {
      const handler = new SplitInBatchesNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "chatTrigger":
    case "chat_trigger": {
      const handler = new ChatTriggerNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "mcpClient":
    case "mcp_client": {
      const handler = new McpClientNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "teams": {
      const handler = new TeamsNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "whatsapp":
    case "whatsappTrigger": {
      const handler = new WhatsAppNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "googleCalendar":
    case "google_calendar": {
      const handler = new GoogleCalendarNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "googleDocs":
    case "google_docs": {
      const handler = new GoogleDocsNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "errorTrigger":
    case "error_trigger": {
      const handler = new ErrorTriggerNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "wait": {
      const handler = new WaitNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
    }
    case "form":
    case "formTrigger":
    case "form_trigger": {
      const handler = new FormNodeHandler();
      return handler.execute({
        executionId: "",
        nodeId: node.id,
        workflowId: "",
        orgId,
        nodeConfig: node.config as Record<string, unknown>,
        input,
      });
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

function workflowGraph(workflow: any): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const version = Array.isArray(workflow.versions) ? workflow.versions[0] : undefined;
  const snapshot = asObject(parseJson(version?.snapshot, {}));
  const relationNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const relationEdges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const rawNodes = relationNodes.length > 0 ? relationNodes : snapshot.nodes ?? [];
  const rawEdges = relationEdges.length > 0 ? relationEdges : snapshot.edges ?? [];
  const nodes = normalizeNodes(rawNodes);
  const edges = normalizeEdges(rawEdges);
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

async function executeGraph(execution: any, workflow: any, parentSpan?: import("../lib/otel.js").Span): Promise<unknown> {
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
    ].includes(node.type),
  );
  if (!trigger) throw new Error("Workflow has no trigger node");

  const reachable = new Set<string>();
  const discover = [trigger.id];
  while (discover.length) {
    const nodeId = discover.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) discover.push(edge.target);
  }

  const remainingIncoming = new Map<string, number>();
  for (const nodeId of reachable) {
    if (nodeId === trigger.id) continue;
    remainingIncoming.set(nodeId, edges.filter((edge) => edge.target === nodeId && reachable.has(edge.source)).length);
  }

  const queue = [trigger.id];
  const queued = new Set(queue);
  const processed = new Set<string>();
  const active = new Set([trigger.id]);
  const activeIncoming = new Map<string, number>();
  const incomingInputs = new Map<string, unknown[]>();
  let finalOutput: unknown = execution.input;
  let returnedOutput = false;

  while (queue.length) {
    const current = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
    if (current?.status === "CANCELLED") throw new Error("Execution cancelled");

    const nodeId = queue.shift()!;
    if (processed.has(nodeId)) continue;
    processed.add(nodeId);
    const node = nodeById.get(nodeId)!;
    const values = incomingInputs.get(nodeId) ?? [];
    const nodeInput = nodeId === trigger.id ? execution.input : values.length === 1 ? values[0] : values;
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
      parentContext
    );

    if (!active.has(nodeId)) {
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "CANCELLED", finishedAt: new Date(), duration: Date.now() - nodeStartedAt },
      });
      nodeSpan.setAttribute("node.status", "CANCELLED");
      nodeSpan.setStatus("OK");
      nodeSpan.end();
      continue;
    }

    try {
      const output = await withTimeout(executeNode(node, nodeInput, execution.orgId), NODE_TIMEOUT_MS, "Node execution timed out");
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
      nodeSpan.setAttribute("node.status", "SUCCESS");
      nodeSpan.setAttribute("node.duration_ms", nodeDuration);
      nodeSpan.setStatus("OK");
      nodeSpan.end();

      finalOutput = output;
      if (node.type === "output") {
        returnedOutput = true;
        break;
      }

      for (const edge of outgoing.get(nodeId) ?? []) {
        const target = edge.target;
        const follows = followsEdge(node, edge, output);
        remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
        if (follows) {
          activeIncoming.set(target, (activeIncoming.get(target) ?? 0) + 1);
          incomingInputs.set(target, [...(incomingInputs.get(target) ?? []), output]);
        }
        if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
          queued.add(target);
          if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
          queue.push(target);
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
            if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
              queued.add(target);
              if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
              queue.push(target);
            }
          }
        }
        continue;
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
          }
          if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
            queued.add(target);
            if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
            queue.push(target);
          }
        }
        continue;
      }

      // Check if workflow has an errorTrigger node
      const errorTriggerNode = nodes.find((n) => ["errorTrigger", "error_trigger"].includes(n.type) && n.id !== node.id);
      if (errorTriggerNode && !processed.has(errorTriggerNode.id)) {
        await prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "FAILED", error: errorMessage(error), finishedAt: new Date(), duration: nodeDuration },
        });
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
        queue.length = 0;
        queue.push(errorTriggerNode.id);
        incomingInputs.set(errorTriggerNode.id, [errorPayload]);
        continue;
      }

      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "FAILED", error: errorMessage(error), finishedAt: new Date(), duration: nodeDuration },
      });
      nodeSpan.setAttribute("node.status", "FAILED");
      nodeSpan.setAttribute("node.duration_ms", nodeDuration);
      nodeSpan.recordException(error);
      nodeSpan.setStatus("ERROR", errorMessage(error));
      nodeSpan.end();
      throw error;
    }
  }

  if (!returnedOutput && processed.size !== reachable.size) throw new Error("Workflow graph contains a cycle or an unreachable branch");
  return finalOutput;
}

export async function createWorkflowExecution(
  workflowId: string,
  input?: unknown,
  options: { userId?: string; trigger?: string } = {},
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
  await recordExecutionAudit(created as any, "execution.created", { status: "PENDING" });
  return created;
}

export async function runExecution(
  executionId: string,
  options: { parentContext?: import("../lib/otel.js").TraceContext | null; traceparent?: string } = {}
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
  try {
    const output = await withTimeout(executeGraph(execution, workflow, wfSpan), EXECUTION_TIMEOUT_MS, "Execution timed out");
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

    const completed = await updateExecution(executionId, {
      status: "SUCCESS",
      output: output === undefined ? null : output,
      finishedAt: new Date(),
      duration,
    });
    await recordExecutionAudit(completed as any, "execution.succeeded", { status: "SUCCESS", duration });
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

    // Trigger errorWorkflow if configured in settings or version snapshot
    try {
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
          const errExecution = await createWorkflowExecution(errWf.id, {
            error: {
              message: errorMessage(error),
              workflowId: workflow.id,
              workflowName: workflow.name,
              executionId,
            },
            execution: failedExecution,
          }, { userId: execution.userId, trigger: "error" });

          const { enqueueExecution } = await import("./queue.js");
          const enqueued = await enqueueExecution(errExecution.id);
          if (!enqueued) {
            void runExecution(errExecution.id).catch((e) => console.error("[errorWorkflow] Async run error:", e));
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
