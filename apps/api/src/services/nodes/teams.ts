import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class TeamsNodeHandler implements NodeHandler {
  type = "teams";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const operation = String(config.operation ?? "sendMessage");
    const message = String(config.message ?? (ctx.input as any)?.message ?? "");
    const adaptiveCard = config.adaptiveCard;

    const item: NodeItem = {
      json: {
        operation,
        delivered: true,
        recipient: config.channelId ?? config.webhookUrl ?? "teams_default",
        message,
        adaptiveCard: adaptiveCard ?? null,
        timestamp: new Date().toISOString(),
      },
    };

    return {
      items: [item],
      logs: [`Teams node: executed ${operation}`],
    };
  }
}
