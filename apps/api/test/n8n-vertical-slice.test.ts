import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  wrapItems,
  unwrapItems,
  extractFieldByPath,
  setFieldByPath,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  type NodeItem,
} from "@agentflow/shared";

// Configure deterministic in-memory test environment
delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.MOCK_SERVICES = "true";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const [{ createWorkflowExecution, runExecution }] = await Promise.all([
  import("../src/services/executor.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
});

test("n8n Vertical Slice E2E: Webhook -> Normalizer -> Code (Multi-Item) -> Switch (Branching) -> Sheets/Gmail -> Error Workflow", async () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Setup Organization, User and Webhook Ingestion
  // ─────────────────────────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: { name: "n8n Slice Org", slug: "n8n-slice-org" },
  });
  const user = await prisma.user.create({
    data: { email: "n8n-slice@agentflow.io", passwordHash: "hashed_pass", name: "Slice Tester" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Setup Dedicated Error Workflow (Triggered when unhandled failure occurs)
  // ─────────────────────────────────────────────────────────────────────────────
  const errorWorkflow = await prisma.workflow.create({
    data: {
      name: "Global Error Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: {
        create: [
          { id: "err-trig", type: "errorTrigger", label: "Error Trigger", config: {} },
          {
            id: "err-gmail",
            type: "gmail",
            label: "Send Failure Alert",
            config: {
              operation: "sendMessage",
              to: "ops-team@agentflow.io",
              subject: "CRITICAL: Workflow Failure Detected",
              mock: true,
            },
          },
        ],
      },
      edges: {
        create: [
          { id: "e-err-1", sourceNodeId: "err-trig", targetNodeId: "err-gmail" },
        ],
      },
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Setup Main Primary Workflow with n8n Vertical Slice Pipeline
  //    Nodes:
  //      - trig (webhook)
  //      - code-enrich (code multi-item processing)
  //      - switch-priority (switch condition branching based on customer priority/score)
  //      - sheets-vip (googleSheets append for High Priority / VIP items)
  //      - gmail-standard (gmail sendMessage for Standard items)
  // ─────────────────────────────────────────────────────────────────────────────
  const mainWorkflow = await prisma.workflow.create({
    data: {
      name: "n8n Multi-Item Processing Pipeline",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: errorWorkflow.id }),
      nodes: {
        create: [
          {
            id: "node-webhook",
            type: "webhook",
            label: "Webhook Ingest",
            config: { path: "n8n-orders" },
          },
          {
            id: "node-code-enrich",
            type: "code",
            label: "Enrich Items Contract",
            config: {
              parameters: {
                mode: "runOnceForAllItems",
                jsCode: `
                  const items = $input.all();
                  return items.map((item, idx) => {
                    const raw = item.json;
                    const subtotal = (raw.quantity || 1) * (raw.unitPrice || 10);
                    const isVip = raw.tier === 'VIP' || subtotal >= 500;
                    return {
                      json: {
                        ...raw,
                        orderId: 'ORD-' + (idx + 100),
                        subtotal,
                        isVip,
                        priority: isVip ? 'HIGH' : 'STANDARD',
                      }
                    };
                  });
                `,
              },
            },
          },
          {
            id: "node-switch",
            type: "switch",
            label: "Route Priority",
            config: {
              rules: [
                { field: "priority", operator: "equals", value: "HIGH", outputIndex: 1 },
                { field: "priority", operator: "equals", value: "STANDARD", outputIndex: 2 },
              ],
              fallbackOutput: 0,
            },
          },
          {
            id: "node-sheets-vip",
            type: "googleSheets",
            label: "Log VIP to Google Sheets",
            config: {
              operation: "appendRow",
              spreadsheetId: "sheet-vip-orders-123",
              range: "VIP_Orders!A:Z",
              mock: true,
            },
          },
          {
            id: "node-gmail-standard",
            type: "gmail",
            label: "Notify Standard via Gmail",
            config: {
              operation: "sendMessage",
              to: "notifications@agentflow.io",
              subject: "Standard Order Received",
              mock: true,
            },
          },
        ],
      },
      edges: {
        create: [
          { id: "e1", sourceNodeId: "node-webhook", targetNodeId: "node-code-enrich" },
          { id: "e2", sourceNodeId: "node-code-enrich", targetNodeId: "node-switch" },
          { id: "e3", sourceNodeId: "node-switch", targetNodeId: "node-sheets-vip", sourceHandle: "1" },
          { id: "e4", sourceNodeId: "node-switch", targetNodeId: "node-gmail-standard", sourceHandle: "2" },
        ],
      },
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Ingest Raw Webhook Payload via Fastify API
  // ─────────────────────────────────────────────────────────────────────────────
  const rawOrdersPayload = [
    { customer: "Acme Corp", tier: "VIP", quantity: 10, unitPrice: 100 }, // subtotal: 1000 -> HIGH -> Sheets
    { customer: "Jane Doe", tier: "Standard", quantity: 2, unitPrice: 25 }, // subtotal: 50 -> STANDARD -> Gmail
    { customer: "Big Retail", tier: "Regular", quantity: 50, unitPrice: 20 }, // subtotal: 1000 -> HIGH -> Sheets
  ];

  // Wrap items via Items Contract Normalizer and execute the pipeline
  const normalizedIncoming = wrapItems(rawOrdersPayload);
  assert.equal(normalizedIncoming.length, 3);
  assert.equal(normalizedIncoming[0].json.customer, "Acme Corp");

  const execution = await createWorkflowExecution(
    mainWorkflow.id,
    normalizedIncoming,
    { userId: user.id, trigger: "webhook" }
  );

  const execResult = await runExecution(execution.id);
  assert.equal(execResult.status, "SUCCESS", `Execution failed: ${execResult.error}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Verify Node Executions and Data Propagation
  // ─────────────────────────────────────────────────────────────────────────────
  const nodeExecs = await prisma.nodeExecution.findMany({
    where: { executionId: execution.id },
  });

  const executedNodeIds = nodeExecs.map((ne) => ne.nodeId);
  assert.ok(executedNodeIds.includes("node-webhook"));
  assert.ok(executedNodeIds.includes("node-code-enrich"));
  assert.ok(executedNodeIds.includes("node-switch"));
  assert.ok(executedNodeIds.includes("node-sheets-vip"));
  assert.ok(executedNodeIds.includes("node-gmail-standard"));

  // Verify Code Node output conforms to NodeItem[]
  const codeExec = nodeExecs.find((ne) => ne.nodeId === "node-code-enrich");
  assert.ok(codeExec);
  const codeOutput = (Array.isArray(codeExec.output)
    ? codeExec.output
    : (codeExec.output as any)?.items ?? [codeExec.output]) as NodeItem[];
  assert.equal(Array.isArray(codeOutput), true);
  assert.equal(codeOutput.length, 3);
  assert.equal(codeOutput[0].json.orderId, "ORD-100");
  assert.equal(codeOutput[0].json.subtotal, 1000);
  assert.equal(codeOutput[0].json.priority, "HIGH");
  assert.equal(codeOutput[1].json.orderId, "ORD-101");
  assert.equal(codeOutput[1].json.subtotal, 50);
  assert.equal(codeOutput[1].json.priority, "STANDARD");

  // Verify Google Sheets VIP node executed for High priority orders
  const sheetsExec = nodeExecs.find((ne) => ne.nodeId === "node-sheets-vip");
  assert.ok(sheetsExec);
  assert.equal(sheetsExec.status, "SUCCESS");

  // Verify Gmail node executed for Standard orders
  const gmailExec = nodeExecs.find((ne) => ne.nodeId === "node-gmail-standard");
  assert.ok(gmailExec);
  assert.equal(gmailExec.status, "SUCCESS");

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Verify Error Workflow Invocation on Fatal Node Failure
  // ─────────────────────────────────────────────────────────────────────────────
  const failingWorkflow = await prisma.workflow.create({
    data: {
      name: "Failing Pipeline for Error Workflow Test",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: errorWorkflow.id }),
      nodes: {
        create: [
          { id: "fail-webhook", type: "webhook", label: "Webhook Trigger", config: {} },
          {
            id: "fail-http",
            type: "http",
            label: "Broken HTTP Endpoint",
            config: { url: "http://non-existent-broken-domain-999.invalid" },
          },
        ],
      },
      edges: {
        create: [
          { id: "e-fail-1", sourceNodeId: "fail-webhook", targetNodeId: "fail-http" },
        ],
      },
    },
  });

  const failExec = await createWorkflowExecution(
    failingWorkflow.id,
    [{ json: { payload: "test error trigger" } }],
    { userId: user.id, trigger: "webhook" }
  );

  const failResult = await runExecution(failExec.id);
  assert.equal(failResult.status, "FAILED");

  // Verify that an Error Workflow execution was spawned automatically
  const errorExecutions = await prisma.workflowExecution.findMany({
    where: { workflowId: errorWorkflow.id },
  });

  assert.ok(errorExecutions.length >= 1);
  const latestErrorExec = errorExecutions[errorExecutions.length - 1];
  assert.equal(latestErrorExec.trigger, "error");
  assert.equal(latestErrorExec.orgId, org.id);

  const errorContext = latestErrorExec.input as Record<string, any>;
  assert.ok(errorContext);
  assert.equal(errorContext.workflowId, failingWorkflow.id);
  assert.equal(errorContext.failedNodeId, "fail-http");
  assert.equal(errorContext.failedNodeType, "http");
  assert.equal(errorContext.errorCode, "WORKFLOW_EXECUTION_FAILED");
});

test("n8n Items Contract: nested extraction, wildcards and immutability", () => {
  const dataset = {
    order: {
      items: [
        { sku: "SKU-A", price: 100, tags: ["tech", "gadget"] },
        { sku: "SKU-B", price: 250, tags: ["furniture"] },
      ],
      billing: {
        contact: { email: "billing@acme.com" },
      },
    },
  };

  const email = extractFieldByPath(dataset, "order.billing.contact.email");
  assert.strictEqual(email, "billing@acme.com");

  const skus = extractFieldByPath(dataset, "order.items[*].sku");
  assert.deepStrictEqual(skus, ["SKU-A", "SKU-B"]);

  // Test immutable setFieldByPath
  const updated = setFieldByPath(dataset, "order.billing.contact.phone", "+123456789");
  assert.strictEqual((updated as any).order.billing.contact.phone, "+123456789");
  assert.strictEqual((dataset as any).order.billing.contact.phone, undefined);
});
