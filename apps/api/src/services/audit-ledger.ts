import { createHash, createHmac } from "node:crypto";
import { auditEventSchema } from "@agentflow/shared";
import { prisma } from "../lib/prisma.js";
import { maskSensitiveData } from "./execution-telemetry.js";

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
  resource: string;
  resourceId: string | null;
  metadata: any;
  hash: string;
  previousHash: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
}

// ponytail: per-org process lock; use a database advisory lock when API replicas share one ledger.
const ledgerTails = new Map<string, Promise<void>>();

async function withOrganizationLedgerLock<T>(orgId: string, operation: () => Promise<T>): Promise<T> {
  const previous = ledgerTails.get(orgId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  ledgerTails.set(orgId, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (ledgerTails.get(orgId) === tail) ledgerTails.delete(orgId);
  }
}

function metadataWithoutLedgerFields(metadata?: Record<string, any> | null): Record<string, any> | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const clean = { ...metadata };
  delete clean.__hash;
  delete clean.__previousHash;
  delete clean.hash;
  delete clean.previousHash;
  return Object.keys(clean).length > 0 ? clean : null;
}

function auditLogRecord(entry: any): AuditLogRecord {
  const metadata = typeof entry.metadata === "string" ? JSON.parse(entry.metadata) : entry.metadata;
  return {
    id: entry.id,
    orgId: entry.orgId,
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource ?? "system",
    resourceId: entry.resourceId,
    metadata,
    hash: metadata?.__hash || metadata?.hash || entry.hash || GENESIS_HASH,
    previousHash: metadata?.__previousHash || metadata?.previousHash || entry.previousHash || GENESIS_HASH,
    ip: entry.ip,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
  };
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
    return `[${obj.map((value) => value === undefined ? "null" : canonicalJson(value)).join(",")}]`;
  }
  const keys = Object.keys(obj).filter((key) => obj[key] !== undefined).sort();
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
  if (!input.orgId) throw new Error("orgId is required for audit events");
  const parsed = auditEventSchema.parse(input);

  return withOrganizationLedgerLock(input.orgId, async () => {
    const latestEntry = await prisma.auditLog.findFirst({
      where: { orgId: input.orgId },
      orderBy: { createdAt: "desc" },
    });
    const latestRecord = latestEntry ? auditLogRecord(latestEntry) : undefined;
    const requestedTimestamp = new Date(input.timestamp ?? Date.now());
    if (Number.isNaN(requestedTimestamp.getTime())) throw new Error("Invalid audit event timestamp");
    const latestTimestamp = latestEntry ? new Date(latestEntry.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const timestamp = new Date(Math.max(requestedTimestamp.getTime(), latestTimestamp + 1)).toISOString();
    const previousHash = latestRecord?.hash ?? GENESIS_HASH;
    const resource = parsed.resource ?? "system";
    const resourceId = parsed.resourceId ?? null;
    const userId = input.userId || "system";
    const metadata = metadataWithoutLedgerFields(parsed.metadata);
    const hash = computeAuditHash({
      previousHash,
      orgId: input.orgId,
      userId,
      action: parsed.action,
      resource,
      resourceId,
      metadata,
      timestamp,
    });

    const created = await prisma.auditLog.create({
      data: {
        action: parsed.action,
        resource,
        resourceId,
        metadata: { ...(metadata || {}), __hash: hash, __previousHash: previousHash },
        ip: input.ip,
        userAgent: input.userAgent,
        userId,
        orgId: input.orgId,
        createdAt: new Date(timestamp),
      },
    });

    return auditLogRecord(created);
  });
}

