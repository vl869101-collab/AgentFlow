export type BotMode = "ai_autonomous" | "human_takeover" | "paused";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "reconnecting";

export type StreamProtocol = "novnc" | "webrtc" | "interactive_canvas";

export interface BotChatMessage {
  id: string;
  sender: "user" | "bot" | "system" | "tool";
  content: string;
  timestamp: string;
  thinking?: string;
  toolCall?: {
    name: string;
    server?: string;
    args: Record<string, unknown>;
    result?: unknown;
    status: "running" | "success" | "failed";
  };
  attachments?: Array<{
    type: "image" | "file";
    url: string;
    name: string;
  }>;
}

export interface BrowserAction {
  id: string;
  type: "navigate" | "click" | "type" | "scroll" | "wait" | "screenshot" | "extract" | "hover";
  target?: string;
  value?: string;
  timestamp: string;
  durationMs?: number;
  status: "pending" | "running" | "completed" | "failed";
  screenshotUrl?: string;
}

export interface BotTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progressPercent: number;
  subtasks?: Array<{
    id: string;
    title: string;
    completed: boolean;
  }>;
  createdAt: string;
}

export interface McpInvocation {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  response?: Record<string, unknown> | string;
  executionTimeMs: number;
  status: "success" | "error" | "running";
  timestamp: string;
}

export interface BrowserViewportState {
  currentUrl: string;
  pageTitle: string;
  zoom: number;
  isFullscreen: boolean;
  resolution: {
    width: number;
    height: number;
    name: "Desktop 1080p" | "Laptop 720p" | "Tablet" | "Mobile";
  };
  isLoading: boolean;
  fps: number;
  latencyMs: number;
  bandwidthMbps: number;
}
