import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parseCursorPagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { checkQuota, checkWorkflowQuota } from "../middleware/quota.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { createWorkflowSchema, saveWorkflowCanvasSchema, updateWorkflowSchema, importN8nWorkflow } from "@agentflow/shared";
import { limitsForPlan } from "../lib/plans.js";
import { computeWorkflowDiff, type WorkflowSnapshot } from "../services/workflow-diff.js";

type CanvasValue = Record<string, any>;

function asObject(value: unknown): CanvasValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CanvasValue) : {};
}

function canvasKind(type: string): string {
  if (["webhook", "cron", "gmailTrigger", "evaluationTrigger", "emailReadImap"].includes(type)) return "trigger";
  if (["http", "email", "discord", "telegram", "sheets", "googleDrive", "gmail"].includes(type)) return "action";
  if (["condition", "transform", "delay", "code"].includes(type)) return "logic";
  return "advanced";
}

function serializeWorkflow(workflow: any) {
  if (!workflow) return workflow;
  const nodes = Array.isArray(workflow.nodes)
    ? workflow.nodes.map((node: any) => {
        const data = asObject(node.data);
        const actualType = String(data.type ?? node.type);
        return {
          id: node.id,
          type: canvasKind(actualType),
          position: node.position ?? { x: 0, y: 0 },
          width: node.width ?? undefined,
          height: node.height ?? undefined,
          data: {
            type: actualType,
            label: data.label ?? node.label ?? actualType,
            description: data.description ?? "",
            config: asObject(data.config ?? node.config),
          },
        };
      })
    : undefined;
  const edges = Array.isArray(workflow.edges)
    ? workflow.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.source ?? edge.sourceNodeId,
        target: edge.target ?? edge.targetNodeId,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
        label: edge.label ?? undefined,
        condition: edge.condition ?? undefined,
        animated: true,
      }))
    : undefined;
  return { ...workflow, ...(nodes ? { nodes } : {}), ...(edges ? { edges } : {}) };
}

async function activeOrgId(request: FastifyRequest): Promise<string | undefined> {
  const userId = userIdFromRequest(request);
  if (!userId) return undefined;
  const tokenOrgId = orgIdFromRequest(request);
  if (!tokenOrgId) return undefined;
  const membership = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId: tokenOrgId } },
  });
  return membership?.orgId;
}

function canonicalCanvas(body: any) {
  const parsed = saveWorkflowCanvasSchema.parse(body);
  const nodes = parsed.nodes.map((node: any) => {
    const data = asObject(node.data);
    return {
      id: String(node.id ?? randomUUID()),
      type: String(data.type ?? node.type),
      label: data.label ?? node.label,
      config: asObject(data.config ?? node.config),
      position: node.position ?? { x: 0, y: 0 },
      width: node.width,
      height: node.height,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) throw new Error("Canvas contains duplicate node ids");
  const edges = parsed.edges.map((edge: any) => ({
    id: String(edge.id ?? randomUUID()),
    sourceNodeId: String(edge.sourceNodeId ?? edge.source),
    targetNodeId: String(edge.targetNodeId ?? edge.target),
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    condition: edge.condition,
  }));
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new Error(`Edge references an unknown node: ${edge.sourceNodeId} -> ${edge.targetNodeId}`);
    }
  }
  return { nodes, edges };
}

async function saveCanvas(workflowId: string, body: any) {
  const canvas = canonicalCanvas(body);
  await prisma.$transaction(async (tx: any) => {
    await tx.workflowEdge.deleteMany({ where: { workflowId } });
    await tx.workflowNode.deleteMany({ where: { workflowId } });
    if (canvas.nodes.length) await tx.workflowNode.createMany({ data: canvas.nodes.map((node) => ({ ...node, workflowId })) });
    if (canvas.edges.length) await tx.workflowEdge.createMany({ data: canvas.edges.map((edge) => ({ ...edge, workflowId })) });

    const lastVersion = await tx.workflowVersion.findFirst({ where: { workflowId }, orderBy: { version: "desc" } });
    await tx.workflowVersion.create({
      data: {
        workflowId,
        version: (lastVersion?.version ?? 0) + 1,
        snapshot: canvas as any,
      },
    });
  });
  return canvas;
}

