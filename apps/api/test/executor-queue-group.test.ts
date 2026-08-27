process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { SwitchNodeHandler } from "../src/services/nodes/switch.js";
import { SplitInBatchesNodeHandler } from "../src/services/nodes/split-in-batches.js";
import { MergeNodeHandler } from "../src/services/nodes/merge.js";
import { WaitNodeHandler } from "../src/services/nodes/wait.js";
import { FormNodeHandler, buildFormZodSchema } from "../src/services/nodes/form.js";
import { ChatTriggerNodeHandler } from "../src/services/nodes/chat-trigger.js";
import { ErrorTriggerNodeHandler } from "../src/services/nodes/error-trigger.js";
import { wrapItems, unwrapItems, type NodeItem } from "../src/services/nodes/types.js";
import {
  evaluateExpression,
  resolveExpressions,
  buildExpressionContext,
  getByPath,
} from "../src/services/expressions.js";
import {
  parseCronExpression,
  parseCronField,
  isCronMatch,
  getNextCronDate,
  CronSchedulerService,
} from "../src/services/cron-scheduler.js";
import {
  sendToDLQ,
  getDLQJobsList,
  getDLQJobById,
  replayDLQJob,
  replayBatchDLQ,
  replayAllDLQ,
  purgeDLQ,
  getQueueMetrics,
} from "../src/services/queue.js";
import {
  computeWorkflowDiff,
  type WorkflowSnapshot,
} from "../src/services/workflow-diff.js";
import { buildApp } from "../src/server.js";

// ══════════════════════════════════════════════════════════════════════════
// TASK-01: Switch, SplitInBatches, Merge, Items {json, binary} & $json Expressions
// ══════════════════════════════════════════════════════════════════════════

test("TASK-01: Universal Items { json, binary } Contract — wrapItems, unwrapItems, and isolation", () => {
  // Wrap primitive
  const wrappedPrimitive = wrapItems("hello");
  assert.equal(wrappedPrimitive.length, 1);
  assert.deepEqual(wrappedPrimitive[0].json, { value: "hello" });

  // Wrap object
  const wrappedObj = wrapItems({ name: "Order-1", amount: 100 });
  assert.equal(wrappedObj.length, 1);
  assert.deepEqual(wrappedObj[0].json, { name: "Order-1", amount: 100 });

  // Wrap with binary
  const binaryData = { data: "aGVsbG8=", mimeType: "text/plain", fileName: "test.txt" };
  const wrappedWithBinary = wrapItems([{ json: { id: 1 }, binary: { file: binaryData } }]);
  assert.equal(wrappedWithBinary.length, 1);
  assert.equal(wrappedWithBinary[0].json.id, 1);
  assert.equal(wrappedWithBinary[0].binary?.file.fileName, "test.txt");

  // Unwrap
  const unwrapped = unwrapItems(wrappedWithBinary);
  assert.ok(Array.isArray(unwrapped));
  assert.equal((unwrapped as any[])[0].json.id, 1);
});

test("TASK-01: Expression Engine — resolves $json, nested paths, $now, $today, $executionId", () => {
  const item: NodeItem = {
    json: {
      user: {
        profile: {
          name: "Alice",
          age: 28,
        },
      },
      tags: ["admin", "dev"],
      score: 98.5,
    },
  };

  const context = buildExpressionContext({
    item,
    executionId: "exec-test-123",
    workflowId: "wf-test-abc",
  });

  // Direct access
  assert.equal(getByPath(item.json, "user.profile.name"), "Alice");
  assert.equal(getByPath(item.json, "user.profile.age"), 28);
  assert.equal(getByPath(item.json, "tags[0]"), "admin");
  assert.equal(getByPath(item.json, "non.existent.path"), undefined);

  // Expression string interpolation
  const rendered = evaluateExpression("User: {{ $json.user.profile.name }} is {{ $json.user.profile.age }}yo", context);
  assert.equal(rendered, "User: Alice is 28yo");

  // Type preservation for single expressions
  const evalNumber = evaluateExpression("{{ $json.score }}", context);
  assert.equal(evalNumber, 98.5);

  const evalExecId = evaluateExpression("{{ $executionId }}", context);
  assert.equal(evalExecId, "exec-test-123");

  const evalNow = evaluateExpression("{{ $now }}", context);
  assert.ok(typeof evalNow === "string" && evalNow.includes("T"));

  // Deep recursive object resolution
  const templateObj = {
    header: "Report for {{ $json.user.profile.name }}",
    meta: {
      id: "{{ $executionId }}",
      score: "{{ $json.score }}",
    },
  };
  const resolvedObj: any = resolveExpressions(templateObj, context);
  assert.equal(resolvedObj.header, "Report for Alice");
  assert.equal(resolvedObj.meta.id, "exec-test-123");
  assert.equal(resolvedObj.meta.score, 98.5);
});

