import { store } from "./store.js";

// ponytail: global singleton, skip Prisma when no DATABASE_URL
let prismaInstance: any;

function getPrisma() {
  if (prismaInstance) return prismaInstance;

  if (!process.env.DATABASE_URL) {
    console.log("[api] No DATABASE_URL — using in-memory store");
    prismaInstance = store;
    return prismaInstance;
  }

  // Real Prisma when DATABASE_URL is set
  const { PrismaClient } = require("@prisma/client");
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
