import type { FastifyInstance } from "fastify";
import { auditEventSchema, auditExportQuerySchema, auditListQuerySchema } from "@agentflow/shared";
import { prisma } from "../lib/prisma.js";
import { orgIdFromRequest, requireAuth, userIdFromRequest } from "../middleware/auth.js";
import { parsePagination } from "../lib/pagination.js";
import {
  exportSignedAuditReport,
  listAuditLedger,
  recordAuditEvent,
  verifyAuditLedgerIntegrity,
} from "../services/audit-ledger.js";

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

      const query = auditListQuerySchema.parse(request.query ?? {});
      return listAuditLedger(orgId, { ...query, ...parsePagination(request, reply) });
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

      const query = auditExportQuerySchema.parse(request.query ?? {});
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
      const body = auditEventSchema.parse(request.body);

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