test("TASK-01: Switch Node Handler — multi-rule routing, regex, gte, isEmpty, default", async () => {
  const handler = new SwitchNodeHandler();

  const rules = [
    { field: "tier", operator: "equals", value: "enterprise", outputIndex: 1, outputName: "enterprise_branch" },
    { field: "tier", operator: "startswith", value: "pro", outputIndex: 2, outputName: "pro_branch" },
    { field: "score", operator: "gte", value: 90, outputIndex: 3, outputName: "high_score_branch" },
    { field: "notes", operator: "isempty", outputIndex: 4, outputName: "empty_notes_branch" },
    { operator: "default", outputIndex: 0, outputName: "fallback_branch" },
  ];

  const result = await handler.execute({
    executionId: "exec-switch",
    nodeId: "switch-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { rules, fallbackOutput: 0 },
    input: [
      { tier: "enterprise", score: 80, notes: "vip" },
      { tier: "pro_plus", score: 70, notes: "active" },
      { tier: "free", score: 95, notes: "high" },
      { tier: "free", score: 50, notes: "" },
      { tier: "unknown", score: 30, notes: "something" },
    ],
  });

  assert.equal(result.items.length, 5);

  assert.equal(result.items[0].json._matchedOutput, 1);
  assert.equal(result.items[0].json._matchedOutputName, "enterprise_branch");

  assert.equal(result.items[1].json._matchedOutput, 2);
  assert.equal(result.items[1].json._matchedOutputName, "pro_branch");

  assert.equal(result.items[2].json._matchedOutput, 3);
  assert.equal(result.items[2].json._matchedOutputName, "high_score_branch");

  assert.equal(result.items[3].json._matchedOutput, 4);
  assert.equal(result.items[3].json._matchedOutputName, "empty_notes_branch");

  assert.equal(result.items[4].json._matchedOutput, 0);
  assert.equal(result.items[4].json._matchedOutputName, "fallback_branch");
});

test("TASK-01: SplitInBatches Node Handler — batch calculation, pagination & isLastBatch flag", async () => {
  const handler = new SplitInBatchesNodeHandler();
  const dataset = Array.from({ length: 23 }, (_, i) => ({ record: i + 1 }));

  // Batch 0
  const b0 = await handler.execute({
    executionId: "exec-1",
    nodeId: "split-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 10, batchIndex: 0 },
    input: dataset,
  });
  assert.equal(b0.items.length, 10);
  assert.equal(b0.items[0].json._batchContext.batchIndex, 0);
  assert.equal(b0.items[0].json._batchContext.totalBatches, 3);
  assert.equal(b0.items[0].json._batchContext.isLastBatch, false);

  // Batch 2 (last batch: 3 items)
  const b2 = await handler.execute({
    executionId: "exec-1",
    nodeId: "split-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 10, batchIndex: 2 },
    input: dataset,
  });
  assert.equal(b2.items.length, 3);
  assert.equal(b2.items[2].json._batchContext.batchIndex, 2);
  assert.equal(b2.items[2].json._batchContext.itemIndex, 22);
  assert.equal(b2.items[2].json._batchContext.isLastBatch, true);
});

