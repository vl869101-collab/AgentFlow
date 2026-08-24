/**
 * Runner nativo do AgentFlow para execucao do workflow WF3.
 *
 * Orquestra handlers em ordem topologica (DAG), passando output de cada
 * node como input do proximo. Usa os handlers criados em handlers/wf3/.
 *
 * Este runner e independente do executor.ts existente (nao edita o registry
 * compartilhado). Registra handlers localmente e os despacha por type.
 * Reutiliza topologicalSort e LocalNodeRegistry do runner compartilhado.
 */
import type { AgentFlowWorkflow, AgentFlowNode, AgentFlowEdge } from "../wf1-workflow.js";
import type { NodeExecutionResult, NodeExecutionContext, NodeItem } from "./handlers/types.js";
import { EmailReadImapHandler } from "./handlers/email-read-imap.js";
import { GmailHandler } from "./handlers/gmail.js";
import { LocalNodeRegistry, topologicalSort } from "../runner.js";

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

/** Cria o registry com os handlers do WF3 registrados */
export function createWf3Registry(): LocalNodeRegistry {
  const registry = new LocalNodeRegistry();
  registry.register("emailReadImap", new EmailReadImapHandler());
  registry.register("gmail", new GmailHandler());
  return registry;
}

/**
 * Resolve quais credenciais o node precisa baseado no tipo.
 * Diferente do runner WF1, o WF3 usa emailReadImap e gmail.
 */
function resolveNodeCredentials(
  node: AgentFlowNode,
  credentials: Map<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  switch (node.type) {
    case "emailReadImap":
      return credentials.get("imap");
    case "gmail":
      return credentials.get("gmail");
    default:
      return undefined;
  }
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
  const handler = registry.getHandler(node.type) as {
    execute: (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>;
  } | undefined;

  if (!handler) {
    throw new Error(`No handler registered for node type: ${node.type}`);
  }

  const nodeCreds = resolveNodeCredentials(node, credentials);

  const ctx: NodeExecutionContext = {
    executionId,
    nodeId: node.id,
    workflowId: "wf3",
    orgId,
    nodeConfig: node.config,
    input,
    credentials: nodeCreds,
  };

  return handler.execute(ctx);
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
  const executionId = `exec_wf3_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const steps: ExecutionStep[] = [];

  const registry = createWf3Registry();
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
