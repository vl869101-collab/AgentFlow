import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem } from "./types.js";

export class ErrorTriggerNodeHandler implements NodeHandler {
  type = "errorTrigger";
  category = "trigger";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = (ctx.input as Record<string, unknown>) ?? {};
    const item: NodeItem = {
      json: {
        errorMessage: String(input.errorMessage ?? input.error ?? "Unhandled Workflow Error"),
        errorCode: String(input.errorCode ?? "NODE_EXECUTION_FAILED"),
        failedNodeId: String(input.failedNodeId ?? "unknown_node"),
        failedNodeType: String(input.failedNodeType ?? "unknown_type"),
        executionId: ctx.executionId,
        workflowId: ctx.workflowId,
        timestamp: new Date().toISOString(),
        ...input,
      },
    };

    return { items: [item] };
  }
}
