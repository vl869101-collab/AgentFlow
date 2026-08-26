import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { parsePagination } from "../lib/pagination.js";
import {
  exportSignedAuditReport,
  recordAuditEvent,
  verifyAuditLedgerIntegrity,
} from "../services/audit-ledger.js";

const recordEventSchema = z.object({
  action: z.string().min(1),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  async function resolveOrgId(request: Parameters<typeof userIdFromRequest>[0]): Promise<string | undefined> {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    if (!tokenOrgId) return undefined;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: tokenOrgId } },
    });
    return membership?.orgId;
  }

  // GET / - List audit logs for current organization
  app.get(
    "/",
    { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = await resolveOrgId(request);
      if (!orgId) {
        return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
      }

      const query = request.query as { action?: string; resource?: string };
      const where: Record<string, any> = { orgId };
      if (query.action) where.action = query.action;
      if (query.resource) where.resource = query.resource;

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...parsePagination(request, reply),
      });

      return logs;
    }
  );

  // GET /verify - Verify cryptographic hash chain integrity
  app.get(
    "/verify",
    { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = await resolveOrgId(request);
      if (!orgId) {
        return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
      }

      const result = await verifyAuditLedgerIntegrity(orgId);
      return result;
    }
  );

  // GET /export - Export signed audit trail for external compliance
  app.get(
    "/export",
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = await resolveOrgId(request);
      if (!orgId) {
        return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
      }

      const query = request.query as { from?: string; to?: string };
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;

      const report = await exportSignedAuditReport(orgId, { from, to });
      return report;
    }
  );

  // POST /events - Manually record an audit event
  app.post(
    "/events",
    { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = await resolveOrgId(request);
      if (!orgId) {
        return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
      }

      const userId = userIdFromRequest(request);
      const body = recordEventSchema.parse(request.body);

      const entry = await recordAuditEvent({
        orgId,
        userId,
        action: body.action,
        resource: body.resource,
        resourceId: body.resourceId,
        metadata: body.metadata,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      });

      return reply.code(201).send(entry);
    }
  );
}
