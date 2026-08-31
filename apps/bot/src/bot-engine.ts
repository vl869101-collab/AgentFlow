import { EventEmitter } from "events";
import { BrowserController } from "./browser-controller.js";
import {
  type BotMode,
  type BotSessionState,
  type BotTask,
  type BrowserAction,
  type McpToolCall,
} from "./types.js";

export interface BotRuntimeConfig {
  sessionId?: string;
  apiUrl?: string;
  apiKey?: string;
  orgId?: string;
  noVncPort?: number;
  botPort?: number;
}

export class BotRuntimeEngine extends EventEmitter {
  private browserController: BrowserController;
  private state: BotSessionState;
  private tasks: Map<string, BotTask> = new Map();
  private actionHistory: BrowserAction[] = [];
  private mcpCalls: McpToolCall[] = [];
  private config: Required<BotRuntimeConfig>;
  private isRunning = false;

  constructor(config: BotRuntimeConfig = {}) {
    super();
    const sessionId = config.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.config = {
      sessionId,
      apiUrl: config.apiUrl || process.env.AGENTFLOW_API_URL || "http://localhost:4000",
      apiKey: config.apiKey || process.env.AGENTFLOW_API_KEY || "af_bot_default_key",
      orgId: config.orgId || process.env.AGENTFLOW_ORG_ID || "default-org",
      noVncPort: config.noVncPort || parseInt(process.env.NOVNC_PORT || "6080", 10),
      botPort: config.botPort || parseInt(process.env.BOT_PORT || "8080", 10),
    };

    this.browserController = new BrowserController();
    this.state = {
      sessionId,
      mode: "ai_autonomous",
      status: "idle",
      currentUrl: "about:blank",
      pageTitle: "AgentFlow Browser",
      resolution: { width: 1920, height: 1080 },
      activeTaskId: null,
      actionsCount: 0,
      connectedClients: 0,
      noVncUrl: `http://localhost:${this.config.noVncPort}/vnc.html?autoconnect=true`,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      await this.browserController.init();
      this.state.status = "idle";
      this.state.currentUrl = await this.browserController.getCurrentUrl();
      this.state.pageTitle = await this.browserController.getPageTitle();
    } catch {
      // Running in headless/mock mode
      this.state.status = "idle";
    }

    this.isRunning = true;
    this.emit("state:change", this.getState());
  }

  public getState(): BotSessionState {
    return { ...this.state, updatedAt: new Date().toISOString() };
  }

  public setMode(mode: BotMode): BotSessionState {
    const prevMode = this.state.mode;
    this.state.mode = mode;

    if (mode === "human_takeover") {
      this.state.status = "waiting_user_input";
      this.emit("human:takeover", { timestamp: new Date().toISOString() });
    } else if (mode === "ai_autonomous") {
      this.state.status = this.state.activeTaskId ? "busy" : "idle";
      this.emit("ai:resume", { timestamp: new Date().toISOString() });
    } else if (mode === "paused") {
      this.state.status = "paused";
      this.emit("paused", { timestamp: new Date().toISOString() });
    }

    this.emit("state:change", this.getState());
    this.emit("mode:change", { prevMode, newMode: mode });
    return this.getState();
  }

  public async executeBrowserAction(
    action: Omit<BrowserAction, "id" | "timestamp" | "status">
  ): Promise<BrowserAction> {
    if (this.state.mode === "human_takeover") {
      throw new Error("Cannot execute autonomous AI action while Human Takeover mode is active");
    }

    if (this.state.mode === "paused") {
      throw new Error("Bot runtime is paused");
    }

    this.state.status = "busy";
    this.emit("state:change", this.getState());

    const result = await this.browserController.executeAction(action);
    this.actionHistory.push(result);
    this.state.actionsCount = this.actionHistory.length;
    this.state.currentUrl = await this.browserController.getCurrentUrl();
    this.state.pageTitle = await this.browserController.getPageTitle();

    if (result.screenshotBase64) {
      this.state.lastScreenshotBase64 = result.screenshotBase64;
    }

    this.state.status = this.state.activeTaskId ? "busy" : "idle";
    this.emit("action:executed", result);
    this.emit("state:change", this.getState());

    return result;
  }

  public createTask(title: string, description?: string, subtasks?: string[]): BotTask {
    const task: BotTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      description,
      status: "pending",
      progressPercent: 0,
      subtasks: subtasks?.map((st, i) => ({
        id: `st_${i + 1}`,
        title: st,
        completed: false,
      })),
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    this.emit("task:created", task);
    return task;
  }

  public updateTaskProgress(taskId: string, progressPercent: number, status?: BotTask["status"]): BotTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.progressPercent = Math.min(100, Math.max(0, progressPercent));
    if (status) task.status = status;
    if (progressPercent >= 100) task.status = "completed";
    task.updatedAt = new Date().toISOString();

    this.tasks.set(taskId, task);
    this.emit("task:updated", task);
    return task;
  }

  public async invokeMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCall> {
    const callStart = Date.now();
    const callRecord: McpToolCall = {
      id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      serverName,
      toolName,
      arguments: args,
      status: "running",
      executionTimeMs: 0,
      timestamp: new Date().toISOString(),
    };

    this.emit("mcp:call_start", callRecord);

    try {
      // Simulate or dispatch to AgentFlow MCP registry
      if (serverName === "browser" && toolName === "navigate") {
        const actionRes = await this.executeBrowserAction({
          type: "navigate",
          value: String(args.url || args.target || ""),
        });
        callRecord.response = { success: actionRes.status === "completed", currentUrl: this.state.currentUrl };
        callRecord.status = actionRes.status === "completed" ? "success" : "error";
      } else {
        // Generic MCP bridge dispatch mock/passthrough
        callRecord.response = { status: "dispatched", server: serverName, tool: toolName, args };
        callRecord.status = "success";
      }
    } catch (err: unknown) {
      callRecord.status = "error";
      callRecord.response = { error: err instanceof Error ? err.message : String(err) };
    } finally {
      callRecord.executionTimeMs = Date.now() - callStart;
      this.mcpCalls.push(callRecord);
      this.emit("mcp:call_end", callRecord);
    }

    return callRecord;
  }

  public getTasks(): BotTask[] {
    return Array.from(this.tasks.values());
  }

  public getActionHistory(): BrowserAction[] {
    return [...this.actionHistory];
  }

  public getMcpCalls(): McpToolCall[] {
    return [...this.mcpCalls];
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    await this.browserController.close();
    this.state.status = "idle";
    this.emit("stopped", { timestamp: new Date().toISOString() });
  }
}