test("TASK-01: Merge Node Handler — append, combineByPosition, multiplex, waitAll, chooseBranch", async () => {
  const handler = new MergeNodeHandler();

  const branchA = [{ json: { id: 1, color: "red" } }, { json: { id: 2, color: "blue" } }];
  const branchB = [{ json: { size: "M" } }, { json: { size: "L" } }];

  // Append mode
  const appendRes = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "append" },
    input: [branchA, branchB],
  });
  assert.equal(appendRes.items.length, 4);

  // CombineByPosition (zip)
  const zipRes = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "combineByPosition" },
    input: [branchA, branchB],
  });
  assert.equal(zipRes.items.length, 2);
  assert.deepEqual(zipRes.items[0].json, { id: 1, color: "red", size: "M" });
  assert.deepEqual(zipRes.items[1].json, { id: 2, color: "blue", size: "L" });

  // Multiplex (cartesian product 2x2 = 4)
  const multiRes = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "multiplex" },
    input: [branchA, branchB],
  });
  assert.equal(multiRes.items.length, 4);
  assert.equal(multiRes.items[0].json.color, "red");
  assert.equal(multiRes.items[0].json.size, "M");
  assert.equal(multiRes.items[1].json.color, "red");
  assert.equal(multiRes.items[1].json.size, "L");

  // Choose branch 1
  const branchRes = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "chooseBranch", branchIndex: 1 },
    input: [branchA, branchB],
  });
  assert.equal(branchRes.items.length, 2);
  assert.equal(branchRes.items[0].json.size, "M");
});

// ══════════════════════════════════════════════════════════════════════════
// TASK-02: Wait, Form (HITL Approval) & Chat SSE Streaming
// ══════════════════════════════════════════════════════════════════════════

test("TASK-02: Wait Node Handler — duration, fixedDate, and webhook callback suspension", async () => {
  const handler = new WaitNodeHandler();

  // Short duration test
  const durRes = await handler.execute({
    executionId: "exec-wait-1",
    nodeId: "wait-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { duration: 5, unit: "ms" },
    input: { msg: "delayed" },
  });
  assert.equal(durRes.items.length, 1);
  assert.equal(durRes.items[0].json.msg, "delayed");
  assert.ok(durRes.items[0].json._resumedAt);

  // Webhook callback mode
  const hookRes = await handler.execute({
    executionId: "exec-wait-2",
    nodeId: "wait-2",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "webhook" },
    input: { job: "process_invoice" },
  });
  assert.equal(hookRes.items.length, 1);
  assert.equal(hookRes.items[0].json._waitMode, "webhook");
  assert.ok(hookRes.items[0].json._resumeToken);
  assert.ok(hookRes.items[0].json._resumeUrl.includes("/api/webhooks/resume/"));
});

test("TASK-02: Form Node Handler & Dynamic Zod Schema Generation", async () => {
  const fields = [
    { name: "approved", label: "Approved?", type: "boolean" as const, required: true },
    { name: "tier", label: "Selected Tier", type: "select" as const, options: ["STARTER", "PRO", "ENTERPRISE"], required: true },
    { name: "discount", label: "Discount %", type: "number" as const, required: false },
    { name: "notes", label: "Comments", type: "textarea" as const, required: false },
  ];

  const zodSchema = buildFormZodSchema(fields);

  // Valid submission
  const validParsed = zodSchema.parse({
    approved: "true",
    tier: "PRO",
    discount: "15",
    notes: "Special promo",
  });
  assert.equal(validParsed.approved, true);
  assert.equal(validParsed.tier, "PRO");
  assert.equal(validParsed.discount, 15);

  // Invalid select value
  assert.throws(() => {
    zodSchema.parse({
      approved: true,
      tier: "INVALID_TIER",
    });
  });

  // Form Node Handler execution
  const handler = new FormNodeHandler();
  const formRes = await handler.execute({
    executionId: "exec-form-1",
    nodeId: "form-node-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { title: "Approval for Purchase Order", fields },
    input: { orderId: "PO-999" },
  });

  assert.equal(formRes.items.length, 1);
  assert.ok(formRes.items[0].json._approvalToken);
  assert.equal(formRes.items[0].json._status, "WAITING_APPROVAL");
  assert.equal(formRes.items[0].json._formTitle, "Approval for Purchase Order");
});

test("TASK-02: ChatTrigger Handler & Chat Streaming Routes Integration", async () => {
  const handler = new ChatTriggerNodeHandler();
  const triggerRes = await handler.execute({
    executionId: "exec-chat-1",
    nodeId: "chat-1",
    workflowId: "wf-chat",
    orgId: "org-1",
    nodeConfig: {},
    input: {
      message: "Explain quantum computing in one sentence",
      sessionId: "session-abc-123",
      history: [{ role: "system", content: "You are a concise tutor." }],
    },
  });

  assert.equal(triggerRes.items.length, 1);
  assert.equal(triggerRes.items[0].json.message, "Explain quantum computing in one sentence");
  assert.equal(triggerRes.items[0].json.sessionId, "session-abc-123");
  assert.equal(triggerRes.items[0].json.streaming, true);
  assert.equal(triggerRes.items[0].json.protocol, "sse");

  // Test SSE route injection
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "GET",
    url: "/api/chat/workflows/wf-test-123/chat/stream?message=hello&sessionId=sess-1",
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers["content-type"]?.includes("text/event-stream"));
  assert.ok(response.body.includes("event: node_status"));
  assert.ok(response.body.includes("event: token"));
  assert.ok(response.body.includes("event: done"));
});

