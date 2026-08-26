// Cron / Schedule Trigger node handler.
import { z } from "zod";

export const CronTriggerInputSchema = z.object({
  cronExpression: z.string().optional().default("*/5 * * * *"),
  expression: z.string().optional(),
  timezone: z.string().optional().default("UTC"),
  interval: z.number().optional(),
  unit: z.enum(["seconds", "minutes", "hours", "days"]).optional(),
}).passthrough();

export type CronTriggerInput = z.infer<typeof CronTriggerInputSchema>;

export function executeCronTrigger(config: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, any>) : {};
  const cronExpression = String(config.cronExpression || config.expression || "*/5 * * * *");
  const timezone = String(config.timezone || "UTC");
  const now = new Date();

  return {
    ...raw,
    timestamp: now.toISOString(),
    scheduledTime: now.toISOString(),
    cronExpression,
    timezone,
    _trigger: "cronTrigger",
    _config: config,
  };
}
