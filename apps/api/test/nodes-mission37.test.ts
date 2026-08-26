process.env.ALLOW_MEMORY_DB = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { SwitchNodeHandler } from "../src/services/nodes/switch.js";
import { SplitInBatchesNodeHandler } from "../src/services/nodes/split-in-batches.js";
import { ChatTriggerNodeHandler } from "../src/services/nodes/chat-trigger.js";
import { McpClientNodeHandler } from "../src/services/nodes/mcp-client.js";
import { TeamsNodeHandler } from "../src/services/nodes/teams.js";
import { WhatsAppNodeHandler } from "../src/services/nodes/whatsapp.js";
import { GoogleCalendarNodeHandler } from "../src/services/nodes/google-calendar.js";
import { GoogleDocsNodeHandler } from "../src/services/nodes/google-docs.js";
import { ErrorTriggerNodeHandler } from "../src/services/nodes/error-trigger.js";
import { WaitNodeHandler } from "../src/services/nodes/wait.js";
import { refreshOAuth2Credential, scanAndRefreshExpiringCredentials } from "../src/services/vault/oauth-refresh.js";

test("TASK-01: SwitchNodeHandler routes items based on rules and fallback", async () => {
  const handler = new SwitchNodeHandler();
  const result = await handler.execute({
    executionId: "exec-1",
    nodeId: "node-switch",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      rules: [
        { field: "score", operator: "greaterthan", value: 80, outputIndex: 1 },
        { field: "score", operator: "lessthan", value: 50, outputIndex: 2 },
      ],
      fallbackOutput: 0,
    },
    input: [
      { score: 95, name: "Alice" },
      { score: 40, name: "Bob" },
      { score: 70, name: "Charlie" },
    ],
  });

  assert.equal(result.items.length, 3);
  assert.equal((result.items[0].json as any)._matchedOutput, 1);
  assert.equal((result.items[0].json as any)._matched, true);
  assert.equal((result.items[1].json as any)._matchedOutput, 2);
  assert.equal((result.items[1].json as any)._matched, true);
  assert.equal((result.items[2].json as any)._matchedOutput, 0);
  assert.equal((result.items[2].json as any)._matched, false);
});

test("TASK-01: SplitInBatchesNodeHandler splits arrays and provides batch metadata", async () => {
  const handler = new SplitInBatchesNodeHandler();
  const inputList = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, data: `item-${i + 1}` }));

  // First batch of 10
  const result1 = await handler.execute({
    executionId: "exec-1",
    nodeId: "node-split",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 10, batchIndex: 0 },
    input: inputList,
  });

  assert.equal(result1.items.length, 10);
  const meta1 = (result1.items[0].json as any)._batchContext;
  assert.equal(meta1.batchIndex, 0);
  assert.equal(meta1.totalBatches, 3);
  assert.equal(meta1.isLastBatch, false);

  // Last batch
  const result3 = await handler.execute({
    executionId: "exec-1",
    nodeId: "node-split",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { batchSize: 10, batchIndex: 2 },
    input: inputList,
  });

  assert.equal(result3.items.length, 5);
  const meta3 = (result3.items[4].json as any)._batchContext;
  assert.equal(meta3.batchIndex, 2);
  assert.equal(meta3.isLastBatch, true);
});

test("TASK-02: ChatTriggerNodeHandler handles message and SSE metadata", async () => {
  const handler = new ChatTriggerNodeHandler();
  const result = await handler.execute({
    executionId: "exec-chat",
    nodeId: "node-chat",
    workflowId: "wf-chat",
    orgId: "org-1",
    nodeConfig: {},
    input: { message: "Hello AI", sessionId: "sess-123", history: [{ role: "user", content: "Hi" }] },
  });

  assert.equal(result.items.length, 1);
  const item = result.items[0].json;
  assert.equal(item.message, "Hello AI");
  assert.equal(item.sessionId, "sess-123");
  assert.equal(item.streaming, true);
  assert.equal(item.protocol, "sse");
});

