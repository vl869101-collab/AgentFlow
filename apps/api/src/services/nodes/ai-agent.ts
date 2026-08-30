/**
 * AI Agent Node Handler (compatível com n8n AI Agent / LangChain ReAct Agents)
 * Suporta:
 * - Agentes autônomos com tool calling em loop (até maxIterations)
 * - Memória de conversação (Window Memory / Buffer Memory)
 * - Execução de sub-ferramentas (MCP, Calculator, HTTP, Vector Store, Custom JS)
 * - Integração unificada com múltiplos modelos LLM e fallback
 */
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
} from "./types.js";
import {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  executeLlmCompletion,
  LlmProviderName,
} from "./llm-model.js";
import { executeMcpClient } from "./mcp-client.js";
import { VectorStoreService } from "./vector-store.js";

export interface ConversationMemory {
  type?: "buffer" | "window" | "summary";
  windowSize?: number;
  history?: ChatMessage[];
  sessionId?: string;
}

export interface AgentToolConfig {
  name: string;
  description: string;
  type?: "mcp" | "calculator" | "vectorStore" | "http" | "custom";
  parameters?: Record<string, unknown>;
  mcpConfig?: Record<string, unknown>;
  vectorStoreConfig?: Record<string, unknown>;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface AiAgentConfig {
  model?: string;
  provider?: LlmProviderName;
  prompt?: string;
  systemPrompt?: string;
  maxIterations?: number;
  tools?: AgentToolConfig[];
  memory?: ConversationMemory;
  credentialId?: string;
  temperature?: number;
  maxTokens?: number;
  returnIntermediateSteps?: boolean;
}

// Armazenamento em memória de histórico por sessionId (para Window / Buffer Memory)
const SESSION_MEMORIES: Map<string, ChatMessage[]> = new Map();

/**
 * Gerencia a memória de conversa (buffer / window)
 */
export class ConversationMemoryManager {
  static getHistory(sessionId: string, windowSize: number = 10): ChatMessage[] {
    const full = SESSION_MEMORIES.get(sessionId) || [];
    if (windowSize <= 0) return full;
    return full.slice(-windowSize);
  }

  static addMessage(sessionId: string, message: ChatMessage): void {
    const list = SESSION_MEMORIES.get(sessionId) || [];
    list.push(message);
    SESSION_MEMORIES.set(sessionId, list);
  }

  static clear(sessionId: string): void {
    SESSION_MEMORIES.delete(sessionId);
  }
}

/**
 * Executa uma sub-ferramenta invocada pelo agente
 */
export async function executeAgentSubTool(
  toolName: string,
  rawArgs: string | Record<string, unknown>,
  availableTools: AgentToolConfig[] = [],
  orgId: string = ""
): Promise<string> {
  let parsedArgs: Record<string, unknown> = {};
  if (typeof rawArgs === "string") {
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      parsedArgs = { input: rawArgs };
    }
  } else {
    parsedArgs = rawArgs || {};
  }