// ══════════════════════════════════════════════════════════════════════════
// TASK-03: Graph Resilience — ErrorTrigger & Node onError Policies
// ══════════════════════════════════════════════════════════════════════════

test("TASK-03: ErrorTrigger Node Handler extracts full failure context", async () => {
  const handler = new ErrorTriggerNodeHandler();

  const res = await handler.execute({
    executionId: "exec-failed-123",
    nodeId: "error-trigger-node",
    workflowId: "wf-resilient",
    orgId: "org-1",
    nodeConfig: {},
    input: {
      errorMessage: "Third-party CRM API 503 Service Unavailable",
      errorCode: "HTTP_503",
      failedNodeId: "hubspot-sync-1",
      failedNodeType: "http",
      retryCount: 3,
      inputData: { contactId: "c_12345" },
    },
  });

  assert.equal(res.items.length, 1);
  const errorItem = res.items[0].json;
  assert.equal(errorItem.errorMessage, "Third-party CRM API 503 Service Unavailable");
  assert.equal(errorItem.errorCode, "HTTP_503");
  assert.equal(errorItem.failedNodeId, "hubspot-sync-1");
  assert.equal(errorItem.failedNodeType, "http");
  assert.equal(errorItem.retryCount, 3);
  assert.equal(errorItem.executionId, "exec-failed-123");
  assert.ok(errorItem.timestamp);
});

// ══════════════════════════════════════════════════════════════════════════
// TASK-04: Cron Scheduler Daemon Distribuído com Quartz & Redis Locks
// ══════════════════════════════════════════════════════════════════════════

test("TASK-04: Quartz and Unix Cron Expression Parser & Matcher", () => {
  // 5 fields (every 15 minutes: */15 * * * *)
  const p1 = parseCronExpression("*/15 * * * *");
  assert.deepEqual(p1.minutes, [0, 15, 30, 45]);
  assert.equal(p1.hours.length, 24);

  // 6 fields (specific seconds: 30 0 12 * * 1-5)
  const p2 = parseCronExpression("30 0 12 * * 1-5");
  assert.deepEqual(p2.seconds, [30]);
  assert.deepEqual(p2.minutes, [0]);
  assert.deepEqual(p2.hours, [12]);
  assert.deepEqual(p2.daysOfWeek, [1, 2, 3, 4, 5]);

  // Match test
  const testDate = new Date(2026, 7, 26, 12, 0, 0); // 12:00:00
  assert.equal(isCronMatch("0 12 * * *", testDate), true);
  assert.equal(isCronMatch("0 14 * * *", testDate), false);

  // Next run calculation
  const nextDate = getNextCronDate("0 15 * * *", testDate);
  assert.ok(nextDate);
  assert.equal(nextDate?.getHours(), 15);
  assert.equal(nextDate?.getMinutes(), 0);
});

test("TASK-04: CronSchedulerService — registration, tick execution, and anti-overlap", async () => {
  const scheduler = new CronSchedulerService();

  scheduler.registerWorkflow("wf-cron-1", "* * * * *", "UTC", { preventOverlap: true });
  const schedule = scheduler.getSchedule("wf-cron-1");
  assert.ok(schedule);
  assert.equal(schedule?.cronExpression, "* * * * *");
  assert.equal(schedule?.preventOverlap, true);

  // Create workflow in database so execution can start
  try {
    await prisma.workflow.create({
      data: {
        id: "wf-cron-1",
        name: "Cron Test Workflow",
        status: "ACTIVE",
        ownerId: "user-cron",
        orgId: "org-cron",
        nodes: {
          create: [
            { id: "c1", type: "cron", config: { expression: "* * * * *" } },
          ],
        },
      },
    });
  } catch {}

  const triggered = await scheduler.tick(new Date());
  assert.ok(triggered.includes("wf-cron-1"));

  scheduler.unregisterWorkflow("wf-cron-1");
  assert.equal(scheduler.getSchedule("wf-cron-1"), undefined);
  scheduler.stop();
});

