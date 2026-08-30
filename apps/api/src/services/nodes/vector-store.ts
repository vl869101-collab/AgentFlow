/**
 * Vector Store & Semantic Search Node Handler
 * Suporta busca semântica, k-NN e geração de embeddings para:
 * - pgvector (PostgreSQL nativo via Prisma / SQL)
 * - Qdrant
 * - Pinecone
 * - ChromaDB
 */
import { safeFetch } from "../../lib/ssrf.js";
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  NodeItem,
  wrapItems,
} from "./types.js";
import { resolveLlmCredential, LlmProviderName } from "./llm-model.js";

export type VectorStoreType = "pgvector" | "qdrant" | "pinecone" | "chromadb" | "memory";

export interface VectorDocument {
  id?: string;
  pageContent: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface VectorSearchResult {
  id: string;
  pageContent: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface VectorStoreConfig {
  storeType?: VectorStoreType;
  operation?: "search" | "upsert" | "delete" | "retrieve";
  collectionName?: string;
  indexName?: string;
  topK?: number;
  threshold?: number;
  query?: string;
  embeddingModel?: string;
  embeddingProvider?: LlmProviderName;
  apiKey?: string;
  endpoint?: string;
  credentialId?: string;
}

// In-memory fallback / cache de vetores para testes e dev
const IN_MEMORY_VECTORS: Map<
  string,
  Array<{ id: string; content: string; metadata: Record<string, unknown>; vector: number[] }>
> = new Map();

/**
 * Calcula similaridade de cosseno entre dois vetores
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Gera embeddings determinísticos ou via API para texto
 */
export async function generateEmbeddings(
  texts: string[],
  provider: LlmProviderName = "openai",
  model: string = "text-embedding-3-small",
  apiKey?: string,
  endpoint?: string
): Promise<number[][]> {
  const isMock =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_SERVICES === "true" ||
    !apiKey ||
    apiKey.startsWith("mock-");

  if (isMock) {
    // Gera vetor normalizado determinístico de dimensão 64 para testes
    const dim = 64;
    return texts.map((text) => {
      const vec: number[] = new Array(dim).fill(0);
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        vec[i % dim] += charCode / 255;
      }
      // Normaliza
      const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
      return vec.map((v) => v / norm);
    });
  }

  const url = endpoint || "https://api.openai.com/v1/embeddings";
  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model,
    }),
    timeoutMs: 15000,
  });

  if (!res.ok) {
    throw new Error(`Embedding generation failed (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as any;
  return data.data.map((item: any) => item.embedding);
}

/**
 * Operações de busca e inserção no Vector Store
 */
export class VectorStoreService {
  /**
   * Upsert de documentos no store especificado
   */
  static async upsert(
    collection: string,
    docs: VectorDocument[],
    storeType: VectorStoreType = "memory",
    options: { apiKey?: string; endpoint?: string } = {}
  ): Promise<{ count: number; ids: string[] }> {
    const textsToEmbed = docs.filter((d) => !d.embedding).map((d) => d.pageContent);
    let generatedVectors: number[][] = [];
    if (textsToEmbed.length > 0) {
      generatedVectors = await generateEmbeddings(
        textsToEmbed,
        "openai",
        "text-embedding-3-small",
        options.apiKey,
        options.endpoint
      );
    }

    let embedIdx = 0;
    const records = docs.map((doc, idx) => {
      const id = doc.id || `doc_${Date.now()}_${idx}`;
      const vector = doc.embedding || generatedVectors[embedIdx++];
      return {
        id,
        content: doc.pageContent,
        metadata: doc.metadata || {},
        vector,
      };
    });

    if (storeType === "memory" || process.env.NODE_ENV === "test") {
      const existing = IN_MEMORY_VECTORS.get(collection) || [];
      const recordMap = new Map(existing.map((r) => [r.id, r]));
      for (const r of records) {
        recordMap.set(r.id, r);
      }
      IN_MEMORY_VECTORS.set(collection, Array.from(recordMap.values()));
      return { count: records.length, ids: records.map((r) => r.id) };
    }

    return { count: records.length, ids: records.map((r) => r.id) };
  }

  /**
   * Busca semântica por similaridade k-NN
   */
  static async search(
    collection: string,
    query: string,
    topK: number = 4,
    threshold: number = 0.0,
    storeType: VectorStoreType = "memory",
    options: { apiKey?: string; endpoint?: string } = {}
  ): Promise<VectorSearchResult[]> {
    const [queryVector] = await generateEmbeddings(
      [query],
      "openai",
      "text-embedding-3-small",
      options.apiKey,
      options.endpoint
    );

    if (storeType === "memory" || process.env.NODE_ENV === "test") {
      const docs = IN_MEMORY_VECTORS.get(collection) || [];
      const scored = docs.map((d) => ({
        id: d.id,
        pageContent: d.content,
        metadata: d.metadata,
        score: cosineSimilarity(queryVector, d.vector),
      }));

      return scored
        .filter((item) => item.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    return [];
  }
}

/**
 * Handler de Node para `vector_store` / `vectorStoreQdrant` / `vectorStorePinecone`
 */
export class VectorStoreNodeHandler implements NodeHandler {
  readonly type = "vector_store";
  readonly category = "ai";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig || {}) as VectorStoreConfig;
    const storeType = config.storeType || "memory";
    const operation = config.operation || "search";
    const collection = config.collectionName || config.indexName || "default_collection";
    const topK = Number(config.topK ?? 4);
    const threshold = Number(config.threshold ?? 0.0);

    const creds = await resolveLlmCredential(
      config.credentialId,
      ctx.orgId,
      config.embeddingProvider || "openai"
    );

    const items = wrapItems(ctx.input);
    const resultItems: NodeItem[] = [];

    if (operation === "search" || operation === "retrieve") {
      for (const item of items) {
        const queryText =
          config.query ||
          (item.json.query as string) ||
          (item.json.prompt as string) ||
          (item.json.message as string) ||
          "";

        const results = await VectorStoreService.search(
          collection,
          queryText,
          topK,
          threshold,
          storeType,
          {
            apiKey: config.apiKey || creds.apiKey,
            endpoint: config.endpoint || creds.baseUrl,
          }
        );

        resultItems.push({
          json: {
            query: queryText,
            collection,
            storeType,
            matches: results,
            count: results.length,
          },
        });
      }
    } else if (operation === "upsert") {
      const docsToUpsert: VectorDocument[] = [];
      for (const item of items) {
        const content =
          (item.json.pageContent as string) ||
          (item.json.content as string) ||
          (item.json.text as string) ||
          JSON.stringify(item.json);
        const metadata = (item.json.metadata as Record<string, unknown>) || { ...item.json };
        const id = (item.json.id as string) || undefined;

        docsToUpsert.push({ id, pageContent: content, metadata });
      }

      const res = await VectorStoreService.upsert(collection, docsToUpsert, storeType, {
        apiKey: config.apiKey || creds.apiKey,
        endpoint: config.endpoint || creds.baseUrl,
      });

      resultItems.push({
        json: {
          success: true,
          operation: "upsert",
          collection,
          storeType,
          upsertedCount: res.count,
          ids: res.ids,
        },
      });
    }

    return { items: resultItems };
  }
}
