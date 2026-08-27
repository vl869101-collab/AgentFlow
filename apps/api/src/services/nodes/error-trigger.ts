import { z } from "zod";
import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";

export const ErrorTriggerPayloadSchema = z.object({
  errorMessage: z.string().default("Unhandled Workflow Error"),
  errorCode: z.string().default("NODE_EXECUTION_FAILED"),
  failedNodeId: z.string().default("unknown_node"),
  failedNodeType: z.string().default("unknown_type"),
  executionId: z.string().optional(),
  workflowId: z.string().optional(),
  timestamp: z.string().default(() => new Date().toISOString()),
  retryCount: z.number().default(0),
  inputData: z.unknown().optional(),
  stack: z.string().optional(),
}).passthrough();

export type ErrorTriggerPayload = z.infer<typeof ErrorTriggerPayloadSchema> & {
  [key: string]: unknown;
};

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
    const inputData = rawInput.inputData !== undefined ? rawInput.inputData : errorObj.inputData !== undefined ? errorObj.inputData : rawInput.input;
    const stack = typeof rawInput.stack === "string" ? rawInput.stack : typeof errorObj.stack === "string" ? errorObj.stack : undefined;
    const timestamp = typeof rawInput.timestamp === "string" ? rawInput.timestamp : typeof errorObj.timestamp === "string" ? errorObj.timestamp : new Date().toISOString();
    const executionId = ctx.executionId || (typeof rawInput.executionId === "string" ? rawInput.executionId : typeof errorObj.executionId === "string" ? errorObj.executionId : undefined);
    const workflowId = ctx.workflowId || (typeof rawInput.workflowId === "string" ? rawInput.workflowId : typeof errorObj.workflowId === "string" ? errorObj.workflowId : undefined);

    const parsed = ErrorTriggerPayloadSchema.safeParse({
      errorMessage,
      errorCode,
      failedNodeId,
      failedNodeType,
      executionId,
      workflowId,
      timestamp,
      retryCount,
      inputData,
      stack,
      ...rawInput,
    });

    const errorPayload: ErrorTriggerPayload = parsed.success
      ? (parsed.data as ErrorTriggerPayload)
      : {
          errorMessage,
          errorCode,
          failedNodeId,
          failedNodeType,
          executionId,
          workflowId,
          timestamp,
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