export async function workflowRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // List workflows with Org Scoping + Search `q` + Cursor Pagination
  app.get("/", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = await activeOrgId(request);
    if (!orgId) return [];

    const query = (request.query ?? {}) as Record<string, unknown>;
    const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : typeof query.search === "string" && query.search.trim() ? query.search.trim() : undefined;

    const { cursor, limit, skip, isCursor } = parseCursorPagination(request, reply, 25);

    const whereClause: any = { orgId };
    if (q) {
      whereClause.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    if (query.status && typeof query.status === "string") {
      whereClause.status = query.status;
    }

    let workflows: any[] = [];
    if (isCursor && cursor) {
      workflows = await prisma.workflow.findMany({
        where: whereClause,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
      });
    } else {
      workflows = await prisma.workflow.findMany({
        where: whereClause,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: skip ?? 0,
        take: limit + 1,
      });
    }

    const hasMore = workflows.length > limit;
    const items = hasMore ? workflows.slice(0, limit) : workflows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    reply.header("X-Next-Cursor", nextCursor ?? "");
    reply.header("X-Has-More", String(hasMore));

    const serialized = items.map(serializeWorkflow);
    if (query.paginate === "true") {
      return { items: serialized, nextCursor, hasMore };
    }
    return serialized;
  });

  app.get("/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({
      where: { id, orgId },
      include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return serializeWorkflow(workflow);
  });

  app.post("/", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } }, preHandler: checkWorkflowQuota }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });

    const body = createWorkflowSchema.parse(request.body);
    const workflow = await prisma.workflow.create({
      data: { name: body.name, description: body.description, ownerId: userId, orgId },
    });
    return reply.status(201).send(workflow);
  });

  async function update(request: FastifyRequest, reply: any) {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    const raw = asObject(request.body);
    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const metadata = updateWorkflowSchema.parse(raw);
    if (Object.keys(metadata).length) await prisma.workflow.update({ where: { id }, data: metadata });
    if (Array.isArray(raw.nodes) || Array.isArray(raw.edges)) {
      const existing = await prisma.workflow.findFirst({
        where: { id, orgId },
        include: { nodes: true, edges: true },
      });
      const existingCanvas = {
        nodes: (existing?.nodes ?? []).map((node: any) => ({ id: node.id, type: node.type, label: node.label, config: node.config, position: node.position })),
        edges: (existing?.edges ?? []).map((edge: any) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle, label: edge.label, condition: edge.condition })),
      };
      await saveCanvas(id, { nodes: raw.nodes ?? existingCanvas.nodes, edges: raw.edges ?? existingCanvas.edges });
    }
    const updated = await prisma.workflow.findFirst({ where: { id, orgId }, include: { nodes: true, edges: true } });
    return serializeWorkflow(updated);
  }

  app.put("/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, update);
  app.patch("/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, update);

  app.delete("/:id", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const result = await prisma.workflow.deleteMany({ where: { id, orgId } });
    if (result.count === 0) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return { ok: true };
  });

  app.put("/:id/canvas", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    const canvas = await saveCanvas(id, request.body);
    return { ok: true, ...canvas };
  });

  app.post("/:id/run", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } }, preHandler: checkQuota }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const execution = await createWorkflowExecution(id, undefined, { userId, trigger: "manual" });
    await prisma.usageRecord.create({ data: { type: "execution", quantity: 1, orgId: workflow.orgId, userId } });
    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id);
    return reply.status(202).send(execution);
  });

  app.post("/import", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, preHandler: checkWorkflowQuota }, async (request, reply) => {
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });

    const body = request.body as { n8nJson?: unknown; workflowJson?: unknown };
    const raw = body.n8nJson ?? body.workflowJson;
    if (!raw) return reply.code(400).send({ error: "n8nJson or workflowJson is required", code: "INVALID_INPUT" });

    let result;
    try {
      result = importN8nWorkflow(raw as string | Record<string, unknown>);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid n8n workflow JSON";
      return reply.code(400).send({ error: message, code: "IMPORT_FAILED" });
    }

    const workflow = await prisma.workflow.create({
      data: {
        name: result.workflow.name,
        status: result.workflow.status,
        ownerId: userId,
        orgId,
      },
    });

    if (result.nodes.length > 0 || result.edges.length > 0) {
      await saveCanvas(workflow.id, { nodes: result.nodes, edges: result.edges });
    }

    const created = await prisma.workflow.findFirst({
      where: { id: workflow.id, orgId },
      include: { nodes: true, edges: true },
    });
    return reply.status(201).send({ workflow: serializeWorkflow(created), warnings: result.warnings });
  });

  // ── Versioning & Semantic Diff (TASK-15) ─────────────────────

  // List all versions of a workflow
  app.get("/:id/versions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const versions = await prisma.workflowVersion.findMany({
      where: { workflowId: id },
      orderBy: { version: "desc" },
    });

    return versions.map((v: any) => ({
      id: v.id,
      version: v.version,
      createdAt: v.createdAt,
      snapshot: typeof v.snapshot === "string" ? JSON.parse(v.snapshot) : v.snapshot,
    }));
  });

  // Calculate semantic diff between two versions
  app.get("/:id/diff", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const query = (request.query as Record<string, string>) ?? {};
    const fromVersionNum = parseInt(query.fromVersion ?? query.v1 ?? "1", 10);
    const toVersionNum = parseInt(query.toVersion ?? query.v2 ?? "2", 10);

    const [v1Record, v2Record] = await Promise.all([
      prisma.workflowVersion.findFirst({ where: { workflowId: id, version: fromVersionNum } }),
      prisma.workflowVersion.findFirst({ where: { workflowId: id, version: toVersionNum } }),
    ]);

    if (!v1Record && !v2Record) {
      return reply.code(404).send({ error: "Specified workflow versions not found", code: "NOT_FOUND" });
    }

    const v1Snapshot: WorkflowSnapshot = v1Record
      ? (typeof v1Record.snapshot === "string" ? JSON.parse(v1Record.snapshot) : v1Record.snapshot)
      : {};
    const v2Snapshot: WorkflowSnapshot = v2Record
      ? (typeof v2Record.snapshot === "string" ? JSON.parse(v2Record.snapshot) : v2Record.snapshot)
      : {};

    const diff = computeWorkflowDiff(v1Snapshot, v2Snapshot);
    return {
      workflowId: id,
      fromVersion: fromVersionNum,
      toVersion: toVersionNum,
      ...diff,
    };
  });

  // Rollback workflow to a specific version
  app.post("/:id/rollback", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const workflow = await prisma.workflow.findFirst({ where: { id, orgId } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const body = (request.body as { targetVersion?: number; version?: number }) ?? {};
    const targetVersionNum = body.targetVersion ?? body.version;

    if (!targetVersionNum || typeof targetVersionNum !== "number") {
      return reply.code(400).send({ error: "targetVersion (number) is required", code: "INVALID_INPUT" });
    }

    const targetVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId: id, version: targetVersionNum },
    });

    if (!targetVersion) {
      return reply.code(404).send({ error: `Version ${targetVersionNum} not found for this workflow`, code: "NOT_FOUND" });
    }

    const snapshot = typeof targetVersion.snapshot === "string" ? JSON.parse(targetVersion.snapshot) : targetVersion.snapshot;
    await saveCanvas(id, snapshot);

    const updated = await prisma.workflow.findFirst({
      where: { id, orgId },
      include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    return {
      ok: true,
      rolledBackToVersion: targetVersionNum,
      newVersion: updated?.versions?.[0]?.version,
      workflow: serializeWorkflow(updated),
    };
  });
}
