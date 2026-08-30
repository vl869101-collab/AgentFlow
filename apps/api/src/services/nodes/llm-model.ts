/**
 * LLM Model Node Handler & Unified Provider Abstraction
 * Suporta: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq e Ollama Local.
 * Resolve credenciais via KMS / Vault ou variáveis de ambiente.
 */
import { prisma } from "../../lib/prisma.js";
import { decryptCredential } from "../../lib/crypto.js";
import { kmsManager, decryptVaultEnvelope, isVaultEnvelope } from "../vault/kms.js";
import { safeFetch } from "../../lib/ssrf.js";
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
} from "./types.js";

export type LlmProviderName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "groq"
  | "ollama"
  | "custom";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LlmCompletionRequest {
  provider: LlmProviderName;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fallbackModels?: Array<{ provider: LlmProviderName; model: string; apiKey?: string }>;
}

export interface LlmCompletionResponse {
  text: string;
  toolCalls?: ToolCall[];
  provider: LlmProviderName;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
}

/**
 * Resolve a chave/segredo de API da credencial informada usando KMS/Vault.
 */
export async function resolveLlmCredential(
  credentialId?: string,
  orgId?: string,
  provider?: LlmProviderName
): Promise<{ apiKey?: string; baseUrl?: string; options?: Record<string, unknown> }> {
  if (credentialId && orgId) {
    try {
      const cred = await prisma.credential.findFirst({
        where: { id: credentialId, orgId },
      });
      if (cred) {
        let decryptedData: Record<string, any> = {};
        const rawData = typeof cred.data === "string" ? JSON.parse(cred.data) : cred.data;

        if (isVaultEnvelope(rawData)) {
          decryptedData = decryptVaultEnvelope(rawData, kmsManager.getProvider());
        } else if (typeof cred.data === "string") {
          try {
            decryptedData = JSON.parse(decryptCredential(cred.data));
          } catch {
            decryptedData = rawData;
          }
        } else {
          decryptedData = rawData;
        }

        return {
          apiKey:
            decryptedData.apiKey ||
            decryptedData.api_key ||
            decryptedData.token ||
            decryptedData.accessToken,
          baseUrl: decryptedData.baseUrl || decryptedData.base_url || decryptedData.endpoint,
          options: decryptedData,
        };
      }
    } catch {
      // Fallback para variáveis de ambiente
    }
  }

  // Fallback padrão para variáveis de ambiente conforme o provider
  const envKeyMap: Record<LlmProviderName, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    groq: process.env.GROQ_API_KEY,
    ollama: process.env.OLLAMA_API_KEY || "ollama",
    custom: process.env.CUSTOM_LLM_API_KEY,
  };

  const envBaseUrlMap: Record<LlmProviderName, string | undefined> = {
    openai: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    anthropic: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
    gemini: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
    deepseek: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    groq: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    ollama: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    custom: process.env.CUSTOM_LLM_BASE_URL,
  };

  const p = provider || "openai";
  return {
    apiKey: envKeyMap[p],
    baseUrl: envBaseUrlMap[p],
  };
}

/**
 * Formata chamadas de tool para formato compatível OpenAI
 */
function formatToolsForOpenAi(tools?: ToolDefinition[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters || { type: "object", properties: {} },
    },
  }));
}

/**
 * Executa chamada unificada para provedor OpenAI ou compatíveis (DeepSeek, Groq, Ollama v1, etc.)
 */
