/**
 * LLM Chain Node Handler (compatível com n8n Basic LLM Chain / LangChain LLMChain)
 * Suporta:
 * - Prompt Templates com interpolação de variáveis ({input}, {variable}, {{item.field}})
 * - Integração direta com LlmModel e Memory
 * - Output Parsers (JSON parser, text parser, item mapper)
 */
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
} from "./types.js";
import {
  executeLlmCompletion,
  resolveLlmCredential,
  LlmProviderName,
  ChatMessage,
} from "./llm-model.js";
import { ConversationMemoryManager } from "./ai-agent.js";
import { evaluateExpression, buildExpressionContext } from "../expressions.js";

export interface LlmChainConfig {
  prompt?: string;
  systemMessage?: string;
  promptTemplate?: string;
  provider?: LlmProviderName;
  model?: string;
  outputParser?: "text" | "json" | "auto";
  memory?: {
    enabled?: boolean;
    sessionId?: string;
    windowSize?: number;
  };
  temperature?: number;
  maxTokens?: number;
  credentialId?: string;
}

/**
 * Interpola variáveis no template do prompt: {var} e {{expr}}
 */
export function interpolatePromptTemplate(
  template: string,
  variables: Record<string, unknown>,
  exprCtx?: Record<string, unknown>
): string {
  let result = template;

  // 1. Interpolação estilo n8n / AgentFlow {{ expression }}
  if (exprCtx && result.includes("{{")) {
    result = result.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
      try {
        const val = evaluateExpression(`{{${expr}}}`, exprCtx);
        return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      } catch {
        return "";
      }
    });
  }

  // 2. Interpolação estilo LangChain {variable}
  result = result.replace(/\{([a-zA-Z0-9_$.]+)\}/g, (match, key) => {
    if (key in variables) {
      const val = variables[key];
      return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
    }
    return match;
  });

  return result;
}

/**
 * Executa parser de saída do LLM
 */
export function parseChainOutput(
  rawText: string,
  parserType: "text" | "json" | "auto" = "auto"
): unknown {
  if (parserType === "text") return rawText;

  if (parserType === "json" || parserType === "auto") {
    try {
      // Tenta extrair bloco markdown ```json ... ``` se existir
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const textToParse = jsonMatch ? jsonMatch[1] : rawText.trim();
      return JSON.parse(textToParse);
    } catch {
      if (parserType === "json") {
        return { error: "Failed to parse JSON output", raw: rawText };
      }
      return rawText;
    }
  }

  return rawText;
}

/**
 * Handler de Node para `llm_chain` / `basicLlmChain` / `n8n-nodes-langchain.chainLlm`
 */
export class LlmChainNodeHandler implements NodeHandler {
  readonly type = "llm_chain";
  readonly category = "ai";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const rawConfig = ctx.nodeConfig || {};
    const config = (rawConfig.parameters || rawConfig) as LlmChainConfig;

    const provider = config.provider || "openai";
    const model = config.model || "gpt-4o-mini";
    const template =
      config.promptTemplate ||
      config.prompt ||
      "{input}";
    const outputParser = config.outputParser || "auto";

    const creds = await resolveLlmCredential(config.credentialId, ctx.orgId, provider);
    const inputItems = wrapItems(ctx.input);
    const resultItems: NodeItem[] = [];

    for (let itemIdx = 0; itemIdx < inputItems.length; itemIdx++) {
      const item = inputItems[itemIdx];
      const json = item.json;

      const exprContext = buildExpressionContext({
        item,
        items: inputItems,
        nodeConfig: rawConfig,
        executionId: ctx.executionId,
        workflowId: ctx.workflowId,
      });

      const templateVariables: Record<string, unknown> = {
        input: json.input || json.prompt || json.message || json.query || JSON.stringify(json),
        ...json,
      };

      const resolvedPrompt = interpolatePromptTemplate(template, templateVariables, exprContext);

      const messages: ChatMessage[] = [];
      if (config.systemMessage) {
        messages.push({ role: "system", content: config.systemMessage });
      }

      // Memory handling
      const sessionId = config.memory?.sessionId || (json.sessionId as string) || ctx.executionId;
      if (config.memory?.enabled) {
        const history = ConversationMemoryManager.getHistory(
          sessionId,
          config.memory.windowSize || 10
        );
        for (const h of history) {
          messages.push(h);
        }
      }

      const userMsg: ChatMessage = { role: "user", content: resolvedPrompt };
      messages.push(userMsg);
      if (config.memory?.enabled) {
        ConversationMemoryManager.addMessage(sessionId, userMsg);
      }

      const response = await executeLlmCompletion(
        {
          provider,
          model,
          messages,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 2048,
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
        },
        ctx.orgId
      );

      if (config.memory?.enabled) {
        ConversationMemoryManager.addMessage(sessionId, {
          role: "assistant",
          content: response.text,
        });
      }

      const parsedOutput = parseChainOutput(response.text, outputParser);

      resultItems.push({
        json: {
          text: response.text,
          parsed: parsedOutput,
          response: typeof parsedOutput === "object" && parsedOutput !== null ? parsedOutput : response.text,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
          prompt: resolvedPrompt,
        },
      });
    }

    return { items: resultItems };
  }
}