export async function listAuditLedger(
  orgId: string,
  options: { action?: string; resource?: string; skip?: number; take?: number } = {},
): Promise<AuditLogRecord[]> {
  const entries = await prisma.auditLog.findMany({
    where: {
      orgId,
      ...(options.action ? { action: options.action } : {}),
      ...(options.resource ? { resource: options.resource } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: options.skip,
    take: options.take,
  });
  return entries.map(auditLogRecord);
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
    const metadataToHash = metadataWithoutLedgerFields(meta);

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

  const formattedEntries: AuditLogRecord[] = entries.map(auditLogRecord);

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

// ═════════════════════════════════════════════════════════════════════════════
// Workflow Execution Audit Ledger (EXP-ESS-03)
// ═════════════════════════════════════════════════════════════════════════════

export interface WorkflowAuditEventInput {
  executionId: string;
  nodeId?: string | null;
  actor?: string | null;
  action: string;
  decision?: string | null;
  payload?: any;
  timestamp?: string | Date;
}

export interface WorkflowAuditLogRecord {
  id: string;
  executionId: string;
  nodeId: string | null;
  actor: string;
  action: string;
  decision: string | null;
  payload: any;
  prevHash: string;
  hash: string;
  createdAt: Date | string;
}

const executionLedgerTails = new Map<string, Promise<void>>();

async function withExecutionLedgerLock<T>(executionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = executionLedgerTails.get(executionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  executionLedgerTails.set(executionId, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (executionLedgerTails.get(executionId) === tail) {
      executionLedgerTails.delete(executionId);
    }
  }
}

/**
 * Computes deterministic SHA-256 hash for workflow audit log chain:
 * hash = SHA-256(prevHash + ":" + canonicalJson(payload))
 */
export function computeWorkflowAuditHash(
  prevHashOrParams: string | { prevHash: string; payload?: any; [key: string]: any },
  maybePayload?: any
): string {
  let prevHash: string;
  let payload: any;

  if (typeof prevHashOrParams === "string") {
    prevHash = prevHashOrParams;
    payload = maybePayload;
  } else {
    prevHash = prevHashOrParams.prevHash;
    payload = prevHashOrParams.payload !== undefined ? prevHashOrParams.payload : maybePayload;
  }

  const payloadStr = canonicalJson(payload);
  return createHash("sha256")
    .update(`${prevHash}:${payloadStr}`, "utf8")
    .digest("hex");
}

/**
 * Records an immutable workflow execution audit log entry.
 * Hash is deterministically chained from the previous block in the execution.
 */
export async function recordWorkflowAuditEvent(input: WorkflowAuditEventInput): Promise<WorkflowAuditLogRecord> {
  if (!input.executionId) {
    throw new Error("executionId is required for workflow audit events");
  }

  return withExecutionLedgerLock(input.executionId, async () => {
    const latestEntry = await prisma.workflowAuditLog.findFirst({
      where: { executionId: input.executionId },
      orderBy: { createdAt: "desc" },
    });

    const requestedTimestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    const latestTimestamp = latestEntry ? new Date(latestEntry.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const timestamp = new Date(Math.max(requestedTimestamp.getTime(), latestTimestamp + 1));

    const prevHash = latestEntry?.hash ?? GENESIS_HASH;
    const actor = input.actor || "system";
    const payload = input.payload !== undefined ? input.payload : null;
    const hash = computeWorkflowAuditHash(prevHash, payload);

    const created = await prisma.workflowAuditLog.create({
      data: {
        executionId: input.executionId,
        nodeId: input.nodeId ?? null,
        actor,
        action: input.action,
        decision: input.decision ?? null,
        payload,
        prevHash,
        hash,
        createdAt: timestamp,
      },
    });

    return {
      id: created.id,
      executionId: created.executionId,
      nodeId: created.nodeId,
      actor: created.actor,
      action: created.action,
      decision: created.decision,
      payload: created.payload,
      prevHash: created.prevHash,
      hash: created.hash,
      createdAt: created.createdAt,
    };
  });
}

/**
 * Validates the cryptographic hash chain of an execution's audit trail.
 * Detects any block modification, insertion, deletion, or tampering.
 */
export async function verifyWorkflowAuditIntegrity(executionId: string): Promise<LedgerIntegrityResult> {
  const entries = await prisma.workflowAuditLog.findMany({
    where: { executionId },
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

  let expectedPrevHash = GENESIS_HASH;
  let rootHash = "";
  let latestHash = "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i === 0) {
      rootHash = entry.hash;
    }
    latestHash = entry.hash;

    // 1. Verify prevHash matches preceding block's hash
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtIndex: i,
        brokenEntryId: entry.id,
        error: `Chain broken at index ${i}: expected prevHash ${expectedPrevHash}, found ${entry.prevHash}`,
        rootHash,
        latestHash,
      };
    }

    // 2. Recompute expected hash for this block
    const recomputedHash = computeWorkflowAuditHash(entry.prevHash, entry.payload);
    if (entry.hash !== recomputedHash) {
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

    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    rootHash,
    latestHash,
  };
}

/**
 * Fetches the verifiable audit trail for an execution with sensitive credentials masked.
 */
export async function getExecutionAuditTrail(executionId: string): Promise<{
  executionId: string;
  integrity: LedgerIntegrityResult;
  totalEntries: number;
  entries: WorkflowAuditLogRecord[];
  logs: WorkflowAuditLogRecord[];
}> {
  const [entries, integrity] = await Promise.all([
    prisma.workflowAuditLog.findMany({
      where: { executionId },
      orderBy: { createdAt: "asc" },
    }),
    verifyWorkflowAuditIntegrity(executionId),
  ]);

  const sanitizedEntries: WorkflowAuditLogRecord[] = entries.map((entry: any) => ({
    id: entry.id,
    executionId: entry.executionId,
    nodeId: entry.nodeId ?? null,
    actor: entry.actor,
    action: entry.action,
    decision: entry.decision ?? null,
    payload: maskSensitiveData(entry.payload),
    prevHash: entry.prevHash,
    hash: entry.hash,
    createdAt: entry.createdAt,
  }));

  return {
    executionId,
    integrity,
    totalEntries: sanitizedEntries.length,
    entries: sanitizedEntries,
    logs: sanitizedEntries,
  };
}

