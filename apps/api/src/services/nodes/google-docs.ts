import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class GoogleDocsNodeHandler implements NodeHandler {
  type = "googleDocs";
  category = "productivity";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const operation = String(config.operation ?? "createDocument");
    const title = String(config.title ?? "Untitled Document");
    const content = String(config.content ?? config.text ?? "");

    const item: NodeItem = {
      json: {
        operation,
        documentId: `doc_${Date.now()}`,
        title,
        contentLength: content.length,
        documentUrl: `https://docs.google.com/document/d/doc_${Date.now()}/edit`,
        timestamp: new Date().toISOString(),
      },
    };

    return {
      items: [item],
      logs: [`Google Docs: ${operation} completed (${title})`],
    };
  }
}