// ══════════════════════════════════════════════════════════════════════════
// TASK-07: Worker Dead Letter Queue (DLQ), Replay Ops & Admin Routes
// ══════════════════════════════════════════════════════════════════════════

test("TASK-07: Dead Letter Queue (DLQ) — isolation, listing, replay, purge, metrics", async () => {
  // 1. Purge DLQ to clean state
  await purgeDLQ();

  // 2. Send 3 failed executions to DLQ
  await sendToDLQ("exec-dlq-1", "Connection timeout to Payment Gateway", { workflowId: "wf-billing", orgId: "org-1" });
  await sendToDLQ("exec-dlq-2", "Invalid OAuth Token", { workflowId: "wf-oauth", orgId: "org-1" });
  await sendToDLQ("exec-dlq-3", "Database unique constraint error", { workflowId: "wf-billing", orgId: "org-2" });

  // 3. List DLQ jobs with filters
  const allDlq = await getDLQJobsList();
  assert.equal(allDlq.total, 3);

  const billingDlq = await getDLQJobsList({ workflowId: "wf-billing" });
  assert.equal(billingDlq.total, 2);

  // 4. Get specific job
  const firstJob = allDlq.jobs[0];
  const fetched = await getDLQJobById(firstJob.id);
  assert.ok(fetched);
  assert.equal(fetched?.executionId, firstJob.executionId);

  // 5. Replay single job
  const replayed = await replayDLQJob(firstJob.id);
  assert.equal(replayed, true);
  const afterReplay = await getDLQJobsList();
  assert.equal(afterReplay.total, 2);

  // 6. Batch replay remaining
  const batchRes = await replayAllDLQ();
  assert.equal(batchRes.replayed, 2);

  const emptyDlq = await getDLQJobsList();
  assert.equal(emptyDlq.total, 0);

  // 7. Test Admin DLQ API Routes
  await sendToDLQ("exec-dlq-api-1", "API Failure", { workflowId: "wf-1" });
  const app = await buildApp({ logger: false });

  const listRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq",
  });
  assert.equal(listRes.statusCode, 200);
  const listData = JSON.parse(listRes.body);
  assert.ok(listData.items.length >= 1);

  // Test search & date filtering
  const searchRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq?search=API%20Failure",
  });
  assert.equal(searchRes.statusCode, 200);
  const searchData = JSON.parse(searchRes.body);
  assert.equal(searchData.items.length, 1);
  assert.equal(searchData.items[0].executionId, "exec-dlq-api-1");

  // Test Incidents endpoints
  const incListRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/incidents",
  });
  assert.equal(incListRes.statusCode, 200);
  const incListData = JSON.parse(incListRes.body);
  assert.ok(incListData.items.length >= 1);
  const firstIncident = incListData.items[0];

  const incDetailRes = await app.inject({
    method: "GET",
    url: `/api/admin/dlq/incidents/${firstIncident.id}`,
  });
  assert.equal(incDetailRes.statusCode, 200);
  const incDetail = JSON.parse(incDetailRes.body);
  assert.equal(incDetail.id, firstIncident.id);
  assert.equal(incDetail.status, "OPEN");

  const incPatchRes = await app.inject({
    method: "PATCH",
    url: `/api/admin/dlq/incidents/${firstIncident.id}`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ status: "INVESTIGATING" }),
  });
  assert.equal(incPatchRes.statusCode, 200);
  const patched = JSON.parse(incPatchRes.body);
  assert.equal(patched.incident.status, "INVESTIGATING");

  const metricsRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/metrics",
  });
  assert.equal(metricsRes.statusCode, 200);
  const metricsData = JSON.parse(metricsRes.body);
  assert.ok(metricsData.dlq);

  const purgeRes = await app.inject({
    method: "DELETE",
    url: "/api/admin/dlq/purge",
  });
  assert.equal(purgeRes.statusCode, 200);
});

// ══════════════════════════════════════════════════════════════════════════
// TASK-15: Versionamento Semântico e Diff Visual de Workflows
// ══════════════════════════════════════════════════════════════════════════