test("TASK-02: WaitNodeHandler handles delay completion", async () => {
  const handler = new WaitNodeHandler();
  const result = await handler.execute({
    executionId: "exec-wait",
    nodeId: "node-wait",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { duration: 10, unit: "milliseconds" },
    input: { test: "data" },
  });

  assert.equal(result.items.length, 1);
  assert.equal((result.items[0].json as any).test, "data");
  assert.ok((result.items[0].json as any)._resumedAt);
});

test("TASK-03: ErrorTriggerNodeHandler creates standardized error payload", async () => {
  const handler = new ErrorTriggerNodeHandler();
  const result = await handler.execute({
    executionId: "exec-err",
    nodeId: "node-err",
    workflowId: "wf-err",
    orgId: "org-1",
    nodeConfig: {},
    input: {
      errorMessage: "Connection timeout to Stripe API",
      errorCode: "ETIMEDOUT",
      failedNodeId: "stripe-node-1",
      failedNodeType: "http",
    },
  });

  assert.equal(result.items.length, 1);
  const item = result.items[0].json;
  assert.equal(item.errorMessage, "Connection timeout to Stripe API");
  assert.equal(item.errorCode, "ETIMEDOUT");
  assert.equal(item.failedNodeId, "stripe-node-1");
  assert.equal(item.executionId, "exec-err");
});

test("TASK-08: McpClientNodeHandler executes tool invocation and wraps result", async () => {
  const handler = new McpClientNodeHandler();
  const result = await handler.execute({
    executionId: "exec-mcp",
    nodeId: "node-mcp",
    workflowId: "wf-mcp",
    orgId: "org-1",
    nodeConfig: { toolName: "searchWorkflows", endpoint: "http://localhost:3000/api/mcp" },
    input: { query: "finance" },
  });

  assert.equal(result.items.length, 1);
  const item = result.items[0].json;
  assert.equal(item._tool, "searchWorkflows");
  assert.equal(item._status, "SUCCESS");
});

test("TASK-16: Teams and WhatsApp Node Handlers format enterprise messages", async () => {
  const teamsHandler = new TeamsNodeHandler();
  const teamsRes = await teamsHandler.execute({
    executionId: "exec-teams",
    nodeId: "node-teams",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "sendAdaptiveCard", adaptiveCard: { type: "AdaptiveCard", version: "1.5" } },
    input: { message: "Critical deployment completed" },
  });
  assert.equal((teamsRes.items[0].json as any).delivered, true);
  assert.equal((teamsRes.items[0].json as any).operation, "sendAdaptiveCard");

  const waHandler = new WhatsAppNodeHandler();
  const waRes = await waHandler.execute({
    executionId: "exec-wa",
    nodeId: "node-wa",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "sendTemplate", template: { name: "order_update" }, to: "+5511999999999" },
    input: {},
  });
  assert.equal((waRes.items[0].json as any).delivered, true);
  assert.equal((waRes.items[0].json as any).to, "+5511999999999");
});

test("TASK-17: Google Calendar & Google Docs Node Handlers execute operations", async () => {
  const calHandler = new GoogleCalendarNodeHandler();
  const calRes = await calHandler.execute({
    executionId: "exec-cal",
    nodeId: "node-cal",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "createEvent", title: "Quarterly Review" },
    input: {},
  });
  assert.equal((calRes.items[0].json as any).summary, "Quarterly Review");
  assert.equal((calRes.items[0].json as any).status, "confirmed");

  const docsHandler = new GoogleDocsNodeHandler();
  const docsRes = await docsHandler.execute({
    executionId: "exec-docs",
    nodeId: "node-docs",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "createDocument", title: "Architecture RFC" },
    input: {},
  });
  assert.equal((docsRes.items[0].json as any).title, "Architecture RFC");
  assert.ok((docsRes.items[0].json as any).documentId);
});

test("TASK-05: scanAndRefreshExpiringCredentials runs without uncaught error", async () => {
  const scanResult = await scanAndRefreshExpiringCredentials();
  assert.ok(typeof scanResult.scanned === "number");
  assert.ok(typeof scanResult.refreshed === "number");
  assert.ok(typeof scanResult.failed === "number");
});
