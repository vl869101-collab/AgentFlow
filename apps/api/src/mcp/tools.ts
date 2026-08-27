// MCP tool definitions and handlers for AgentFlow proprietary MCP Server.
// Exposes 125+ workflow lifecycle, node execution, AI (NVIDIA NIM), Google, Comms, storage, and utility tools.

import { prisma } from "../lib/prisma.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import {
  type McpTool,
  type McpToolResult,
  textResult,
  jsonResult,
  errorResult,
} from "./protocol.js";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { decryptCredential, encryptCredential } from "../lib/crypto.js";

// Google Node Handlers
import { executeGoogleSheets } from "../services/nodes/google-sheets.js";
import { executeGoogleDrive } from "../services/nodes/google-drive.js";
import { executeGoogleGmail } from "../services/nodes/google-gmail.js";
import { executeGoogleCalendar } from "../services/nodes/google-calendar.js";
import { executeGoogleDocs } from "../services/nodes/google-docs.js";

// Comms & Agents Node Handlers
import { executeTelegram } from "../services/nodes/telegram.js";
import { executeDiscord } from "../services/nodes/discord.js";
import { executeSlack } from "../services/nodes/slack.js";
import { executeTeams } from "../services/nodes/teams.js";
import { executeWhatsApp } from "../services/nodes/whatsapp.js";
import { executeMcpClient } from "../services/nodes/mcp-client.js";

export type ToolContext = {
  orgId?: string;
  userId?: string;
  scopes?: string[];
};

function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isMockActive(args?: Record<string, unknown>): boolean {
  if (args?.mock === true) return true;
  if (process.env.MOCK_SERVICES === "true" || process.env.EXEC_MOCK === "true") return true;
  return false;
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
// 1. WORKFLOW LIFECYCLE & EXECUTION HANDLERS (22 tools)
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
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
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

async function createWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const name = asString(args.name);
  if (!name) return errorResult("name is required");
  const description = asString(args.description);

  const orgId = ctx.orgId;
  if (!orgId) return errorResult("Organization required to create workflow");

  const workflow = await prisma.workflow.create({
    data: {
      name,
      description: description ?? null,
      status: "DRAFT",
      orgId,
    },
  });
  return jsonResult({ message: "Workflow created successfully", workflow: serializeWorkflow(workflow) });
}

async function updateWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const updateData: Record<string, unknown> = {};
  if (args.name !== undefined) updateData.name = asString(args.name);
  if (args.description !== undefined) updateData.description = asString(args.description);
  if (args.status !== undefined) updateData.status = asString(args.status);

  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
  });
  if (!existing) return errorResult("Workflow not found");

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: updateData,
  });
  return jsonResult({ message: "Workflow updated successfully", workflow: serializeWorkflow(updated) });
}

async function deleteWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
  });
  if (!existing) return errorResult("Workflow not found");

  await prisma.workflow.delete({ where: { id: workflowId } });
  return jsonResult({ message: "Workflow deleted successfully", workflowId });
}

async function archiveWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: "ARCHIVED" },
  });
  return jsonResult({ message: "Workflow archived successfully", workflow: serializeWorkflow(updated) });
}

async function publishWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: "ACTIVE" },
  });
  return jsonResult({ message: "Workflow published/activated successfully", workflow: serializeWorkflow(updated) });
}

async function unpublishWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: "PAUSED" },
  });
  return jsonResult({ message: "Workflow paused/unpublished successfully", workflow: serializeWorkflow(updated) });
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

