import { NodeExecutionContext, NodeExecutionResult, NodeHandler, NodeItem, wrapItems } from "./types.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

export interface FormField {
  name: string;
  label?: string;
  type?: "string" | "text" | "textarea" | "number" | "boolean" | "select" | "date" | "email";
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string | number } | string>;
  placeholder?: string;
  description?: string;
}

export interface FormNodeConfig {
  title?: string;
  description?: string;
  fields?: FormField[];
  timeoutHours?: number;
  expiresInSeconds?: number;
  [key: string]: unknown;
}

/**
 * Builds a dynamic Zod validation schema for a given list of form fields.
 */
export function buildFormZodSchema(fields: FormField[] = []): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "number": {
        schema = z.coerce.number();
        break;
      }
      case "boolean": {
        schema = z.preprocess((val) => {
          if (typeof val === "boolean") return val;
          if (val === "true" || val === "1" || val === 1) return true;
          if (val === "false" || val === "0" || val === 0) return false;
          return val;
        }, z.boolean());
        break;
      }
      case "email": {
        schema = z.string().email();
        break;
      }
      case "select": {
        if (field.options && field.options.length > 0) {
          const validValues = field.options.map((opt) => (typeof opt === "object" ? String(opt.value) : String(opt)));
          schema = z.string().refine((val) => validValues.includes(val), {
            message: `Value must be one of: ${validValues.join(", ")}`,
          });
        } else {
          schema = z.string();
        }
        break;
      }
      case "text":
      case "textarea":
      case "date":
      case "string":
      default: {
        schema = z.string();
        break;
      }
    }

    if (!field.required) {
      schema = schema.optional();
    }

    shape[field.name] = schema;
  }

  return z.object(shape);
}

export class FormNodeHandler implements NodeHandler {
  type = "form";
  category = "approval";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig ?? {}) as FormNodeConfig;
    const fields = config.fields ?? [
      { name: "approved", label: "Approve Request", type: "boolean", required: true },
      { name: "comments", label: "Comments", type: "textarea", required: false },
    ];
    const title = config.title ?? "Human Approval Required";
    const description = config.description ?? "";
    const token = `form_${randomUUID().replace(/-/g, "")}`;
    const timeoutHours = Number(config.timeoutHours ?? 24);
    const expiresAt = new Date(Date.now() + timeoutHours * 3600 * 1000).toISOString();

    const inputItems = wrapItems(ctx.input);
    const inputContext = inputItems[0]?.json ?? {};

    // Register approval in database if executionId exists
    if (ctx.executionId) {
      try {
        const execution = await prisma.workflowExecution.findUnique({ where: { id: ctx.executionId } });
        if (execution) {
          await prisma.approval.create({
            data: {
              id: token,
              executionId: ctx.executionId,
              userId: execution.userId || "system",
              status: "PENDING",
              message: title,
              context: {
                fields,
                title,
                description,
                nodeId: ctx.nodeId,
                workflowId: ctx.workflowId,
                expiresAt,
                input: inputContext,
              },
            },
          });

          await prisma.workflowExecution.update({
            where: { id: ctx.executionId },
            data: { status: "WAITING_APPROVAL" },
          });
        }
      } catch (err) {
        // In memory/offline tests without active execution records, continue gracefully
      }
    }

    const items: NodeItem[] = inputItems.map((item) => ({
      json: {
        ...item.json,
        _approvalToken: token,
        _approvalUrl: `/api/approvals/form/${token}`,
        _formTitle: title,
        _formDescription: description,
        _fields: fields,
        _expiresAt: expiresAt,
        _status: "WAITING_APPROVAL",
      },
      binary: item.binary,
    }));

    return {
      items,
      logs: [`Form node: generated HITL approval token ${token} (expires in ${timeoutHours}h)`],
    };
  }
}
