/**
 * TwelveLabs Index Manager
 * Criação e gerenciamento de índices multimodais combinando:
 * - Marengo 2.7 (Busca semântica de vídeo, visual, conversa e texto na tela)
 * - Pegasus 1.2 (Compreensão profunda de vídeo, geração de texto, sumarização)
 */
import { TwelveLabsClient } from "./client.js";
import { CreateIndexRequest, IndexResponse } from "./types.js";

export class TwelveLabsIndexManager {
  private client: TwelveLabsClient;

  constructor(client?: TwelveLabsClient) {
    this.client = client || new TwelveLabsClient();
  }

  /**
   * Cria um índice com motores multimodais Marengo + Pegasus
   */
  async createModalIndex(request: {
    indexName: string;
    includeMarengo?: boolean;
    includePegasus?: boolean;
  }): Promise<IndexResponse> {
    const models: any[] = [];

    if (request.includeMarengo !== false) {
      models.push({
        model_name: "marengo2.7",
        model_options: ["visual", "conversation", "text_in_video"],
      });
    }

    if (request.includePegasus !== false) {
      models.push({
        model_name: "pegasus1.2",
        model_options: ["visual", "conversation"],
      });
    }

    const payload = {
      index_name: request.indexName,
      models,
      addons: ["thumbnail"],
    };

    const res: any = await this.client.request("/indexes", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: res._id || res.id || `idx_${Date.now()}`,
      indexName: res.index_name || request.indexName,
      models: res.models || models,
      videoCount: res.video_count || 0,
      totalDuration: res.total_duration || 0,
      createdAt: res.created_at || new Date().toISOString(),
      updatedAt: res.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Obtém ou cria o índice dedicado para as Lives do Overclock e Bot Genesis
   */
  async getOrCreateGenesisIndex(indexName: string = "overclock-bot-genesis"): Promise<IndexResponse> {
    const list = await this.listIndexes();
    const existing = list.find((idx) => idx.indexName === indexName);
    if (existing) {
      return existing;
    }
    return this.createModalIndex({ indexName });
  }

  /**
   * Lista todos os índices disponíveis
   */
  async listIndexes(): Promise<IndexResponse[]> {
    const res: any = await this.client.request("/indexes", {
      method: "GET",
    });

    const items = res.data || (Array.isArray(res) ? res : []);
    return items.map((item: any) => ({
      id: item._id || item.id,
      indexName: item.index_name || item.name || "unnamed-index",
      models: item.models || [],
      videoCount: item.video_count ?? item.videos?.length ?? 0,
      totalDuration: item.total_duration ?? 0,
      createdAt: item.created_at || new Date().toISOString(),
      updatedAt: item.updated_at || new Date().toISOString(),
    }));
  }

  /**
   * Retorna detalhes de um índice específico
   */
  async getIndex(indexId: string): Promise<IndexResponse> {
    const res: any = await this.client.request(`/indexes/${indexId}`, {
      method: "GET",
    });

    return {
      id: res._id || res.id || indexId,
      indexName: res.index_name || "index",
      models: res.models || [],
      videoCount: res.video_count ?? 0,
      totalDuration: res.total_duration ?? 0,
      createdAt: res.created_at || new Date().toISOString(),
      updatedAt: res.updated_at || new Date().toISOString(),
    };
  }
}
