import assert from "node:assert/strict";
import test from "node:test";

// Configurações de ambiente para testes determinísticos
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

const [{ buildApp }, { resetStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
]);

const {
  TwelveLabsClient,
  TwelveLabsIndexManager,
  TwelveLabsVideoIngest,
  TwelveLabsVideoAnalyzer,
  TwelveLabsKnowledgeExporter,
} = await import("../src/services/twelvelabs/index.js");

const {
  executeTwelveLabsNode,
  TwelveLabsNodeHandler,
} = await import("../src/services/nodes/twelvelabs.js");

const app = await buildApp({ logger: false });

test.beforeEach(() => resetStore());

test("TwelveLabsClient initializes in mock mode and provides endpoints & Jockey MCP URL", () => {
  const client = new TwelveLabsClient({ mock: true });
  assert.equal(client.isMockMode(), true);
  assert.ok(client.getBaseUrl());
  assert.ok(client.getJockeyUrl().includes("mcp.twelvelabs.io"));
});

test("TwelveLabsIndexManager creates modal index (Marengo + Pegasus) and lists indexes", async () => {
  const client = new TwelveLabsClient({ mock: true });
  const indexManager = new TwelveLabsIndexManager(client);

  const created = await indexManager.createModalIndex({
    indexName: "overclock-bot-day69-live",
    includeMarengo: true,
    includePegasus: true,
  });

  assert.ok(created.id);
  assert.equal(created.indexName, "overclock-bot-day69-live");
  assert.ok(created.models.length >= 2);

  const list = await indexManager.listIndexes();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
});

test("TwelveLabsVideoIngest submits video ingest task and polls completion", async () => {
  const client = new TwelveLabsClient({ mock: true });
  const ingest = new TwelveLabsVideoIngest(client);

  const task = await ingest.createIngestTask({
    indexId: "idx_mock_day69_genesis",
    videoUrl: "https://youtube.com/watch?v=live-dia69-overclock-bot",
    videoTitle: "Overclock Bot Live Dia 69",
  });

  assert.ok(task.taskId);
  assert.equal(task.indexId, "idx_mock_day69_genesis");

  const completed = await ingest.waitForTaskCompletion(task.taskId, { maxTimeoutMs: 5000 });
  assert.equal(completed.status, "ready");
  assert.equal(completed.progress, 100);
  assert.ok(completed.videoId);
});

test("TwelveLabsVideoAnalyzer executes Marengo semantic search and Pegasus video generation", async () => {
  const client = new TwelveLabsClient({ mock: true });
  const analyzer = new TwelveLabsVideoAnalyzer(client);

  const searchRes = await analyzer.semanticSearch({
    indexId: "idx_mock_day69_genesis",
    query: "Playwright setup, noVNC e MCP tools",
  });

  assert.equal(searchRes.query, "Playwright setup, noVNC e MCP tools");
  assert.ok(searchRes.matches.length > 0);
  assert.ok(searchRes.matches[0].videoId);
  assert.ok(searchRes.matches[0].confidence);

  const generatedText = await analyzer.generateVideoText({
    videoId: "vid_mock_day69_bot_genesis",
    prompt: "Qual a arquitetura do Overclock Bot?",
  });

  assert.ok(generatedText.length > 0);
});

test("TwelveLabsVideoAnalyzer extracts Day 69 Genesis architecture, timeline, logs and pitfalls", async () => {
  const client = new TwelveLabsClient({ mock: true });
  const analyzer = new TwelveLabsVideoAnalyzer(client);

  const genesis = await analyzer.analyzeDay69Genesis("vid_day69_genesis_live");

  assert.equal(genesis.videoId, "vid_day69_genesis_live");
  assert.ok(genesis.title.includes("Overclock Bot"));
  assert.ok(genesis.architecture.runtime.includes("Node.js"));
  assert.ok(genesis.architecture.browserEngine.includes("Playwright"));
  assert.ok(genesis.architecture.displayProtocol.includes("Xvfb"));
  assert.ok(genesis.stepByStepDecisions.length >= 5);
  assert.ok(genesis.executionLogsAndCommands.length >= 3);
  assert.ok(genesis.pitfallsAndTroubleshooting.length >= 3);

  // Testa o Knowledge Exporter
  const md = TwelveLabsKnowledgeExporter.formatToMarkdown(genesis);
  assert.ok(md.includes("# 🚀 Live Dia 69"));
  assert.ok(md.includes("```mermaid"));
  assert.ok(md.includes("Playwright"));
  assert.ok(md.includes("websockify"));
});

