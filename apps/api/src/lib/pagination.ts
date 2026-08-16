import type { FastifyReply, FastifyRequest } from "fastify";

export type Pagination = { skip: number; take: number };

export function parsePagination(request: FastifyRequest, reply: FastifyReply, defaultLimit = 25): Pagination {
  const query = (request.query ?? {}) as Record<string, unknown>;
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? defaultLimit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : defaultLimit;
  reply.header("X-Page", String(page));
  reply.header("X-Limit", String(limit));
  return { skip: (page - 1) * limit, take: limit };
}