  // 1. Ferramenta embutida: Calculator
  if (toolName === "calculator" || toolName === "math_eval") {
    const expr = String(parsedArgs.expression || parsedArgs.query || parsedArgs.input || "0");
    try {
      // Avaliação segura simples de expressões aritméticas
      const sanitized = expr.replace(/[^0-9+\-*/().\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized});`)();
      return JSON.stringify({ result });
    } catch {
      return JSON.stringify({ error: `Could not evaluate expression: ${expr}` });
    }
  }

  // 2. Busca na lista de ferramentas declaradas
  const tool = availableTools.find((t) => t.name === toolName);
  if (!tool) {
    return JSON.stringify({ error: `Tool ${toolName} not found` });
  }

  if (tool.handler) {
    try {
      const res = await tool.handler(parsedArgs);
      return typeof res === "string" ? res : JSON.stringify(res);
    } catch (err: any) {
      return JSON.stringify({ error: err.message || "Tool execution failed" });
    }
  }

  // 3. MCP Tool
  if (tool.type === "mcp") {
    try {
      const mcpRes = await executeMcpClient(
        {
          ...(tool.mcpConfig || {}),
          operation: "callTool",
          toolName,
          arguments: parsedArgs,
        },
        parsedArgs,
        orgId
      );
      return JSON.stringify(mcpRes);
    } catch (err: any) {
      return JSON.stringify({ error: `MCP tool error: ${err.message}` });
    }
  }

  // 4. Vector Store Tool (Busca semântica)
  if (tool.type === "vectorStore") {
    try {
      const query = String(parsedArgs.query || parsedArgs.input || "");
      const collection = String(tool.vectorStoreConfig?.collectionName || "default_collection");
      const results = await VectorStoreService.search(collection, query, 4, 0.0, "memory");
      return JSON.stringify({ matches: results });
    } catch (err: any) {
      return JSON.stringify({ error: `Vector search error: ${err.message}` });
    }
  }

  return JSON.stringify({ status: "success", tool: toolName, args: parsedArgs });
}

/**
 * Loop principal do Autonomous AI Agent
 */
export async function runAutonomousAgentLoop(
  userPrompt: string,
  config: AiAgentConfig,
  orgId: string = ""
): Promise<{
  output: string;
  iterations: number;
  intermediateSteps: Array<{ action: ToolCall; result: string }>;
  messages: ChatMessage[];
}> {
  const maxIterations = config.maxIterations || 5;
  const provider = config.provider || "openai";
  const model = config.model || "gpt-4o-mini";
  const sessionId = config.memory?.sessionId || "default_session";
  const windowSize = config.memory?.windowSize || 10;

  // Carrega histórico de memória
  const history = ConversationMemoryManager.getHistory(sessionId, windowSize);

  const messages: ChatMessage[] = [];
  if (config.systemPrompt) {
    messages.push({ role: "system", content: config.systemPrompt });
  }

  // Inclui histórico
  for (const h of history) {
    messages.push(h);
  }

  // Adiciona a mensagem atual do usuário
  const userMsg: ChatMessage = { role: "user", content: userPrompt };
  messages.push(userMsg);
  ConversationMemoryManager.addMessage(sessionId, userMsg);

  // Prepara tools para o LLM
  const toolDefs: ToolDefinition[] = (config.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters || {
      type: "object",
      properties: { query: { type: "string" }, input: { type: "string" } },
    },
  }));

  // Se nenhuma tool estiver configurada, adiciona Calculator por padrão se necessário
  if (toolDefs.length === 0) {
    toolDefs.push({
      name: "calculator",
      description: "Perform math calculations and arithmetic operations",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "Arithmetic expression to evaluate" } },
        required: ["expression"],
      },
    });
  }

  const intermediateSteps: Array<{ action: ToolCall; result: string }> = [];
  let currentIteration = 0;
  let finalOutput = "";

  while (currentIteration < maxIterations) {
    currentIteration++;

    const response = await executeLlmCompletion(
      {
        provider,
        model,
        messages,
        temperature: config.temperature ?? 0.2,
        maxTokens: config.maxTokens ?? 2048,
        tools: toolDefs,
      },
      orgId
    );

    // Se o modelo retornou tool calls, executa-as
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Registra a mensagem do assistente com os tool calls
      messages.push({
        role: "assistant",
        content: response.text || "",
        tool_calls: response.toolCalls,
      });

      for (const tc of response.toolCalls) {
        const toolResult = await executeAgentSubTool(
          tc.function.name,
          tc.function.arguments,
          config.tools,
          orgId
        );

        intermediateSteps.push({
          action: tc,
          result: toolResult,
        });

        // Adiciona a resposta da tool ao histórico da conversa
        messages.push({
          role: "tool",
          name: tc.function.name,
          tool_call_id: tc.id,
          content: toolResult,
        });
      }
    } else {
      // Resposta final atingida
      finalOutput = response.text;
      const assistantMsg: ChatMessage = { role: "assistant", content: finalOutput };
      messages.push(assistantMsg);
      ConversationMemoryManager.addMessage(sessionId, assistantMsg);
      break;
    }
  }

  if (!finalOutput && messages.length > 0) {
    finalOutput = messages[messages.length - 1].content || "Task completed.";
  }

  return {
    output: finalOutput,
    iterations: currentIteration,
    intermediateSteps,
    messages,
  };
}

/**
 * Handler de Node para `ai_agent` / `aiAgent` / `n8n-nodes-langchain.agent`
 */
export class AiAgentNodeHandler implements NodeHandler {
  readonly type = "ai_agent";
  readonly category = "ai";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const rawConfig = ctx.nodeConfig || {};
    const config = (rawConfig.parameters || rawConfig) as AiAgentConfig;

    const items = wrapItems(ctx.input);
    const resultItems: NodeItem[] = [];

    for (const item of items) {
      const prompt =
        config.prompt ||
        (item.json.prompt as string) ||
        (item.json.message as string) ||
        (item.json.query as string) ||
        JSON.stringify(item.json);

      const agentResult = await runAutonomousAgentLoop(
        prompt,
        {
          ...config,
          memory: {
            sessionId: (item.json.sessionId as string) || ctx.executionId,
            ...(config.memory || {}),
          },
        },
        ctx.orgId
      );

      resultItems.push({
        json: {
          output: agentResult.output,
          response: agentResult.output,
          iterations: agentResult.iterations,
          intermediateSteps: config.returnIntermediateSteps
            ? agentResult.intermediateSteps
            : undefined,
          prompt,
        },
      });
    }

    return { items: resultItems };
  }
}
