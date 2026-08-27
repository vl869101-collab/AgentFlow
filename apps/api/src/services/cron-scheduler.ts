import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { createWorkflowExecution, runExecution } from "./executor.js";
import { enqueueExecution, getWorkflowQueue } from "./queue.js";
import { getRedisClient } from "../lib/redis.js";

export interface CronScheduleConfig {
  workflowId: string;
  cronExpression: string;
  timezone?: string;
  preventOverlap?: boolean;
  active?: boolean;
}

export interface CronMatchOptions {
  currentDate?: Date;
  timezone?: string;
}

export interface CronSyncEvent {
  action: "SYNC" | "UNREGISTER";
  workflowId: string;
  timestamp?: number;
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const CRON_ALIASES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
  "@every_minute": "* * * * *",
  "@every_second": "* * * * * *",
};

export const CRON_SYNC_CHANNEL = "agentflow:cron:sync";

// ── Quartz & Unix Cron Parser Helpers ───────────────────────

export function parseCronField(
  field: string,
  min: number,
  max: number,
  aliasMap?: Record<string, number>
): number[] {
  const result = new Set<number>();
  let normalized = field.trim().toUpperCase();

  if (aliasMap) {
    for (const [name, val] of Object.entries(aliasMap)) {
      normalized = normalized.replace(new RegExp(`\\b${name}\\b`, "g"), String(val));
    }
  }

  const parts = normalized.split(",");

  for (const part of parts) {
    if (part === "*" || part === "?") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;
      if (range !== "*" && range !== "?") {
        if (range.includes("-")) {
          const [rStart, rEnd] = range.split("-").map((s) => parseInt(s, 10));
          start = isNaN(rStart) ? min : rStart;
          end = isNaN(rEnd) ? max : rEnd;
        } else {
          start = parseInt(range, 10) || min;
        }
      }
      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) result.add(i);
      }
    } else if (part.includes("-")) {
      const [start, end] = part.split("-").map((s) => parseInt(s, 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) result.add(i);
        }
      }
    } else {
      let num = parseInt(part, 10);
      if (aliasMap && isNaN(num) && aliasMap[part] !== undefined) {
        num = aliasMap[part];
      }
      if (num === 7 && max === 6 && min === 0) {
        // Standard unix: 7 is Sunday (0)
        num = 0;
      }
      if (!isNaN(num) && num >= min && num <= max) {
        result.add(num);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

export interface ParsedCron {
  seconds?: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

export function parseCronExpression(expression: string): ParsedCron {
  const trimmed = expression.trim();
  const resolved = CRON_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const parts = resolved.split(/\s+/);

  if (parts.length < 5 || parts.length > 6) {
    throw new Error(`Invalid cron expression '${expression}': expected 5 or 6 fields`);
  }

  let seconds: number[] | undefined;
  let minutePart: string;
  let hourPart: string;
  let domPart: string;
  let monthPart: string;
  let dowPart: string;

  if (parts.length === 6) {
    // 6 fields: sec min hour dom month dow
    seconds = parseCronField(parts[0], 0, 59);
    minutePart = parts[1];
    hourPart = parts[2];
    domPart = parts[3];
    monthPart = parts[4];
    dowPart = parts[5];
  } else {
    // 5 fields: min hour dom month dow
    minutePart = parts[0];
    hourPart = parts[1];
    domPart = parts[2];
    monthPart = parts[3];
    dowPart = parts[4];
  }

  return {
    ...(seconds ? { seconds } : {}),
    minutes: parseCronField(minutePart, 0, 59),
    hours: parseCronField(hourPart, 0, 23),
    daysOfMonth: parseCronField(domPart, 1, 31),
    months: parseCronField(monthPart, 1, 12, MONTH_NAMES),
    daysOfWeek: parseCronField(dowPart, 0, 6, DOW_NAMES),
  };
}

export function getDatePartsInTimezone(
  date: Date,
  timezone?: string
): { sec: number; min: number; hour: number; dom: number; month: number; dow: number } {
  if (!timezone || timezone === "UTC" || timezone === "GMT") {
    if (timezone === "UTC" || timezone === "GMT") {
      return {
        sec: date.getUTCSeconds(),
        min: date.getUTCMinutes(),
        hour: date.getUTCHours(),
        dom: date.getUTCDate(),
        month: date.getUTCMonth() + 1,
        dow: date.getUTCDay(),
      };
    }
    return {
      sec: date.getSeconds(),
      min: date.getMinutes(),
      hour: date.getHours(),
      dom: date.getDate(),
      month: date.getMonth() + 1,
      dow: date.getDay(),
    };
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    let sec = 0;
    let min = 0;
    let hour = 0;
    let dom = 1;
    let month = 1;
    let dow = 0;

    for (const p of parts) {
      if (p.type === "second") sec = parseInt(p.value, 10);
      else if (p.type === "minute") min = parseInt(p.value, 10);
      else if (p.type === "hour") {
        const val = parseInt(p.value, 10);
        hour = val === 24 ? 0 : val;
      } else if (p.type === "day") dom = parseInt(p.value, 10);
      else if (p.type === "month") month = parseInt(p.value, 10);
      else if (p.type === "weekday") {
        const weekdayMap: Record<string, number> = {
          Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        dow = weekdayMap[p.value] ?? date.getDay();
      }
    }

    return { sec, min, hour, dom, month, dow };
  } catch {
    return {
      sec: date.getSeconds(),
      min: date.getMinutes(),
      hour: date.getHours(),
      dom: date.getDate(),
      month: date.getMonth() + 1,
      dow: date.getDay(),
    };
  }
}

export function isCronMatch(expression: string, date = new Date(), timezone?: string): boolean {
  try {
    const parsed = parseCronExpression(expression);
    const parts = getDatePartsInTimezone(date, timezone);

    if (parsed.seconds && !parsed.seconds.includes(parts.sec)) return false;
    if (!parsed.minutes.includes(parts.min)) return false;
    if (!parsed.hours.includes(parts.hour)) return false;
    if (!parsed.daysOfMonth.includes(parts.dom)) return false;
    if (!parsed.months.includes(parts.month)) return false;
    if (!parsed.daysOfWeek.includes(parts.dow)) return false;

    return true;
  } catch {
    return false;
  }
}

export function getNextCronDate(
  expression: string,
  fromDate = new Date(),
  timezone?: string
): Date | null {
  const current = new Date(fromDate.getTime() + 1000);
  current.setMilliseconds(0);

  const maxIterations = 366 * 24 * 60;
  let iter = 0;

  while (iter < maxIterations) {
    if (isCronMatch(expression, current, timezone)) {
      return new Date(current.getTime());
    }
    current.setMinutes(current.getMinutes() + 1);
    current.setSeconds(0);
    iter++;
  }

  return null;
}

// ── Distributed Lock via Redis (Redlock Pattern) ────────────

export interface LockAcquisitionResult {
  acquired: boolean;
  token: string;
}

export class DistributedLock {
  private inMemoryLocks = new Map<string, { token: string; expiresAt: number }>();

  async acquire(
    key: string,
    ttlMs = 60000,
    customToken?: string
  ): Promise<LockAcquisitionResult> {
    const token = customToken || randomUUID();
    const client = getRedisClient();

    if (client) {
      try {
        const res = await client.set(`lock:${key}`, token, "PX", ttlMs, "NX");
        const acquired = res === "OK";
        return { acquired, token: acquired ? token : "" };
      } catch (err) {
        // Fallback to in-memory lock
      }
    }

    const now = Date.now();
    const existing = this.inMemoryLocks.get(key);
    if (existing && existing.expiresAt > now) {
      return { acquired: false, token: "" };
    }

    this.inMemoryLocks.set(key, { token, expiresAt: now + ttlMs });
    return { acquired: true, token };
  }

  async release(key: string, token?: string): Promise<boolean> {
    const client = getRedisClient();
    if (client) {
      try {
        if (token) {
          const lua = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          const result = await client.eval(lua, 1, `lock:${key}`, token);
          return Number(result) === 1;
        } else {
          const result = await client.del(`lock:${key}`);
          return Number(result) > 0;
        }
      } catch {}
    }

    const existing = this.inMemoryLocks.get(key);
    if (!existing) return false;
    if (!token || existing.token === token) {
      this.inMemoryLocks.delete(key);
      return true;
    }
    return false;
  }

  async isLocked(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (client) {
      try {
        const exists = await client.exists(`lock:${key}`);
        return exists === 1;
      } catch {}
    }
    const entry = this.inMemoryLocks.get(key);
    return Boolean(entry && entry.expiresAt > Date.now());
  }
}

// ── CronSchedulerService ────────────────────────────────────

export class CronSchedulerService {
  private schedules = new Map<string, CronScheduleConfig>();
  private intervalTimer?: ReturnType<typeof setInterval>;
  private lock = new DistributedLock();
  private isRunning = false;
  private subscriberClient: any = null;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial sync of all active cron workflows from DB
    await this.syncAllWorkflows();

    // Subscribe to Redis PubSub sync events across instances
    await this.subscribeToSyncEvents();

    // Tick every minute on second 0
    this.intervalTimer = setInterval(() => {
      void this.tick();
    }, 60 * 1000);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    if (this.subscriberClient) {
      try {
        this.subscriberClient.unsubscribe(CRON_SYNC_CHANNEL);
        this.subscriberClient.disconnect();
      } catch {}
      this.subscriberClient = null;
    }
    this.schedules.clear();
    this.isRunning = false;
  }

  registerWorkflow(
    workflowId: string,
    cronExpression: string,
    timezone?: string,
    options: { preventOverlap?: boolean } = {}
  ): void {
    parseCronExpression(cronExpression);

    this.schedules.set(workflowId, {
      workflowId,
      cronExpression,
      timezone,
      preventOverlap: options.preventOverlap ?? true,
      active: true,
    });

    void this.registerBullMQRepeatable(workflowId, cronExpression, timezone);
  }

  unregisterWorkflow(workflowId: string): void {
    this.schedules.delete(workflowId);
    void this.removeBullMQRepeatable(workflowId);
  }

  getSchedule(workflowId: string): CronScheduleConfig | undefined {
    return this.schedules.get(workflowId);
  }

  listSchedules(): CronScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  async syncWorkflow(workflowId: string): Promise<boolean> {
    try {
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: { nodes: true },
      });

      if (!workflow || workflow.status !== "ACTIVE") {
        this.unregisterWorkflow(workflowId);
        return false;
      }

      const cronNode = workflow.nodes?.find((n: any) =>
        ["cron", "cronTrigger", "cron_trigger"].includes(n.type)
      );

      if (!cronNode) {
        this.unregisterWorkflow(workflowId);
        return false;
      }

      const config = (cronNode.config as Record<string, any>) ?? {};
      const cronExpr = String(config.expression ?? config.cronExpression ?? config.cron ?? "0 * * * *");
      const timezone = config.timezone ? String(config.timezone) : undefined;
      const preventOverlap = config.preventOverlap !== false;

      this.registerWorkflow(workflowId, cronExpr, timezone, { preventOverlap });
      return true;
    } catch {
      return false;
    }
  }

  async syncAllWorkflows(): Promise<number> {
    try {
      const workflows = await prisma.workflow.findMany({
        where: { status: "ACTIVE" },
        include: { nodes: true },
      });

      let count = 0;
      for (const wf of workflows) {
        const cronNode = wf.nodes?.find((n: any) =>
          ["cron", "cronTrigger", "cron_trigger"].includes(n.type)
        );

        if (cronNode) {
          const config = (cronNode.config as Record<string, any>) ?? {};
          const cronExpr = String(config.expression ?? config.cronExpression ?? config.cron ?? "0 * * * *");
          const timezone = config.timezone ? String(config.timezone) : undefined;
          const preventOverlap = config.preventOverlap !== false;

          try {
            this.registerWorkflow(wf.id, cronExpr, timezone, { preventOverlap });
            count++;
          } catch {}
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  // ── BullMQ Repeatables Integration ─────────────────────────

  async registerBullMQRepeatable(
    workflowId: string,
    cronExpression: string,
    timezone?: string
  ): Promise<boolean> {
    const queue = getWorkflowQueue();
    if (!queue) return false;

    try {
      await this.removeBullMQRepeatable(workflowId);
      await queue.add(
        "cron-trigger",
        { workflowId, isCron: true },
        {
          jobId: `cron:${workflowId}`,
          repeat: {
            pattern: cronExpression,
            tz: timezone,
          },
          removeOnComplete: true,
          removeOnFail: true,
        }
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  async removeBullMQRepeatable(workflowId: string): Promise<boolean> {
    const queue = getWorkflowQueue();
    if (!queue) return false;

    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.id === `cron:${workflowId}` || job.name === "cron-trigger" && job.key.includes(workflowId)) {
          await queue.removeRepeatableByKey(job.key);
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  // ── Real-Time Sync & Redis PubSub ──────────────────────────

  async publishSyncEvent(event: CronSyncEvent): Promise<void> {
    const client = getRedisClient();
    if (client && client.status === "ready") {
      try {
        await client.publish(
          CRON_SYNC_CHANNEL,
          JSON.stringify({ ...event, timestamp: Date.now() })
        );
      } catch (err) {
        // PubSub publish fallback
      }
    }
  }

  async handleSyncEvent(event: CronSyncEvent): Promise<void> {
    if (event.action === "SYNC") {
      await this.syncWorkflow(event.workflowId);
    } else if (event.action === "UNREGISTER") {
      this.unregisterWorkflow(event.workflowId);
    }
  }

  async subscribeToSyncEvents(): Promise<void> {
    const client = getRedisClient();
    if (!client || client.status !== "ready" || this.subscriberClient) return;

    try {
      this.subscriberClient = client.duplicate();
      await this.subscriberClient.subscribe(CRON_SYNC_CHANNEL);
      this.subscriberClient.on("message", (_channel: string, message: string) => {
        try {
          const event = JSON.parse(message) as CronSyncEvent;
          void this.handleSyncEvent(event);
        } catch {}
      });
    } catch (err) {
      // PubSub subscribe fallback
    }
  }

  // ── Trigger Execution with Redlock Anti-Overlap ────────────

  async triggerCron(
    workflowId: string,
    options: { preventOverlap?: boolean } = {}
  ): Promise<boolean> {
    const lockKey = `cron:${workflowId}`;
    const shouldPreventOverlap = options.preventOverlap ?? true;
    let lockToken: string | undefined;

    if (shouldPreventOverlap) {
      const lockRes = await this.lock.acquire(lockKey, 5 * 60 * 1000);
      const acquired = typeof lockRes === "boolean" ? lockRes : lockRes.acquired;
      lockToken = typeof lockRes === "object" ? lockRes.token : undefined;

      if (!acquired) {
        console.warn(
          `[CronScheduler] Skipping overlapping execution for workflow ${workflowId} (locked)`
        );
        return false;
      }
    }

    try {
      const execution = await createWorkflowExecution(
        workflowId,
        {
          cronTrigger: true,
          triggeredAt: new Date().toISOString(),
        },
        { trigger: "cron" }
      );

      const enqueued = await enqueueExecution(execution.id);
      if (!enqueued) {
        void runExecution(execution.id).finally(async () => {
          if (shouldPreventOverlap) {
            await this.lock.release(lockKey, lockToken);
          }
        });
      } else if (shouldPreventOverlap) {
        // For enqueued jobs, release lock once execution completes or let worker handle
        // We can keep the lock with TTL
      }
      return true;
    } catch (err) {
      if (shouldPreventOverlap) {
        await this.lock.release(lockKey, lockToken);
      }
      throw err;
    }
  }

  async tick(now = new Date()): Promise<string[]> {
    const triggered: string[] = [];

    for (const schedule of this.schedules.values()) {
      if (!schedule.active) continue;

      if (isCronMatch(schedule.cronExpression, now, schedule.timezone)) {
        try {
          const ok = await this.triggerCron(schedule.workflowId, {
            preventOverlap: schedule.preventOverlap,
          });
          if (ok) {
            triggered.push(schedule.workflowId);
          }
        } catch (err) {
          console.error(
            `[CronScheduler] Error triggering workflow ${schedule.workflowId}:`,
            err
          );
        }
      }
    }

    return triggered;
  }
}

export const cronScheduler = new CronSchedulerService();
