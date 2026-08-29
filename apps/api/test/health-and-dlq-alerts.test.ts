import assert from "node:assert/strict";
import test from "node:test";

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

const [
  { buildApp },
  { resetStore },
  { sendToDLQ, getDLQIncidents },
  { deadMansSwitch, DeadMansSwitchService },
  { checkDeadlockStatus, checkConnectionSaturation },
  { buildApiDatasourceUrl, createApiPrismaClient },
] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/services/queue.js"),
  import("../src/services/dead-mans-switch.js"),
  import("../src/routes/health.js"),
  import("../src/lib/prisma.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
  deadMansSwitch.reset();
});

test("Healthcheck: /health returns advanced status, latency metrics, memory and worker checks", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);

  // Status and timestamp
  assert.ok(["ok", "degraded"].includes(body.status));
  assert.ok(typeof body.timestamp === "string");

  // Dependency checks
  assert.ok(body.checks);
  assert.ok(body.checks.postgres);
  assert.ok(body.checks.redis);
  assert.ok(body.checks.workflowQueue);
  assert.ok(body.checks.dlqQueue);
  assert.ok(body.checks.memory);
  assert.ok(body.checks.deadlock);
  assert.ok(body.checks.connectionSaturation);

  // Latency metrics
  assert.ok(body.latencyMs);
  assert.ok(typeof body.latencyMs.postgres === "number");

  // Memory metrics
  assert.ok(body.metrics);
  assert.ok(body.metrics.memory);
  assert.ok(typeof body.metrics.memory.rssMb === "number");
  assert.ok(typeof body.metrics.memory.heapUsedMb === "number");
  assert.ok(typeof body.metrics.memory.heapTotalMb === "number");
  assert.ok(typeof body.metrics.memory.systemFreeMb === "number");
  assert.ok(typeof body.metrics.memory.systemTotalMb === "number");

  // Worker metrics
  assert.ok(body.metrics.workers);
  assert.ok(body.metrics.workers.workflowQueue);
  assert.ok(body.metrics.workers.dlqQueue);

  // Deadlock check
  assert.ok(body.metrics.deadlockCheck);
  assert.ok(["ok", "unsupported", "deadlock_detected"].includes(body.metrics.deadlockCheck.status));

  // Connection saturation metrics
  assert.ok(body.metrics.connectionSaturation);
  assert.ok(["ok", "warning", "saturated", "unsupported"].includes(body.metrics.connectionSaturation.status));
});

test("Healthcheck: checkDeadlockStatus and checkConnectionSaturation utility return structured state", async () => {
  const status = await checkDeadlockStatus();
  assert.ok(["ok", "unsupported", "deadlock_detected"].includes(status.status));
  assert.ok(typeof status.checkedAt === "string");

  const saturation = await checkConnectionSaturation();
  assert.ok(["ok", "warning", "saturated", "unsupported"].includes(saturation.status));
  assert.ok(typeof saturation.checkedAt === "string");
});

test("Prisma Pool Policy: buildApiDatasourceUrl sets connection budget parameters properly", () => {
  const url = "postgresql://postgres:postgres@localhost:5432/agentflow?schema=public";
  const configured = buildApiDatasourceUrl(url, {
    connectionLimit: 15,
    poolTimeoutSeconds: 5,
    connectTimeoutSeconds: 8,
    applicationName: "agentflow-api-test",
  });

  assert.ok(configured);
  assert.ok(configured.includes("connection_limit=15"));
  assert.ok(configured.includes("pool_timeout=5"));
  assert.ok(configured.includes("connect_timeout=8"));
  assert.ok(configured.includes("application_name=agentflow-api-test"));

  // Default parameters
  const defaultUrl = buildApiDatasourceUrl(url);
  assert.ok(defaultUrl?.includes("connection_limit=10"));
  assert.ok(defaultUrl?.includes("pool_timeout=10"));
  assert.ok(defaultUrl?.includes("connect_timeout=10"));
  assert.ok(defaultUrl?.includes("application_name=agentflow-api"));
});

test("DeadMansSwitch: formats structured Discord embed and Slack blocks correctly", () => {
  const service = new DeadMansSwitchService();

  const incident = {
    id: "inc-test-1",
    jobId: "job-test-1",
    executionId: "exec-test-100",
    workflowId: "wf-test-200",
    orgId: "org-test-300",
    error: "Connection timeout to external CRM endpoint",
    timestamp: new Date().toISOString(),
    severity: "HIGH" as const,
    status: "OPEN" as const,
  };

  // 1. Discord Embed
  const discord = service.formatDiscordAlert(incident, 3);
  assert.ok(typeof discord.content === "string");
  assert.ok((discord.content as string).includes("DEAD MAN'S SWITCH"));
  assert.ok(Array.isArray(discord.embeds));
  const embed = (discord.embeds as Array<any>)[0];
  assert.ok(embed.title.includes("DLQ Alert"));
  assert.equal(embed.color, 0xf59e0b); // Orange for high
  assert.ok(embed.fields.some((f: any) => f.name === "Execution ID" && f.value.includes("exec-test-100")));
  assert.ok(embed.fields.some((f: any) => f.name === "Error Message" && f.value.includes("Connection timeout")));

  // 2. Critical Discord Embed
  const criticalIncident = { ...incident, severity: "CRITICAL" as const };
  const discordCrit = service.formatDiscordAlert(criticalIncident, 5);
  assert.equal(((discordCrit.embeds as Array<any>)[0]).color, 0xef4444); // Red for critical

  // 3. Slack Blocks
  const slack = service.formatSlackAlert(incident, 3);
  assert.ok(typeof slack.text === "string");
  assert.ok(Array.isArray(slack.blocks));
  assert.ok((slack.blocks as Array<any>).some((b: any) => b.type === "header"));
  assert.ok((slack.blocks as Array<any>).some((b: any) => b.text?.text?.includes("DEAD MAN'S SWITCH")));
});

