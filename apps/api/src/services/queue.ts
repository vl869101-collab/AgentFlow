import { Queue, type Job } from "bullmq";
import { getEnv } from "../lib/env.js";
import { telemetry } from "../lib/otel.js";
import { deadMansSwitch } from "./dead-mans-switch.js";

let workflowQueue: Queue | undefined;
let dlqQueue: Queue | undefined;

// In-memory DLQ store for test & offline environments
export interface DLQRecord {
  id: string;
  executionId: string;
  error: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  attemptsMade?: number;
  workflowId?: string;
  orgId?: string;
}

export interface DLQIncidentRecord {
  id: string;
  jobId: string;
  executionId: string;
  workflowId?: string;
  orgId?: string;
  error: string;
  timestamp: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "PURGED";
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

const inMemoryDLQ = new Map<string, DLQRecord>();
const inMemoryIncidents = new Map<string, DLQIncidentRecord>();

function getRedisConnection() {
  const redis = new URL(getEnv().REDIS_URL);
  return {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function getWorkflowQueue(): Queue | undefined {
  const enabled = process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) return undefined;
  if (workflowQueue) return workflowQueue;

  try {
    workflowQueue = new Queue("workflows", { connection: getRedisConnection() });
    return workflowQueue;
  } catch {
    return undefined;
  }
}

export function getDLQQueue(): Queue | undefined {
  const enabled = process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) return undefined;
  if (dlqQueue) return dlqQueue;

  try {
    dlqQueue = new Queue("workflows-dlq", { connection: getRedisConnection() });
    return dlqQueue;
  } catch {
    return undefined;
  }
}

export function getQueueByName(name: "workflows" | "workflows-dlq" | string): Queue | undefined {
  if (name === "workflows") return getWorkflowQueue();
  if (name === "workflows-dlq" || name === "dlq") return getDLQQueue();
  return undefined;
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const DEFAULT_DLQ_OPTIONS = {
  attempts: 1,
  removeOnComplete: 5000,
  removeOnFail: 10000,
};

export async function sendToDLQ(executionId: string, error: string, metadata?: Record<string, unknown>): Promise<boolean> {
  const jobId = `dlq-${executionId}-${Date.now()}`;
  const nowStr = new Date().toISOString();
  const record: DLQRecord = {
    id: jobId,
    executionId,
    error,
    metadata,
    timestamp: nowStr,
    attemptsMade: (metadata?.attemptsMade as number) ?? 3,
    workflowId: metadata?.workflowId as string | undefined,
    orgId: metadata?.orgId as string | undefined,
  };

  inMemoryDLQ.set(jobId, record);

  // Automatically record an incident in the incident history ledger
  const incidentId = `inc-${jobId}`;
  const incident: DLQIncidentRecord = {
    id: incidentId,
    jobId,
    executionId,
    workflowId: metadata?.workflowId as string | undefined,
    orgId: metadata?.orgId as string | undefined,
    error,
    timestamp: nowStr,
    severity: (metadata?.attemptsMade as number) >= 5 ? "CRITICAL" : "HIGH",
    status: "OPEN",
    metadata,
  };
  inMemoryIncidents.set(incidentId, incident);

  // Check Dead Man's Switch and automatically trigger alerts on recurring failures
  try {
    await deadMansSwitch.recordFailureAndCheckAlert(incident);
  } catch (alertErr) {
    console.error("[DLQ] Error checking Dead Man's Switch alerts:", alertErr);
  }

  const dlq = getDLQQueue();
  if (dlq) {
    try {
      await dlq.add("dead-letter", record, { jobId, ...DEFAULT_DLQ_OPTIONS });
    } catch (err) {
      console.error("Unable to enqueue into BullMQ DLQ", err);
    }
  }

  return true;
}

export async function enqueueExecution(executionId: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
  const queue = getWorkflowQueue();
  if (!queue) return false;
  try {
    const payload: Record<string, unknown> = { executionId, ...metadata };
    if (!payload.traceparent && !payload.traceParent) {
      payload.traceparent = telemetry.formatTraceParent({
        traceId: telemetry.generateTraceId(),
        spanId: telemetry.generateSpanId(),
        traceFlags: "01",
      });
    }
    await queue.add("execute", payload, { jobId: executionId, ...DEFAULT_JOB_OPTIONS });
    return true;
  } catch (error) {
    console.error("Unable to enqueue workflow execution", error);
    return false;
  }
}

export async function getDLQJobsList(options: {
  workflowId?: string;
  orgId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ jobs: DLQRecord[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const dlq = getDLQQueue();
  if (dlq) {
    try {
      const bullJobs = await dlq.getJobs(["waiting", "completed", "failed", "delayed", "active"], offset, offset + limit - 1);
      let jobs: DLQRecord[] = bullJobs.map((j) => ({
        id: j.id ?? "",
        executionId: j.data?.executionId ?? "",
        error: j.data?.error ?? j.failedReason ?? "Unknown failure",
        metadata: j.data?.metadata,
        timestamp: j.data?.timestamp ?? new Date(j.timestamp).toISOString(),
        attemptsMade: j.attemptsMade,
        workflowId: j.data?.workflowId,
        orgId: j.data?.orgId,
      }));
      if (options.workflowId) jobs = jobs.filter((j) => j.workflowId === options.workflowId);
      if (options.orgId) jobs = jobs.filter((j) => j.orgId === options.orgId);
      if (options.startDate) {
        const start = new Date(options.startDate).getTime();
        jobs = jobs.filter((j) => new Date(j.timestamp).getTime() >= start);
      }
      if (options.endDate) {
        const end = new Date(options.endDate).getTime();
        jobs = jobs.filter((j) => new Date(j.timestamp).getTime() <= end);
      }
      const total = await dlq.count();
      return { jobs, total };
    } catch {}
  }

  let records = Array.from(inMemoryDLQ.values());
  if (options.workflowId) {
    records = records.filter((r) => r.workflowId === options.workflowId);
  }
  if (options.orgId) {
    records = records.filter((r) => r.orgId === options.orgId);
  }
  if (options.startDate) {
    const start = new Date(options.startDate).getTime();
    records = records.filter((r) => new Date(r.timestamp).getTime() >= start);
  }
  if (options.endDate) {
    const end = new Date(options.endDate).getTime();
    records = records.filter((r) => new Date(r.timestamp).getTime() <= end);
  }
  if (options.search) {
    const query = options.search.toLowerCase();
    records = records.filter((r) => r.error.toLowerCase().includes(query) || r.executionId.toLowerCase().includes(query));
  }

  const total = records.length;
  const jobs = records.slice(offset, offset + limit);
  return { jobs, total };
}

export async function getDLQJobById(jobId: string): Promise<DLQRecord | null> {
  const dlq = getDLQQueue();
  if (dlq) {
    try {
      const job = await dlq.getJob(jobId);
      if (job) {
        return {
          id: job.id ?? "",
          executionId: job.data?.executionId ?? "",
          error: job.data?.error ?? job.failedReason ?? "Unknown failure",
          metadata: job.data?.metadata,
          timestamp: job.data?.timestamp ?? new Date(job.timestamp).toISOString(),
          attemptsMade: job.attemptsMade,
          workflowId: job.data?.workflowId,
          orgId: job.data?.orgId,
        };
      }
    } catch {}
  }

  return inMemoryDLQ.get(jobId) ?? null;
}

export async function getDLQIncidents(options: {
  workflowId?: string;
  orgId?: string;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ incidents: DLQIncidentRecord[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  let records = Array.from(inMemoryIncidents.values());

  if (options.workflowId) {
    records = records.filter((r) => r.workflowId === options.workflowId);
  }
  if (options.orgId) {
    records = records.filter((r) => r.orgId === options.orgId);
  }
  if (options.status) {
    records = records.filter((r) => r.status === options.status);
  }
  if (options.severity) {
    records = records.filter((r) => r.severity === options.severity);
  }

  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const total = records.length;
  const incidents = records.slice(offset, offset + limit);
  return { incidents, total };
}

export async function getDLQIncidentById(id: string): Promise<DLQIncidentRecord | null> {
  return inMemoryIncidents.get(id) ?? null;
}

export async function updateDLQIncidentStatus(id: string, status: DLQIncidentRecord["status"]): Promise<DLQIncidentRecord | null> {
  const inc = inMemoryIncidents.get(id);
  if (!inc) return null;
  inc.status = status;
  if (status === "RESOLVED" || status === "PURGED") {
    inc.resolvedAt = new Date().toISOString();
  }
  return inc;
}

export async function replayDLQJob(jobId: string): Promise<boolean> {
  const record = await getDLQJobById(jobId);
  if (!record) return false;

  // Re-enqueue execution
  await enqueueExecution(record.executionId, { replayedFromDLQ: true, dlqJobId: jobId });

  // Update incident status
  const incidentId = `inc-${jobId}`;
  const inc = inMemoryIncidents.get(incidentId);
  if (inc) {
    inc.status = "RESOLVED";
    inc.resolvedAt = new Date().toISOString();
  }

  // Remove from DLQ
  inMemoryDLQ.delete(jobId);
  const dlq = getDLQQueue();
  if (dlq) {
    try {
      const job = await dlq.getJob(jobId);
      if (job) await job.remove();
    } catch {}
  }

  return true;
}

export async function replayBatchDLQ(jobIds: string[]): Promise<{ replayed: number; failed: number }> {
  let replayed = 0;
  let failed = 0;

  for (const id of jobIds) {
    const success = await replayDLQJob(id);
    if (success) replayed++;
    else failed++;
  }

  return { replayed, failed };
}

export async function replayAllDLQ(): Promise<{ replayed: number; failed: number }> {
  const { jobs } = await getDLQJobsList({ limit: 1000 });
  const ids = jobs.map((j) => j.id);
  return replayBatchDLQ(ids);
}

export async function purgeDLQ(): Promise<number> {
  const count = inMemoryDLQ.size;
  inMemoryDLQ.clear();

  // Mark all open incidents as PURGED
  for (const inc of inMemoryIncidents.values()) {
    if (inc.status === "OPEN" || inc.status === "INVESTIGATING") {
      inc.status = "PURGED";
      inc.resolvedAt = new Date().toISOString();
    }
  }

  const dlq = getDLQQueue();
  if (dlq) {
    try {
      await dlq.drain();
      await dlq.clean(0, 10000, "failed");
      await dlq.clean(0, 10000, "completed");
    } catch {}
  }

  return count;
}

export async function getQueueMetrics() {
  const q = getWorkflowQueue();
  const dlq = getDLQQueue();

  const emptyStats = { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  const getCounts = async (queue?: Queue) => {
    if (!queue) return emptyStats;
    try {
      const counts = await queue.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused");
      return {
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      };
    } catch {
      return emptyStats;
    }
  };

  const dlqCount = inMemoryDLQ.size;
  const isAnomaly = dlqCount > 100;

  return {
    workflows: await getCounts(q),
    dlq: {
      ...(await getCounts(dlq)),
      inMemoryCount: dlqCount,
      anomalyAlert: isAnomaly,
    },
  };
}

export async function retryFailedJobs(queueName: "workflows" | "workflows-dlq" | string = "workflows"): Promise<number> {
  const queue = getQueueByName(queueName);
  if (!queue) return 0;
  try {
    const failedJobs = await queue.getFailed(0, 100);
    let retried = 0;
    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }
    return retried;
  } catch (err) {
    console.error(`Error retrying failed jobs in ${queueName}:`, err);
    return 0;
  }
}

export async function retryJob(queueName: string, jobId: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    await job.retry();
    return true;
  } catch (err) {
    console.error(`Error retrying job ${jobId} in ${queueName}:`, err);
    return false;
  }
}

export async function getQueueJobs(
  queueName: string,
  types: Array<"active" | "waiting" | "completed" | "failed" | "delayed" | "paused"> = ["failed", "waiting", "active"],
  start = 0,
  end = 50
) {
  const queue = getQueueByName(queueName);
  if (!queue) return [];
  try {
    const jobs = await queue.getJobs(types as any, start, end);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (err) {
    console.error(`Error getting jobs for ${queueName}:`, err);
    return [];
  }
}

export async function cleanQueue(queueName: string, grace = 1000, limit = 1000, type: "completed" | "failed" = "completed") {
  const queue = getQueueByName(queueName);
  if (!queue) return [];
  try {
    return await queue.clean(grace, limit, type);
  } catch (err) {
    console.error(`Error cleaning queue ${queueName}:`, err);
    return [];
  }
}

export async function pauseQueue(queueName: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    await queue.pause();
    return true;
  } catch {
    return false;
  }
}

export async function resumeQueue(queueName: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) return false;
  try {
    await queue.resume();
    return true;
  } catch {
    return false;
  }
}

export async function closeExecutionQueue() {
  await workflowQueue?.close();
  await dlqQueue?.close();
  workflowQueue = undefined;
  dlqQueue = undefined;
}
