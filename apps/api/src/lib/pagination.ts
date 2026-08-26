import type { FastifyReply, FastifyRequest } from "fastify";

export type Pagination = { skip: number; take: number };

export interface CursorPagination {
  cursor?: string;
  limit: number;
  skip?: number;
  isCursor: boolean;
}

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

export function parseCursorPagination(
  request: FastifyRequest,
  reply: FastifyReply,
  defaultLimit = 25,
): CursorPagination {
  const query = (request.query ?? {}) as Record<string, unknown>;
  const rawCursor = query.cursor;
  const cursor = typeof rawCursor === "string" && rawCursor.trim() ? rawCursor.trim() : undefined;
  const rawLimit = Number(query.limit ?? defaultLimit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : defaultLimit;
  const rawPage = Number(query.page ?? 1);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  reply.header("X-Limit", String(limit));
  if (cursor) {
    reply.header("X-Cursor", cursor);
    return { cursor, limit, skip: 1, isCursor: true };
  }

  reply.header("X-Page", String(page));
  return { limit, skip: (page - 1) * limit, isCursor: false };
}
