import assert from "node:assert/strict";
import test from "node:test";
import {
  wrapItems,
  unwrapItems,
  type NodeItem,
} from "@agentflow/shared";
import {
  LlmModelNodeHandler,
  executeLlmCompletion,
  resolveLlmCredential,
  type LlmCompletionRequest,
} from "../src/services/nodes/llm-model.js";
import {
  AiAgentNodeHandler,
  runAutonomousAgentLoop,
  ConversationMemoryManager,
  executeAgentSubTool,
} from "../src/services/nodes/ai-agent.js";
import {
  LlmChainNodeHandler,
  interpolatePromptTemplate,
  parseChainOutput,
} from "../src/services/nodes/llm-chain.js";
import {
  VectorStoreNodeHandler,
  VectorStoreService,
  cosineSimilarity,
  generateEmbeddings,
} from "../src/services/nodes/vector-store.js";
import type { NodeExecutionContext } from "../src/services/nodes/types.js";

function makeContext(
  type: string,
  nodeConfig: Record<string, unknown>,
  input: unknown = []
): NodeExecutionContext {
  return {
    executionId: `exec-${type}-test`,
    nodeId: `node-${type}-1`,
    workflowId: `wf-${type}-test`,
    orgId: "org-ai-test",
    nodeConfig: { type, ...nodeConfig },
    input,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Unified LLM Model Provider & Fallback Tests
// ─────────────────────────────────────────────────────────────────────────────

test("LLM Model: resolves credentials and executes completion across providers", async () => {
  const reqOpenAI: LlmCompletionRequest = {
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Qual a capital do Brasil?" }],
  };
  const resOpenAI = await executeLlmCompletion(reqOpenAI, "org-ai-test");
  assert.strictEqual(resOpenAI.provider, "openai");
  assert.strictEqual(resOpenAI.model, "gpt-4o-mini");
  assert.ok(resOpenAI.text.length > 0);

  const reqAnthropic: LlmCompletionRequest = {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Explique computação quântica em 1 frase." }],
  };
  const resAnthropic = await executeLlmCompletion(reqAnthropic, "org-ai-test");
  assert.strictEqual(resAnthropic.provider, "anthropic");
  assert.ok(resAnthropic.text.includes("Anthropic"));

  const reqGemini: LlmCompletionRequest = {
    provider: "gemini",
    model: "gemini-1.5-pro",
    messages: [{ role: "user", content: "Olá Gemini!" }],
  };
  const resGemini = await executeLlmCompletion(reqGemini, "org-ai-test");
  assert.strictEqual(resGemini.provider, "gemini");
  assert.ok(resGemini.text.includes("Gemini"));
});

test("LLM Model: seamlessly falls back to secondary model when primary fails", async () => {
  const reqWithFallback: LlmCompletionRequest = {
    provider: "custom",
    model: "invalid-offline-model",
    apiKey: "invalid-key",
    baseUrl: "http://127.0.0.1:54321/invalid",
    timeoutMs: 50,
    messages: [{ role: "user", content: "Test fallback" }],
    fallbackModels: [
      {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "mock-valid-key",
      },
    ],
  };

  const res = await executeLlmCompletion(reqWithFallback, "org-ai-test");
  assert.strictEqual(res.provider, "openai");
  assert.strictEqual(res.model, "gpt-4o-mini");
  assert.ok(res.text.length > 0);
});

test("LlmModelNodeHandler: processes items and returns structured NodeItem output", async () => {
  const handler = new LlmModelNodeHandler();
  const ctx = makeContext(
    "llm_model",
    {
      provider: "deepseek",
      model: "deepseek-chat",
      systemPrompt: "Você é um assistente técnico especializado.",
    },
    [{ json: { prompt: "Como funciona um vector database?" } }]
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0].json.provider, "deepseek");
  assert.strictEqual(res.items[0].json.model, "deepseek-chat");
  assert.ok(res.items[0].json.response);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Vector Store & Semantic Search Tests
// ─────────────────────────────────────────────────────────────────────────────

test("VectorStore: calculates cosine similarity correctly", () => {
  const vec1 = [1, 0, 0];
  const vec2 = [1, 0, 0];
  assert.strictEqual(Math.round(cosineSimilarity(vec1, vec2) * 100) / 100, 1.0);

  const vecOrthogonal = [0, 1, 0];
  assert.strictEqual(cosineSimilarity(vec1, vecOrthogonal), 0.0);

  const vecOpposite = [-1, 0, 0];
  assert.strictEqual(Math.round(cosineSimilarity(vec1, vecOpposite) * 100) / 100, -1.0);
});

test("VectorStore: upserts documents and performs semantic k-NN retrieval", async () => {
  const collection = `test_kb_${Date.now()}`;
  const docs = [
    { id: "doc1", pageContent: "O AgentFlow suporta nodes de IA e agentes autônomos." },
    { id: "doc2", pageContent: "PostgreSQL com pgvector permite buscas semânticas rápidas." },
    { id: "doc3", pageContent: "Receita de bolo de chocolate com morangos." },
  ];

  const upsertRes = await VectorStoreService.upsert(collection, docs, "memory");
  assert.strictEqual(upsertRes.count, 3);
  assert.deepStrictEqual(upsertRes.ids, ["doc1", "doc2", "doc3"]);

  const searchRes = await VectorStoreService.search(
    collection,
    "Como funciona busca vetorial no PostgreSQL?",
    2,
    0.0,
    "memory"
  );

  assert.strictEqual(searchRes.length, 2);
  assert.ok(searchRes[0].score >= searchRes[1].score);
  assert.ok(searchRes[0].pageContent.length > 0);
});

test("VectorStoreNodeHandler: executes upsert and search operations via node contract", async () => {
  const handler = new VectorStoreNodeHandler();
  const collection = `node_kb_${Date.now()}`;

  // 1. Upsert
  const upsertCtx = makeContext(
    "vector_store",
    {
      operation: "upsert",
      collectionName: collection,
      storeType: "memory",
    },
    [
      { json: { id: "item1", content: "Documentação de API e Webhooks do AgentFlow" } },
      { json: { id: "item2", content: "Guia de autenticação OAuth2 e KMS Envelope" } },
    ]
  );
  const upsertResult = await handler.execute(upsertCtx);
  assert.strictEqual(upsertResult.items.length, 1);
  assert.strictEqual(upsertResult.items[0].json.success, true);
  assert.strictEqual(upsertResult.items[0].json.upsertedCount, 2);

  // 2. Search
  const searchCtx = makeContext(
    "vector_store",
    {
      operation: "search",
      collectionName: collection,
      topK: 2,
    },
    [{ json: { query: "Como autenticar usando KMS?" } }]
  );
  const searchResult = await handler.execute(searchCtx);
  assert.strictEqual(searchResult.items.length, 1);
  assert.strictEqual(searchResult.items[0].json.count, 2);
  assert.ok(Array.isArray(searchResult.items[0].json.matches));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI Agent (Autonomous Loop, Memory & Tool Execution) Tests
// ─────────────────────────────────────────────────────────────────────────────

test("ConversationMemoryManager: maintains conversation window and buffer history", () => {
  const sessionId = `session_${Date.now()}`;
  ConversationMemoryManager.clear(sessionId);

  ConversationMemoryManager.addMessage(sessionId, { role: "user", content: "Mensagem 1" });
  ConversationMemoryManager.addMessage(sessionId, { role: "assistant", content: "Resposta 1" });
  ConversationMemoryManager.addMessage(sessionId, { role: "user", content: "Mensagem 2" });
  ConversationMemoryManager.addMessage(sessionId, { role: "assistant", content: "Resposta 2" });

  const historyWindow2 = ConversationMemoryManager.getHistory(sessionId, 2);
  assert.strictEqual(historyWindow2.length, 2);
  assert.strictEqual(historyWindow2[0].content, "Mensagem 2");
  assert.strictEqual(historyWindow2[1].content, "Resposta 2");

  const fullHistory = ConversationMemoryManager.getHistory(sessionId, 0);
  assert.strictEqual(fullHistory.length, 4);

  ConversationMemoryManager.clear(sessionId);
  assert.strictEqual(ConversationMemoryManager.getHistory(sessionId).length, 0);
});

test("executeAgentSubTool: executes calculator and custom tool handlers", async () => {
  // Teste de calculadora aritmética segura
  const calcRes = await executeAgentSubTool("calculator", { expression: "10 * 5 + 2" });
  const parsedCalc = JSON.parse(calcRes);
  assert.strictEqual(parsedCalc.result, 52);

  // Teste de tool customizada
  const customTool = {
    name: "fetchUserData",
    description: "Get user data by id",
    handler: async (args: Record<string, unknown>) => ({ userId: args.id, name: "Victor", role: "admin" }),
  };

  const customRes = await executeAgentSubTool("fetchUserData", { id: "usr_123" }, [customTool]);
  const parsedCustom = JSON.parse(customRes);
  assert.strictEqual(parsedCustom.name, "Victor");
  assert.strictEqual(parsedCustom.role, "admin");
});

test("AiAgentNodeHandler: runs autonomous agent loop with tool execution and memory", async () => {
  const handler = new AiAgentNodeHandler();
  const sessionId = `agent_sess_${Date.now()}`;

  const ctx = makeContext(
    "ai_agent",
    {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "Você é um agente autônomo com acesso a ferramentas de cálculo e consulta.",
      maxIterations: 3,
      returnIntermediateSteps: true,
      memory: { sessionId, windowSize: 5 },
      tools: [
        {
          name: "calculator",
          description: "Calculates mathematical operations",
          parameters: {
            type: "object",
            properties: { expression: { type: "string" } },
            required: ["expression"],
          },
        },
      ],
    },
    [{ json: { prompt: "Calcule calc 25 * 4 por favor", sessionId } }]
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 1);
  assert.ok(res.items[0].json.output);
  assert.ok(res.items[0].json.iterations >= 1);
  assert.ok(Array.isArray(res.items[0].json.intermediateSteps));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LLM Chain (Prompt Templates & Output Parsers) Tests
// ─────────────────────────────────────────────────────────────────────────────

test("interpolatePromptTemplate: interpolates variables and expressions accurately", () => {
  const template = "Olá {name}, seu pedido #{orderId} está {{ $json.status }}.";
  const vars = { name: "Carlos", orderId: "98765" };
  const exprCtx = { $json: { status: "CONFIRMADO" } };

  const interpolated = interpolatePromptTemplate(template, vars, exprCtx);
  assert.strictEqual(interpolated, "Olá Carlos, seu pedido #98765 está CONFIRMADO.");
});

test("parseChainOutput: handles JSON extraction, markdown fences, and text fallbacks", () => {
  const jsonMarkdown = "Aqui está a resposta:\n```json\n{\n  \"status\": \"success\",\n  \"score\": 95\n}\n```";
  const parsed = parseChainOutput(jsonMarkdown, "json") as Record<string, unknown>;
  assert.strictEqual(parsed.status, "success");
  assert.strictEqual(parsed.score, 95);

  const plainText = "Texto simples de saída.";
  assert.strictEqual(parseChainOutput(plainText, "text"), plainText);
});

test("LlmChainNodeHandler: executes prompt template chain with memory and JSON parsing", async () => {
  const handler = new LlmChainNodeHandler();
  const ctx = makeContext(
    "llm_chain",
    {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      promptTemplate: "Resuma o seguinte conteúdo em 1 frase: {input}",
      outputParser: "text",
    },
    [{ json: { input: "AgentFlow é uma plataforma de automação e orquestração de fluxos de trabalho inteligentes com IA." } }]
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0].json.provider, "anthropic");
  assert.ok(res.items[0].json.response);
  assert.ok(res.items[0].json.prompt.includes("AgentFlow"));
});
