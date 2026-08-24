/**
 * Runner nativo do AgentFlow para execucao do workflow WF1.
 *
 * Orquestra handlers em ordem topologica (DAG), passando output de cada
 * node como input do proximo. Usa os handlers criados em handlers/*.
 *
 * Este runner e independente do executor.ts existente (nao edita o registry
 * compartilhado). Registra handlers localmente e os despacha por type.
 */
import type { AgentFlowWorkflow, AgentFlowNode, AgentFlowEdge } from "./wf1-workflow.js";
import type { NodeExecutionResult } from "./handlers/types.js";
import { GmailTriggerHandler } from "./handlers/gmailTrigger.js";
import { CodeNodeHandler } from "./handlers/code.js";
import { GoogleDriveHandler } from "./handlers/googleDrive.js";

export interface ExecutionStep {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: "running" | "success" | "failed";
  input: unknown;
  output?: unknown;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs: number;
  logs: string[];
}

export interface WorkflowExecutionResult {
  workflowId: string;
  workflowName: string;
  status: "success" | "failed" | "cancelled";
  trigger: string;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: ExecutionStep[];
}

/** Handler registry local — NAO edita o registry compartilhado do executor.ts */
export class LocalNodeRegistry {
  private handlers: Map<string, unknown> = new Map();

  register(type: string, handler: unknown): void {
    this.handlers.set(type, handler);
  }

  getHandler(type: string): unknown | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  list(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/** Cria o registry com os handlers do WF1 registrados */
export function createWf1Registry(): LocalNodeRegistry {
  const registry = new LocalNodeRegistry();
  registry.register("gmailTrigger", new GmailTriggerHandler());
  registry.register("code", new CodeNodeHandler());
  registry.register("googleDrive", new GoogleDriveHandler());
  return registry;
}

/** Ordena nodes em ordem topologica baseado nas edges */
function topologicalSort(nodes: AgentFlowNode[], edges: AgentFlowEdge[]): AgentFlowNode[] {
  const sorted: AgentFlowNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) throw new Error(`Cycle detected in workflow graph at node ${nodeId}`);
    visiting.add(nodeId);

    const nextNodeIds = edges
      .filter((e) => e.sourceNodeId === nodeId)
      .map((e) => e.targetNodeId);

    for (const nextId of nextNodeIds) {
      const next = nodeMap.get(nextId);
      if (next) visit(nextId);
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) sorted.push(node);
  };

  // Encontra o trigger (node sem edges de entrada)
  const targetIds = new Set(edges.map((e) => e.targetNodeId));
  const trigger = nodes.find((n) => !targetIds.has(n.id));

  if (!trigger) throw new Error("No trigger node — every node has incoming edges");
  visit(trigger.id);

  // Visita quaisquer nodes nao alcancaveis do trigger
  for (const node of nodes) {
    if (!visited.has(node.id)) visit(node.id);
  }

  // DFS post-order inverte a ordem — inverte para obter topological order correta
  return sorted.reverse();
}

/** Executa um node usando o handler apropriado do registry */
async function runNode(
  node: AgentFlowNode,
  input: unknown,
  credentials: Map<string, Record<string, unknown>>,
  executionId: string,
  orgId: string,
  registry: LocalNodeRegistry,
): Promise<NodeExecutionResult> {
  const handler = registry.getHandler(node.type);
  if (!handler) {
    throw new Error(`No handler registered for node type: ${node.type}`);
  }

  // Mapeia credentials baseado no tipo do node
  const nodeCreds = resolveNodeCredentials(node, credentials);

  const ctx = {
    executionId,
    nodeId: node.id,
    workflowId: "wf1",
    orgId,
    nodeConfig: node.config,
    input,
    credentials: nodeCreds,
  };

  const handlerAny = handler as { execute: (ctx: typeof ctx) => Promise<NodeExecutionResult> };
  return handlerAny.execute(ctx);
}

/** Resolve quais credenciais o node precisa baseado no tipo */
function resolveNodeCredentials(
  node: AgentFlowNode,
  credentials: Map<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  switch (node.type) {
    case "gmailTrigger":
      return credentials.get("gmail");
    case "googleDrive":
      return credentials.get("googleDrive");
    default:
      return undefined;
  }
}

/** Executa o workflow completo em ordem topologica */
export async function runWorkflow(
  workflow: AgentFlowWorkflow,
  input: unknown,
  credentials: Map<string, Record<string, unknown>>,
  options: { orgId?: string; userId?: string; trigger?: string } = {},
): Promise<WorkflowExecutionResult> {
  const orgId = options.orgId ?? workflow.orgId;
  const trigger = options.trigger ?? "manual";
  const executionId = `exec_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const steps: ExecutionStep[] = [];

  const registry = createWf1Registry();
  const sortedNodes = topologicalSort(workflow.nodes, workflow.edges);

  let currentInput: unknown = input;
  let error: string | null = null;
  let status: "success" | "failed" | "cancelled" = "success";

  for (const node of sortedNodes) {
    const stepStarted = Date.now();
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: node.type,
      status: "running",
      input: currentInput,
      startedAt: new Date().toISOString(),
      logs: [],
    };

    try {
      const result = await runNode(node, currentInput, credentials, executionId, orgId, registry);

      step.status = "success";
      step.output = result.items;
      step.logs = result.logs ?? [];
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.now() - stepStarted;

      steps.push(step);

      // O output deste node vira input do proximo
      currentInput = result.items;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      step.status = "failed";
      step.error = msg;
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.now() - stepStarted;
      step.logs.push(`ERROR: ${msg}`);
      steps.push(step);

      status = "failed";
      error = msg;
      break;
    }
  }

  const finishedAt = new Date().toISOString();

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status,
    trigger,
    input,
    output: currentInput,
    error,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startTime,
    steps,
  };
}

export { topologicalSort };