async function callOpenAiCompatible(
  req: LlmCompletionRequest,
  resolvedApiKey: string,
  resolvedBaseUrl: string
): Promise<LlmCompletionResponse> {
  const isMock =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    resolvedBaseUrl.includes("mock") ||
    resolvedApiKey.startsWith("mock-");

  if (isMock) {
    const lastMessage = req.messages[req.messages.length - 1]?.content || "";

    // Se a mensagem mencionar tool calling ou se for configurado tool
    if (req.tools && req.tools.length > 0 && lastMessage.toLowerCase().includes("calc")) {
      return {
        text: "",
        provider: req.provider,
        model: req.model,
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            type: "function",
            function: {
              name: req.tools[0].name,
              arguments: JSON.stringify({ expression: "2+2", query: lastMessage }),
            },
          },
        ],
        usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
      };
    }

    return {
      text: `[${req.provider}/${req.model}] Resposta gerada com sucesso para: "${lastMessage.slice(0, 50)}"`,
      provider: req.provider,
      model: req.model,
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    };
  }

  const url = `${resolvedBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 2048,
  };
  if (req.topP !== undefined) body.top_p = req.topP;
  const tools = formatToolsForOpenAi(req.tools);
  if (tools) {
    body.tools = tools;
    if (req.toolChoice) body.tool_choice = req.toolChoice;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (resolvedApiKey) {
    headers.Authorization = `Bearer ${resolvedApiKey}`;
  }

  const timeoutMs = req.timeoutMs ?? 30000;
  const res = await safeFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    timeoutMs,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM call failed (${req.provider} - HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0];
  const msg = choice?.message;

  const toolCalls: ToolCall[] | undefined = msg?.tool_calls?.map((tc: any) => ({
    id: tc.id,
    type: "function",
    function: {
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    },
  }));

  return {
    text: msg?.content || "",
    toolCalls,
    provider: req.provider,
    model: req.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
    raw: data,
  };
}

/**
 * Executa chamada para Anthropic Messages API
 */
async function callAnthropic(
  req: LlmCompletionRequest,
  resolvedApiKey: string,
  resolvedBaseUrl: string
): Promise<LlmCompletionResponse> {
  const isMock =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    resolvedBaseUrl.includes("mock") ||
    resolvedApiKey.startsWith("mock-");

  if (isMock) {
    const lastMessage = req.messages[req.messages.length - 1]?.content || "";
    if (req.tools && req.tools.length > 0 && lastMessage.toLowerCase().includes("calc")) {
      return {
        text: "",
        provider: "anthropic",
        model: req.model,
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            type: "function",
            function: {
              name: req.tools[0].name,
              arguments: JSON.stringify({ expression: "2+2", query: lastMessage }),
            },
          },
        ],
        usage: { promptTokens: 18, completionTokens: 12, totalTokens: 30 },
      };
    }

    return {
      text: `[Anthropic ${req.model}] Resposta: "${lastMessage.slice(0, 50)}"`,
      provider: "anthropic",
      model: req.model,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }

  const systemMessage = req.messages.find((m) => m.role === "system")?.content;
  const userAssistantMessages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: m.content,
    }));

  const body: Record<string, unknown> = {
    model: req.model || "claude-3-5-sonnet-20241022",
    messages: userAssistantMessages,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.7,
  };
  if (systemMessage) body.system = systemMessage;
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: "object", properties: {} },
    }));
  }

  const url = `${resolvedBaseUrl.replace(/\/$/, "")}/messages`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": resolvedApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    timeoutMs: req.timeoutMs ?? 30000,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of data.content || []) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    provider: "anthropic",
    model: req.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens ?? 0,
          completionTokens: data.usage.output_tokens ?? 0,
          totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        }
      : undefined,
    raw: data,
  };
}

/**
 * Executa chamada para Google Gemini API
 */
async function callGemini(
  req: LlmCompletionRequest,
  resolvedApiKey: string,
  resolvedBaseUrl: string
): Promise<LlmCompletionResponse> {
  const isMock =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_SERVICES === "true" ||
    process.env.EXEC_MOCK === "true" ||
    resolvedBaseUrl.includes("mock") ||
    resolvedApiKey.startsWith("mock-");

  if (isMock) {
    const lastMessage = req.messages[req.messages.length - 1]?.content || "";
    return {
      text: `[Google Gemini ${req.model}] Resposta: "${lastMessage.slice(0, 50)}"`,
      provider: "gemini",
      model: req.model,
      usage: { promptTokens: 12, completionTokens: 22, totalTokens: 34 },
    };
  }

  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const modelName = req.model.replace(/^models\//, "");
  const url = `${resolvedBaseUrl.replace(/\/$/, "")}/models/${modelName}:generateContent?key=${resolvedApiKey}`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens ?? 2048,
      topP: req.topP ?? 0.95,
    },
  };

  const res = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: req.timeoutMs ?? 30000,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text).join("") || "";

  return {
    text,
    provider: "gemini",
    model: req.model,
    raw: data,
  };
}

/**
 * Executa uma chamada unificada a LLM com suporte a múltiplos provedores e fallback automático de modelos.
 */
export async function executeLlmCompletion(
  request: LlmCompletionRequest,
  orgId: string = ""
): Promise<LlmCompletionResponse> {
  const providersToTry: Array<{
    provider: LlmProviderName;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  }> = [
    {
      provider: request.provider,
      model: request.model,
      apiKey: request.apiKey,
      baseUrl: request.baseUrl,
    },
    ...(request.fallbackModels || []),
  ];

  let lastError: Error | null = null;

  for (const target of providersToTry) {
    try {
      const creds = await resolveLlmCredential(undefined, orgId, target.provider);
      const effectiveApiKey = target.apiKey || creds.apiKey || "mock-api-key";
      const effectiveBaseUrl = target.baseUrl || creds.baseUrl || "https://api.openai.com/v1";

      const currentReq: LlmCompletionRequest = {
        ...request,
        provider: target.provider,
        model: target.model,
        apiKey: effectiveApiKey,
        baseUrl: effectiveBaseUrl,
      };

      switch (target.provider) {
        case "anthropic":
          return await callAnthropic(currentReq, effectiveApiKey, effectiveBaseUrl);
        case "gemini":
          return await callGemini(currentReq, effectiveApiKey, effectiveBaseUrl);
        case "openai":
        case "deepseek":
        case "groq":
        case "ollama":
        case "custom":
        default:
          return await callOpenAiCompatible(currentReq, effectiveApiKey, effectiveBaseUrl);
      }
    } catch (err: any) {
      lastError = err;
      // Continua para o próximo fallback
    }
  }

  throw lastError || new Error("Failed to execute LLM completion with any provider");
}

/**
 * Handler de Node para `llm_model` / `lmChatOpenAi` / `lmChatAnthropic`
 */
export class LlmModelNodeHandler implements NodeHandler {
  readonly type = "llm_model";
  readonly category = "ai";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig || {};
    const provider = (config.provider as LlmProviderName) || "openai";
    const model = String(config.model || "gpt-4o-mini");

    const creds = await resolveLlmCredential(
      config.credentialId as string | undefined,
      ctx.orgId,
      provider
    );

    const items = wrapItems(ctx.input);
    const resultItems: NodeItem[] = [];

    for (const item of items) {
      const prompt =
        (config.prompt as string) ||
        (item.json.prompt as string) ||
        (item.json.message as string) ||
        JSON.stringify(item.json);

      const systemPrompt = config.systemPrompt as string | undefined;
      const messages: ChatMessage[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const response = await executeLlmCompletion(
        {
          provider,
          model,
          messages,
          temperature: Number(config.temperature ?? 0.7),
          maxTokens: Number(config.maxTokens ?? 2048),
          apiKey: (config.apiKey as string) || creds.apiKey,
          baseUrl: (config.baseUrl as string) || creds.baseUrl,
          fallbackModels: config.fallbackModels as any,
        },
        ctx.orgId
      );

      resultItems.push({
        json: {
          text: response.text,
          response: response.text,
          provider: response.provider,
          model: response.model,
          toolCalls: response.toolCalls,
          usage: response.usage,
          prompt,
        },
      });
    }

    return { items: resultItems };
  }
}