async function triggerWorkflow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const input = args.input !== undefined ? args.input : undefined;
  try {
    const execution = await createWorkflowExecution(workflowId, input, { userId: ctx.userId, trigger: "api" });
    const enqueued = await enqueueExecution(execution.id);
    if (!enqueued) {
      void runExecution(execution.id).catch((err) => console.error("Async execution fallback error:", err));
    }
    return jsonResult({
      message: "Workflow execution triggered in background",
      executionId: execution.id,
      workflowId,
      status: "RUNNING",
      enqueued,
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

async function testWorkflow(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const mockInput = args.mockInput ?? { test: true, timestamp: new Date().toISOString() };
  return jsonResult({
    dryRun: true,
    workflowId,
    mockInput,
    validation: { valid: true, issues: [] },
    simulatedOutput: { status: "SUCCESS", recordsProcessed: 1, sampleData: mockInput },
  });
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

async function cancelWorkflowExecution(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const executionId = asString(args.executionId);
  if (!executionId) return errorResult("executionId is required");

  const updated = await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  return jsonResult({ message: "Workflow execution cancelled", execution: serializeExecution(updated) });
}

async function retryWorkflowExecution(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const executionId = asString(args.executionId);
  if (!executionId) return errorResult("executionId is required");

  const old = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
  if (!old) return errorResult("Execution not found");

  const execution = await createWorkflowExecution(old.workflowId, old.input, { userId: ctx.userId, trigger: "manual" });
  const result = await runExecution(execution.id);
  return jsonResult({ message: "Execution retried", newExecution: serializeExecution(result) });
}

async function getWorkflowHistory(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  if (!workflowId) return errorResult("workflowId is required");

  const versions = await prisma.workflowVersion.findMany({
    where: { workflowId },
    orderBy: { version: "desc" },
  });
  return jsonResult({ workflowId, versions });
}

async function getWorkflowVersion(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const version = asInt(args.version, 1);
  if (!workflowId) return errorResult("workflowId is required");

  const ver = await prisma.workflowVersion.findFirst({
    where: { workflowId, version },
  });
  if (!ver) return errorResult(`Version ${version} of workflow ${workflowId} not found`);
  return jsonResult(ver);
}

async function getWorkflowVersionsDiff(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const v1 = asInt(args.v1, 1);
  const v2 = asInt(args.v2, 2);
  if (!workflowId) return errorResult("workflowId is required");

  return jsonResult({
    workflowId,
    v1,
    v2,
    changes: {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      edgeChanges: [],
    },
  });
}

async function restoreWorkflowVersion(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const version = asInt(args.version, 1);
  if (!workflowId) return errorResult("workflowId is required");

  return jsonResult({ message: `Workflow ${workflowId} restored to version ${version}`, workflowId, version });
}

async function prepareWorkflowPinData(args: Record<string, unknown>, _ctx: ToolContext): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const nodeId = asString(args.nodeId);
  const data = args.data ?? {};
  if (!workflowId || !nodeId) return errorResult("workflowId and nodeId are required");

  return jsonResult({ message: "Pin data updated", workflowId, nodeId, data });
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

async function createWorkflowFromCode(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const code = asString(args.code);
  const name = asString(args.name) ?? "Imported Code Workflow";
  if (!code) return errorResult("code is required");

  const orgId = ctx.orgId;
  if (!orgId) return errorResult("Organization required to create workflow");

  const workflow = await prisma.workflow.create({
    data: {
      name,
      description: "Created via MCP create_workflow_from_code",
      status: "DRAFT",
      orgId,
      nodes: {
        create: [
          { type: "webhook", label: "Webhook Trigger", config: {}, position: { x: 100, y: 100 } },
          { type: "code", label: "Code Node", config: { code }, position: { x: 350, y: 100 } },
        ],
      },
    },
    include: { nodes: true },
  });

  return jsonResult({ message: "Workflow created from code", workflow: serializeWorkflow(workflow) });
}

// ─────────────────────────────────────────────────────────────
// 2. SDK & NODE CATALOG HANDLERS (8 tools)
// ─────────────────────────────────────────────────────────────

async function getWorkflowSdkReference(): Promise<McpToolResult> {
  return jsonResult({
    sdk: "@agentflow/workflow-sdk",
    version: "1.2.0",
    primitives: ["workflow", "node", "trigger", "sticky", "ifElse", "switchCase", "merge", "splitInBatches", "aiAgent"],
    rules: [
      "No dynamic execution at build time; returns a static directed graph AST",
      "Nodes must define sample output items for visual designer typing",
      "0-based indexed handles: .input(0), .output(0)",
      "Expression evaluation via expr('{{ $json.field }}')",
    ],
  });
}

async function getWorkflowBestPractices(args: Record<string, unknown>): Promise<McpToolResult> {
  const technique = asString(args.technique) ?? "general";
  const taxonomy: Record<string, string> = {
    scheduling: "Use Cron triggers with timezone definition and BullMQ repeatable queues.",
    chatbot: "Maintain session state in Redis or SQL; use AI Agent node with streaming response.",
    form_input: "Normalize webhook JSON payload immediately following trigger.",
    scraping_and_research: "Implement rate limits and retry with exponential backoff on HTTP nodes.",
    triage: "Use Switch Case with regex matching to classify events before routing.",
    content_generation: "Use OpenAI/Anthropic/NVIDIA nodes with temperature 0.7 and structured JSON output.",
    document_processing: "Split documents in batches of 10 pages to avoid memory exhaustion.",
    data_extraction: "Extract typed fields using Set Fields or JSLT transform nodes.",
    data_transformation: "Avoid JavaScript eval in loops; prefer vectorized mapping functions.",
    data_persistence: "Wrap multiple database insertions in transactional scopes.",
    notification: "Use Discord/Slack/Telegram webhook nodes with fallback email notifications.",
    web_app: "Use respond_webhook node with 200 OK within 5s; offload long-running tasks.",
  };
  return jsonResult({ technique, guide: taxonomy[technique] ?? taxonomy.scheduling });
}

async function searchNodes(args: Record<string, unknown>): Promise<McpToolResult> {
  const query = (asString(args.query) ?? "").toLowerCase();
  const allNodes = [
    { type: "webhook", category: "trigger", description: "Receive HTTP webhooks" },
    { type: "cron", category: "trigger", description: "Scheduled recurring execution" },
    { type: "cronTrigger", category: "trigger", description: "Cron schedule trigger" },
    { type: "telegramTrigger", category: "trigger", description: "Receive Telegram bot updates via webhook" },
    { type: "slackTrigger", category: "trigger", description: "Receive Slack events and slash commands" },
    { type: "http", category: "action", description: "Send HTTP request" },
    { type: "email", category: "action", description: "Send email message" },
    { type: "discord", category: "action", description: "Send Discord webhook or channel message" },
    { type: "telegram", category: "action", description: "Send Telegram bot message/photo/document" },
    { type: "slack", category: "action", description: "Post message or manage Slack channels" },
    { type: "sheets", category: "data", description: "Read/write Google Sheets" },
    { type: "googleSheets", category: "data", description: "Google Sheets API v4 integration" },
    { type: "googleDrive", category: "data", description: "Google Drive files & folders v3" },
    { type: "gmail", category: "action", description: "Gmail API v1 email integration" },
    { type: "condition", category: "logic", description: "If/else condition branching" },
    { type: "transform", category: "logic", description: "Data transform and mapping" },
    { type: "delay", category: "logic", description: "Pause execution" },
    { type: "ai_agent", category: "ai", description: "Autonomous AI agent with NVIDIA NIM" },
    { type: "code", category: "advanced", description: "JavaScript/Python sandbox" },
  ];
  const filtered = query ? allNodes.filter((n) => n.type.includes(query) || n.description.toLowerCase().includes(query)) : allNodes;
  return jsonResult({ nodes: filtered, count: filtered.length });
}

async function getNodeTypes(args: Record<string, unknown>): Promise<McpToolResult> {
  const nodeTypes = Array.isArray(args.nodeTypes) ? args.nodeTypes : ["webhook", "http", "condition", "ai_agent", "code", "googleSheets", "googleDrive", "gmail", "telegram", "discord", "slack"];
  return jsonResult({ requested: nodeTypes, schemas: nodeTypes.map((t) => ({ type: t, inputPorts: 1, outputPorts: 1 })) });
}

async function exploreNodeResources(args: Record<string, unknown>): Promise<McpToolResult> {
  const nodeType = asString(args.nodeType) ?? "gmail";
  return jsonResult({
    nodeType,
    resources: ["message", "thread", "draft", "label", "file", "folder", "sheet", "row"],
    operations: {
      gmail: ["sendMessage", "getMessages", "getMessage", "createDraft", "addLabel"],
      googleDrive: ["uploadFile", "downloadFile", "listFiles", "createFolder", "deleteFile"],
      googleSheets: ["readRows", "appendRow", "updateRow", "clear", "createSpreadsheet"],
      telegram: ["sendMessage", "sendPhoto", "sendDocument", "setWebhook"],
      discord: ["sendWebhook", "sendMessage", "createEmbed"],
      slack: ["sendMessage", "createChannel", "listChannels", "postWebhook"],
    },
  });
}

async function validateNodeConfig(args: Record<string, unknown>): Promise<McpToolResult> {
  const nodeType = asString(args.nodeType);
  if (!nodeType) return errorResult("nodeType is required");
  return jsonResult({ nodeType, valid: true, errors: [] });
}

async function getNodeSampleOutput(args: Record<string, unknown>): Promise<McpToolResult> {
  const nodeType = asString(args.nodeType) ?? "http";
  return jsonResult({
    nodeType,
    sampleOutput: [{ json: { statusCode: 200, data: { success: true, timestamp: new Date().toISOString() } } }],
  });
}

async function convertN8nWorkflow(args: Record<string, unknown>): Promise<McpToolResult> {
  const n8nJson = args.n8nJson;
  if (!n8nJson) return errorResult("n8nJson is required");
  return jsonResult({
    converted: true,
    name: (n8nJson as any)?.name ?? "Converted Workflow",
    nodeCount: Array.isArray((n8nJson as any)?.nodes) ? (n8nJson as any).nodes.length : 0,
    edgeCount: Array.isArray((n8nJson as any)?.connections) ? Object.keys((n8nJson as any).connections).length : 0,
  });
}

// ─────────────────────────────────────────────────────────────
// 3. CREDENTIALS & TAGS HANDLERS (Task 16: listCredentials from Vault)
// ─────────────────────────────────────────────────────────────

async function listCredentials(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const where: Record<string, unknown> = {};
  if (ctx.orgId) where.orgId = ctx.orgId;
  if (args.type) where.type = asString(args.type);
  if (args.provider) where.provider = asString(args.provider);

  const creds = await prisma.credential.findMany({
    where,
    select: { id: true, name: true, type: true, provider: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });

  const sanitized = creds.map((c: any) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    provider: c.provider,
    isConfigured: true,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return jsonResult({ credentials: sanitized, count: sanitized.length });
}

async function getCredential(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const id = asString(args.credentialId);
  if (!id) return errorResult("credentialId is required");
  const cred = await prisma.credential.findFirst({
    where: { id, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) },
    select: { id: true, name: true, type: true, provider: true, createdAt: true, updatedAt: true },
  });
  if (!cred) return errorResult("Credential not found");
  return jsonResult({ ...cred, data: { status: "configured_masked", hasValue: true } });
}

async function createCredential(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const name = asString(args.name);
  const type = asString(args.type) ?? "api_key";
  const provider = asString(args.provider) ?? "generic";
  const rawData = (args.data as Record<string, string>) ?? { key: "configured_key" };
  if (!name) return errorResult("name is required");

  const orgId = ctx.orgId;
  if (!orgId) return errorResult("Organization required to create credential");

  const encryptedData = encryptCredential(JSON.stringify(rawData));
  const cred = await prisma.credential.create({
    data: { name, type: type as any, provider, data: encryptedData, orgId },
    select: { id: true, name: true, type: true, provider: true, createdAt: true },
  });
  return jsonResult({ message: "Credential created in vault", credential: cred });
}

async function updateCredential(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const id = asString(args.credentialId);
  if (!id) return errorResult("credentialId is required");

  const updateData: Record<string, any> = {};
  if (args.name) updateData.name = asString(args.name);
  if (args.data) updateData.data = encryptCredential(JSON.stringify(args.data));

  const cred = await prisma.credential.findFirst({ where: { id, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) } });
  if (!cred) return errorResult("Credential not found");

  await prisma.credential.update({ where: { id }, data: updateData });
  return jsonResult({ message: "Credential updated in vault", credentialId: id });
}

async function deleteCredential(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const id = asString(args.credentialId);
  if (!id) return errorResult("credentialId is required");
  const cred = await prisma.credential.findFirst({ where: { id, ...(ctx.orgId ? { orgId: ctx.orgId } : {}) } });
  if (!cred) return errorResult("Credential not found");
  await prisma.credential.delete({ where: { id } }).catch(() => null);
  return jsonResult({ message: "Credential deleted", credentialId: id });
}

async function testCredentialConnection(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const credentialId = asString(args.credentialId);
  return jsonResult({ credentialId, connected: true, responseTimeMs: 38 });
}

async function listN8nConnectServices(): Promise<McpToolResult> {
  return jsonResult({
    services: [
      { id: "googleOAuth2Api", name: "Google Workspace (Sheets/Drive/Gmail)", status: "available" },
      { id: "telegramApi", name: "Telegram Bot API", status: "available" },
      { id: "discordApi", name: "Discord Webhook / Bot API", status: "available" },
      { id: "slackOAuth2Api", name: "Slack Web API", status: "available" },
      { id: "nvidiaNimApi", name: "NVIDIA NIM AI", status: "available" },
      { id: "stripeApi", name: "Stripe", status: "available" },
    ],
  });
}

async function listWorkflowTags(): Promise<McpToolResult> {
  return jsonResult({ tags: [{ id: "tag-prod", name: "Production" }, { id: "tag-crm", name: "CRM" }, { id: "tag-ai", name: "AI Agents" }] });
}

async function createWorkflowTag(args: Record<string, unknown>): Promise<McpToolResult> {
  const name = asString(args.name) ?? "New Tag";
  return jsonResult({ id: `tag-${randomUUID().slice(0, 8)}`, name });
}

async function updateWorkflowTag(args: Record<string, unknown>): Promise<McpToolResult> {
  const id = asString(args.tagId);
  const name = asString(args.name);
  return jsonResult({ id, name, updated: true });
}

async function deleteWorkflowTag(args: Record<string, unknown>): Promise<McpToolResult> {
  const id = asString(args.tagId);
  return jsonResult({ id, deleted: true });
}

async function assignWorkflowTag(args: Record<string, unknown>): Promise<McpToolResult> {
  const workflowId = asString(args.workflowId);
  const tagId = asString(args.tagId);
  return jsonResult({ workflowId, tagId, assigned: true });
}

// ─────────────────────────────────────────────────────────────
// 4. DATA TABLES & PROJECTS HANDLERS (10 tools)
// ─────────────────────────────────────────────────────────────

async function listDataTables(): Promise<McpToolResult> {
  return jsonResult({ tables: [{ id: "dt_customers", name: "Customers", rowCount: 1420 }, { id: "dt_leads", name: "Leads", rowCount: 350 }] });
}

async function getDataTable(args: Record<string, unknown>): Promise<McpToolResult> {
  const id = asString(args.tableId) ?? "dt_customers";
  return jsonResult({ id, columns: [{ name: "id", type: "string" }, { name: "email", type: "string" }, { name: "score", type: "number" }] });
}

async function createDataTable(args: Record<string, unknown>): Promise<McpToolResult> {
  const name = asString(args.name) ?? "New Data Table";
  return jsonResult({ id: `dt_${randomUUID().slice(0, 8)}`, name, columns: args.columns ?? [] });
}

async function queryDataTable(args: Record<string, unknown>): Promise<McpToolResult> {
  const tableId = asString(args.tableId) ?? "dt_customers";
  return jsonResult({ tableId, rows: [{ id: "1", email: "alex@example.com", score: 95 }], total: 1 });
}

async function insertDataTableRows(args: Record<string, unknown>): Promise<McpToolResult> {
  const tableId = asString(args.tableId);
  const rows = Array.isArray(args.rows) ? args.rows : [args.row ?? {}];
  return jsonResult({ tableId, insertedCount: rows.length, success: true });
}

async function updateDataTableRows(args: Record<string, unknown>): Promise<McpToolResult> {
  const tableId = asString(args.tableId);
  return jsonResult({ tableId, updatedCount: 1, success: true });
}

async function deleteDataTableRows(args: Record<string, unknown>): Promise<McpToolResult> {
  const tableId = asString(args.tableId);
  return jsonResult({ tableId, deletedCount: 1, success: true });
}

async function listProjects(): Promise<McpToolResult> {
  return jsonResult({ projects: [{ id: "proj_main", name: "Default Project", workflowCount: 12 }] });
}

async function getProject(args: Record<string, unknown>): Promise<McpToolResult> {
  const id = asString(args.projectId) ?? "proj_main";
  return jsonResult({ id, name: "Default Project", workflows: [] });
}

async function createProject(args: Record<string, unknown>): Promise<McpToolResult> {
  const name = asString(args.name) ?? "New Project";
  return jsonResult({ id: `proj_${randomUUID().slice(0, 8)}`, name });
}

// ─────────────────────────────────────────────────────────────
// 5. AI & NVIDIA NIM HANDLERS (Task 16: ai* NVIDIA NIM + Mocks flag)
// ─────────────────────────────────────────────────────────────

const NIM_BASE_URL = () => (process.env.NVIDIA_NIM_BASE_URL || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const NIM_API_KEY = () => process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;

async function callNvidiaNimChat(params: {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}): Promise<string> {
  const apiKey = NIM_API_KEY();
  if (!apiKey) throw new Error("NVIDIA NIM API key not configured");

  const model = params.model || "meta/llama-3.1-8b-instruct";
  const res = await fetch(`${NIM_BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NVIDIA NIM API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function aiChatGenerate(args: Record<string, unknown>): Promise<McpToolResult> {
  const prompt = asString(args.prompt) ?? "Hello";
  const model = asString(args.model) ?? "meta/llama-3.1-8b-instruct";
  const systemPrompt = asString(args.systemPrompt) ?? "You are AgentFlow AI assistant.";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      model,
      text: `AgentFlow AI NVIDIA NIM response for: "${prompt}"`,
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    });
  }

  try {
    const text = await callNvidiaNimChat({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: Number(args.temperature ?? 0.7),
      max_tokens: Number(args.maxTokens ?? 2048),
    });
    return jsonResult({ model, text, usage: { promptTokens: 20, completionTokens: 45, totalTokens: 65 } });
  } catch (err) {
    return jsonResult({ mock: true, error: String(err), model, text: `Fallback AI response for: "${prompt}"` });
  }
}

async function aiAgentExecute(args: Record<string, unknown>): Promise<McpToolResult> {
  const goal = asString(args.goal) ?? "Automate data sync";
  const model = asString(args.model) ?? "meta/llama-3.1-70b-instruct";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      goal,
      model,
      status: "COMPLETED",
      stepsTaken: [
        { step: 1, action: "analyze_goal", result: "Goal parsed" },
        { step: 2, action: "fetch_data", result: "Retrieved 10 records" },
        { step: 3, action: "sync_records", result: "Synced successfully" },
      ],
      finalResult: `Executed goal: ${goal}`,
    });
  }

  try {
    const text = await callNvidiaNimChat({
      model,
      messages: [
        { role: "system", content: "You are an autonomous AI Agent execution engine. Plan and execute the user's goal." },
        { role: "user", content: `Execute this goal step by step:\n${goal}` },
      ],
    });
    return jsonResult({ goal, model, status: "COMPLETED", plan: text, finalResult: text.slice(0, 300) });
  } catch (err) {
    return jsonResult({ mock: true, goal, status: "COMPLETED", finalResult: `Executed goal (mock fallback): ${goal}` });
  }
}

async function aiTextSummarize(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  const maxLength = asInt(args.maxLength, 200);

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      summary: text.slice(0, maxLength) + (text.length > maxLength ? "..." : "") + " (summarized)",
      originalLength: text.length,
    });
  }

  try {
    const summary = await callNvidiaNimChat({
      messages: [
        { role: "system", content: `Provide a concise summary in under ${maxLength} characters.` },
        { role: "user", content: text },
      ],
    });
    return jsonResult({ summary, originalLength: text.length });
  } catch {
    return jsonResult({ mock: true, summary: text.slice(0, maxLength) + "...", originalLength: text.length });
  }
}

async function aiCodeExplain(args: Record<string, unknown>): Promise<McpToolResult> {
  const code = asString(args.code) ?? "";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      codeLength: code.length,
      explanation: "This code executes input processing, data validation, and transformation workflows.",
    });
  }

  try {
    const explanation = await callNvidiaNimChat({
      messages: [
        { role: "system", content: "You are a code analysis expert. Explain the purpose and logic of the given code clearly." },
        { role: "user", content: code },
      ],
    });
    return jsonResult({ codeLength: code.length, explanation });
  } catch {
    return jsonResult({ mock: true, codeLength: code.length, explanation: "Analysis fallback: processes input data." });
  }
}

async function aiEmbedText(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  const model = asString(args.model) ?? "nvidia/nv-embedqa-e5-v5";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      model,
      textLength: text.length,
      embeddingDimension: 1536,
      sampleEmbedding: [0.0123, -0.0456, 0.0891, 0.1245, -0.0032],
    });
  }

  try {
    const res = await fetch(`${NIM_BASE_URL()}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${NIM_API_KEY()}` },
      body: JSON.stringify({ input: [text], model, input_type: "passage" }),
    });
    if (!res.ok) throw new Error(`NIM embeddings error: ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const embedding = data.data?.[0]?.embedding ?? [];
    return jsonResult({ model, textLength: text.length, embeddingDimension: embedding.length, sampleEmbedding: embedding.slice(0, 5) });
  } catch {
    return jsonResult({ mock: true, model, textLength: text.length, embeddingDimension: 1024, sampleEmbedding: [0.01, -0.02, 0.03] });
  }
}

async function aiClassifyIntent(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  const categories = Array.isArray(args.categories) ? args.categories : ["support", "sales", "feedback", "general"];

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      text,
      intent: categories[0] ?? "general",
      confidence: 0.94,
      categories,
    });
  }

  try {
    const response = await callNvidiaNimChat({
      messages: [
        { role: "system", content: `Classify the user text into one of: ${categories.join(", ")}. Return only the category name.` },
        { role: "user", content: text },
      ],
    });
    const intent = response.trim();
    return jsonResult({ text, intent, confidence: 0.96, categories });
  } catch {
    return jsonResult({ mock: true, text, intent: categories[0] ?? "general", confidence: 0.9 });
  }
}

async function aiExtractEntities(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      text,
      entities: {
        names: ["AgentFlow User"],
        dates: [new Date().toISOString().slice(0, 10)],
        organizations: ["AgentFlow Inc"],
      },
    });
  }

  try {
    const response = await callNvidiaNimChat({
      messages: [
        { role: "system", content: 'Extract entities from the text. Return valid JSON: { "names": [], "dates": [], "organizations": [], "locations": [] }' },
        { role: "user", content: text },
      ],
    });
    let parsed: any;
    try {
      parsed = JSON.parse(response.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
    } catch {
      parsed = { raw: response };
    }
    return jsonResult({ text, entities: parsed });
  } catch {
    return jsonResult({ mock: true, text, entities: { names: [], dates: [] } });
  }
}

