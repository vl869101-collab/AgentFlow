import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { checkWorkflowQuota } from "../middleware/quota.js";
import {
  PRECONFIGURED_TEMPLATES,
  sanitizeTemplateForExport,
  cloneTemplateToWorkspace,
  importTemplateJsonToWorkspace,
} from "../services/templates.js";
import { cloneTemplateSchema, importTemplateSchema } from "@agentflow/shared";

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

export async function templateRoutes(app: FastifyInstance) {
  // ══════════════════════════════════════════════════════════════
  // Rota Pública / Autenticada de Listagem de Templates
  // ══════════════════════════════════════════════════════════════
  app.get("/", async (request: FastifyRequest) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const search = typeof query.search === "string" ? query.search.toLowerCase().trim() : undefined;
    const category = typeof query.category === "string" ? query.category.trim() : undefined;
    const tag = typeof query.tag === "string" ? query.tag.trim() : undefined;

    let templates = PRECONFIGURED_TEMPLATES;

    if (category && category !== "all" && category !== "Todas") {
      templates = templates.filter((t) => t.category.toLowerCase() === category.toLowerCase());
    }

    if (tag) {
      templates = templates.filter((t) => t.tags.some((tg) => tg.toLowerCase() === tag.toLowerCase()));
    }

    if (search) {
      templates = templates.filter((t) =>
        `${t.name} ${t.description} ${t.category} ${t.tags.join(" ")} ${t.connectors.join(" ")}`
          .toLowerCase()
          .includes(search)
      );
    }

    return {
      total: templates.length,
      categories: ["Todas", "IA & RAG", "Vendas & CRM", "Suporte & Atendimento", "DevOps & Cloud", "Marketing & Growth"],
      templates,
    };
  });

  // ══════════════════════════════════════════════════════════════
  // Obter detalhes de 1 template específico por ID
  // ══════════════════════════════════════════════════════════════
  app.get("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = PRECONFIGURED_TEMPLATES.find((t) => t.id === id);
    if (!template) {
      return reply.code(404).send({ error: `Template com ID "${id}" não foi encontrado.`, code: "NOT_FOUND" });
    }
    return template;
  });

  // ══════════════════════════════════════════════════════════════
  // Exportar template sanitizado em JSON para download / compartilhamento
  // ══════════════════════════════════════════════════════════════
  app.get("/:id/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = PRECONFIGURED_TEMPLATES.find((t) => t.id === id);
    if (!template) {
      return reply.code(404).send({ error: `Template com ID "${id}" não foi encontrado.`, code: "NOT_FOUND" });
    }

    const sanitized = sanitizeTemplateForExport(template);
    reply.header("Content-Disposition", `attachment; filename="agentflow-template-${template.id}.json"`);
    reply.header("Content-Type", "application/json; charset=utf-8");
    return sanitized;
  });

  // ══════════════════════════════════════════════════════════════
  // Clonar template para o Workspace do Usuário Autenticado
  // ══════════════════════════════════════════════════════════════
  app.post("/:id/clone", { preHandler: [requireAuth, checkWorkflowQuota] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);

    if (!userId || !orgId) {
      return reply.code(403).send({ error: "Contexto de organização e autenticação são necessários para clonar.", code: "ORG_REQUIRED" });
    }

    const body = cloneTemplateSchema.parse(request.body ?? {});

    try {
      const clonedWorkflow = await cloneTemplateToWorkspace({
        templateId: id,
        userId,
        orgId,
        customName: body.name,
        customDescription: body.description,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.status(201).send({
        success: true,
        message: "Template clonado com sucesso para seu workspace!",
        workflow: clonedWorkflow,
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message || "Erro ao clonar template",
        code: "TEMPLATE_CLONE_ERROR",
      });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Importar template arbitrário em JSON para o Workspace
  // ══════════════════════════════════════════════════════════════
  app.post("/import", { preHandler: [requireAuth, checkWorkflowQuota] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const orgId = await activeOrgId(request);

    if (!userId || !orgId) {
      return reply.code(403).send({ error: "Contexto de organização e autenticação são necessários para importar.", code: "ORG_REQUIRED" });
    }

    const body = importTemplateSchema.parse(request.body);

    try {
      const importedWorkflow = await importTemplateJsonToWorkspace({
        templateData: body.template,
        userId,
        orgId,
        customName: body.name,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.status(201).send({
        success: true,
        message: "Template JSON importado com sucesso!",
        workflow: importedWorkflow,
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message || "Erro ao importar template JSON",
        code: "TEMPLATE_IMPORT_ERROR",
      });
    }
  });
}
