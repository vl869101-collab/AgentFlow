import { store } from "./store.js";
import { PrismaClient } from "@prisma/client";

export interface ApiDatabasePoolConfig {
  connectionLimit?: number;
  poolTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  applicationName?: string;
}

let prismaInstance: any;

/**
 * Builds the parameterized DATABASE_URL enforcing the connection budget policy.
 * API service default budget: connection_limit=10, pool_timeout=10, connect_timeout=10, app_name=agentflow-api.
 */
export function buildApiDatasourceUrl(rawUrl?: string, config?: ApiDatabasePoolConfig): string | undefined {
  const urlString = rawUrl || process.env.DATABASE_URL;
  if (!urlString) return undefined;

  try {
    const parsed = new URL(urlString);

    const connectionLimit =
      config?.connectionLimit ??
      (process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : undefined) ??
      (process.env.DATABASE_CONNECTION_LIMIT ? parseInt(process.env.DATABASE_CONNECTION_LIMIT, 10) : undefined) ??
      10; // Default connection budget per API replica

    if (connectionLimit > 0) {
      parsed.searchParams.set("connection_limit", String(connectionLimit));
    }

    const poolTimeout =
      config?.poolTimeoutSeconds ??
      (process.env.DATABASE_POOL_TIMEOUT ? parseInt(process.env.DATABASE_POOL_TIMEOUT, 10) : undefined) ??
      10; // 10s queue wait timeout before failing fast

    if (poolTimeout > 0) {
      parsed.searchParams.set("pool_timeout", String(poolTimeout));
    }

    const connectTimeout =
      config?.connectTimeoutSeconds ??
      (process.env.DATABASE_CONNECT_TIMEOUT ? parseInt(process.env.DATABASE_CONNECT_TIMEOUT, 10) : undefined) ??
      10;

    if (connectTimeout > 0) {
      parsed.searchParams.set("connect_timeout", String(connectTimeout));
    }

    const appName = config?.applicationName ?? process.env.DATABASE_APPLICATION_NAME ?? "agentflow-api";
    if (appName) {
      parsed.searchParams.set("application_name", appName);
    }

    return parsed.toString();
  } catch {
    return urlString;
  }
}

export function createApiPrismaClient(config?: ApiDatabasePoolConfig): PrismaClient {
  const datasourceUrl = buildApiDatasourceUrl(undefined, config);

  const clientOptions: any = {
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  };

  if (datasourceUrl) {
    clientOptions.datasources = {
      db: {
        url: datasourceUrl,
      },
    };
  }

  return new PrismaClient(clientOptions);
}

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
  prismaInstance = globalForPrisma.prisma ?? createApiPrismaClient();
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
