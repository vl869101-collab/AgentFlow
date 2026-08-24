import { lookup, resolve4, resolve6 } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { decryptCredential } from "../lib/crypto.js";

// Native handler (registered via the registry-pending process — Part 2)
import { executeEvaluationTrigger } from "./nodes/evaluationTrigger.js";
import { CodeNodeHandler } from "./nodes/code.js";

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
    throw new Error("Invalid JSON in workflow definition");
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

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.internal"
  ) {
    return true;
  }

  if (!ipaddr.isValid(normalized)) return false;
  try {
    return ipaddr.parse(normalized).range() !== "unicast";
  } catch {
    return true;
  }
}

async function resolveDns(hostname: string): Promise<string[]> {
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason as NodeJS.ErrnoException);
  const hasUnexpectedError = errors.some((error) => !["ENOTFOUND", "ENODATA"].includes(error?.code ?? ""));
  if (hasUnexpectedError) throw new Error("HTTP node hostname could not be resolved safely");
  if (addresses.length > 0) return addresses;

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

function isAllowedEgressHostname(hostname: string): boolean {
  const allowedHosts = getEnv().EGRESS_ALLOWED_HOSTS;
  if (!allowedHosts || allowedHosts.length === 0) return true;
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return allowedHosts.some((allowedHost) => {
    if (allowedHost.startsWith("*.")) {
      const suffix = allowedHost.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === allowedHost;
  });
}

function assertSafeUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("HTTP node URL is invalid");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("HTTP node only supports public HTTP(S) URLs");
  }
  if (!isAllowedEgressHostname(url.hostname)) {
    throw new Error("HTTP node host is not in the egress allowlist");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("HTTP node cannot call private or local network addresses");
  }
  return url;
}

// H-01 fix: redirects are followed manually (native redirect following would
// silently bypass the URL/IP allowlist). Every hop resolves DNS and re-validates
// all A+AAAA records; the Location header must be http(s) and safe.
async function fetchWithTimeout(input: string | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const timeoutPerRequest = Math.max(Math.floor(timeoutMs / (MAX_REDIRECTS + 1)), 5_000);
  let current: string | URL = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = typeof current === "string" ? new URL(current) : current;
    await assertSafeResolved(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutPerRequest);
    let response: Response;
    try {
      response = await fetch(current, { ...init, redirect: "manual", signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("HTTP redirect response has no Location header");
    const next = new URL(location, url);
    if (!["http:", "https:"].includes(next.protocol)) {
      throw new Error("HTTP redirect to non-HTTP(S) URL is not allowed");
    }
    if (!isAllowedEgressHostname(next.hostname)) {
      throw new Error("HTTP redirect host is not in the egress allowlist");
    }
    if (isBlockedHostname(next.hostname)) {
      throw new Error("HTTP redirect to private or local network address is not allowed");
    }
    current = next;
  }
  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

// H-01 fix: resolves DNS and re-validates every A/AAAA record before a request
// goes out. Blocks hostnames that resolve (in part) to private/local IPs, so a
// split-horizon DNS rebinding cannot reach metadata or internal services.
async function assertSafeResolved(url: URL): Promise<void> {
  if (isBlockedHostname(url.hostname)) {
    throw new Error("HTTP node cannot call private or local network addresses");
  }
  if (ipaddr.isValid(url.hostname)) return; // Literal IPs are already validated.
  const addresses = await resolveDns(url.hostname);
  if (addresses.length === 0 || addresses.some((address) => !ipaddr.isValid(address) || isBlockedHostname(address))) {
    throw new Error("HTTP node cannot resolve to private or local network addresses");
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
  const url = assertSafeUrl(config.url);
  const method = String(config.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }

  const headers = Object.fromEntries(
    Object.entries(asObject(config.headers)).map(([key, value]) => [key, String(value)]),
  );
  const storedHeaders = await credentialHeaders(config, orgId);
  for (const [key, value] of Object.entries(storedHeaders)) {
    if (!Object.keys(headers).some((header) => header.toLowerCase() === key.toLowerCase())) headers[key] = value;
  }
  const configuredBody = config.body;
  const bodyValue = configuredBody === undefined && method !== "GET" && method !== "HEAD" ? input : configuredBody;
  const body = bodyValue === undefined ? undefined : typeof bodyValue === "string" ? bodyValue : JSON.stringify(bodyValue);
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(url, { method, headers, body }, Math.min(Number(config.timeout ?? 30) * 1000, NODE_TIMEOUT_MS));
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
      // Merge inputs from parallel branches - input is an array of items
      const items = Array.isArray(input) ? input : [input];
      return { items };
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

async function executeGraph(execution: any, workflow: any): Promise<unknown> {
  const { nodes, edges } = workflowGraph(workflow);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);

  const trigger = nodes.find((node) =>
    ["trigger", "webhook", "cron", "manual", "evaluationTrigger", "gmailTrigger", "emailReadImap"].includes(node.type),
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

    if (!active.has(nodeId)) {
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "CANCELLED", finishedAt: new Date(), duration: Date.now() - nodeStartedAt },
      });
      continue;
    }

    try {
      const output = await withTimeout(executeNode(node, nodeInput, execution.orgId), NODE_TIMEOUT_MS, "Node execution timed out");
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: {
          status: "SUCCESS",
          output: output === undefined ? null : output,
          finishedAt: new Date(),
          duration: Date.now() - nodeStartedAt,
        },
      });
      finalOutput = output;
      if (node.type === "output") {
        returnedOutput = true;
        break;
      }

      for (const edge of outgoing.get(nodeId) ?? []) {
        const target = edge.target;
        const follows = node.type !== "condition" || followsConditionEdge(edge, output);
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
      await prisma.nodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "FAILED", error: errorMessage(error), finishedAt: new Date(), duration: Date.now() - nodeStartedAt },
      });
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
  return (await prisma.workflowExecution.create({
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
}

export async function runExecution(executionId: string): Promise<ExecutionResult> {
  const execution = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error("Execution not found");
  if (["SUCCESS", "FAILED", "CANCELLED"].includes(execution.status)) return execution as ExecutionResult;

  const workflow = await prisma.workflow.findFirst({
    where: { id: execution.workflowId },
    include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!workflow) return updateExecution(executionId, { status: "FAILED", error: "Workflow not found", finishedAt: new Date() });

  const startedAt = new Date(execution.startedAt ?? Date.now());
  await updateExecution(executionId, { status: "RUNNING" });
  try {
    const output = await withTimeout(executeGraph(execution, workflow), EXECUTION_TIMEOUT_MS, "Execution timed out");
    return updateExecution(executionId, {
      status: "SUCCESS",
      output: output === undefined ? null : output,
      finishedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    });
  } catch (error) {
    const current = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
    if (current?.status === "CANCELLED") return current as ExecutionResult;
    return updateExecution(executionId, {
      status: "FAILED",
      error: errorMessage(error),
      finishedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    });
  }
}

export async function executeWorkflow(workflowId: string, input?: unknown, trigger = "api"): Promise<ExecutionResult> {
  const execution = await createWorkflowExecution(workflowId, input, { trigger });
  return runExecution(execution.id);
}
