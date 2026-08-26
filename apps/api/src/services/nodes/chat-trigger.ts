import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class ChatTriggerNodeHandler implements NodeHandler {
  type = "chatTrigger";
  category = "trigger";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = (ctx.input as Record<string, unknown>) ?? {};
    const message = String(input.message ?? input.prompt ?? input.query ?? "");
    const sessionId = String(input.sessionId ?? input.threadId ?? ctx.executionId);
    const history = Array.isArray(input.history) ? input.history : [];

    const item: NodeItem = {
      json: {
        message,
        sessionId,
        history,
        streaming: true,
        protocol: "sse",
        timestamp: new Date().toISOString(),
        ...input,
      },
    };

    return { items: [item] };
  }
}
