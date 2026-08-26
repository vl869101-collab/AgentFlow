import { createHash, createHmac } from "node:crypto";
import { prisma } from "../lib/prisma.js";

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export interface AuditEventInput {
  orgId: string;
  userId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
  timestamp?: string;
}

export interface AuditLogRecord {
  id: string;
  orgId: string;
  userId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: any;
  hash: string;
  previousHash: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
}

export interface LedgerIntegrityResult {
  valid: boolean;
  totalEntries: number;
  brokenAtIndex?: number;
  brokenEntryId?: string;
  error?: string;
  rootHash?: string;
  latestHash?: string;
}

export interface SignedAuditReport {
  orgId: string;
  generatedAt: string;
  totalEntries: number;
  integrity: boolean;
  rootHash: string;
  latestHash: string;
  signature: string;
  entries: AuditLogRecord[];
}

/**
 * Deterministic JSON serialization for canonical hashing across platforms.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Calculates cryptographic SHA-256 hash for an audit ledger block.
 */
export function computeAuditHash(params: {
  previousHash: string;
  orgId: string;
  userId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  metadata?: any;
  timestamp: string;
}): string {
  const payload = [
    params.previousHash,
    params.orgId,
    params.userId || "system",
    params.action,
    params.resource || "",
    params.resourceId || "",
    canonicalJson(params.metadata),
    params.timestamp,
  ].join(":");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Records a new immutable audit ledger entry into the cryptographic hash chain.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<AuditLogRecord> {
  const timestamp = input.timestamp || new Date().toISOString();
  const action = input.action;
  const resource = input.resource || null;
  const resourceId = input.resourceId || null;
  const userId = input.userId || "system";
  const orgId = input.orgId;
  const metadata = input.metadata && Object.keys(input.metadata).length > 0 ? input.metadata : null;

  // Find latest entry for org to obtain previousHash
  const latestEntry = await prisma.auditLog.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });

  let previousHash = GENESIS_HASH;
  if (latestEntry) {
    const meta = typeof latestEntry.metadata === "string"
      ? JSON.parse(latestEntry.metadata)
      : (latestEntry.metadata as Record<string, any> | undefined);
    
    previousHash = meta?.__hash || meta?.hash || (latestEntry as any).hash || GENESIS_HASH;
  }

  const hash = computeAuditHash({
    previousHash,
    orgId,
    userId,
    action,
    resource,
    resourceId,
    metadata,
    timestamp,
  });

  const metadataWithHash = {
    ...(metadata || {}),
    __hash: hash,
    __previousHash: previousHash,
  };

  const created = await prisma.auditLog.create({
    data: {
      action,
      resource,
      resourceId,
      metadata: metadataWithHash,
      ip: input.ip,
      userAgent: input.userAgent,
      userId,
      orgId,
      createdAt: new Date(timestamp),
    },
  });

  return {
    id: created.id,
    orgId: created.orgId,
    userId: created.userId,
    action: created.action,
    resource: created.resource,
    resourceId: created.resourceId,
    metadata: created.metadata,
    hash,
    previousHash,
    ip: created.ip,
    userAgent: created.userAgent,
    createdAt: created.createdAt,
  };
}

/**
 * Verifies end-to-end cryptographic hash chain integrity for an organization.
 */
export async function verifyAuditLedgerIntegrity(orgId: string): Promise<LedgerIntegrityResult> {
  const entries = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });

  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      rootHash: GENESIS_HASH,
      latestHash: GENESIS_HASH,
    };
  }

  let expectedPreviousHash = GENESIS_HASH;
  let rootHash = "";
  let latestHash = "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const meta = typeof entry.metadata === "string"
      ? JSON.parse(entry.metadata)
      : (entry.metadata as Record<string, any> | undefined);

    const storedHash = meta?.__hash || meta?.hash || (entry as any).hash;
    const storedPreviousHash = meta?.__previousHash || meta?.previousHash || (entry as any).previousHash || GENESIS_HASH;

    if (i === 0) {
      rootHash = storedHash;
    }
    latestHash = storedHash;

    // 1. Verify previousHash matches preceding block's hash
    if (storedPreviousHash !== expectedPreviousHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtIndex: i,
        brokenEntryId: entry.id,
        error: `Chain broken at index ${i}: expected previousHash ${expectedPreviousHash}, found ${storedPreviousHash}`,
        rootHash,
        latestHash,
      };
    }

    // 2. Recompute expected hash for this block
    const timestamp = entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt);
    
    // Clean metadata excluding internal hash fields
    const cleanMeta = meta ? { ...meta } : null;
    if (cleanMeta) {
      delete cleanMeta.__hash;
      delete cleanMeta.__previousHash;
      delete cleanMeta.hash;
      delete cleanMeta.previousHash;
    }
    const metadataToHash = cleanMeta && Object.keys(cleanMeta).length > 0 ? cleanMeta : null;

    const recomputedHash = computeAuditHash({
      previousHash: storedPreviousHash,
      orgId: entry.orgId,
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: metadataToHash,
      timestamp,
    });

    if (storedHash !== recomputedHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtIndex: i,
        brokenEntryId: entry.id,
        error: `Tamper detected at block ${i} (ID: ${entry.id}): payload modified`,
        rootHash,
        latestHash,
      };
    }

    expectedPreviousHash = storedHash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    rootHash,
    latestHash,
  };
}

/**
 * Exports a signed, tamper-evident audit report for SOC2 / ISO 27001 compliance.
 */
export async function exportSignedAuditReport(
  orgId: string,
  options: { from?: Date; to?: Date } = {}
): Promise<SignedAuditReport> {
  const integrity = await verifyAuditLedgerIntegrity(orgId);

  const where: Record<string, any> = { orgId };
  if (options.from || options.to) {
    where.createdAt = {};
    if (options.from) where.createdAt.gte = options.from;
    if (options.to) where.createdAt.lte = options.to;
  }

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  const formattedEntries: AuditLogRecord[] = entries.map((e: any) => {
    const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata;
    return {
      id: e.id,
      orgId: e.orgId,
      userId: e.userId,
      action: e.action,
      resource: e.resource,
      resourceId: e.resourceId,
      metadata: meta,
      hash: meta?.__hash || meta?.hash || GENESIS_HASH,
      previousHash: meta?.__previousHash || meta?.previousHash || GENESIS_HASH,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt,
    };
  });

  const generatedAt = new Date().toISOString();
  const signingSecret = process.env.JWT_SECRET || process.env.CREDENTIAL_ENCRYPTION_KEY || "agentflow-audit-secret";
  const reportPayload = `${orgId}:${generatedAt}:${integrity.rootHash}:${integrity.latestHash}:${formattedEntries.length}`;
  const signature = createHmac("sha256", signingSecret).update(reportPayload).digest("hex");

  return {
    orgId,
    generatedAt,
    totalEntries: formattedEntries.length,
    integrity: integrity.valid,
    rootHash: integrity.rootHash ?? GENESIS_HASH,
    latestHash: integrity.latestHash ?? GENESIS_HASH,
    signature,
    entries: formattedEntries,
  };
}
