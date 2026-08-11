import { prisma } from "../lib/prisma.js";

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

function parseJson(value: unknown, fallback?: unknown): any {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function normalizeNodes(value: unknown): WorkflowNode[] {
  const nodes = parseJson(value, []);
  if (!Array.isArray(nodes)) throw new Error("Workflow nodes must be an array");

  return nodes.map((value, index) => {
    const node = asObject(value);
    const type = String(node.type ?? "");
    if (!type) throw new Error(`Workflow node ${index} has no type`);
    return {
      id: String(node.id ?? node.nodeId ?? `node-${index}`),
      type,
      config: asObject(parseJson(node.config, {})),
    };
  });
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

  // A condition without labelled branches is still a valid pass-through node.
  return true;
}

async function executeAi(config: JsonObject, input: unknown): Promise<unknown> {
  const model = config.model;
  if (!model) throw new Error("AI node model is required");

  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) throw new Error("NVIDIA NIM API key not configured");

  const baseUrl = (
    process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1"
  ).replace(/\/$/, "");
  const prompt = config.prompt ? String(config.prompt) : "";
  const inputText = JSON.stringify(input ?? null);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: String(model),
      messages: [
        { role: "user", content: prompt ? `${prompt}\n\nInput:\n${inputText}` : inputText },
      ],
    }),
  });

  if (!response.ok) throw new Error(`NIM error: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as JsonObject;
  return data.choices?.[0]?.message?.content ?? data;
}

async function executeHttp(config: JsonObject, input: unknown): Promise<unknown> {
  const url = config.url;
  if (!url) throw new Error("HTTP node URL is required");

  const method = String(config.method ?? "GET").toUpperCase();
  const headers = { ...asObject(config.headers) } as Record<string, string>;
  const configuredBody = config.body;
  const bodyValue =
    configuredBody === undefined && method !== "GET" && method !== "HEAD" ? input : configuredBody;
  const body =
    bodyValue === undefined
      ? undefined
      : typeof bodyValue === "string"
        ? bodyValue
        : JSON.stringify(bodyValue);
  if (
    body !== undefined &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(String(url), { method, headers, body });
  const text = await response.text();
  let result: unknown = text;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON response bodies as text.
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  return result;
}

async function executeNode(node: WorkflowNode, input: unknown): Promise<unknown> {
  switch (node.type) {
    case "trigger":
      return input;
    case "ai":
      return executeAi(node.config, input);
    case "condition":
      return evaluateCondition(input, node.config);
    case "http":
      return executeHttp(node.config, input);
    case "code": {
      // ponytail: basic eval, not isolation; use a worker sandbox before accepting untrusted code.
      const code = String(node.config.code ?? "return input;");
      return await new Function("input", code)(input);
    }
    case "output":
      return input;
    default:
      throw new Error(`Unsupported workflow node type: ${node.type}`);
  }
}

function workflowGraph(workflow: any): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const version = Array.isArray(workflow.versions) ? workflow.versions[0] : undefined;
  const snapshot = asObject(parseJson(version?.snapshot, {}));
  const storedNodes = parseJson(workflow.nodes, undefined);
  const storedEdges = parseJson(workflow.edges, undefined);
  const rawNodes =
    Array.isArray(storedNodes) && storedNodes.length > 0
      ? storedNodes
      : (snapshot.nodes ?? storedNodes ?? []);
  const rawEdges =
    Array.isArray(storedEdges) && storedEdges.length > 0
      ? storedEdges
      : (snapshot.edges ?? storedEdges ?? []);
  const nodes = normalizeNodes(rawNodes);
  const edges = normalizeEdges(rawEdges);
  return { nodes, edges };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateExecution(id: string, data: JsonObject): Promise<ExecutionResult> {
  await prisma.workflowExecution.updateMany({ where: { id }, data });
  const execution = await prisma.workflowExecution.findUnique({ where: { id } });
  if (!execution) throw new Error("Execution not found after update");
  return execution as ExecutionResult;
}

export async function executeWorkflow(workflowId: string, input?: any): Promise<ExecutionResult> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId },
    include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!workflow) throw new Error("Workflow not found");

  const startedAt = new Date();
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      orgId: workflow.orgId,
      userId: workflow.ownerId ?? undefined,
      status: "PENDING",
      trigger: "api",
      input: input === undefined ? undefined : input,
      startedAt,
    },
  });

  try {
    await updateExecution(execution.id, { status: "RUNNING" });
    const { nodes, edges } = workflowGraph(workflow);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const outgoing = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
        throw new Error(`Workflow edge references unknown node: ${edge.source} -> ${edge.target}`);
      }
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    }

    const trigger = nodes.find((node) => node.type === "trigger");
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
      remainingIncoming.set(
        nodeId,
        edges.filter((edge) => edge.target === nodeId && reachable.has(edge.source)).length,
      );
    }

    const queue = [trigger.id];
    const queued = new Set(queue);
    const processed = new Set<string>();
    const active = new Set([trigger.id]);
    const activeIncoming = new Map<string, number>();
    const incomingInputs = new Map<string, unknown[]>();
    let finalOutput: unknown = input;
    let returnedOutput = false;

    while (queue.length) {
      const nodeId = queue.shift()!;
      if (processed.has(nodeId)) continue;
      processed.add(nodeId);

      const node = nodeById.get(nodeId)!;
      if (active.has(nodeId)) {
        const values = incomingInputs.get(nodeId) ?? [];
        const nodeInput = nodeId === trigger.id ? input : values.length === 1 ? values[0] : values;
        const output = await executeNode(node, nodeInput);
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
            const valuesForTarget = incomingInputs.get(target) ?? [];
            valuesForTarget.push(output);
            incomingInputs.set(target, valuesForTarget);
          }
          if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
            queued.add(target);
            if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
            queue.push(target);
          }
        }
      } else {
        for (const edge of outgoing.get(nodeId) ?? []) {
          const target = edge.target;
          remainingIncoming.set(target, (remainingIncoming.get(target) ?? 0) - 1);
          if (remainingIncoming.get(target) === 0 && !queued.has(target)) {
            queued.add(target);
            if ((activeIncoming.get(target) ?? 0) > 0) active.add(target);
            queue.push(target);
          }
        }
      }
    }

    if (!returnedOutput && processed.size !== reachable.size) {
      throw new Error("Workflow graph contains a cycle");
    }

    return updateExecution(execution.id, {
      status: "SUCCESS",
      output: finalOutput === undefined ? null : finalOutput,
      finishedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    });
  } catch (error) {
    return updateExecution(execution.id, {
      status: "FAILED",
      error: errorMessage(error),
      finishedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    });
  }
}
