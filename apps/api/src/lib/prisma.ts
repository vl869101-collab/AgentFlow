import { store } from "./store.js";
import { PrismaClient } from "@prisma/client";

let prismaInstance: any;

function getPrisma() {
  // Memory mode takes precedence even if DATABASE_URL was polluted by a
  // global @prisma/client that does dotenv.config() on import (e.g. sibling
  // project deploypulse/.env). Tests set ALLOW_MEMORY_DB=1 + delete
  // DATABASE_URL before importing server, but the global client's import
  // side-effect restores DATABASE_URL before getPrisma() runs.
  if (process.env.ALLOW_MEMORY_DB === "1") {
    if (prismaInstance !== store) {
      console.warn("[api] ALLOW_MEMORY_DB=1 — using the in-memory database");
      prismaInstance = store;
      (globalThis as unknown as { prisma: any }).prisma = undefined;
    }
    return prismaInstance;
  }

  if (prismaInstance) return prismaInstance;

  if (!process.env.DATABASE_URL) {
    throw new Error("[api] DATABASE_URL is required. Set ALLOW_MEMORY_DB=1 only to explicitly enable the in-memory database.");
  }

  // Real Prisma when DATABASE_URL is set. Keep this import static because the
  // API is ESM and CommonJS require() is not available at runtime.
  const globalForPrisma = globalThis as unknown as { prisma: any };
  prismaInstance = globalForPrisma.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaInstance;
  return prismaInstance;
}

export const prisma = new Proxy({} as any, {
  get(_, prop) {
    const target = getPrisma();
    const val = (target as any)[prop];
    if (typeof val === "function") {
      return val.bind(target);
    }
    return val;
  },
});
