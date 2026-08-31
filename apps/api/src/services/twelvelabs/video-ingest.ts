/**
 * TwelveLabs Video Ingestion Pipeline
 * Responsável por:
 * - Iniciar tarefas de indexação de vídeos longos (Lives, recordings) via URL ou File Upload
 * - Monitorar o progresso assíncrono (pending -> validating -> indexing -> ready)
 * - Suporte a pooling e webhook de conclusão
 */
import { TwelveLabsClient } from "./client.js";
import { IngestTaskRequest, IngestTaskResponse } from "./types.js";

export class TwelveLabsVideoIngest {
  private client: TwelveLabsClient;

  constructor(client?: TwelveLabsClient) {
    this.client = client || new TwelveLabsClient();
  }

  /**
   * Inicia tarefa de ingestão para um vídeo (e.g. Live do Dia 69 do Overclock Bot)
   */
  async createIngestTask(request: IngestTaskRequest): Promise<IngestTaskResponse> {
    const videoSource = request.filePath || request.videoUrl;

    // Também podemos delegar via Jockey MCP tool se disponível
    if (!this.client.isMockMode() && videoSource) {
      try {
        const jockeyRes = await this.client.executeJockeyTool("ingest_video", {
          index_id: request.indexId,
          url: request.videoUrl,
          file_path: request.filePath,
          video_title: request.videoTitle || "Overclock Bot Genesis - Dia 69",
        });
        if (!jockeyRes.isMock && (jockeyRes.result as any)?.task_id) {
          const res = jockeyRes.result as any;
          return {
            taskId: res.task_id,
            indexId: request.indexId,
            status: "indexing",
            videoId: res.video_id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      } catch {
        // Fallback para REST endpoint nativo
      }
    }

    const payload: Record<string, unknown> = {
      index_id: request.indexId,
    };

    if (request.videoUrl) {
      payload.url = request.videoUrl;
    }
    if (request.filePath) {
      payload.file_path = request.filePath;
    }
    if (request.videoTitle) {
      payload.video_title = request.videoTitle;
    }

    const res: any = await this.client.request("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      taskId: res._id || res.id || `task_${Date.now()}`,
      indexId: res.index_id || request.indexId,
      status: (res.status as IngestTaskResponse["status"]) || "ready",
      videoId: res.video_id || "vid_mock_day69_bot_genesis",
      progress: res.process?.percentage ?? (res.status === "ready" ? 100 : 0),
      createdAt: res.created_at || new Date().toISOString(),
      updatedAt: res.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Consulta o status atual de uma tarefa de indexação
   */
  async getTaskStatus(taskId: string): Promise<IngestTaskResponse> {
    const res: any = await this.client.request(`/tasks/${taskId}`, {
      method: "GET",
    });

    return {
      taskId: res._id || taskId,
      indexId: res.index_id || "default_index",
      status: (res.status as IngestTaskResponse["status"]) || "ready",
      videoId: res.video_id || (res.status === "ready" ? "vid_mock_day69_bot_genesis" : undefined),
      progress: res.process?.percentage ?? 100,
      estimatedTime: res.estimated_time,
      error: res.system_info?.error || res.error,
      createdAt: res.created_at || new Date().toISOString(),
      updatedAt: res.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Aguarda a tarefa atingir o status "ready" ou "failed" com timeout configurável
   */
  async waitForTaskCompletion(
    taskId: string,
    options: { pollingIntervalMs?: number; maxTimeoutMs?: number } = {}
  ): Promise<IngestTaskResponse> {
    const interval = options.pollingIntervalMs || 2000;
    const maxTimeout = options.maxTimeoutMs || 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxTimeout) {
      const task = await this.getTaskStatus(taskId);
      if (task.status === "ready" || task.status === "failed") {
        return task;
      }
      if (this.client.isMockMode()) {
        return {
          ...task,
          status: "ready",
          progress: 100,
          videoId: "vid_mock_day69_bot_genesis",
        };
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Timeout waiting for TwelveLabs ingest task ${taskId} after ${maxTimeout}ms`);
  }
}