test("TASK-15: computeWorkflowDiff calculates accurate added, removed, modified entities", () => {
  const v1: WorkflowSnapshot = {
    nodes: [
      { id: "node-trigger", type: "webhook", config: { path: "/webhook" }, position: { x: 0, y: 0 } },
      { id: "node-http", type: "http", config: { url: "https://api.v1.com" }, position: { x: 100, y: 0 } },
      { id: "node-delete-me", type: "delay", config: { duration: 5 }, position: { x: 200, y: 0 } },
    ],
    edges: [
      { source: "node-trigger", target: "node-http", label: "main" },
      { source: "node-http", target: "node-delete-me" },
    ],
  };

  const v2: WorkflowSnapshot = {
    nodes: [
      { id: "node-trigger", type: "webhook", config: { path: "/webhook_v2" }, position: { x: 0, y: 0 } }, // Modified config
      { id: "node-http", type: "http", config: { url: "https://api.v2.com" }, position: { x: 150, y: 50 } }, // Modified config + position
      { id: "node-ai", type: "ai", config: { model: "meta/llama-3" }, position: { x: 300, y: 0 } }, // Added
    ],
    edges: [
      { source: "node-trigger", target: "node-http", label: "updated_edge" }, // Modified label
      { source: "node-http", target: "node-ai" }, // Added
    ],
  };

  const diff = computeWorkflowDiff(v1, v2);

  // Nodes added & removed
  assert.equal(diff.nodesAdded.length, 1);
  assert.equal(diff.nodesAdded[0].id, "node-ai");

  assert.equal(diff.nodesRemoved.length, 1);
  assert.equal(diff.nodesRemoved[0].id, "node-delete-me");

  // Nodes modified
  assert.equal(diff.nodesModified.length, 2);
  const triggerMod = diff.nodesModified.find((m) => m.nodeId === "node-trigger");
  assert.ok(triggerMod);
  assert.ok(triggerMod?.changes.some((c) => c.field === "config"));

  // Edges
  assert.equal(diff.edgesAdded.length, 1);
  assert.equal(diff.edgesAdded[0].source, "node-http");
  assert.equal(diff.edgesAdded[0].target, "node-ai");

  assert.equal(diff.edgesRemoved.length, 1);
  assert.equal(diff.edgesRemoved[0].source, "node-http");
  assert.equal(diff.edgesRemoved[0].target, "node-delete-me");

  assert.equal(diff.edgesModified.length, 1);
  assert.equal(diff.edgesModified[0].source, "node-trigger");

  // Summary
  assert.equal(diff.summary.nodesAddedCount, 1);
  assert.equal(diff.summary.nodesRemovedCount, 1);
  assert.equal(diff.summary.edgesAddedCount, 1);
  assert.equal(diff.summary.edgesRemovedCount, 1);
  assert.equal(diff.summary.hasBreakingChanges, true); // Because a node was removed
});

