process.env.NODE_ENV = "test";
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  parseCronField,
  parseCronExpression,
  isCronMatch,
  getNextCronDate,
  DistributedLock,
  CronSchedulerService,
  cronScheduler,
} from "../src/services/cron-scheduler.js";

// ── 1. Quartz & Unix Cron Parsing Tests ───────────────────────

test("TASK-04: Cron Parser - 5 fields standard unix cron", () => {
  const parsed = parseCronExpression("*/10 2-4 1,15 * 1-5");
  assert.deepEqual(parsed.minutes, [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(parsed.hours, [2, 3, 4]);
  assert.deepEqual(parsed.daysOfMonth, [1, 15]);
  assert.equal(parsed.months.length, 12);
  assert.deepEqual(parsed.daysOfWeek, [1, 2, 3, 4, 5]);
  assert.equal(parsed.seconds, undefined);
});

test("TASK-04: Cron Parser - 6 fields Quartz cron with seconds and question mark", () => {
  const parsed = parseCronExpression("15 30 12 ? * MON-FRI");
  assert.deepEqual(parsed.seconds, [15]);
  assert.deepEqual(parsed.minutes, [30]);
  assert.deepEqual(parsed.hours, [12]);
  assert.equal(parsed.daysOfMonth.length, 31); // ? translates to *
  assert.deepEqual(parsed.daysOfWeek, [1, 2, 3, 4, 5]);
});

test("TASK-04: Cron Parser - Month names and Day names", () => {
  const parsed = parseCronExpression("0 0 1 JAN,JUN,DEC SUN,SAT");
  assert.deepEqual(parsed.months, [1, 6, 12]);
  assert.deepEqual(parsed.daysOfWeek, [0, 6]);
});

test("TASK-04: Cron Parser - Handles invalid expressions cleanly", () => {
  assert.throws(() => parseCronExpression("invalid expression"), /Invalid cron expression/);
  assert.throws(() => parseCronExpression("* * *"), /Invalid cron expression/);
  assert.throws(() => parseCronExpression("* * * * * * *"), /Invalid cron expression/);
});

test("TASK-04: Cron Parser - Standard aliases (@daily, @hourly, @weekly, @monthly, @yearly)", () => {
  const hourly = parseCronExpression("@hourly");
  assert.deepEqual(hourly.minutes, [0]);
  assert.equal(hourly.hours.length, 24);

  const daily = parseCronExpression("@daily");
  assert.deepEqual(daily.minutes, [0]);
  assert.deepEqual(daily.hours, [0]);
});

// ── 2. Timezone Matching Tests ───────────────────────────────

test("TASK-04: Timezone matching - UTC vs America/Sao_Paulo vs America/New_York", () => {
  // 2026-08-26 15:30:00 UTC
  const dateUtc = new Date(Date.UTC(2026, 7, 26, 15, 30, 0));

  // In UTC, hour is 15
  assert.equal(isCronMatch("30 15 * * *", dateUtc, "UTC"), true);
  assert.equal(isCronMatch("30 12 * * *", dateUtc, "UTC"), false);

  // In America/Sao_Paulo (UTC-3 in standard time), 15:30 UTC is 12:30 local
  assert.equal(isCronMatch("30 12 * * *", dateUtc, "America/Sao_Paulo"), true);
  assert.equal(isCronMatch("30 15 * * *", dateUtc, "America/Sao_Paulo"), false);

  // In America/New_York (EDT UTC-4 in August), 15:30 UTC is 11:30 local
  assert.equal(isCronMatch("30 11 * * *", dateUtc, "America/New_York"), true);
});

test("TASK-04: getNextCronDate with Timezone", () => {
  const fromDate = new Date(Date.UTC(2026, 7, 26, 10, 0, 0));
  // Find next 14:00 in America/Sao_Paulo
  const next = getNextCronDate("0 14 * * *", fromDate, "America/Sao_Paulo");
  assert.ok(next);
  // 14:00 Sao Paulo is 17:00 UTC
  assert.equal(next?.getUTCHours(), 17);
  assert.equal(next?.getUTCMinutes(), 0);
});

// ── 3. DistributedLock & Redlock Pattern ─────────────────────

test("TASK-04: DistributedLock - acquire, isLocked, release with token verification", async () => {
  const lock = new DistributedLock();
  const lockKey = "wf-test-lock-1";

  // Acquire lock
  const res1 = await lock.acquire(lockKey, 5000);
  assert.equal(res1.acquired, true);
  assert.ok(res1.token);

  // Check locked
  assert.equal(await lock.isLocked(lockKey), true);

  // Second acquire should fail
  const res2 = await lock.acquire(lockKey, 5000);
  assert.equal(res2.acquired, false);

  // Release with wrong token should fail
  const releasedWrong = await lock.release(lockKey, "wrong-token");
  assert.equal(releasedWrong, false);
  assert.equal(await lock.isLocked(lockKey), true);

  // Release with correct token succeeds
  const releasedRight = await lock.release(lockKey, res1.token);
  assert.equal(releasedRight, true);
  assert.equal(await lock.isLocked(lockKey), false);

  // Can acquire again after release
  const res3 = await lock.acquire(lockKey, 5000);
  assert.equal(res3.acquired, true);
  await lock.release(lockKey, res3.token);
});

// ── 4. CronSchedulerService Full Lifecycle ────────────────────

test("TASK-04: CronSchedulerService - register, unregister, preventOverlap, and execution", async () => {
  const scheduler = new CronSchedulerService();
  const wfId = "wf-scheduler-test-1";

  // Create workflow in memory DB
  await prisma.workflow.create({
    data: {
      id: wfId,
      name: "Scheduler Auto Workflow",
      status: "ACTIVE",
      ownerId: "user-test",
      orgId: "org-test",
      nodes: {
        create: [
          {
            id: "node-cron-1",
            type: "cronTrigger",
            config: { expression: "* * * * *", timezone: "UTC", preventOverlap: true },
          },
        ],
      },
    },
  });

  // Sync workflow from DB
  const synced = await scheduler.syncWorkflow(wfId);
  assert.equal(synced, true);

  const schedule = scheduler.getSchedule(wfId);
  assert.ok(schedule);
  assert.equal(schedule?.cronExpression, "* * * * *");
  assert.equal(schedule?.timezone, "UTC");
  assert.equal(schedule?.preventOverlap, true);

  // Trigger cron execution
  const triggeredOk = await scheduler.triggerCron(wfId, { preventOverlap: true });
  assert.equal(triggeredOk, true);

  // Dynamic update: change status to INACTIVE
  await prisma.workflow.update({
    where: { id: wfId },
    data: { status: "INACTIVE" },
  });

  const syncedInactive = await scheduler.syncWorkflow(wfId);
  assert.equal(syncedInactive, false);
  assert.equal(scheduler.getSchedule(wfId), undefined);

  scheduler.stop();
});

test("TASK-04: CronSchedulerService - Live sync event handling", async () => {
  const scheduler = new CronSchedulerService();
  const wfId = "wf-sync-event-test";

  await prisma.workflow.create({
    data: {
      id: wfId,
      name: "Sync Event Workflow",
      status: "ACTIVE",
      ownerId: "user-test",
      orgId: "org-test",
      nodes: {
        create: [
          {
            id: "cron-node",
            type: "cron",
            config: { expression: "0 * * * *" },
          },
        ],
      },
    },
  });

  // Simulate handling incoming live sync event
  await scheduler.handleSyncEvent({ action: "SYNC", workflowId: wfId });
  assert.ok(scheduler.getSchedule(wfId));

  // Simulate delete event
  await scheduler.handleSyncEvent({ action: "UNREGISTER", workflowId: wfId });
  assert.equal(scheduler.getSchedule(wfId), undefined);

  scheduler.stop();
});
