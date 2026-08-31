/**
 * TwelveLabs Video Analysis Workflow Node Handler
 * Integra o motor multimodal TwelveLabs e o Jockey MCP nos fluxos do AgentFlow.
 *
 * Operações suportadas:
 * - createIndex: Cria índices modais (Marengo / Pegasus)
 * - ingestVideo: Submete vídeo para indexação
 * - semanticSearch: Busca visual/fala/texto em vídeo com timestamps
 * - generateSummary: Geração de texto e resumos via Pegasus
 * - analyzeGenesisDay69: Análise profunda do Overclock Bot
 * - jockeyTool: Execução de ferramentas via TwelveLabs Jockey MCP
 */
import {
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  wrapItems,
} from "./types.js";
import { z } from "zod";
import {
  TwelveLabsClient,
  TwelveLabsIndexManager,
  TwelveLabsVideoIngest,
  TwelveLabsVideoAnalyzer,
  TwelveLabsKnowledgeExporter,
} from "../twelvelabs/index.js";

export const twelveLabsNodeConfigSchema = z.object({
  operation: z
    .enum([
      "createIndex",
      "ingestVideo",
      "semanticSearch",
      "generateSummary",
      "analyzeGenesisDay69",
      "jockeyTool",
    ])
    .default("analyzeGenesisDay69"),
  indexId: z.string().optional(),
  indexName: z.string().optional(),
  videoId: z.string().optional(),
  videoUrl: z.string().optional(),
  query: z.string().optional(),
  prompt: z.string().optional(),
  toolName: z.string().optional(),
  toolArguments: z.record(z.unknown()).optional(),
  apiKey: z.string().optional(),
  mock: z.boolean().optional(),
});

export type TwelveLabsNodeConfig = z.infer<typeof twelveLabsNodeConfigSchema>;

export async function executeTwelveLabsNode(
  config: Record<string, unknown>,
  input: unknown = {},
  _orgId: string = ""
): Promise<Record<string, unknown>> {
  const parsed = twelveLabsNodeConfigSchema.safeParse(config);
  const cfg: TwelveLabsNodeConfig = parsed.success
    ? parsed.data
    : {
        operation: (config.operation as any) || "analyzeGenesisDay69",
        indexId: config.indexId as string | undefined,
        indexName: config.indexName as string | undefined,
        videoId: config.videoId as string | undefined,
        videoUrl: config.videoUrl as string | undefined,
        query: config.query as string | undefined,
        prompt: config.prompt as string | undefined,
        toolName: config.toolName as string | undefined,
        toolArguments: config.toolArguments as Record<string, unknown> | undefined,
        apiKey: config.apiKey as string | undefined,
        mock: config.mock as boolean | undefined,
      };

  const client = new TwelveLabsClient({
    apiKey: cfg.apiKey,
    mock: cfg.mock,
  });

  const indexManager = new TwelveLabsIndexManager(client);
  const videoIngest = new TwelveLabsVideoIngest(client);
  const videoAnalyzer = new TwelveLabsVideoAnalyzer(client);

  const inputObj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const operation = cfg.operation;

  switch (operation) {
    case "createIndex": {
      const indexName = cfg.indexName || (inputObj.indexName as string) || "overclock-bot-genesis";
      const index = await indexManager.createModalIndex({ indexName });
      return { operation, index, success: true };
    }

    case "ingestVideo": {
      const indexId = cfg.indexId || (inputObj.indexId as string) || "idx_mock_day69_genesis";
      const videoUrl = cfg.videoUrl || (inputObj.videoUrl as string) || (inputObj.url as string);
      const videoTitle = (inputObj.videoTitle as string) || "Overclock Bot Genesis Video";
      const task = await videoIngest.createIngestTask({ indexId, videoUrl, videoTitle });
      return { operation, task, success: true };
    }

    case "semanticSearch": {
      const indexId = cfg.indexId || (inputObj.indexId as string) || "idx_mock_day69_genesis";
      const query = cfg.query || (inputObj.query as string) || "Playwright setup and noVNC";
      const results = await videoAnalyzer.semanticSearch({ indexId, query });
      return { operation, ...results, success: true };
    }

    case "generateSummary": {
      const videoId = cfg.videoId || (inputObj.videoId as string) || "vid_mock_day69_bot_genesis";
      const prompt = cfg.prompt || (inputObj.prompt as string) || "Summarize the architectural decisions made in this video.";
      const summary = await videoAnalyzer.generateVideoText({ videoId, prompt });
      return { operation, videoId, summary, success: true };
    }

    case "jockeyTool": {
      const toolName = cfg.toolName || (inputObj.toolName as string) || "search_video";
      const args = cfg.toolArguments || (inputObj.toolArguments as Record<string, unknown>) || {};
      const jockeyRes = await client.executeJockeyTool(toolName, args);
      return { operation, ...jockeyRes, success: true };
    }

    case "analyzeGenesisDay69":
    default: {
      const videoId = cfg.videoId || (inputObj.videoId as string) || "vid_mock_day69_bot_genesis";
      const analysis = await videoAnalyzer.analyzeDay69Genesis(videoId);
      const markdown = TwelveLabsKnowledgeExporter.formatToMarkdown(analysis);
      const exportRes = await TwelveLabsKnowledgeExporter.exportToFile(analysis);

      return {
        operation: "analyzeGenesisDay69",
        videoId: analysis.videoId,
        title: analysis.title,
        architecture: analysis.architecture,
        stepByStepDecisions: analysis.stepByStepDecisions,
        executionLogsAndCommands: analysis.executionLogsAndCommands,
        pitfallsAndTroubleshooting: analysis.pitfallsAndTroubleshooting,
        markdownDocument: markdown,
        exportedFilePath: exportRes.filePath,
        bytesWritten: exportRes.bytesWritten,
        success: true,
      };
    }
  }
}

export class TwelveLabsNodeHandler implements NodeHandler {
  type = "twelveLabs";
  category = "ai";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const rawResult = await executeTwelveLabsNode(
      ctx.nodeConfig,
      ctx.input,
      ctx.orgId
    );

    return {
      items: wrapItems([rawResult]),
      logs: [`[TwelveLabsNode] Executed operation ${(ctx.nodeConfig as any)?.operation || "analyzeGenesisDay69"}`],
    };
  }
}