test("TwelveLabs Jockey MCP tool execution handles tools smoothly", async () => {
  const client = new TwelveLabsClient({ mock: true });
  const res = await client.executeJockeyTool("search_video", {
    index_id: "idx_test",
    query: "Laschuk coding session",
  });

  assert.equal(res.isMock, true);
  assert.ok(res.result);
});

test("Workflow Node: executeTwelveLabsNode executes all operations", async () => {
  // Teste de createIndex
  const resIndex = await executeTwelveLabsNode({
    operation: "createIndex",
    indexName: "test-genesis-index",
    mock: true,
  });
  assert.equal(resIndex.operation, "createIndex");
  assert.equal(resIndex.success, true);

  // Teste de semanticSearch
  const resSearch = await executeTwelveLabsNode({
    operation: "semanticSearch",
    query: "Playwright VNC bridge",
    mock: true,
  });
  assert.equal(resSearch.operation, "semanticSearch");
  assert.ok((resSearch as any).matches);

  // Teste de analyzeGenesisDay69
  const resGenesis = await executeTwelveLabsNode({
    operation: "analyzeGenesisDay69",
    mock: true,
  });
  assert.equal(resGenesis.operation, "analyzeGenesisDay69");
  assert.ok((resGenesis as any).architecture);
  assert.ok((resGenesis as any).markdownDocument);

  // Teste de TwelveLabsNodeHandler
  const handler = new TwelveLabsNodeHandler();
  assert.equal(handler.type, "twelveLabs");
  assert.equal(handler.category, "ai");

  const executionResult = await handler.execute({
    executionId: "exec-123",
    nodeId: "node-twelvelabs-1",
    workflowId: "wf-123",
    orgId: "org-123",
    nodeConfig: { operation: "analyzeGenesisDay69", mock: true },
    input: {},
  });

  assert.equal(executionResult.items.length, 1);
  assert.equal(executionResult.items[0].json.success, true);
});

test("Fastify Routes: /api/twelvelabs endpoints are wired and respond correctly", async () => {
  // Teste de autorização sem token
  const noAuth = await app.inject({
    method: "GET",
    url: "/api/twelvelabs/indexes",
  });
  assert.equal(noAuth.statusCode, 401);

  // Registro de usuário e login para obter token válido
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      email: "twelvelabs.tester@example.com",
      password: "StrongPass123!",
      name: "TwelveLabs Tester",
    }),
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      email: "twelvelabs.tester@example.com",
      password: "StrongPass123!",
    }),
  });

  assert.equal(loginRes.statusCode, 200);
  const token = JSON.parse(loginRes.body).token;
  assert.ok(token, "Token JWT gerado com sucesso");

  // GET /api/twelvelabs/indexes
  const indexesRes = await app.inject({
    method: "GET",
    url: "/api/twelvelabs/indexes",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(indexesRes.statusCode, 200);
  assert.ok(JSON.parse(indexesRes.body).indexes);

  // POST /api/twelvelabs/search
  const searchRes = await app.inject({
    method: "POST",
    url: "/api/twelvelabs/search",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({
      indexId: "idx_mock_day69_genesis",
      query: "Playwright display stream",
    }),
  });
  assert.equal(searchRes.statusCode, 200);
  assert.ok(JSON.parse(searchRes.body).matches);

  // POST /api/twelvelabs/analyze-day69
  const analyzeRes = await app.inject({
    method: "POST",
    url: "/api/twelvelabs/analyze-day69",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({
      videoId: "vid_day69_genesis_live",
    }),
  });
  assert.equal(analyzeRes.statusCode, 200);
  const analyzeBody = JSON.parse(analyzeRes.body);
  assert.equal(analyzeBody.success, true);
  assert.ok(analyzeBody.data.architecture);
  assert.ok(analyzeBody.exportedFile);

  // GET /api/twelvelabs/knowledge-doc
  const docRes = await app.inject({
    method: "GET",
    url: "/api/twelvelabs/knowledge-doc",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(docRes.statusCode, 200);
  assert.ok(docRes.body.includes("Live Dia 69"));

  // POST /api/twelvelabs/jockey
  const jockeyRes = await app.inject({
    method: "POST",
    url: "/api/twelvelabs/jockey",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({
      toolName: "search_video",
      arguments: { query: "Overclock bot genesis" },
    }),
  });
  assert.equal(jockeyRes.statusCode, 200);
  assert.equal(JSON.parse(jockeyRes.body).success, true);
});
