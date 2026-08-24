import { z } from "zod";

export type JsonObject = Record<string, unknown>;

export const EVALUATION_TRIGGER_TYPE = "evaluationTrigger";
export const EVALUATION_TRIGGER_NATIVE_TYPE = "n8n-nodes-base.evaluationTrigger";
export const EVALUATION_TRIGGER_VERSION = 4.7 as const;

export const EvaluationTriggerOptionsSchema = z
	.object({
		rawData: z.boolean().optional(),
	})
	.passthrough();

export const EvaluationTriggerParametersSchema = z
	.object({
		dataTableId: z.unknown().optional(),
		runEvaluation: z.boolean().optional().default(false),
		options: EvaluationTriggerOptionsSchema.optional(),
	})
	.passthrough();

export const EvaluationTriggerParamsSchema = z
	.object({
		typeVersion: z
			.number()
			.optional()
			.default(EVALUATION_TRIGGER_VERSION),
		originalN8nType: z
			.string()
			.optional()
			.default(EVALUATION_TRIGGER_NATIVE_TYPE),
		originalN8nId: z.string().optional(),
		parameters: EvaluationTriggerParametersSchema.optional().default({}),
	})
	.passthrough();

export type EvaluationTriggerParams = z.infer<typeof EvaluationTriggerParamsSchema>;

export interface EvaluationTriggerConfig {
	typeVersion?: number;
	originalN8nType?: string;
	originalN8nId?: string;
	parameters?: Record<string, unknown>;
}

export interface EvaluationTriggerResult {
	items: Array<{ json: JsonObject; binary: JsonObject }>;
	_trigger: "evaluationTrigger";
	_config: {
		dataTableId: unknown;
		runEvaluation: boolean;
		typeVersion: number;
		originalN8nType: string;
		originalN8nId: string | undefined;
	};
}

export function buildEvaluationTriggerConfig(
	dataTableId: unknown = null,
	overrides: Partial<EvaluationTriggerConfig> = {},
): JsonObject {
	return {
		typeVersion: EVALUATION_TRIGGER_VERSION,
		originalN8nType: EVALUATION_TRIGGER_NATIVE_TYPE,
		parameters: {
			dataTableId,
			runEvaluation: false,
		},
		...overrides,
	};
}

export function isEvaluationTrigger(config: unknown): boolean {
	if (!config || typeof config !== "object") return false;
	const obj = config as JsonObject;
	const originalType = obj.originalN8nType;
	if (
		typeof originalType === "string" &&
		originalType === EVALUATION_TRIGGER_NATIVE_TYPE
	) {
		return true;
	}
	const params = obj.parameters as JsonObject | undefined;
	if (params && typeof params.dataTableId !== "undefined") return true;
	return false;
}

export function parseEvaluationTriggerConfig(config: unknown): EvaluationTriggerParams {
	return EvaluationTriggerParamsSchema.parse(config);
}

export function asObject(value: unknown): JsonObject {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: {};
}

export function executeEvaluationTrigger(
	config: EvaluationTriggerConfig,
	input?: unknown,
): EvaluationTriggerResult {
	const params = EvaluationTriggerParamsSchema.parse(config);
	const resolvedInput = asObject(input);

	const result: EvaluationTriggerResult = {
		items: [{ json: { ...resolvedInput }, binary: {} }],
		_trigger: EVALUATION_TRIGGER_TYPE,
		_config: {
			dataTableId: params.parameters.dataTableId,
			runEvaluation: params.parameters.runEvaluation,
			typeVersion: params.typeVersion,
			originalN8nType: params.originalN8nType,
			originalN8nId: params.originalN8nId,
		},
	};

	return result;
}
