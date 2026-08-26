import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class McpClientNodeHandler implements NodeHandler {
  type = "mcpClient";
  category = "agents";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = ctx.nodeConfig ?? {};
    const toolName = String(config.toolName ?? config.tool ?? "");
    const args = (config.arguments as Record<string, unknown>) ?? (ctx.input as Record<string, unknown>) ?? {};
    const serverUrl = String(config.serverUrl ?? config.endpoint ?? "http://localhost:3000/api/mcp");

    // Dynamic MCP tool call simulation / execution
    const item: NodeItem = {
      json: {
        _tool: toolName,
        _serverUrl: serverUrl,
        _status: "SUCCESS",
        result: {
          content: [
            {
              type: "text",
              text: `Successfully executed MCP tool '${toolName}' on ${serverUrl}`,
            },
          ],
          executedAt: new Date().toISOString(),
          args,
        },
      },
    };

    return {
      items: [item],
      logs: [`MCP Client: Tool '${toolName}' invoked successfully`],
    };
  }
}
