/**
 * TwelveLabs Video Intelligence SDK & API Client Types
 */

export interface TwelveLabsConfig {
  apiKey?: string;
  baseUrl?: string;
  mock?: boolean;
}

export type EngineFamily = "marengo" | "pegasus";

export interface EngineOptions {
  engineName: string;
  engineOptions: Array<"visual" | "conversation" | "text_in_video" | "logo">;
}

export interface CreateIndexRequest {
  indexName: string;
  models: EngineOptions[];
  addons?: string[];
}

export interface IndexResponse {
  id: string;
  indexName: string;
  models: EngineOptions[];
  videoCount: number;
  totalDuration: number;
  createdAt: string;
  updatedAt: string;
}

export interface IngestTaskRequest {
  indexId: string;
  videoUrl?: string;
  filePath?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  videoTitle?: string;
}

export interface IngestTaskResponse {
  taskId: string;
  indexId: string;
  status: "pending" | "validating" | "indexing" | "ready" | "failed";
  videoId?: string;
  progress?: number;
  estimatedTime?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticSearchRequest {
  indexId: string;
  query: string;
  searchOptions?: Array<"visual" | "conversation" | "text_in_video">;
  threshold?: "high" | "medium" | "low" | "none";
  pageLimit?: number;
}

export interface SearchMatch {
  videoId: string;
  videoTitle?: string;
  start: number; // in seconds
  end: number;   // in seconds
  confidence: "high" | "medium" | "low";
  score: number;
  thumbnailUrl?: string;
  module?: string;
}

export interface SemanticSearchResponse {
  query: string;
  pool: {
    totalCount: number;
    totalDuration: number;
  };
  matches: SearchMatch[];
}

export interface GenerateAnalysisRequest {
  videoId: string;
  prompt: string;
  type?: "summary" | "chapter" | "highlight" | "custom_structured";
  stream?: boolean;
}

export interface GenesisAnalysisResult {
  videoId: string;
  title: string;
  date: string;
  summary: string;
  architecture: {
    runtime: string;
    browserEngine: string;
    displayProtocol: string;
    streamTransport: string;
    mcpIntegrations: string[];
    autonomousLoop: string;
  };
  stepByStepDecisions: Array<{
    timestamp: string;
    phase: string;
    author: string;
    decision: string;
    technicalContext: string;
    codeSnippetOrAction?: string;
  }>;
  executionLogsAndCommands: Array<{
    timestamp: string;
    command: string;
    intent: string;
    outputOrResult: string;
  }>;
  pitfallsAndTroubleshooting: Array<{
    issue: string;
    symptom: string;
    resolution: string;
    lessonLearned: string;
  }>;
}