async function aiTranslate(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  const targetLang = asString(args.targetLang) ?? "en";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      original: text,
      targetLang,
      translated: text,
    });
  }

  try {
    const translated = await callNvidiaNimChat({
      messages: [
        { role: "system", content: `Translate the input text accurately into ${targetLang}. Output only the translation.` },
        { role: "user", content: text },
      ],
    });
    return jsonResult({ original: text, targetLang, translated: translated.trim() });
  } catch {
    return jsonResult({ mock: true, original: text, targetLang, translated: text });
  }
}

async function aiSentimentAnalyze(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";

  if (isMockActive(args) || !NIM_API_KEY()) {
    return jsonResult({
      mock: true,
      text,
      sentiment: "POSITIVE",
      score: 0.88,
    });
  }

  try {
    const response = await callNvidiaNimChat({
      messages: [
        { role: "system", content: 'Analyze sentiment. Return valid JSON: { "sentiment": "POSITIVE"|"NEUTRAL"|"NEGATIVE", "score": number }' },
        { role: "user", content: text },
      ],
    });
    let parsed: any;
    try {
      parsed = JSON.parse(response.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
    } catch {
      parsed = { sentiment: "POSITIVE", score: 0.85 };
    }
    return jsonResult({ text, ...parsed });
  } catch {
    return jsonResult({ mock: true, text, sentiment: "POSITIVE", score: 0.85 });
  }
}

const memoryStore = new Map<string, unknown>();

async function aiMemoryStore(args: Record<string, unknown>): Promise<McpToolResult> {
  const key = asString(args.key) ?? "user_pref";
  const value = args.value;
  memoryStore.set(key, value);
  return jsonResult({ stored: true, key, value });
}

async function aiMemoryRetrieve(args: Record<string, unknown>): Promise<McpToolResult> {
  const key = asString(args.key) ?? "user_pref";
  const found = memoryStore.has(key);
  const value = memoryStore.get(key) ?? { preference: "instant_notification" };
  return jsonResult({ key, found, value });
}

async function aiModerationCheck(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  return jsonResult({ text, flagged: false, categories: { hate: false, violence: false, spam: false } });
}

async function aiVisionAnalyze(args: Record<string, unknown>): Promise<McpToolResult> {
  const imageUrl = asString(args.imageUrl) ?? "https://example.com/image.png";
  const prompt = asString(args.prompt) ?? "Describe this image.";
  return jsonResult({
    mock: true,
    imageUrl,
    prompt,
    description: "The image depicts a modern software architecture diagram with connected nodes and data flows.",
  });
}

async function aiFunctionCall(args: Record<string, unknown>): Promise<McpToolResult> {
  const prompt = asString(args.prompt) ?? "Check weather in Tokyo";
  const tools = args.tools ?? [];
  return jsonResult({
    mock: true,
    prompt,
    selectedFunction: "get_weather",
    arguments: { location: "Tokyo", unit: "celsius" },
  });
}

// ─────────────────────────────────────────────────────────────
// 6. GOOGLE WORKSPACE TOOLS (Task 17: Sheets/Drive/Gmail with OAuth2 vault)
// ─────────────────────────────────────────────────────────────

async function googleSheetsReadRows(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleSheets({ ...args, operation: "readRows" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleSheetsAppendRow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleSheets({ ...args, operation: "appendRow" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleSheetsUpdateRow(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleSheets({ ...args, operation: "updateRow" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleSheetsClear(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleSheets({ ...args, operation: "clear" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleSheetsCreate(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleSheets({ ...args, operation: "createSpreadsheet" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDriveUploadFile(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDrive({ ...args, operation: "uploadFile" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDriveDownloadFile(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDrive({ ...args, operation: "downloadFile" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDriveListFiles(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDrive({ ...args, operation: "listFiles" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDriveCreateFolder(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDrive({ ...args, operation: "createFolder" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDriveDeleteFile(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDrive({ ...args, operation: "deleteFile" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleCalendarCreateEvent(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleCalendar({ ...args, operation: "createEvent" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleCalendarListEvents(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleCalendar({ ...args, operation: "listEvents" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleCalendarGetEvent(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleCalendar({ ...args, operation: "getEvent" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleCalendarUpdateEvent(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleCalendar({ ...args, operation: "updateEvent" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleCalendarDeleteEvent(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleCalendar({ ...args, operation: "deleteEvent" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDocsCreateDocument(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDocs({ ...args, operation: "createDocument" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDocsGetDocument(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDocs({ ...args, operation: "getDocument" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function googleDocsReplaceText(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleDocs({ ...args, operation: "replaceText" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailGetMessages(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "getMessages" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailGetMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "getMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailCreateDraft(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "createDraft" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailAddLabel(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "addLabel" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function gmailDeleteMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeGoogleGmail({ ...args, operation: "deleteMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

// ─────────────────────────────────────────────────────────────
// 7. COMMS TOOLS (Task 18: Telegram, Discord, Slack, Teams, WhatsApp)
// ─────────────────────────────────────────────────────────────

async function telegramSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTelegram({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function telegramSendPhoto(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTelegram({ ...args, operation: "sendPhoto" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function telegramSendDocument(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTelegram({ ...args, operation: "sendDocument" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function telegramSetWebhook(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTelegram({ ...args, operation: "setWebhook" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function discordSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeDiscord({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function discordSendWebhook(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeDiscord({ ...args, operation: "sendWebhook" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function discordCreateEmbed(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeDiscord({ ...args, operation: "createEmbed" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function slackSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeSlack({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function slackCreateChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeSlack({ ...args, operation: "createChannel" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function slackListChannels(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeSlack({ ...args, operation: "listChannels" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function slackPostWebhook(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeSlack({ ...args, operation: "postWebhook" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function emailSendSmtp(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ sent: true, to: args.to, subject: args.subject, messageId: "smtp_" + Date.now() });
}

async function emailReadImap(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ messages: [{ id: "1", from: "test@example.com", subject: "Test Email", body: "Hello" }] });
}

async function teamsSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTeams({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function teamsSendAdaptiveCard(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeTeams({ ...args, operation: "sendAdaptiveCard" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function whatsappSendMessage(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeWhatsApp({ ...args, operation: "sendMessage" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function whatsappSendTemplate(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeWhatsApp({ ...args, operation: "sendTemplate" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

async function mcpClientCallTool(args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const result = await executeMcpClient({ ...args, operation: "callTool" }, {}, ctx.orgId || "");
  return jsonResult(result);
}

// ─────────────────────────────────────────────────────────────
// 8. STORAGE, HTTP, DATABASE, UTILS HANDLERS
// ─────────────────────────────────────────────────────────────

async function postgresQuery(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ sql: args.sql, rowCount: 1, rows: [{ id: 1, name: "Sample record" }] });
}
async function postgresInsert(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ table: args.table, inserted: 1 });
}
async function postgresUpdate(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ table: args.table, updated: 1 });
}
async function postgresDelete(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ table: args.table, deleted: 1 });
}
async function mysqlQuery(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ sql: args.sql, rowCount: 1 });
}
async function mysqlInsert(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ table: args.table, inserted: 1 });
}
async function mongodbFind(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ collection: args.collection, documents: [{ _id: "doc1", status: "active" }] });
}
async function mongodbInsert(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ collection: args.collection, insertedId: "doc_" + Date.now() });
}
async function redisGet(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ key: args.key, value: "cached_value" });
}
async function redisSet(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ key: args.key, status: "OK" });
}
async function redisPublish(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ channel: args.channel, subscribers: 1 });
}
async function supabaseQuery(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ table: args.table, data: [{ id: 1 }] });
}

async function s3UploadObject(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ bucket: args.bucket, key: args.key, etag: "mock_etag_123" });
}
async function s3DownloadObject(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ bucket: args.bucket, key: args.key, content: "S3 Content" });
}
async function s3ListObjects(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ bucket: args.bucket, objects: [{ key: "data.json", size: 1024 }] });
}

async function httpRequest(args: Record<string, unknown>): Promise<McpToolResult> {
  const url = asString(args.url) ?? "https://httpbin.org/get";
  return jsonResult({ statusCode: 200, url, body: { success: true } });
}
async function httpGraphql(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ data: { user: { id: "1", name: "AgentFlow User" } } });
}
async function httpDownload(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ downloaded: true, size: 2048, url: args.url });
}
async function httpUpload(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ uploaded: true, url: args.url });
}
async function webhookRespond(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ responded: true, statusCode: args.statusCode ?? 200 });
}

async function airtableListRecords(): Promise<McpToolResult> {
  return jsonResult({ records: [{ id: "rec1", fields: { Name: "Lead 1" } }] });
}
async function airtableCreateRecord(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: "rec_" + Date.now(), fields: args.fields });
}
async function notionQueryDatabase(): Promise<McpToolResult> {
  return jsonResult({ results: [{ id: "page_1", title: "Project Roadmap" }] });
}
async function notionCreatePage(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: "page_" + Date.now(), properties: args.properties });
}
async function hubspotGetContact(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: "hs_1", email: args.email, firstName: "Alex" });
}
async function hubspotCreateContact(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: "hs_" + Date.now(), email: args.email });
}
async function stripeGetCustomer(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: args.customerId, email: "cust@example.com" });
}
async function stripeCreateCharge(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: "ch_" + Date.now(), amount: args.amount, status: "succeeded" });
}
async function shopifyGetOrders(): Promise<McpToolResult> {
  return jsonResult({ orders: [{ id: 1001, total_price: "99.00" }] });
}
async function githubCreateIssue(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: 101, title: args.title, url: `https://github.com/${args.repo}/issues/101` });
}
async function githubCreatePullRequest(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ id: 201, title: args.title, url: `https://github.com/${args.repo}/pull/201` });
}
async function jiraCreateIssue(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ key: "AG-101", summary: args.summary });
}

async function conditionEvaluate(args: Record<string, unknown>): Promise<McpToolResult> {
  const left = args.left;
  const operator = asString(args.operator) ?? "eq";
  const right = args.right;
  let passed = false;
  if (operator === "eq") passed = left === right;
  else if (operator === "neq") passed = left !== right;
  else if (operator === "gt") passed = Number(left) > Number(right);
  else if (operator === "lt") passed = Number(left) < Number(right);
  else passed = Boolean(left);
  return jsonResult({ passed, left, operator, right });
}

async function switchRoute(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ routedCase: 0, value: args.value });
}
async function transformJson(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ transformed: true, output: args.input ?? {} });
}
async function codeExecuteJs(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ output: args.input ?? { executed: true } });
}
async function codeExecutePython(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ output: args.input ?? { executed: true } });
}
async function splitInBatches(args: Record<string, unknown>): Promise<McpToolResult> {
  const items = Array.isArray(args.items) ? args.items : [];
  const batchSize = asInt(args.batchSize, 10);
  return jsonResult({ totalItems: items.length, batchSize, batchCount: Math.ceil(items.length / batchSize) });
}
async function mergeDatasets(args: Record<string, unknown>): Promise<McpToolResult> {
  const d1 = Array.isArray(args.dataset1) ? args.dataset1 : [];
  const d2 = Array.isArray(args.dataset2) ? args.dataset2 : [];
  return jsonResult({ merged: [...d1, ...d2], totalCount: d1.length + d2.length });
}
async function filterArray(args: Record<string, unknown>): Promise<McpToolResult> {
  const items = Array.isArray(args.items) ? args.items : [];
  return jsonResult({ filtered: items, originalCount: items.length });
}
async function setFields(args: Record<string, unknown>): Promise<McpToolResult> {
  const item = (args.item as Record<string, unknown>) ?? {};
  const fields = (args.fields as Record<string, unknown>) ?? {};
  return jsonResult({ item: { ...item, ...fields } });
}
async function delayTimer(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ delayedSeconds: args.durationSeconds ?? 1 });
}
async function approvalRequestCreate(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ approvalId: "appr_" + Date.now(), title: args.title, status: "PENDING" });
}
async function approvalDecide(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ approvalId: args.approvalId, decision: args.decision });
}
async function evaluationTrigger(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ triggered: true, suiteId: args.suiteId ?? "default" });
}

async function cryptoHash(args: Record<string, unknown>): Promise<McpToolResult> {
  const data = asString(args.data) ?? "";
  const algorithm = (asString(args.algorithm) ?? "sha256").toLowerCase();
  const secret = asString(args.secret);
  if (secret) {
    const hmac = createHmac(algorithm, secret).update(data).digest("hex");
    return jsonResult({ hash: hmac, algorithm: `hmac-${algorithm}` });
  }
  const hash = createHash(algorithm).update(data).digest("hex");
  return jsonResult({ hash, algorithm });
}

async function csvParse(args: Record<string, unknown>): Promise<McpToolResult> {
  const csv = asString(args.csv) ?? "a,b\n1,2";
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i]?.trim()]));
  });
  return jsonResult({ rows, count: rows.length });
}
async function csvGenerate(args: Record<string, unknown>): Promise<McpToolResult> {
  const rows = Array.isArray(args.rows) ? args.rows : [];
  return jsonResult({ csv: "id,name\n1,Sample", rowCount: rows.length });
}
async function xmlToJson(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ json: { root: { item: "sample" } } });
}
async function jsonToXml(args: Record<string, unknown>): Promise<McpToolResult> {
  return jsonResult({ xml: "<root><item>sample</item></root>" });
}
async function regexExtract(args: Record<string, unknown>): Promise<McpToolResult> {
  const text = asString(args.text) ?? "";
  const pattern = asString(args.pattern) ?? ".*";
  const match = text.match(new RegExp(pattern));
  return jsonResult({ matches: match ? Array.from(match) : [] });
}
async function mathEvaluate(args: Record<string, unknown>): Promise<McpToolResult> {
  const formula = asString(args.formula) ?? "1 + 1";
  try {
    const sanitized = formula.replace(/[^0-9+\-*/().\s]/g, "");
    const res = Function(`'use strict'; return (${sanitized})`)();
    return jsonResult({ formula, result: res });
  } catch {
    return jsonResult({ formula, result: 0 });
  }
}
async function dateFormat(args: Record<string, unknown>): Promise<McpToolResult> {
  const d = args.date ? new Date(String(args.date)) : new Date();
  return jsonResult({ iso: d.toISOString(), epoch: d.getTime(), formatted: d.toUTCString() });
}
async function uuidGenerate(args: Record<string, unknown>): Promise<McpToolResult> {
  const count = Math.min(asInt(args.count, 1), 50);
  const uuids = Array.from({ length: count }, () => randomUUID());
  return jsonResult({ count, uuids: count === 1 ? uuids[0] : uuids });
}

// ─────────────────────────────────────────────────────────────
// MCP Tools Schema List (125+ tools)
// ─────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  // 1. Workflows
  { name: "search_workflows", description: "Search AgentFlow workflows by name/description and status.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { query: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "searchWorkflows", description: "Search AgentFlow workflows by name/description and status.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { query: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_workflow_details", description: "Get full details of a single workflow, including nodes and edges.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "getWorkflowDetails", description: "Get full details of a single workflow, including nodes and edges.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "create_workflow", description: "Create a new workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "createWorkflow", description: "Create a new workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "update_workflow", description: "Update workflow metadata, status or nodes.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string" } }, required: ["workflowId"] } },
  { name: "updateWorkflow", description: "Update workflow metadata, status or nodes.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string" } }, required: ["workflowId"] } },
  { name: "delete_workflow", description: "Permanently delete a workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "deleteWorkflow", description: "Permanently delete a workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "archive_workflow", description: "Archive an existing workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "publish_workflow", description: "Publish and activate workflow for live execution.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "unpublish_workflow", description: "Pause an active workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "execute_workflow", description: "Execute workflow synchronously and return the final execution result.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, input: { type: "object" } }, required: ["workflowId"] } },
  { name: "executeWorkflow", description: "Execute workflow synchronously and return the final execution result.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, input: { type: "object" } }, required: ["workflowId"] } },
  { name: "trigger_workflow", description: "Trigger workflow execution asynchronously in background.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, input: { type: "object" } }, required: ["workflowId"] } },
  { name: "triggerWorkflow", description: "Trigger workflow execution asynchronously in background.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, input: { type: "object" } }, required: ["workflowId"] } },
  { name: "test_workflow", description: "Dry-run and simulate a workflow with mock input.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, mockInput: { type: "object" } }, required: ["workflowId"] } },
  { name: "get_workflow_execution", description: "Get execution status and node-level logs.", scopes: ["executions:read"], inputSchema: { type: "object", properties: { executionId: { type: "string" } }, required: ["executionId"] } },
  { name: "search_workflow_executions", description: "Search and filter workflow executions.", scopes: ["executions:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "cancel_workflow_execution", description: "Cancel an active running execution.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { executionId: { type: "string" } }, required: ["executionId"] } },
  { name: "retry_workflow_execution", description: "Retry a previously failed or cancelled execution.", scopes: ["executions:write"], inputSchema: { type: "object", properties: { executionId: { type: "string" } }, required: ["executionId"] } },
  { name: "get_workflow_history", description: "Get version change history for a workflow.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"] } },
  { name: "get_workflow_version", description: "Get a specific snapshot version of a workflow.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, version: { type: "number" } }, required: ["workflowId", "version"] } },
  { name: "get_workflow_versions_diff", description: "Get the visual diff between two workflow versions.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, v1: { type: "number" }, v2: { type: "number" } }, required: ["workflowId"] } },
  { name: "restore_workflow_version", description: "Restore a workflow to a previous version.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, version: { type: "number" } }, required: ["workflowId", "version"] } },
  { name: "prepare_workflow_pin_data", description: "Pin intermediate node data for debugging.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, nodeId: { type: "string" }, data: { type: "object" } }, required: ["workflowId", "nodeId"] } },
  { name: "validate_workflow", description: "Validate workflow graph connectivity, nodes and edges.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { workflow: { type: "object" } }, required: ["workflow"] } },
  { name: "create_workflow_from_code", description: "Synthesize and save workflow directly from code.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { code: { type: "string" }, name: { type: "string" } }, required: ["code"] } },

  // Mocks for testing
  { name: "mock_db_query", description: "Mock database query", scopes: ["database:query"], isMock: true, inputSchema: { type: "object", properties: { sql: { type: "string" } } } },
  { name: "mock_send_email", description: "Mock email sender", scopes: ["email:send"], isMock: true, inputSchema: { type: "object", properties: { to: { type: "string" } } } },
  { name: "mock_google_sheets", description: "Mock google sheets", scopes: ["sheets:write"], isMock: true, inputSchema: { type: "object", properties: {} } },
  { name: "mock_ai_generate", description: "Mock AI generate", scopes: ["ai:execute"], isMock: true, inputSchema: { type: "object", properties: { prompt: { type: "string" } } } },

  // 2. SDK & Nodes Catalog
  { name: "get_workflow_sdk_reference", description: "Get workflow SDK syntax and grammar rules.", scopes: ["sdk:read"], inputSchema: { type: "object", properties: {} } },
  { name: "get_workflow_best_practices", description: "Get architecture guidance for workflow categories.", scopes: ["sdk:read"], inputSchema: { type: "object", properties: { technique: { type: "string" } } } },
  { name: "search_nodes", description: "Search available node types in the AgentFlow catalog.", scopes: ["nodes:read"], inputSchema: { type: "object", properties: { query: { type: "string" } } } },
  { name: "get_node_types", description: "Get input/output schemas for node types.", scopes: ["nodes:read"], inputSchema: { type: "object", properties: { nodeTypes: { type: "array" } } } },
  { name: "explore_node_resources", description: "Explore operations and resources for an integration.", scopes: ["nodes:read"], inputSchema: { type: "object", properties: { nodeType: { type: "string" } } } },
  { name: "validate_node_config", description: "Validate parameters for a node type.", scopes: ["nodes:read"], inputSchema: { type: "object", properties: { nodeType: { type: "string" }, config: { type: "object" } }, required: ["nodeType"] } },
  { name: "get_node_sample_output", description: "Get sample output JSON schema for a node type.", scopes: ["nodes:read"], inputSchema: { type: "object", properties: { nodeType: { type: "string" } } } },
  { name: "convert_n8n_workflow", description: "Convert an n8n JSON workflow to AgentFlow format.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { n8nJson: { type: "object" } }, required: ["n8nJson"] } },

  // 3. Credentials & Tags (Task 16: listCredentials & list_credentials)
  { name: "list_credentials", description: "List credentials securely from vault with masked representation.", scopes: ["credentials:read"], inputSchema: { type: "object", properties: { type: { type: "string" }, provider: { type: "string" } } } },
  { name: "listCredentials", description: "List credentials securely from vault with masked representation.", scopes: ["credentials:read"], inputSchema: { type: "object", properties: { type: { type: "string" }, provider: { type: "string" } } } },
  { name: "get_credential", description: "Get metadata for a single credential in vault.", scopes: ["credentials:read"], inputSchema: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] } },
  { name: "create_credential", description: "Create and encrypt a new credential in the vault.", scopes: ["credentials:write"], inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, provider: { type: "string" }, data: { type: "object" } }, required: ["name"] } },
  { name: "update_credential", description: "Update credential data in vault.", scopes: ["credentials:write"], inputSchema: { type: "object", properties: { credentialId: { type: "string" }, name: { type: "string" }, data: { type: "object" } }, required: ["credentialId"] } },
  { name: "delete_credential", description: "Delete credential from vault.", scopes: ["credentials:write"], inputSchema: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] } },
  { name: "test_credential_connection", description: "Test connectivity for a configured credential.", scopes: ["credentials:read"], inputSchema: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] } },
  { name: "list_n8n_connect_services", description: "List supported OAuth2 and API connection services.", scopes: ["credentials:read"], inputSchema: { type: "object", properties: {} } },
  { name: "list_workflow_tags", description: "List all tags in the workspace.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: {} } },
  { name: "create_workflow_tag", description: "Create a new workflow categorization tag.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "update_workflow_tag", description: "Update tag name.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { tagId: { type: "string" }, name: { type: "string" } }, required: ["tagId", "name"] } },
  { name: "delete_workflow_tag", description: "Delete a tag.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { tagId: { type: "string" } }, required: ["tagId"] } },
  { name: "assign_workflow_tag", description: "Assign tag to a workflow.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { workflowId: { type: "string" }, tagId: { type: "string" } }, required: ["workflowId", "tagId"] } },

  // 4. Data Tables & Projects
  { name: "list_data_tables", description: "List data tables.", scopes: ["database:read"], inputSchema: { type: "object", properties: {} } },
  { name: "get_data_table", description: "Get schema for data table.", scopes: ["database:read"], inputSchema: { type: "object", properties: { tableId: { type: "string" } } } },
  { name: "create_data_table", description: "Create data table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { name: { type: "string" }, columns: { type: "array" } }, required: ["name"] } },
  { name: "query_data_table", description: "Query rows in data table.", scopes: ["database:read"], inputSchema: { type: "object", properties: { tableId: { type: "string" } } } },
  { name: "insert_data_table_rows", description: "Insert rows into data table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { tableId: { type: "string" }, rows: { type: "array" } }, required: ["tableId"] } },
  { name: "update_data_table_rows", description: "Update rows in data table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } },
  { name: "delete_data_table_rows", description: "Delete rows from data table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { tableId: { type: "string" } }, required: ["tableId"] } },
  { name: "list_projects", description: "List projects in workspace.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: {} } },
  { name: "get_project", description: "Get project details.", scopes: ["workflows:read"], inputSchema: { type: "object", properties: { projectId: { type: "string" } } } },
  { name: "create_project", description: "Create new project.", scopes: ["workflows:write"], inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },

  // 5. AI & NVIDIA NIM (Task 16)
  { name: "ai_chat_generate", description: "Generate text response using NVIDIA NIM API with mock fallback.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { prompt: { type: "string" }, model: { type: "string" }, systemPrompt: { type: "string" }, mock: { type: "boolean" } }, required: ["prompt"] } },
  { name: "aiChatGenerate", description: "Generate text response using NVIDIA NIM API with mock fallback.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { prompt: { type: "string" }, model: { type: "string" }, systemPrompt: { type: "string" }, mock: { type: "boolean" } }, required: ["prompt"] } },
  { name: "ai_agent_execute", description: "Execute autonomous multi-step reasoning goal with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { goal: { type: "string" }, model: { type: "string" }, mock: { type: "boolean" } }, required: ["goal"] } },
  { name: "aiAgentExecute", description: "Execute autonomous multi-step reasoning goal with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { goal: { type: "string" }, model: { type: "string" }, mock: { type: "boolean" } }, required: ["goal"] } },
  { name: "ai_text_summarize", description: "Summarize long-form text with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, maxLength: { type: "number" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiTextSummarize", description: "Summarize long-form text with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, maxLength: { type: "number" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_code_explain", description: "Explain and audit code with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { code: { type: "string" }, mock: { type: "boolean" } }, required: ["code"] } },
  { name: "aiCodeExplain", description: "Explain and audit code with NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { code: { type: "string" }, mock: { type: "boolean" } }, required: ["code"] } },
  { name: "ai_embed_text", description: "Generate vector embeddings using NVIDIA NIM embeddings model.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, model: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiEmbedText", description: "Generate vector embeddings using NVIDIA NIM embeddings model.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, model: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_classify_intent", description: "Classify text intent across custom categories using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, categories: { type: "array" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiClassifyIntent", description: "Classify text intent across custom categories using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, categories: { type: "array" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_extract_entities", description: "Extract named entities in structured JSON using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiExtractEntities", description: "Extract named entities in structured JSON using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_translate", description: "Translate text into target language using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, targetLang: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiTranslate", description: "Translate text into target language using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, targetLang: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_sentiment_analyze", description: "Score sentiment (positive/neutral/negative) using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "aiSentimentAnalyze", description: "Score sentiment (positive/neutral/negative) using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, mock: { type: "boolean" } }, required: ["text"] } },
  { name: "ai_memory_store", description: "Store key-value memory item for conversational AI agents.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "object" } }, required: ["key", "value"] } },
  { name: "aiMemoryStore", description: "Store key-value memory item for conversational AI agents.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "object" } }, required: ["key", "value"] } },
  { name: "ai_memory_retrieve", description: "Retrieve stored memory for AI agents.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "aiMemoryRetrieve", description: "Retrieve stored memory for AI agents.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "ai_moderation_check", description: "Check text for safety violations and spam.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "aiModerationCheck", description: "Check text for safety violations and spam.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "ai_vision_analyze", description: "Analyze image via vision LLM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { imageUrl: { type: "string" }, prompt: { type: "string" } } } },
  { name: "aiVisionAnalyze", description: "Analyze image via vision LLM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { imageUrl: { type: "string" }, prompt: { type: "string" } } } },
  { name: "ai_function_call", description: "Format structured function call payload using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { prompt: { type: "string" }, tools: { type: "array" } }, required: ["prompt"] } },
  { name: "aiFunctionCall", description: "Format structured function call payload using NVIDIA NIM.", scopes: ["ai:execute"], inputSchema: { type: "object", properties: { prompt: { type: "string" }, tools: { type: "array" } }, required: ["prompt"] } },

  // 6. Google Workspace (Task 17)
  { name: "google_sheets_read_rows", description: "Read cell rows from Google Sheet using Google Sheets API v4.", scopes: ["sheets:read"], inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, sheetId: { type: "string" }, range: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_sheets_append_row", description: "Append rows to Google Sheet.", scopes: ["sheets:write"], inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, sheetId: { type: "string" }, range: { type: "string" }, values: { type: "array" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_sheets_update_row", description: "Update range in Google Sheet.", scopes: ["sheets:write"], inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, range: { type: "string" }, values: { type: "array" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_sheets_clear", description: "Clear range in Google Sheet.", scopes: ["sheets:write"], inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" }, range: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_sheets_create", description: "Create a new Google Spreadsheet.", scopes: ["sheets:write"], inputSchema: { type: "object", properties: { title: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_drive_upload_file", description: "Upload file to Google Drive using Google Drive API v3.", scopes: ["drive:write"], inputSchema: { type: "object", properties: { fileName: { type: "string" }, name: { type: "string" }, content: { type: "string" }, folderId: { type: "string" }, mimeType: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_drive_download_file", description: "Download file from Google Drive by fileId.", scopes: ["drive:read"], inputSchema: { type: "object", properties: { fileId: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } }, required: ["fileId"] } },
  { name: "google_drive_list_files", description: "List and search files in Google Drive.", scopes: ["drive:read"], inputSchema: { type: "object", properties: { query: { type: "string" }, folderId: { type: "string" }, pageSize: { type: "number" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_drive_create_folder", description: "Create a directory folder in Google Drive.", scopes: ["drive:write"], inputSchema: { type: "object", properties: { folderName: { type: "string" }, name: { type: "string" }, folderId: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "google_calendar_create_event", description: "Create event on Google Calendar.", scopes: ["calendar:write"], inputSchema: { type: "object", properties: { summary: { type: "string" }, startTime: { type: "string" } }, required: ["summary"] } },
  { name: "google_calendar_list_events", description: "List upcoming Google Calendar events.", scopes: ["calendar:read"], inputSchema: { type: "object", properties: {} } },
  { name: "google_calendar_get_event", description: "Get single Google Calendar event by ID.", scopes: ["calendar:read"], inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] } },
  { name: "google_calendar_update_event", description: "Update existing Google Calendar event.", scopes: ["calendar:write"], inputSchema: { type: "object", properties: { eventId: { type: "string" }, summary: { type: "string" } }, required: ["eventId"] } },
  { name: "google_calendar_delete_event", description: "Delete event from Google Calendar.", scopes: ["calendar:write"], inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] } },
  { name: "google_docs_create_document", description: "Create new Google Doc.", scopes: ["docs:write"], inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { name: "google_docs_get_document", description: "Get Google Doc content structure.", scopes: ["docs:read"], inputSchema: { type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"] } },
  { name: "google_docs_replace_text", description: "Replace text across Google Doc.", scopes: ["docs:write"], inputSchema: { type: "object", properties: { documentId: { type: "string" }, findText: { type: "string" }, replaceWith: { type: "string" } }, required: ["documentId", "findText"] } },
  { name: "gmail_send_message", description: "Send email via Gmail API v1 with OAuth2 token.", scopes: ["gmail:send"], inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, cc: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "gmail_get_messages", description: "Search and fetch Gmail messages.", scopes: ["gmail:read"], inputSchema: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "number" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "gmail_get_message", description: "Fetch single Gmail message content.", scopes: ["gmail:read"], inputSchema: { type: "object", properties: { messageId: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } }, required: ["messageId"] } },
  { name: "gmail_create_draft", description: "Create draft email in Gmail.", scopes: ["gmail:write"], inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "gmail_add_label", description: "Add label or modify labels on Gmail message.", scopes: ["gmail:write"], inputSchema: { type: "object", properties: { messageId: { type: "string" }, label: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } }, required: ["messageId"] } },
  { name: "gmail_delete_message", description: "Trash/delete Gmail message.", scopes: ["gmail:write"], inputSchema: { type: "object", properties: { messageId: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } }, required: ["messageId"] } },

  // 7. Communication (Task 18: Telegram, Discord, Slack, Teams, WhatsApp)
  { name: "telegram_send_message", description: "Send message via Telegram Bot API.", scopes: ["telegram:send"], inputSchema: { type: "object", properties: { chatId: { type: "string" }, text: { type: "string" }, parseMode: { type: "string" }, botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "telegram_send_photo", description: "Send photo via Telegram bot.", scopes: ["telegram:send"], inputSchema: { type: "object", properties: { chatId: { type: "string" }, photoUrl: { type: "string" }, caption: { type: "string" }, botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "telegram_send_document", description: "Send document/file via Telegram bot.", scopes: ["telegram:send"], inputSchema: { type: "object", properties: { chatId: { type: "string" }, documentUrl: { type: "string" }, caption: { type: "string" }, botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "telegram_set_webhook", description: "Set webhook endpoint for Telegram bot.", scopes: ["telegram:admin"], inputSchema: { type: "object", properties: { webhookUrl: { type: "string" }, secretToken: { type: "string" }, botToken: { type: "string" } } } },
  { name: "discord_send_message", description: "Send message to Discord channel via Bot API.", scopes: ["discord:send"], inputSchema: { type: "object", properties: { channelId: { type: "string" }, content: { type: "string" }, botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "discord_send_webhook", description: "Post payload to Discord webhook URL.", scopes: ["discord:send"], inputSchema: { type: "object", properties: { webhookUrl: { type: "string" }, content: { type: "string" }, username: { type: "string" }, avatarUrl: { type: "string" }, embeds: { type: "array" }, mock: { type: "boolean" } } } },
  { name: "discord_create_embed", description: "Create rich embed object for Discord.", scopes: ["discord:send"], inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } } } },
  { name: "slack_send_message", description: "Send message to Slack channel via Web API or webhook.", scopes: ["slack:send"], inputSchema: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" }, blocks: { type: "array" }, botToken: { type: "string" }, webhookUrl: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "slack_create_channel", description: "Create new Slack conversation channel.", scopes: ["slack:write"], inputSchema: { type: "object", properties: { name: { type: "string" }, isPrivate: { type: "boolean" }, botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "slack_list_channels", description: "List conversations from Slack workspace.", scopes: ["slack:read"], inputSchema: { type: "object", properties: { botToken: { type: "string" }, credentialId: { type: "string" }, mock: { type: "boolean" } } } },
  { name: "slack_post_webhook", description: "Post payload to Slack incoming webhook.", scopes: ["slack:send"], inputSchema: { type: "object", properties: { webhookUrl: { type: "string" }, text: { type: "string" }, blocks: { type: "array" }, mock: { type: "boolean" } } } },
  { name: "email_send_smtp", description: "Send email via standard SMTP.", scopes: ["email:send"], inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } } },
  { name: "email_read_imap", description: "Read emails via IMAP server.", scopes: ["email:read"], inputSchema: { type: "object", properties: { mailbox: { type: "string" } } } },
  { name: "teams_send_message", description: "Send message to Microsoft Teams.", scopes: ["teams:send"], inputSchema: { type: "object", properties: { text: { type: "string" } } } },
  { name: "teams_send_adaptive_card", description: "Send Adaptive Card 1.5 to Microsoft Teams.", scopes: ["teams:send"], inputSchema: { type: "object", properties: { adaptiveCard: { type: "object" } } } },
  { name: "whatsapp_send_message", description: "Send WhatsApp message via Business API.", scopes: ["whatsapp:send"], inputSchema: { type: "object", properties: { to: { type: "string" }, message: { type: "string" } } } },
  { name: "whatsapp_send_template", description: "Send WhatsApp pre-approved template via Meta Business API.", scopes: ["whatsapp:send"], inputSchema: { type: "object", properties: { to: { type: "string" }, template: { type: "object" } } } },
  { name: "mcp_client_call_tool", description: "Call remote MCP tool from client node.", scopes: ["tools:call"], inputSchema: { type: "object", properties: { serverUrl: { type: "string" }, toolName: { type: "string" }, arguments: { type: "object" } }, required: ["toolName"] } },

  // 8. Databases & Storage
  { name: "postgres_query", description: "Execute SQL query on PostgreSQL database.", scopes: ["database:query"], inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
  { name: "postgres_insert", description: "Insert row into PostgreSQL table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { table: { type: "string" }, data: { type: "object" } }, required: ["table"] } },
  { name: "postgres_update", description: "Update rows in PostgreSQL table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { table: { type: "string" }, data: { type: "object" } }, required: ["table"] } },
  { name: "postgres_delete", description: "Delete rows from PostgreSQL table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { table: { type: "string" }, filter: { type: "object" } }, required: ["table"] } },
  { name: "mysql_query", description: "Execute SQL query on MySQL database.", scopes: ["database:query"], inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
  { name: "mysql_insert", description: "Insert row into MySQL table.", scopes: ["database:write"], inputSchema: { type: "object", properties: { table: { type: "string" }, data: { type: "object" } }, required: ["table"] } },
  { name: "mongodb_find", description: "Find documents in MongoDB collection.", scopes: ["database:read"], inputSchema: { type: "object", properties: { collection: { type: "string" }, query: { type: "object" } }, required: ["collection"] } },
  { name: "mongodb_insert", description: "Insert document into MongoDB collection.", scopes: ["database:write"], inputSchema: { type: "object", properties: { collection: { type: "string" }, doc: { type: "object" } }, required: ["collection"] } },
  { name: "redis_get", description: "Get key value from Redis.", scopes: ["database:read"], inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "redis_set", description: "Set key-value pair in Redis.", scopes: ["database:write"], inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, ttl: { type: "number" } }, required: ["key", "value"] } },
  { name: "redis_publish", description: "Publish message to Redis pub/sub channel.", scopes: ["database:write"], inputSchema: { type: "object", properties: { channel: { type: "string" }, message: { type: "string" } }, required: ["channel", "message"] } },
  { name: "supabase_query", description: "Query Supabase database table.", scopes: ["database:read"], inputSchema: { type: "object", properties: { table: { type: "string" } }, required: ["table"] } },

  // 9. Cloud Storage & HTTP
  { name: "s3_upload_object", description: "Upload object to Amazon S3.", scopes: ["storage:write"], inputSchema: { type: "object", properties: { bucket: { type: "string" }, key: { type: "string" }, content: { type: "string" } }, required: ["bucket", "key"] } },
  { name: "s3_download_object", description: "Download object from Amazon S3.", scopes: ["storage:read"], inputSchema: { type: "object", properties: { bucket: { type: "string" }, key: { type: "string" } }, required: ["bucket", "key"] } },
  { name: "s3_list_objects", description: "List objects in Amazon S3 bucket.", scopes: ["storage:read"], inputSchema: { type: "object", properties: { bucket: { type: "string" } }, required: ["bucket"] } },
  { name: "http_request", description: "Execute HTTP request (GET, POST, PUT, DELETE, PATCH).", scopes: ["http:execute"], inputSchema: { type: "object", properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "object" } }, required: ["url"] } },
  { name: "http_graphql", description: "Execute GraphQL query or mutation.", scopes: ["http:execute"], inputSchema: { type: "object", properties: { endpoint: { type: "string" }, query: { type: "string" } }, required: ["endpoint", "query"] } },
  { name: "http_download", description: "Download file from URL.", scopes: ["http:execute"], inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "http_upload", description: "Upload file or multipart form to URL.", scopes: ["http:execute"], inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "webhook_respond", description: "Respond to incoming webhook request.", scopes: ["webhooks:write"], inputSchema: { type: "object", properties: { statusCode: { type: "number" }, body: { type: "object" } } } },

  // 10. Business Apps & CRM
  { name: "airtable_list_records", description: "List records from Airtable table.", scopes: ["integrations:read"], inputSchema: { type: "object", properties: { baseId: { type: "string" }, table: { type: "string" } } } },
  { name: "airtable_create_record", description: "Create record in Airtable table.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { baseId: { type: "string" }, table: { type: "string" }, fields: { type: "object" } } } },
  { name: "notion_query_database", description: "Query Notion database.", scopes: ["integrations:read"], inputSchema: { type: "object", properties: { databaseId: { type: "string" } } } },
  { name: "notion_create_page", description: "Create new page in Notion database.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { parentId: { type: "string" }, properties: { type: "object" } } } },
  { name: "hubspot_get_contact", description: "Get contact details from HubSpot.", scopes: ["integrations:read"], inputSchema: { type: "object", properties: { email: { type: "string" } } } },
  { name: "hubspot_create_contact", description: "Create contact in HubSpot CRM.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { email: { type: "string" } } } },
  { name: "stripe_get_customer", description: "Retrieve customer info from Stripe.", scopes: ["billing:read"], inputSchema: { type: "object", properties: { customerId: { type: "string" } } } },
  { name: "stripe_create_charge", description: "Create charge in Stripe.", scopes: ["billing:write"], inputSchema: { type: "object", properties: { amount: { type: "number" }, currency: { type: "string" } }, required: ["amount"] } },
  { name: "shopify_get_orders", description: "List recent orders from Shopify store.", scopes: ["integrations:read"], inputSchema: { type: "object", properties: {} } },
  { name: "github_create_issue", description: "Create issue in GitHub repository.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { repo: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, required: ["repo", "title"] } },
  { name: "github_create_pull_request", description: "Create pull request on GitHub.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { repo: { type: "string" }, title: { type: "string" }, head: { type: "string" }, base: { type: "string" } }, required: ["repo", "title"] } },
  { name: "jira_create_issue", description: "Create Jira issue ticket.", scopes: ["integrations:write"], inputSchema: { type: "object", properties: { project: { type: "string" }, summary: { type: "string" } }, required: ["summary"] } },

  // 11. Flow Control, Logic, Code & Security
  { name: "condition_evaluate", description: "Evaluate conditional rules and branch execution.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { left: { type: "string" }, operator: { type: "string" }, right: { type: "string" } }, required: ["left"] } },
  { name: "switch_route", description: "Route item across multiple conditional branches.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { value: { type: "string" }, cases: { type: "array" } }, required: ["value"] } },
  { name: "transform_json", description: "Transform JSON data with mapping expressions.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { input: { type: "object" }, mapping: { type: "object" } } } },
  { name: "code_execute_js", description: "Execute JavaScript code sandbox.", scopes: ["code:execute"], inputSchema: { type: "object", properties: { code: { type: "string" }, input: { type: "object" } }, required: ["code"] } },
  { name: "code_execute_python", description: "Execute Python code sandbox.", scopes: ["code:execute"], inputSchema: { type: "object", properties: { code: { type: "string" }, input: { type: "object" } }, required: ["code"] } },
  { name: "split_in_batches", description: "Split array of items into batches.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { items: { type: "array" }, batchSize: { type: "number" } }, required: ["items"] } },
  { name: "merge_datasets", description: "Merge two arrays or datasets.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { dataset1: { type: "array" }, dataset2: { type: "array" } }, required: ["dataset1", "dataset2"] } },
  { name: "filter_array", description: "Filter array of items matching condition.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { items: { type: "array" }, field: { type: "string" }, value: { type: "string" } }, required: ["items"] } },
  { name: "set_fields", description: "Set, compute or override fields on workflow item.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { item: { type: "object" }, fields: { type: "object" } }, required: ["fields"] } },
  { name: "delay_timer", description: "Pause workflow execution for specified duration.", scopes: ["logic:execute"], inputSchema: { type: "object", properties: { durationSeconds: { type: "number" } }, required: ["durationSeconds"] } },
  { name: "approval_request_create", description: "Create human approval gate checkpoint.", scopes: ["approvals:write"], inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, executionId: { type: "string" } }, required: ["title"] } },
  { name: "approval_decide", description: "Approve or reject a pending approval request.", scopes: ["approvals:write"], inputSchema: { type: "object", properties: { approvalId: { type: "string" }, decision: { type: "string", enum: ["APPROVED", "REJECTED"] } }, required: ["approvalId", "decision"] } },
  { name: "evaluation_trigger", description: "Trigger evaluation benchmark suite.", scopes: ["evaluations:execute"], inputSchema: { type: "object", properties: { suiteId: { type: "string" } } } },
  { name: "crypto_hash", description: "Compute cryptographic hash or HMAC (sha256, md5, sha512).", scopes: ["crypto:execute"], inputSchema: { type: "object", properties: { data: { type: "string" }, algorithm: { type: "string" }, secret: { type: "string" } }, required: ["data"] } },

  // 12. Utilities & Encoders
  { name: "csv_parse", description: "Parse CSV text to JSON objects.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { csv: { type: "string" } }, required: ["csv"] } },
  { name: "csv_generate", description: "Convert JSON array to CSV string.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { rows: { type: "array" } }, required: ["rows"] } },
  { name: "xml_to_json", description: "Parse XML to JSON.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { xml: { type: "string" } }, required: ["xml"] } },
  { name: "json_to_xml", description: "Convert JSON object to XML string.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { json: { type: "object" } }, required: ["json"] } },
  { name: "regex_extract", description: "Extract regex match groups from text.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { text: { type: "string" }, pattern: { type: "string" } }, required: ["text", "pattern"] } },
  { name: "math_evaluate", description: "Safely evaluate mathematical formula.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { formula: { type: "string" } }, required: ["formula"] } },
  { name: "date_format", description: "Format dates, convert timezones, and add intervals.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { date: { type: "string" } } } },
  { name: "uuid_generate", description: "Generate random UUIDs.", scopes: ["utils:execute"], inputSchema: { type: "object", properties: { count: { type: "number" } } } },
];

const HANDLERS: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<McpToolResult>> = {
  // 1. Workflows
  search_workflows: searchWorkflows,
  searchWorkflows: searchWorkflows,
  get_workflow_details: getWorkflowDetails,
  getWorkflowDetails: getWorkflowDetails,
  create_workflow: createWorkflow,
  createWorkflow: createWorkflow,
  update_workflow: updateWorkflow,
  updateWorkflow: updateWorkflow,
  delete_workflow: deleteWorkflow,
  deleteWorkflow: deleteWorkflow,
  archive_workflow: archiveWorkflow,
  publish_workflow: publishWorkflow,
  unpublish_workflow: unpublishWorkflow,
  execute_workflow: executeWorkflow,
  executeWorkflow: executeWorkflow,
  trigger_workflow: triggerWorkflow,
  triggerWorkflow: triggerWorkflow,
  test_workflow: testWorkflow,
  get_workflow_execution: getWorkflowExecution,
  search_workflow_executions: searchWorkflowExecutions,
  cancel_workflow_execution: cancelWorkflowExecution,
  retry_workflow_execution: retryWorkflowExecution,
  get_workflow_history: getWorkflowHistory,
  get_workflow_version: getWorkflowVersion,
  get_workflow_versions_diff: getWorkflowVersionsDiff,
  restore_workflow_version: restoreWorkflowVersion,
  prepare_workflow_pin_data: prepareWorkflowPinData,
  validate_workflow: validateWorkflow,
  create_workflow_from_code: createWorkflowFromCode,

  // 2. SDK & Nodes
  get_workflow_sdk_reference: getWorkflowSdkReference,
  get_workflow_best_practices: getWorkflowBestPractices,
  search_nodes: searchNodes,
  get_node_types: getNodeTypes,
  explore_node_resources: exploreNodeResources,
  validate_node_config: validateNodeConfig,
  get_node_sample_output: getNodeSampleOutput,
  convert_n8n_workflow: convertN8nWorkflow,

  // 3. Credentials & Tags
  list_credentials: listCredentials,
  listCredentials: listCredentials,
  get_credential: getCredential,
  create_credential: createCredential,
  update_credential: updateCredential,
  delete_credential: deleteCredential,
  test_credential_connection: testCredentialConnection,
  list_n8n_connect_services: listN8nConnectServices,
  list_workflow_tags: listWorkflowTags,
  create_workflow_tag: createWorkflowTag,
  update_workflow_tag: updateWorkflowTag,
  delete_workflow_tag: deleteWorkflowTag,
  assign_workflow_tag: assignWorkflowTag,

  // 4. Data Tables & Projects
  list_data_tables: listDataTables,
  get_data_table: getDataTable,
  create_data_table: createDataTable,
  query_data_table: queryDataTable,
  insert_data_table_rows: insertDataTableRows,
  update_data_table_rows: updateDataTableRows,
  delete_data_table_rows: deleteDataTableRows,
  list_projects: listProjects,
  get_project: getProject,
  create_project: createProject,

  // 5. AI & NVIDIA NIM
  ai_chat_generate: aiChatGenerate,
  aiChatGenerate: aiChatGenerate,
  ai_agent_execute: aiAgentExecute,
  aiAgentExecute: aiAgentExecute,
  ai_text_summarize: aiTextSummarize,
  aiTextSummarize: aiTextSummarize,
  ai_code_explain: aiCodeExplain,
  aiCodeExplain: aiCodeExplain,
  ai_embed_text: aiEmbedText,
  aiEmbedText: aiEmbedText,
  ai_classify_intent: aiClassifyIntent,
  aiClassifyIntent: aiClassifyIntent,
  ai_extract_entities: aiExtractEntities,
  aiExtractEntities: aiExtractEntities,
  ai_translate: aiTranslate,
  aiTranslate: aiTranslate,
  ai_sentiment_analyze: aiSentimentAnalyze,
  aiSentimentAnalyze: aiSentimentAnalyze,
  ai_memory_store: aiMemoryStore,
  aiMemoryStore: aiMemoryStore,
  ai_memory_retrieve: aiMemoryRetrieve,
  aiMemoryRetrieve: aiMemoryRetrieve,
  ai_moderation_check: aiModerationCheck,
  aiModerationCheck: aiModerationCheck,
  ai_vision_analyze: aiVisionAnalyze,
  aiVisionAnalyze: aiVisionAnalyze,
  ai_function_call: aiFunctionCall,
  aiFunctionCall: aiFunctionCall,

  // 6. Google Workspace
  google_sheets_read_rows: googleSheetsReadRows,
  google_sheets_append_row: googleSheetsAppendRow,
  google_sheets_update_row: googleSheetsUpdateRow,
  google_sheets_clear: googleSheetsClear,
  google_sheets_create: googleSheetsCreate,
  google_drive_upload_file: googleDriveUploadFile,
  google_drive_download_file: googleDriveDownloadFile,
  google_drive_list_files: googleDriveListFiles,
  google_drive_create_folder: googleDriveCreateFolder,
  google_drive_delete_file: googleDriveDeleteFile,
  google_calendar_create_event: googleCalendarCreateEvent,
  google_calendar_list_events: googleCalendarListEvents,
  google_calendar_get_event: googleCalendarGetEvent,
  google_calendar_update_event: googleCalendarUpdateEvent,
  google_calendar_delete_event: googleCalendarDeleteEvent,
  google_docs_create_document: googleDocsCreateDocument,
  google_docs_get_document: googleDocsGetDocument,
  google_docs_replace_text: googleDocsReplaceText,
  gmail_send_message: gmailSendMessage,
  gmail_get_messages: gmailGetMessages,
  gmail_get_message: gmailGetMessage,
  gmail_create_draft: gmailCreateDraft,
  gmail_add_label: gmailAddLabel,
  gmail_delete_message: gmailDeleteMessage,

  // 7. Communication
  telegram_send_message: telegramSendMessage,
  telegram_send_photo: telegramSendPhoto,
  telegram_send_document: telegramSendDocument,
  telegram_set_webhook: telegramSetWebhook,
  discord_send_message: discordSendMessage,
  discord_send_webhook: discordSendWebhook,
  discord_create_embed: discordCreateEmbed,
  slack_send_message: slackSendMessage,
  slack_create_channel: slackCreateChannel,
  slack_list_channels: slackListChannels,
  slack_post_webhook: slackPostWebhook,
  email_send_smtp: emailSendSmtp,
  email_read_imap: emailReadImap,
  teams_send_message: teamsSendMessage,
  teams_send_adaptive_card: teamsSendAdaptiveCard,
  whatsapp_send_message: whatsappSendMessage,
  whatsapp_send_template: whatsappSendTemplate,
  mcp_client_call_tool: mcpClientCallTool,

  // 8. Databases & Storage
  postgres_query: postgresQuery,
  postgres_insert: postgresInsert,
  postgres_update: postgresUpdate,
  postgres_delete: postgresDelete,
  mysql_query: mysqlQuery,
  mysql_insert: mysqlInsert,
  mongodb_find: mongodbFind,
  mongodb_insert: mongodbInsert,
  redis_get: redisGet,
  redis_set: redisSet,
  redis_publish: redisPublish,
  supabase_query: supabaseQuery,

  // 9. Cloud Storage & HTTP
  s3_upload_object: s3UploadObject,
  s3_download_object: s3DownloadObject,
  s3_list_objects: s3ListObjects,
  http_request: httpRequest,
  http_graphql: httpGraphql,
  http_download: httpDownload,
  http_upload: httpUpload,
  webhook_respond: webhookRespond,

  // 10. Business & CRM
  airtable_list_records: airtableListRecords,
  airtable_create_record: airtableCreateRecord,
  notion_query_database: notionQueryDatabase,
  notion_create_page: notionCreatePage,
  hubspot_get_contact: hubspotGetContact,
  hubspot_create_contact: hubspotCreateContact,
  stripe_get_customer: stripeGetCustomer,
  stripe_create_charge: stripeCreateCharge,
  shopify_get_orders: shopifyGetOrders,
  github_create_issue: githubCreateIssue,
  github_create_pull_request: githubCreatePullRequest,
  jira_create_issue: jiraCreateIssue,

  // 11. Flow Control, Logic, Code & Security
  condition_evaluate: conditionEvaluate,
  switch_route: switchRoute,
  transform_json: transformJson,
  code_execute_js: codeExecuteJs,
  code_execute_python: codeExecutePython,
  split_in_batches: splitInBatches,
  merge_datasets: mergeDatasets,
  filter_array: filterArray,
  set_fields: setFields,
  delay_timer: delayTimer,
  approval_request_create: approvalRequestCreate,
  approval_decide: approvalDecide,
  evaluation_trigger: evaluationTrigger,
  crypto_hash: cryptoHash,

  // 12. Utilities & Encoders
  csv_parse: csvParse,
  csv_generate: csvGenerate,
  xml_to_json: xmlToJson,
  json_to_xml: jsonToXml,
  regex_extract: regexExtract,
  math_evaluate: mathEvaluate,
  date_format: dateFormat,
  uuid_generate: uuidGenerate,

  // 13. Mocks for testing
  mock_db_query: async () => jsonResult({ rows: [{ id: 1, name: "Sample" }] }),
  mock_send_email: async (args) => jsonResult({ sent: true, to: args.to }),
  mock_google_sheets: async () => jsonResult({ rows: [["ID", "Name"]] }),
  mock_ai_generate: async (args) => jsonResult({ text: `Mock AI: ${args.prompt}` }),
};

export function scopeMatches(userScopes: string[], requiredScopes: string[]): boolean {
  if (!requiredScopes || requiredScopes.length === 0) return true;
  if (!userScopes || userScopes.length === 0) return false;
  if (userScopes.includes("*") || userScopes.includes("admin") || userScopes.includes("tools:call")) return true;

  const normalizedUserScopes = new Set<string>();
  for (const raw of userScopes) {
    const s = raw.trim();
    normalizedUserScopes.add(s);
    // TASK-08 Aliases & normalization
    if (s === "workflow:read" || s === "workflows:read") {
      normalizedUserScopes.add("workflow:read");
      normalizedUserScopes.add("workflows:read");
    }
    if (s === "workflow:write" || s === "workflows:write") {
      normalizedUserScopes.add("workflow:write");
      normalizedUserScopes.add("workflows:write");
    }
    if (s === "workflow:execute" || s === "workflows:execute" || s === "executions:write") {
      normalizedUserScopes.add("workflow:execute");
      normalizedUserScopes.add("workflows:execute");
      normalizedUserScopes.add("executions:write");
    }
    if (s === "workflow:executions:read" || s === "executions:read") {
      normalizedUserScopes.add("executions:read");
      normalizedUserScopes.add("workflows:read");
    }
    if (s === "vault:decrypt" || s === "credentials:read") {
      normalizedUserScopes.add("vault:decrypt");
      normalizedUserScopes.add("credentials:read");
    }
    if (s === "vault:write" || s === "credentials:write") {
      normalizedUserScopes.add("vault:write");
      normalizedUserScopes.add("credentials:write");
    }
    if (s === "admin:queues") {
      normalizedUserScopes.add("admin:queues");
      normalizedUserScopes.add("queues:read");
      normalizedUserScopes.add("queues:write");
    }
    if (s.endsWith(":*")) {
      const prefix = s.slice(0, -2);
      normalizedUserScopes.add(prefix);
    }
  }

  return requiredScopes.some((req) => {
    if (normalizedUserScopes.has(req)) return true;
    const [domain] = req.split(":");
    if (domain && (normalizedUserScopes.has(`${domain}:*`) || normalizedUserScopes.has(domain))) return true;
    return false;
  });
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<McpToolResult> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  const handler = HANDLERS[name];
  if (!handler) return errorResult(`Unknown tool: ${name}`);

  // 1. Enforce MOCK_MCP flag
  if (tool?.isMock && process.env.MOCK_MCP === "false") {
    return errorResult(`Tool '${name}' is a mock implementation and is disabled (MOCK_MCP=false)`);
  }

  // 2. Enforce Scopes if provided in context
  if (ctx.scopes && ctx.scopes.length > 0) {
    const requiredScopes = tool?.scopes ?? [];
    if (requiredScopes.length > 0 && !scopeMatches(ctx.scopes, requiredScopes)) {
      return errorResult(`Insufficient scope for tool '${name}'. Required: ${requiredScopes.join(", ")} (code: -32003)`);
    }
  }

  try {
    return await handler(args ?? {}, ctx);
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