test("DeadMansSwitch: triggers alert automatically when failure threshold is reached in window", async () => {
  const service = new DeadMansSwitchService({
    thresholdCount: 3,
    windowMs: 60000,
    cooldownMs: 5000,
    discordWebhookUrl: "https://discord.com/api/webhooks/mock/123",
    slackWebhookUrl: "https://hooks.slack.com/services/mock/123",
  });

  const baseIncident = {
    jobId: "job-alert-1",
    executionId: "exec-alert-1",
    error: "Fatal database connection drop",
    timestamp: new Date().toISOString(),
    severity: "HIGH" as const,
    status: "OPEN" as const,
  };

  // Failure 1 (below threshold)
  const r1 = await service.recordFailureAndCheckAlert({ id: "inc-1", ...baseIncident });
  assert.equal(r1.triggered, false);
  assert.equal(r1.reason, "BELOW_THRESHOLD");
  assert.equal(r1.errorCount, 1);

  // Failure 2 (below threshold)
  const r2 = await service.recordFailureAndCheckAlert({ id: "inc-2", ...baseIncident });
  assert.equal(r2.triggered, false);
  assert.equal(r2.reason, "BELOW_THRESHOLD");
  assert.equal(r2.errorCount, 2);

  // Failure 3 (reaches threshold of 3 -> triggers alert)
  const r3 = await service.recordFailureAndCheckAlert({ id: "inc-3", ...baseIncident });
  assert.equal(r3.triggered, true);
  assert.equal(r3.reason, "THRESHOLD_BREACHED");
  assert.equal(r3.errorCount, 3);
  assert.equal(r3.discordDelivered, true);
  assert.equal(r3.slackDelivered, true);
  assert.ok(r3.alertPayloads?.discord);
  assert.ok(r3.alertPayloads?.slack);

  // Failure 4 immediately after (cooldown active -> suppressed)
  const r4 = await service.recordFailureAndCheckAlert({ id: "inc-4", ...baseIncident });
  assert.equal(r4.triggered, false);
  assert.equal(r4.reason, "COOLDOWN_ACTIVE");
});

test("DLQ API & DeadMansSwitch integration: sendToDLQ automatically feeds incidents and triggers alerts", async () => {
  deadMansSwitch.updateConfig({
    thresholdCount: 2,
    windowMs: 60000,
    cooldownMs: 1000,
    discordWebhookUrl: "https://discord.com/api/webhooks/mock/test",
    slackWebhookUrl: "https://hooks.slack.com/services/mock/test",
  });

  // Sending 2 failures to DLQ
  await sendToDLQ("exec-dlq-auto-1", "Timeout node 1", { workflowId: "wf-1", attemptsMade: 3 });
  await sendToDLQ("exec-dlq-auto-2", "Timeout node 2", { workflowId: "wf-1", attemptsMade: 3 });

  const incidents = await getDLQIncidents();
  assert.ok(incidents.total >= 2);

  // Test DLQ alerts API endpoints
  const configRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/alerts/config",
  });
  assert.equal(configRes.statusCode, 200);
  const configBody = JSON.parse(configRes.body);
  assert.equal(configBody.config.thresholdCount, 2);

  // Test updating config via API
  const updateRes = await app.inject({
    method: "POST",
    url: "/api/admin/dlq/alerts/config",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ thresholdCount: 4 }),
  });
  assert.equal(updateRes.statusCode, 200);
  const updatedBody = JSON.parse(updateRes.body);
  assert.equal(updatedBody.config.thresholdCount, 4);

  // Test manual test alert API
  const testAlertRes = await app.inject({
    method: "POST",
    url: "/api/admin/dlq/alerts/test",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ executionId: "exec-manual-test", error: "Simulated worker deadlock" }),
  });
  assert.equal(testAlertRes.statusCode, 200);
  const testAlertBody = JSON.parse(testAlertRes.body);
  assert.equal(testAlertBody.ok, true);
  assert.ok(testAlertBody.formattedAlerts.discord);
  assert.ok(testAlertBody.formattedAlerts.slack);
});
