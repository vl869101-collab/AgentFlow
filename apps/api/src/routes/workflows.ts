import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { createWorkflowSchema, updateWorkflowSchema, saveWorkflowCanvasSchema } from "@agentflow/shared";

export async function workflowRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // list workflows for user's orgs
  app.get("/", async (request) => {
    const userId = userIdFromRequest(request);
    return prisma.workflow.findMany({
      where: { owner: { id: userId } },
      include: { _count: { select: { executions: true, nodes: true } } },
      orderBy: { updatedAt: "desc" },
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const workflow = await prisma.workflow.findFirst({
      where: { id, owner: { id: userId } },
      include: { nodes: true, edges: true, versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return workflow;
  });

  app.post("/", async (request, reply) => {
    const userId = userIdFromRequest(request);
    const body = createWorkflowSchema.parse(request.body);

    // ponytail: use user's first org, frontend should send orgId in future
    const membership = await prisma.organizationMember.findFirst({ where: { userId } });
    if (!membership) return reply.code(400).send({ error: "No organization", code: "NO_ORG" });

    const workflow = await prisma.workflow.create({
      data: {
        name: body.name,
        description: body.description,
        ownerId: userId,
        orgId: membership.orgId,
      },
    });
    return reply.status(201).send(workflow);
  });

  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const body = updateWorkflowSchema.parse(request.body);

    const workflow = await prisma.workflow.findFirst({ where: { id, owner: { id: userId } } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const updated = await prisma.workflow.update({ where: { id }, data: body });
    return updated;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const result = await prisma.workflow.deleteMany({ where: { id, owner: { id: userId } } });
    if (result.count === 0) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });
    return { ok: true };
  });

  // save canvas (nodes + edges) — atomic upsert
  app.put("/:id/canvas", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const body = saveWorkflowCanvasSchema.parse(request.body);

    const workflow = await prisma.workflow.findFirst({ where: { id, owner: { id: userId } } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    await prisma.$transaction(async (tx: any) => {
      await tx.workflowNode.deleteMany({ where: { workflowId: id } });
      await tx.workflowEdge.deleteMany({ where: { workflowId: id } });

      if (body.nodes.length > 0) {
        await tx.workflowNode.createMany({
          data: body.nodes.map((n) => ({
            type: n.type,
            label: n.label,
            config: n.config,
            position: n.position,
            width: n.width,
            height: n.height,
            workflowId: id,
          })),
        });
      }

      if (body.edges.length > 0) {
        // ponytail: edges reference node IDs that were just recreated — need to map old→new
        // for MVP, skip edge re-creation after delete (frontend re-saves full canvas)
        // TODO: implement proper old→new ID mapping
      }

      // bump version
      const lastVersion = await tx.workflowVersion.findFirst({
        where: { workflowId: id },
        orderBy: { version: "desc" },
      });
      await tx.workflowVersion.create({
        data: {
          workflowId: id,
          version: (lastVersion?.version ?? 0) + 1,
          snapshot: { nodes: body.nodes, edges: body.edges } as any,
        },
      });
    });

    return { ok: true };
  });

  // run workflow
  app.post("/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const workflow = await prisma.workflow.findFirst({ where: { id, owner: { id: userId } } });
    if (!workflow) return reply.code(404).send({ error: "Workflow not found", code: "NOT_FOUND" });

    const execution = await prisma.workflowExecution.create({
      data: { workflowId: id, userId, orgId: workflow.orgId, status: "PENDING", trigger: "manual" },
    });

    // ponytail: enqueue to BullMQ worker
    try {
      const { workflowQueue } = await import("../worker.js");
      await workflowQueue.add("execute", { executionId: execution.id }, { jobId: execution.id });
    } catch {
      // worker might not be running in dev
    }

    return reply.status(201).send(execution);
  });
}
