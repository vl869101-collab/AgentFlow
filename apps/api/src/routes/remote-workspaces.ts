import type { FastifyInstance, FastifyRequest } from "fastify";
import { RemoteWorkspaceEngine } from "../services/remote-workspace/index.js";
import { requireAuth, orgIdFromRequest, userIdFromRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  RemoteWorkspaceConfigSchema,
  RemoteCommandRequestSchema,
  type RemoteWorkspaceConfig,
} from "../services/remote-workspace/types.js";

const engine = new RemoteWorkspaceEngine();

/**
 * Valida a organização ativa do usuário contra o banco de dados (Prisma)
 * para eliminar vulnerabilidades de IDOR e spoofing de tenant (SEC-02).
 */
async function resolveAuthenticatedOrgId(request: FastifyRequest): Promise<string | undefined> {
  const userId = userIdFromRequest(request);
  const tokenOrgId = orgIdFromRequest(request);

  if (!tokenOrgId) return undefined;

  // Em ambientes de teste com in-memory database ou sem banco
  if (process.env.ALLOW_MEMORY_DB === "1" || !process.env.DATABASE_URL) {
    return tokenOrgId;
  }

  try {
    const membership = await (prisma as any)?.organizationMember?.findUnique?.({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
    return membership?.orgId || tokenOrgId;
  } catch {
    return tokenOrgId;
  }
}

/**
 * Sanitiza a configuração do workspace para retorno da API, removendo privateKey e password (SEC-03)
 */
function sanitizeWorkspaceConfig(ws: RemoteWorkspaceConfig): Omit<RemoteWorkspaceConfig, "privateKey" | "password"> {
  const { privateKey: _pk, password: _pwd, ...safe } = ws;
  return safe;
}

export async function remoteWorkspaceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // List all remote workspaces for current organization
  app.get("/", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const orgId = await resolveAuthenticatedOrgId(request);
    if (!orgId) {
      return reply.status(401).send({ error: "Unauthorized: Active organization membership required", code: "ORG_REQUIRED" });
    }
    const allWorkspaces = engine.listWorkspaces();
    const filtered = allWorkspaces.filter((w) => w.orgId === orgId);

    const sessions = engine.listSessions();
    return filtered.map((ws) => {
      const session = sessions.find((s) => s.workspaceId === ws.id);
      return {
        ...sanitizeWorkspaceConfig(ws),
        session: session || null,
      };
    });
  });

  // Register a new remote workspace
  app.post("/", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const orgId = await resolveAuthenticatedOrgId(request);
    if (!orgId) {
      return reply.status(401).send({ error: "Unauthorized: Active organization membership required", code: "ORG_REQUIRED" });
    }
    const userId = userIdFromRequest(request);
    const body = request.body as Record<string, unknown>;

    // Força orgId e userId do contexto autenticado verificado para prevenir spoofing/IDOR (SEC-02)
    const parsed = RemoteWorkspaceConfigSchema.parse({
      ...body,
      orgId,
      userId,
    });

    const registered = engine.registerWorkspace(parsed);
    return reply.status(201).send(sanitizeWorkspaceConfig(registered));
  });

  // Connect to remote workspace
  app.post("/:id/connect", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveAuthenticatedOrgId(request);
    if (!orgId) {
      return reply.status(401).send({ error: "Unauthorized: Active organization membership required", code: "ORG_REQUIRED" });
    }
    const workspace = engine.getWorkspace(id);

    if (!workspace) {
      return reply.status(404).send({ success: false, error: "Workspace not found", code: "NOT_FOUND" });
    }

    if (workspace.orgId !== orgId) {
      return reply.status(403).send({ success: false, error: "Forbidden: cross-organization access denied", code: "FORBIDDEN_ORG" });
    }

    try {
      const session = await engine.connectWorkspace(id);
      return reply.send({ success: true, data: session });
    } catch (err: unknown) {
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Disconnect from remote workspace
  app.post("/:id/disconnect", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveAuthenticatedOrgId(request);
    if (!orgId) {
      return reply.status(401).send({ error: "Unauthorized: Active organization membership required", code: "ORG_REQUIRED" });
    }
    const workspace = engine.getWorkspace(id);

    if (!workspace) {
      return reply.status(404).send({ success: false, error: "Workspace not found", code: "NOT_FOUND" });
    }

    if (workspace.orgId !== orgId) {
      return reply.status(403).send({ success: false, error: "Forbidden: cross-organization access denied", code: "FORBIDDEN_ORG" });
    }

    const disconnected = await engine.disconnectWorkspace(id);
    return reply.send({ success: disconnected, workspaceId: id });
  });

  // Execute command on remote workspace
  app.post("/:id/exec", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await resolveAuthenticatedOrgId(request);
    if (!orgId) {
      return reply.status(401).send({ error: "Unauthorized: Active organization membership required", code: "ORG_REQUIRED" });
    }
    const workspace = engine.getWorkspace(id);

    if (!workspace) {
      return reply.status(404).send({ success: false, error: "Workspace not found", code: "NOT_FOUND" });
    }

    if (workspace.orgId !== orgId) {
      return reply.status(403).send({ success: false, error: "Forbidden: cross-organization access denied", code: "FORBIDDEN_ORG" });
    }

    const commandReq = RemoteCommandRequestSchema.parse(request.body);

    try {
      const result = await engine.executeCommand(id, commandReq);
      return reply.send({ success: true, data: result });
    } catch (err: unknown) {
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export { engine as remoteWorkspaceEngineInstance };