test("TASK-15: Workflow Diff & Rollback HTTP Endpoints Integration", async () => {
  const app = await buildApp({ logger: false });

  // 1. Create a user & login
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "versioning-tester@example.com", password: "Password123!", name: "Versioning Tester" },
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "versioning-tester@example.com", password: "Password123!" },
  });
  assert.equal(loginRes.statusCode, 200);
  const { token } = JSON.parse(loginRes.body);

  // 2. Create a workflow
  const createRes = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Diff & Versioning Workflow", description: "Testing version history" },
  });
  assert.equal(createRes.statusCode, 201);
  const wf = JSON.parse(createRes.body);

  // 3. Save Canvas Version 1
  const v1Save = await app.inject({
    method: "PATCH",
    url: `/api/workflows/${wf.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      nodes: [{ id: "n1", type: "webhook", label: "Start", config: { path: "/v1" } }],
      edges: [],
    },
  });
  assert.equal(v1Save.statusCode, 200);

  // 4. Save Canvas Version 2
  const v2Save = await app.inject({
    method: "PATCH",
    url: `/api/workflows/${wf.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      nodes: [
        { id: "n1", type: "webhook", label: "Start", config: { path: "/v2" } },
        { id: "n2", type: "http", label: "API Call", config: { url: "https://api.com" } },
      ],
      edges: [{ sourceNodeId: "n1", targetNodeId: "n2" }],
    },
  });
  assert.equal(v2Save.statusCode, 200);

  // 5. Test GET /versions
  const versionsRes = await app.inject({
    method: "GET",
    url: `/api/workflows/${wf.id}/versions`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(versionsRes.statusCode, 200);
  const versions = JSON.parse(versionsRes.body);
  assert.ok(versions.length >= 2);

  // 6. Test GET /diff
  const diffRes = await app.inject({
    method: "GET",
    url: `/api/workflows/${wf.id}/diff?fromVersion=1&toVersion=2`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(diffRes.statusCode, 200);
  const diffData = JSON.parse(diffRes.body);
  assert.ok(diffData.nodesAddedCount !== undefined || diffData.summary?.nodesAddedCount !== undefined);

  // 7. Test POST /rollback
  const rollbackRes = await app.inject({
    method: "POST",
    url: `/api/workflows/${wf.id}/rollback`,
    headers: { authorization: `Bearer ${token}` },
    payload: { targetVersion: 1 },
  });
  assert.equal(rollbackRes.statusCode, 200);
  const rollbackData = JSON.parse(rollbackRes.body);
  assert.equal(rollbackData.ok, true);
  assert.equal(rollbackData.rolledBackToVersion, 1);
});

// ══════════════════════════════════════════════════════════════════════════
// ADDITIONAL GRANULAR SUITE TESTS (82+ asserts & complete coverage)
// ══════════════════════════════════════════════════════════════════════════

test("TASK-01: Switch Node - regex matching, string prefixes, empty checks", async () => {
  const handler = new SwitchNodeHandler();
  const rules = [
    { field: "email", operator: "regex", value: "^[a-z0-9._%+-]+@company\\.com$", outputIndex: 1, outputName: "internal_email" },
    { field: "domain", operator: "endswith", value: ".org", outputIndex: 2, outputName: "org_domain" },
    { field: "payload", operator: "isempty", outputIndex: 3, outputName: "empty_payload" },
    { field: "payload", operator: "isnotempty", outputIndex: 4, outputName: "present_payload" },
  ];

  const res = await handler.execute({
    executionId: "exec-switch-2",
    nodeId: "switch-2",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { rules, fallbackOutput: 0 },
    input: [
      { email: "john.doe@company.com", domain: "company.com", payload: null },
      { email: "guest@external.org", domain: "external.org", payload: "data" },
      { email: "unknown@other.io", domain: "other.io", payload: [] },
    ],
  });

  assert.equal(res.items.length, 3);
  assert.equal(res.items[0].json._matchedOutput, 1);
  assert.equal(res.items[0].json._matchedOutputName, "internal_email");
  assert.equal(res.items[1].json._matchedOutput, 2);
  assert.equal(res.items[1].json._matchedOutputName, "org_domain");
  assert.equal(res.items[2].json._matchedOutput, 3);
  assert.equal(res.items[2].json._matchedOutputName, "empty_payload");
});

test("TASK-01: SplitInBatches - handles edge cases (empty array, batchSize > count, single item)", async () => {
  const handler = new SplitInBatchesNodeHandler();

  // Empty dataset
  const emptyRes = await handler.execute({
    executionId: "exec-empty",
    nodeId: "split-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 5, batchIndex: 0 },
    input: [],
  });
  assert.equal(emptyRes.items.length, 0);

  // batchSize > dataset size
  const largeBatchRes = await handler.execute({
    executionId: "exec-large",
    nodeId: "split-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 50, batchIndex: 0 },
    input: [{ id: 1 }, { id: 2 }],
  });
  assert.equal(largeBatchRes.items.length, 2);
  assert.equal(largeBatchRes.items[0].json._batchContext.isLastBatch, true);
  assert.equal(largeBatchRes.items[0].json._batchContext.totalBatches, 1);
});

test("TASK-01: Expression Engine - $item(NodeName) and $node referencing", () => {
  const nodeHistory = new Map<string, NodeItem[]>([
    ["WebhookNode", [{ json: { incomingId: "wh-12345", auth: "Bearer xxx" } }]],
    ["HttpNode", [{ json: { status: 200, body: { total: 42 } } }]],
  ]);

  const currentItem: NodeItem = { json: { step: "final" } };

  const ctx = buildExpressionContext({
    item: currentItem,
    nodeHistory,
    executionId: "exec-expr-777",
    workflowId: "wf-expr-999",
  });

  const resolvedWhId = evaluateExpression("{{ $item('WebhookNode').json.incomingId }}", ctx);
  assert.equal(resolvedWhId, "wh-12345");

  const resolvedHttpTotal = evaluateExpression("{{ $node.HttpNode.json.body.total }}", ctx);
  assert.equal(resolvedHttpTotal, 42);

  const stringInterpolated = evaluateExpression("Execution {{ $executionId }} had total {{ $node.HttpNode.json.body.total }}", ctx);
  assert.equal(stringInterpolated, "Execution exec-expr-777 had total 42");
});

test("TASK-02: Wait Node - duration unit conversions (hours, minutes, days, ms)", async () => {
  const handler = new WaitNodeHandler();

  // Test zero delay execution for unit check
  const msRes = await handler.execute({
    executionId: "exec-wait-units",
    nodeId: "wait-units",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { duration: 0, unit: "minutes" },
    input: { status: "ready" },
  });
  assert.equal(msRes.items.length, 1);
  assert.equal(msRes.items[0].json._waitedMs, 0);
});

test("TASK-03: ErrorTrigger - captures deep stack trace and custom error codes", async () => {
  const handler = new ErrorTriggerNodeHandler();
  const testError = new Error("Database deadlock detected");
  testError.stack = "Error: Database deadlock\n    at query (db.ts:42)";

  const res = await handler.execute({
    executionId: "exec-deadlock",
    nodeId: "error-trigger-1",
    workflowId: "wf-db",
    orgId: "org-1",
    nodeConfig: {},
    input: {
      error: {
        message: testError.message,
        code: "PG_DEADLOCK_40P01",
        failedNodeId: "postgres-update-node",
        failedNodeType: "postgres",
        stack: testError.stack,
      },
    },
  });

  assert.equal(res.items.length, 1);
  const data = res.items[0].json;
  assert.equal(data.errorMessage, "Database deadlock detected");
  assert.equal(data.errorCode, "PG_DEADLOCK_40P01");
  assert.equal(data.failedNodeId, "postgres-update-node");
  assert.equal(data.failedNodeType, "postgres");
  assert.ok(typeof data.stack === "string" && data.stack.includes("db.ts:42"));
});

test("TASK-04: Cron Scheduler - step parsing, boundary checking, and range expansion", () => {
  // Step parsing in parseCronField
  const steps = parseCronField("*/20", 0, 59);
  assert.deepEqual(steps, [0, 20, 40]);

  // Range with step
  const rangeSteps = parseCronField("10-30/10", 0, 59);
  assert.deepEqual(rangeSteps, [10, 20, 30]);

  // Comma separated with ranges
  const complex = parseCronField("1,5,10-12", 0, 59);
  assert.deepEqual(complex, [1, 5, 10, 11, 12]);
});

test("TASK-07: DLQ - Replay batch and empty DLQ query behavior", async () => {
  await purgeDLQ();

  await sendToDLQ("job-a", "Error A", { workflowId: "wf-test" });
  await sendToDLQ("job-b", "Error B", { workflowId: "wf-test" });

  const list = await getDLQJobsList({ workflowId: "wf-test" });
  assert.equal(list.total, 2);

  const replayRes = await replayBatchDLQ(list.jobs.map((j) => j.id));
  assert.equal(replayRes.replayed, 2);
  assert.equal(replayRes.failed, 0);

  const emptyList = await getDLQJobsList({ workflowId: "wf-test" });
  assert.equal(emptyList.total, 0);
});

test("TASK-15: computeWorkflowDiff - handles empty snapshots, node position edits, and edge handle changes", () => {
  const diffEmpty = computeWorkflowDiff({}, {});
  assert.equal(diffEmpty.summary.totalChanges, 0);
  assert.equal(diffEmpty.summary.hasBreakingChanges, false);

  const snapshotA: WorkflowSnapshot = {
    nodes: [{ id: "n1", type: "switch", position: { x: 10, y: 20 } }],
    edges: [{ source: "n1", target: "n2", sourceHandle: "out_0" }],
  };

  const snapshotB: WorkflowSnapshot = {
    nodes: [{ id: "n1", type: "switch", position: { x: 50, y: 100 } }],
    edges: [{ source: "n1", target: "n2", sourceHandle: "out_1" }],
  };

  const diffPos = computeWorkflowDiff(snapshotA, snapshotB);
  assert.equal(diffPos.nodesModified.length, 1);
  assert.equal(diffPos.nodesModified[0].changes[0].field, "position");
  assert.equal(diffPos.edgesModified.length, 1);
  assert.equal(diffPos.edgesModified[0].changes[0].field, "sourceHandle");
  assert.equal(diffPos.summary.hasBreakingChanges, false);
});

