import { z } from "zod";

/**
 * 5-Field Contract (Job, Sources, Judgment, Output, Forbidden)
 * Specification and validation for autonomous / AI workflow nodes.
 *
 * Rules:
 * - job: Clear description of the task / objective (required, non-empty string).
 * - sources: Upstream node IDs or allowed data inputs (array of strings, default empty).
 * - judgment: Operational boundaries, evaluation criteria, reasoning rules, or confidence thresholds.
 * - output: Expected schema, JSON structure, or description of output contract.
 * - forbidden: Explicit safety boundaries and disallowed actions (array of strings).
 *
 * Acceptance rule:
 * - Autonomous nodes performing external actions (isExternalAction: true) MUST
 *   define at least one non-empty rule in `forbidden`.
 */
const baseFiveFieldContractSchema = z
  .object({
    job: z.string().min(1, "Job description is required"),
    sources: z.array(z.string()).default([]),
    judgment: z.union([z.string().min(1, "Judgment criteria is required"), z.record(z.unknown())]),
    output: z.union([z.record(z.unknown()), z.string().min(1, "Output specification is required"), z.array(z.unknown())]),
    forbidden: z.array(z.string().min(1)).default([]),
    isExternalAction: z.boolean().optional().default(false),
  })
  .superRefine((contract, ctx) => {
    if (contract.isExternalAction && (!contract.forbidden || contract.forbidden.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Autonomous nodes performing external actions must define at least one 'forbidden' rule",
        path: ["forbidden"],
      });
    }
  });

export const fiveFieldContractSchema = z.preprocess((val) => {
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return {
      job: obj.job ?? obj.Job,
      sources: obj.sources ?? obj.Sources ?? [],
      judgment: obj.judgment ?? obj.Judgment,
      output: obj.output ?? obj.Output,
      forbidden: obj.forbidden ?? obj.Forbidden ?? [],
      isExternalAction:
        obj.isExternalAction ?? obj.IsExternalAction ?? obj.externalAction ?? obj.ExternalAction ?? false,
    };
  }
  return val;
}, baseFiveFieldContractSchema);

export type FiveFieldContract = z.infer<typeof fiveFieldContractSchema>;

/**
 * Validates a node configuration against the 5-Field Contract.
 * Throws ZodError if invalid.
 */
export function validateFiveFieldContract(data: unknown): FiveFieldContract {
  return fiveFieldContractSchema.parse(data);
}
