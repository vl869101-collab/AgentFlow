import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { checkQuota } from "../middleware/quota.js";
import { createWorkflowExecution, runExecution } from "../services/executor.js";
import { enqueueExecution } from "../services/queue.js";
import { createWorkflowSchema, saveWorkflowCanvasSchema, updateWorkflowSchema } from "@agentflow/shared";
import { limitsForPlan } from "../lib/plans.js";

type CanvasValue = Record<string, any>;

function asObject(value: unknown): CanvasValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CanvasValue) : {};
}

function canvasKind(type: string): string {
  if (["webhook", "cron"].includes(type)) return "trigger";
  if (["http", "email", "discord", "telegram", "sheets"].includes(type)) return "action";
  if (["condition", "transform", "delay"].includes(type)) return "logic";
  return "advanced";
}

function serializeWorkflow(workflow: any) {
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
  const tokenOrgId = orgIdFromRequest(request);
  if (tokenOrgId) {
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
    if (membership) return membership.orgId;
  }
  const membership = await prisma.organizationMember.findFirst({ where: { userId } });
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

  app.get("/", async (request, reply) => {
    const orgId = await activeOrgId(request);
    if (!orgId) return [];
    const pagination = parsePagination(request, reply);
    const workflows = await prisma.workflow.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" }, ...pagination });
    return workflows.map(serializeWorkflow);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    const workflow = orgId
      ? await prisma.workflow.findFirst({
          where: { id, orgId },
          include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
        })
      : null;
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return serializeWorkflow(workflow);
  });

  app.post("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);
    if (!orgId) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });
    const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
    const workflowLimit = limitsForPlan(organization?.plan).workflows;
    const workflowCount = await prisma.workflow.count({ where: { orgId, status: { not: "ARCHIVED" } } });
    if (workflowCount >= workflowLimit) {
      return reply.code(403).send({
        error: `Your plan allows ${workflowLimit} workflow${workflowLimit === 1 ? "" : "s"}`,
        code: "WORKFLOW_LIMIT_REACHED",
        limit: workflowLimit,
      });
    }
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

  app.put("/:id", update);
  app.patch("/:id", update);

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    const result = orgId ? await prisma.workflow.deleteMany({ where: { id, orgId } }) : { count: 0 };
    if (result.count === 0) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return { ok: true };
  });

  app.put("/:id/canvas", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await activeOrgId(request);
    const workflow = orgId ? await prisma.workflow.findFirst({ where: { id, orgId } }) : null;
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    const canvas = await saveCanvas(id, request.body);
    return { ok: true, ...canvas };
  });

  app.post("/:id/run", { preHandler: checkQuota }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);
    const workflow = orgId ? await prisma.workflow.findFirst({ where: { id, orgId } }) : null;
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const execution = await createWorkflowExecution(id, undefined, { userId, trigger: "manual" });
    await prisma.usageRecord.create({ data: { type: "execution", quantity: 1, orgId: workflow.orgId, userId } });
    if (!(await enqueueExecution(execution.id))) void runExecution(execution.id);
    return reply.status(202).send(execution);
  });
}
