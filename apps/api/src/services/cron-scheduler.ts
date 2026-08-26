import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { createWorkflowExecution, runExecution } from "./executor.js";
import { enqueueExecution } from "./queue.js";
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

// ── Quartz & Unix Cron Parser Helpers ───────────────────────

export function parseCronField(field: string, min: number, max: number): number[] {
  const result = new Set<number>();
  const parts = field.split(",");

  for (const part of parts) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;
      if (range !== "*") {
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
      const num = parseInt(part, 10);
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
  const parts = expression.trim().split(/\s+/);
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
    daysOfMonth: parseCronField(domPart.replace(/\?/g, "*"), 1, 31),
    months: parseCronField(monthPart, 1, 12),
    daysOfWeek: parseCronField(dowPart.replace(/\?/g, "*").replace(/7/g, "0"), 0, 6),
  };
}

export function isCronMatch(expression: string, date = new Date()): boolean {
  try {
    const parsed = parseCronExpression(expression);
    const sec = date.getSeconds();
    const min = date.getMinutes();
    const hour = date.getHours();
    const dom = date.getDate();
    const month = date.getMonth() + 1;
    const dow = date.getDay();

    if (parsed.seconds && !parsed.seconds.includes(sec)) return false;
    if (!parsed.minutes.includes(min)) return false;
    if (!parsed.hours.includes(hour)) return false;
    if (!parsed.daysOfMonth.includes(dom)) return false;
    if (!parsed.months.includes(month)) return false;
    if (!parsed.daysOfWeek.includes(dow)) return false;

    return true;
  } catch {
    return false;
  }
}

export function getNextCronDate(expression: string, fromDate = new Date()): Date | null {
  const current = new Date(fromDate.getTime() + 1000);
  current.setMilliseconds(0);

  // Search forward up to 366 days
  const maxIterations = 366 * 24 * 60;
  let iter = 0;

  while (iter < maxIterations) {
    if (isCronMatch(expression, current)) {
      return new Date(current.getTime());
    }
    current.setMinutes(current.getMinutes() + 1);
    current.setSeconds(0);
    iter++;
  }

  return null;
}

// ── Distributed Lock via Redis ───────────────────────────────

class DistributedLock {
  private inMemoryLocks = new Map<string, number>();

  async acquire(key: string, ttlMs = 60000): Promise<boolean> {
    const client = getRedisClient();
    if (client) {
      try {
        const res = await client.set(`lock:${key}`, "1", "PX", ttlMs, "NX");
        return res === "OK";
      } catch {}
    }

    const now = Date.now();
    const existing = this.inMemoryLocks.get(key);
    if (existing && existing > now) {
      return false;
    }
    this.inMemoryLocks.set(key, now + ttlMs);
    return true;
  }

  async release(key: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.del(`lock:${key}`);
      } catch {}
    }
    this.inMemoryLocks.delete(key);
  }

  async isLocked(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (client) {
      try {
        const exists = await client.exists(`lock:${key}`);
        return exists === 1;
      } catch {}
    }
    const expiry = this.inMemoryLocks.get(key);
    return Boolean(expiry && expiry > Date.now());
  }
}

// ── CronSchedulerService ────────────────────────────────────

export class CronSchedulerService {
  private schedules = new Map<string, CronScheduleConfig>();
  private intervalTimer?: ReturnType<typeof setInterval>;
  private lock = new DistributedLock();
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial sync of all active cron workflows
    await this.syncAllWorkflows();

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
    this.schedules.clear();
    this.isRunning = false;
  }

  registerWorkflow(workflowId: string, cronExpression: string, timezone?: string, options: { preventOverlap?: boolean } = {}): void {
    // Validate expression syntax
    parseCronExpression(cronExpression);

    this.schedules.set(workflowId, {
      workflowId,
      cronExpression,
      timezone,
      preventOverlap: options.preventOverlap ?? true,
      active: true,
    });
  }

  unregisterWorkflow(workflowId: string): void {
    this.schedules.delete(workflowId);
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

  async triggerCron(workflowId: string, options: { preventOverlap?: boolean } = {}): Promise<boolean> {
    const lockKey = `cron:${workflowId}`;
    const shouldPreventOverlap = options.preventOverlap ?? true;

    if (shouldPreventOverlap) {
      const acquired = await this.lock.acquire(lockKey, 5 * 60 * 1000);
      if (!acquired) {
        console.warn(`[CronScheduler] Skipping overlapping execution for workflow ${workflowId} (locked)`);
        return false;
      }
    }

    try {
      const execution = await createWorkflowExecution(workflowId, {
        cronTrigger: true,
        triggeredAt: new Date().toISOString(),
      }, { trigger: "cron" });

      const enqueued = await enqueueExecution(execution.id);
      if (!enqueued) {
        void runExecution(execution.id).finally(async () => {
          if (shouldPreventOverlap) {
            await this.lock.release(lockKey);
          }
        });
      }
      return true;
    } catch (err) {
      if (shouldPreventOverlap) {
        await this.lock.release(lockKey);
      }
      throw err;
    }
  }

  async tick(now = new Date()): Promise<string[]> {
    const triggered: string[] = [];

    for (const schedule of this.schedules.values()) {
      if (!schedule.active) continue;

      if (isCronMatch(schedule.cronExpression, now)) {
        try {
          const ok = await this.triggerCron(schedule.workflowId, { preventOverlap: schedule.preventOverlap });
          if (ok) {
            triggered.push(schedule.workflowId);
          }
        } catch (err) {
          console.error(`[CronScheduler] Error triggering workflow ${schedule.workflowId}:`, err);
        }
      }
    }

    return triggered;
  }
}

export const cronScheduler = new CronSchedulerService();
