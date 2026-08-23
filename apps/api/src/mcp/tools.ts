// MCP tool definitions + handlers for the AgentFlow exposure surface.
// Maps to the n8n MCP server workflow tools (see n8n-migration/mcp-sdk-reference.md).

import { prisma } from "../lib/prisma.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import type { McpTool, McpToolResult } from "./protocol.js";

type ToolContext = {
  orgId?: string;
  userId?: string;
};

function textResult(text: string, isError = false): McpToolResult {
  return { content: [{ type: "text", text }], isError };
}

function jsonResult(value: unknown): McpToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

function errorResult(message: string): McpToolResult {
  return textResult(JSON.stringify({ error: message }, null, 2), true);
}

function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function serializeWorkflow(workflow: any) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? null,
    status: workflow.status,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : undefined,
    edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : undefined,
  };
}

function serializeExecution(execution: any) {
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    trigger: execution.trigger,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt ?? null,
    duration: execution.duration ?? null,
    error: execution.error ?? null,
    input: execution.input ?? null,
    output: execution.output ?? null,
    workflow: execution.workflow ? { id: execution.workflow.id, name: execution.workflow.name } : undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

async function searchWorkflows(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const query = asString(args.query);
  const status = asString(args.status);
  const limit = asInt(args.limit, 50);
  const offset = asInt(args.offset, 0);

  const where: Record<string, unknown> = {};
  if (ctx.orgId) where.orgId = ctx.orgId;
  if (status) where.status = status;
  if (query) {
    where.OR = [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }];
  }

  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      include: { nodes: { select: { id: true } }, edges: { select: { id: true } } },
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
    }),
    prisma.workflow.count({ where }),
  ]);

  return jsonResult({ workflows: workflows.map(serializeWorkflow), total, limit, offset });
}

async function getWorkflowDetails(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
    include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!workflow) return errorResult("Workflow not found");

  return jsonResult({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? null,
    status: workflow.status,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    nodes: workflow.nodes.map((node: any) => ({
      id: node.id,
      type: node.type,
      label: node.label ?? null,
      config: node.config,
      position: node.position,
    })),
    edges: workflow.edges.map((edge: any) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      label: edge.label ?? null,
      condition: edge.condition ?? null,
    })),
    version: workflow.versions?.[0]?.version ?? null,
  });
}

async function executeWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
  });
  if (!workflow) return errorResult("Workflow not found");

  const input = args.input !== undefined ? args.input : undefined;
  try {
    const execution = await createWorkflowExecution(workflowId, input, { userId: ctx.userId, trigger: "api" });
    const result = await runExecution(execution.id);
    return jsonResult(serializeExecution(result));
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

async function getWorkflowExecution(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const executionId = asString(args.executionId);
  if (!executionId) return errorResult("executionId is required");

  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
    include: { workflow: { select: { id: true, name: true } } },
  });
  if (!execution) return errorResult("Execution not found");

  const nodes = await prisma.nodeExecution.findMany({ where: { executionId }, orderBy: { startedAt: "asc" } });
  return jsonResult({
    ...serializeExecution(execution),
    nodes: nodes.map((node: any) => ({
      id: node.id,
      nodeId: node.nodeId,
      status: node.status,
      input: node.input ?? null,
      output: node.output ?? null,
      error: node.error ?? null,
      startedAt: node.startedAt,
      finishedAt: node.finishedAt ?? null,
      duration: node.duration ?? null,
    })),
  });
}

async function searchWorkflowExecutions(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const status = asString(args.status);
  const limit = asInt(args.limit, 50);
  const offset = asInt(args.offset, 0);

  const where: Record<string, unknown> = {};
  if (ctx.orgId) where.orgId = ctx.orgId;
  if (workflowId) where.workflowId = workflowId;
  if (status) where.status = status;

  const [executions, total] = await Promise.all([
    prisma.workflowExecution.findMany({
      where,
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
    }),
    prisma.workflowExecution.count({ where }),
  ]);

  return jsonResult({ executions: executions.map(serializeExecution), total, limit, offset });
}

async function validateWorkflow(args: Record<string, unknown>): Promise<McpToolResult> {
  const workflow = args.workflow;
  if (!workflow || typeof workflow !== "object") return errorResult("workflow is required");

  const nodes = Array.isArray((workflow as any).nodes) ? (workflow as any).nodes : [];
  const edges = Array.isArray((workflow as any).edges) ? (workflow as any).edges : [];
  const errors: string[] = [];

  if (nodes.length === 0) errors.push("Workflow must contain at least one node");

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    const id = node?.id ?? node?.nodeId;
    if (!id) {
      errors.push("Every node must have an id");
      continue;
    }
    if (nodeIds.has(id)) errors.push(`Duplicate node id: ${id}`);
    nodeIds.add(id);
    const type = node?.type ?? node?.data?.type;
    if (!type) errors.push(`Node ${id} has no type`);
  }

  for (const edge of edges) {
    const source = edge?.sourceNodeId ?? edge?.source;
    const target = edge?.targetNodeId ?? edge?.target;
    if (!source || !target) {
      errors.push("Every edge must have a source and target");
      continue;
    }
    if (!nodeIds.has(source)) errors.push(`Edge references unknown source node: ${source}`);
    if (!nodeIds.has(target)) errors.push(`Edge references unknown target node: ${target}`);
  }

  return jsonResult({ valid: errors.length === 0, nodeCount: nodes.length, edgeCount: edges.length, errors });
}

// ─────────────────────────────────────────────────────────────
// Tool registry
// ─────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  {
    name: "search_workflows",
    description:
      "Search AgentFlow workflows by name/description and status. Returns a paginated list of workflows with node/edge counts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term matching workflow name or description" },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"], description: "Filter by workflow status" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
  },
  {
    name: "get_workflow_details",
    description: "Get full details of a single AgentFlow workflow, including its nodes, edges and latest version.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "execute_workflow",
    description: "Execute an AgentFlow workflow by id with an optional input payload. Returns the execution result.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id to execute" },
        input: { type: "object", description: "Optional input payload passed to the workflow trigger" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "get_workflow_execution",
    description: "Get a single AgentFlow workflow execution by id, including per-node execution details.",
    inputSchema: {
      type: "object",
      properties: {
        executionId: { type: "string", description: "The execution id" },
      },
      required: ["executionId"],
    },
  },
  {
    name: "search_workflow_executions",
    description: "Search AgentFlow workflow executions by workflow id and/or status. Returns a paginated list.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Filter by workflow id" },
        status: { type: "string", enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"], description: "Filter by execution status" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
  },
  {
    name: "validate_workflow",
    description: "Validate an AgentFlow workflow definition (nodes + edges) before persisting. Mirrors the n8n validate→create pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        workflow: {
          type: "object",
          description: "Workflow definition with nodes and edges arrays",
          properties: {
            nodes: { type: "array", items: { type: "object" } },
            edges: { type: "array", items: { type: "object" } },
          },
        },
      },
      required: ["workflow"],
    },
  },
];

const HANDLERS: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<McpToolResult>> = {
  search_workflows: searchWorkflows,
  get_workflow_details: getWorkflowDetails,
  execute_workflow: executeWorkflow,
  get_workflow_execution: getWorkflowExecution,
  search_workflow_executions: searchWorkflowExecutions,
  validate_workflow: validateWorkflow,
};

export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return errorResult(`Unknown tool: ${name}`);
  try {
    return await handler(args ?? {}, ctx);
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
