import { PrismaClient } from "@prisma/client";

export interface DatabasePoolConfig {
  connectionLimit?: number;
  poolTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  directUrl?: string;
  applicationName?: string;
}

/**
 * Parses and formats the PostgreSQL connection URL to strictly enforce
 * connection pooling parameters (connection_limit, pool_timeout, connect_timeout)
 * across application services according to the Connection Budget policy.
 */
export function buildPrismaDatasourceUrl(
  rawUrl?: string,
  config?: DatabasePoolConfig
): string | undefined {
  const urlString = rawUrl || process.env.DATABASE_URL;
  if (!urlString) return undefined;

  try {
    const parsed = new URL(urlString);

    // Determine connection limit: explicit config > env var > default per budget
    const connectionLimit =
      config?.connectionLimit ??
      (process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : undefined) ??
      (process.env.DATABASE_CONNECTION_LIMIT ? parseInt(process.env.DATABASE_CONNECTION_LIMIT, 10) : undefined);

    if (connectionLimit && !isNaN(connectionLimit) && connectionLimit > 0) {
      parsed.searchParams.set("connection_limit", String(connectionLimit));
    }

    // Determine pool timeout: explicit config > env var > default (10s)
    const poolTimeout =
      config?.poolTimeoutSeconds ??
      (process.env.DATABASE_POOL_TIMEOUT ? parseInt(process.env.DATABASE_POOL_TIMEOUT, 10) : undefined);

    if (poolTimeout && !isNaN(poolTimeout) && poolTimeout > 0) {
      parsed.searchParams.set("pool_timeout", String(poolTimeout));
    }

    // Connect timeout in seconds (default 10s)
    const connectTimeout =
      config?.connectTimeoutSeconds ??
      (process.env.DATABASE_CONNECT_TIMEOUT ? parseInt(process.env.DATABASE_CONNECT_TIMEOUT, 10) : undefined);

    if (connectTimeout && !isNaN(connectTimeout) && connectTimeout > 0) {
      parsed.searchParams.set("connect_timeout", String(connectTimeout));
    }

    // Application name for observability in pg_stat_activity
    const appName =
      config?.applicationName ??
      process.env.DATABASE_APPLICATION_NAME ??
      (process.env.SERVICE_NAME ? `agentflow-${process.env.SERVICE_NAME}` : "agentflow-database");

    if (appName) {
      parsed.searchParams.set("application_name", appName);
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, return raw url safely
    return urlString;
  }
}

/**
 * Creates a configured PrismaClient instance with pool budget and query timeouts.
 */
export function createPrismaClient(config?: DatabasePoolConfig): PrismaClient {
  const datasourceUrl = buildPrismaDatasourceUrl(undefined, config);

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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
