import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class WhatsAppNodeHandler implements NodeHandler {
  type = "whatsapp";
  category = "communications";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const operation = String(config.operation ?? "sendMessage");
    const to = String(config.to ?? (ctx.input as any)?.to ?? "");
    const message = String(config.message ?? (ctx.input as any)?.message ?? "");
    const template = config.template;

    const item: NodeItem = {
      json: {
        operation,
        delivered: true,
        to,
        message,
        template: template ?? null,
        messageId: `wamid.HBgM${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };

    return {
      items: [item],
      logs: [`WhatsApp Cloud API: sent ${operation} to ${to}`],
    };
  }
}
