/**
 * Rotas Fastify para TwelveLabs Video AI & Genesis Analysis
 * Endpoints:
 * - POST /api/twelvelabs/indexes (Criar / listar índices multimodais)
 * - POST /api/twelvelabs/ingest (Ingerir vídeo / monitorar tarefa)
 * - POST /api/twelvelabs/search (Busca semântica multimodal Marengo)
 * - POST /api/twelvelabs/generate (Pegasus video-to-text)
 * - POST /api/twelvelabs/analyze-day69 (Análise profunda da live do Overclock Bot)
 * - GET  /api/twelvelabs/knowledge-doc (Retorna o markdown exportado)
 * - POST /api/twelvelabs/jockey (Execução de tool no TwelveLabs Jockey MCP)
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { checkAiQuota } from "../services/metering.js";
import { z } from "zod";
import {
  TwelveLabsClient,
  TwelveLabsIndexManager,
  TwelveLabsVideoIngest,
  TwelveLabsVideoAnalyzer,
  TwelveLabsKnowledgeExporter,
} from "../services/twelvelabs/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const createIndexSchema = z.object({
  indexName: z.string().min(1).default("overclock-bot-genesis"),
  includeMarengo: z.boolean().optional().default(true),
  includePegasus: z.boolean().optional().default(true),
});

const ingestSchema = z.object({
  indexId: z.string().min(1),
  videoUrl: z.string().url().optional(),
  filePath: z.string().optional(),
  videoTitle: z.string().optional().default("Overclock Bot Live Dia 69"),
});

const searchSchema = z.object({
  indexId: z.string().min(1),
  query: z.string().min(1),
  threshold: z.enum(["high", "medium", "low", "none"]).optional().default("medium"),
});

const generateSchema = z.object({
  videoId: z.string().min(1),
  prompt: z.string().min(1),
  temperature: z.number().min(0).max(1).optional().default(0.2),
});

const jockeyToolSchema = z.object({
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()).optional().default({}),
});

export async function twelveLabsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  const client = new TwelveLabsClient();
  const indexManager = new TwelveLabsIndexManager(client);
  const videoIngest = new TwelveLabsVideoIngest(client);
  const videoAnalyzer = new TwelveLabsVideoAnalyzer(client);

  /**
   * Listar ou Criar Índices
   */
  app.get("/indexes", async (_request, reply) => {
    try {
      const indexes = await indexManager.listIndexes();
      return reply.send({ success: true, indexes });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post("/indexes", async (request, reply) => {
    try {
      const body = createIndexSchema.parse(request.body);
      const index = await indexManager.createModalIndex(body);
      return reply.status(201).send({ success: true, index });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * Iniciar Ingestão de Vídeo
   */
  app.post(
    "/ingest",
    {
      preHandler: checkAiQuota,
    },
    async (request, reply) => {
      try {
        const body = ingestSchema.parse(request.body);
        const task = await videoIngest.createIngestTask(body);
        return reply.status(202).send({ success: true, task });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * Consultar status de tarefa de indexação
   */
  app.get("/tasks/:taskId", async (request, reply) => {
    try {
      const { taskId } = request.params as { taskId: string };
      const task = await videoIngest.getTaskStatus(taskId);
      return reply.send({ success: true, task });
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  /**
   * Busca Semântica de Vídeo (Marengo)
   */
  app.post("/search", async (request, reply) => {
    try {
      const body = searchSchema.parse(request.body);
      const results = await videoAnalyzer.semanticSearch(body);
      return reply.send({ success: true, ...results });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * Geração de Texto / Respostas de Vídeo (Pegasus)
   */
  app.post(
    "/generate",
    {
      preHandler: checkAiQuota,
    },
    async (request, reply) => {
      try {
        const body = generateSchema.parse(request.body);
        const text = await videoAnalyzer.generateVideoText(body);
        return reply.send({ success: true, text });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * Análise Profunda da Live do Dia 69 (Overclock Bot Genesis)
   * Executa a extração completa e persiste em docs/overclock-bot-genesis-day69.md
   */
  app.post(
    "/analyze-day69",
    {
      preHandler: checkAiQuota,
    },
    async (request, reply) => {
      try {
        const videoId = (request.body as any)?.videoId || "vid_day69_genesis_live";
        const result = await videoAnalyzer.analyzeDay69Genesis(videoId);

        // Exporta automaticamente para Markdown na documentação
        const exportRes = await TwelveLabsKnowledgeExporter.exportToFile(result);

        return reply.send({
          success: true,
          data: result,
          exportedFile: exportRes.filePath,
          bytesWritten: exportRes.bytesWritten,
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  /**
   * Retorna o Markdown gerado do Genesis do Overclock Bot
   */
  app.get("/knowledge-doc", async (_request, reply) => {
    try {
      const docPath = path.resolve(process.cwd(), "docs", "overclock-bot-genesis-day69.md");
      const content = await fs.readFile(docPath, "utf-8");
      return reply.header("Content-Type", "text/markdown; charset=utf-8").send(content);
    } catch {
      // Se ainda não existir, gera e retorna
      const result = await videoAnalyzer.analyzeDay69Genesis();
      await TwelveLabsKnowledgeExporter.exportToFile(result);
      const markdown = TwelveLabsKnowledgeExporter.formatToMarkdown(result);
      return reply.header("Content-Type", "text/markdown; charset=utf-8").send(markdown);
    }
  });

  /**
   * Integração Nativa TwelveLabs Jockey MCP Tool Execution
   */
  app.post("/jockey", async (request, reply) => {
    try {
      const { toolName, arguments: args } = jockeyToolSchema.parse(request.body);
      const mcpResult = await client.executeJockeyTool(toolName, args);
      return reply.send({ success: true, ...mcpResult });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
