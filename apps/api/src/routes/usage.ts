import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAuth, userIdFromRequest, orgIdFromRequest } from "../middleware/auth.js";
import { getOrgUsageSummary, getOrgUsageBreakdown, recordUsageEvent } from "../services/metering.js";

export async function usageRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Get current active organization usage summary
  app.get("/", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);

    let orgId = tokenOrgId;
    if (!orgId) {
      const membership = await prisma.organizationMember.findFirst({ where: { userId } });
      orgId = membership?.orgId;
    }

    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const summary = await getOrgUsageSummary(orgId);
    if (!summary) return reply.code(404).send({ error: "Usage summary not found", code: "NOT_FOUND" });
    return summary;
  });

  // Get detailed ledger breakdown by workflow and date
  app.get("/breakdown", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);
    const query = request.query as { startDate?: string; endDate?: string; workflowId?: string; metricType?: string; limit?: string };

    let orgId = tokenOrgId;
    if (!orgId) {
      const membership = await prisma.organizationMember.findFirst({ where: { userId } });
      orgId = membership?.orgId;
    }

    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const breakdown = await getOrgUsageBreakdown(orgId, {
      startDate: query.startDate,
      endDate: query.endDate,
      workflowId: query.workflowId,
      metricType: query.metricType,
      limit: query.limit ? Number(query.limit) : undefined,
    });

    return breakdown;
  });

  // Raw ledger records list
  app.get("/events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = userIdFromRequest(request);
    const tokenOrgId = orgIdFromRequest(request);

    let orgId = tokenOrgId;
    if (!orgId) {
      const membership = await prisma.organizationMember.findFirst({ where: { userId } });
      orgId = membership?.orgId;
    }

    if (!orgId) {
      return reply.code(403).send({ error: "Organization context is required", code: "ORG_REQUIRED" });
    }

    const records = await prisma.usageRecord.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      ...parsePagination(request, reply, 50),
    });

    return records;
  });
}
