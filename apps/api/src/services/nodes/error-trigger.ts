import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";

export interface ErrorTriggerPayload {
  errorMessage: string;
  errorCode: string;
  failedNodeId: string;
  failedNodeType: string;
  executionId?: string;
  workflowId?: string;
  timestamp: string;
  retryCount?: number;
  inputData?: unknown;
  stack?: string;
  [key: string]: unknown;
}

export class ErrorTriggerNodeHandler implements NodeHandler {
  type = "errorTrigger";
  category = "trigger";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const rawInput = (ctx.input as Record<string, unknown>) ?? {};
    const errorObj = rawInput.error && typeof rawInput.error === "object" ? (rawInput.error as Record<string, unknown>) : {};

    const errorMessage = String(
      rawInput.errorMessage ?? rawInput.message ?? errorObj.message ?? rawInput.error ?? "Unhandled Workflow Error"
    );
    const errorCode = String(rawInput.errorCode ?? rawInput.code ?? errorObj.code ?? "NODE_EXECUTION_FAILED");
    const failedNodeId = String(rawInput.failedNodeId ?? errorObj.failedNodeId ?? ctx.nodeId ?? "unknown_node");
    const failedNodeType = String(rawInput.failedNodeType ?? errorObj.failedNodeType ?? "unknown_type");
    const retryCount = Number(rawInput.retryCount ?? errorObj.retryCount ?? 0);
    const inputData = rawInput.inputData ?? errorObj.inputData ?? rawInput.input;
    const stack = typeof rawInput.stack === "string" ? rawInput.stack : typeof errorObj.stack === "string" ? errorObj.stack : undefined;

    const errorPayload: ErrorTriggerPayload = {
      errorMessage,
      errorCode,
      failedNodeId,
      failedNodeType,
      executionId: ctx.executionId,
      workflowId: ctx.workflowId,
      timestamp: new Date().toISOString(),
      retryCount,
      inputData,
      stack,
      ...rawInput,
    };

    const item: NodeItem = {
      json: errorPayload,
    };

    return {
      items: [item],
      logs: [`ErrorTrigger: captured failure on node '${failedNodeId}' (${failedNodeType}): ${errorMessage}`],
    };
  }
}
