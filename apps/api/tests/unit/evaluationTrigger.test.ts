import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
	executeEvaluationTrigger,
	buildEvaluationTriggerConfig,
	parseEvaluationTriggerConfig,
	isEvaluationTrigger,
	asObject,
	EvaluationTriggerParamsSchema,
	EVALUATION_TRIGGER_TYPE,
	EVALUATION_TRIGGER_NATIVE_TYPE,
	EVALUATION_TRIGGER_VERSION,
} from "../../src/services/nodes/evaluationTrigger.js";
import { store, resetStore, workflowNodes, workflowEdges, workflowVersions } from "../../src/lib/store.js";

// Shared source (tsconfig paths don't map the workspace alias, so use a direct path)
import {
	NODE_TYPES,
	workflowNodeTypeSchema,
} from "../../../../packages/shared/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "../../../../n8n-migration/recriacao/fixtures/wf2-native-workflow.json");

describe("asObject", () => {
	it("returns plain objects as-is", () => {
		const obj = { a: 1, b: "x" };
		expect(asObject(obj)).toBe(obj);
	});

	it.each([null, undefined, [1, 2], "string", 42, true])(
		"returns {} for non-object input: %p",
		(value) => {
			expect(asObject(value)).toEqual({});
		},
	);
});

describe("EvaluationTriggerParamsSchema", () => {
	it("applies defaults for an empty config", () => {
		const parsed = EvaluationTriggerParamsSchema.parse({});
		expect(parsed.typeVersion).toBe(4.7);
		expect(parsed.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
		expect(parsed.parameters).toEqual({ runEvaluation: false });
	});

	it("parses a full config", () => {
		const parsed = EvaluationTriggerParamsSchema.parse({
			typeVersion: 4.7,
			originalN8nType: "n8n-nodes-base.evaluationTrigger",
			originalN8nId: "abc",
			parameters: { dataTableId: "dt-1", runEvaluation: true },
		});
		expect(parsed.parameters.dataTableId).toBe("dt-1");
		expect(parsed.parameters.runEvaluation).toBe(true);
		expect(parsed.originalN8nId).toBe("abc");
	});

	it("defaults runEvaluation to false when omitted", () => {
		const parsed = EvaluationTriggerParamsSchema.parse({
			parameters: { dataTableId: "dt-2" },
		});
		expect(parsed.parameters.runEvaluation).toBe(false);
		expect(parsed.parameters.dataTableId).toBe("dt-2");
	});

	it("passes through unknown parameters fields", () => {
		const parsed = EvaluationTriggerParamsSchema.parse({
			parameters: { dataTableId: "dt", extra: "keep" },
		});
		expect((parsed.parameters as Record<string, unknown>).extra).toBe("keep");
	});
});

describe("buildEvaluationTriggerConfig", () => {
	it("builds a native config with a dataTableId", () => {
		const cfg = buildEvaluationTriggerConfig("dt-1");
		expect(cfg.typeVersion).toBe(4.7);
		expect(cfg.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
		expect((cfg.parameters as Record<string, unknown>).dataTableId).toBe("dt-1");
	});

	it("applies overrides", () => {
		const cfg = buildEvaluationTriggerConfig("dt-1", { typeVersion: 1, originalN8nId: "n8n-xyz" });
		expect(cfg.typeVersion).toBe(1);
		expect(cfg.originalN8nId).toBe("n8n-xyz");
	});

	it("defaults dataTableId to null", () => {
		const cfg = buildEvaluationTriggerConfig();
		expect((cfg.parameters as Record<string, unknown>).dataTableId).toBeNull();
	});
});

describe("parseEvaluationTriggerConfig", () => {
	it("parses a valid config successfully", () => {
		const result = parseEvaluationTriggerConfig({
			typeVersion: 4.7,
			parameters: { dataTableId: "dt-3" },
		});
		expect(result.typeVersion).toBe(4.7);
		expect(result.parameters.dataTableId).toBe("dt-3");
	});
});

describe("isEvaluationTrigger", () => {
	it("returns true for originalN8nType matching evaluationTrigger", () => {
		expect(isEvaluationTrigger({ originalN8nType: "n8n-nodes-base.evaluationTrigger" })).toBe(true);
	});

	it("returns true when parameters contain a dataTableId", () => {
		expect(isEvaluationTrigger({ parameters: { dataTableId: "dt-4" } })).toBe(true);
	});

	it("returns false for null config", () => {
		expect(isEvaluationTrigger(null)).toBe(false);
	});

	it("returns false for empty config", () => {
		expect(isEvaluationTrigger({})).toBe(false);
	});

	it("returns false for a different node type", () => {
		expect(isEvaluationTrigger({ originalN8nType: "n8n-nodes-base.start" })).toBe(false);
	});
});

describe("executeEvaluationTrigger", () => {
	it("produces items + trigger metadata from object input", () => {
		const input = { row: { id: 1, name: "dataset row" } };
		const result = executeEvaluationTrigger(
			buildEvaluationTriggerConfig("dt-1"),
			input,
		);
		expect(result._trigger).toBe("evaluationTrigger");
		expect(result.items[0].json).toEqual(input);
		expect(result.items[0].binary).toEqual({});
		expect(result._config.dataTableId).toBe("dt-1");
		expect(result._config.typeVersion).toBe(4.7);
		expect(result._config.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
	});

	it("handles undefined input", () => {
		const result = executeEvaluationTrigger(buildEvaluationTriggerConfig());
		expect(result.items[0].json).toEqual({});
		expect(result._config.dataTableId).toBeNull();
	});

	it.each([null, [1, 2], "string", 42, true])(
		"coerces non-object input %p to empty json",
		(value) => {
			const result = executeEvaluationTrigger(buildEvaluationTriggerConfig(), value);
			expect(result.items[0].json).toEqual({});
		},
	);

	it("applies default typeVersion when omitted", () => {
		const result = executeEvaluationTrigger({ parameters: { dataTableId: "dt-2" } });
		expect(result._config.typeVersion).toBe(4.7);
	});

	it("preserves originalN8nId when provided", () => {
		const result = executeEvaluationTrigger({
			parameters: { dataTableId: "dt-5" },
			originalN8nId: "SkxlGdS2egKPhibM",
		});
		expect(result._config.originalN8nId).toBe("SkxlGdS2egKPhibM");
	});
});

describe("exported constants", () => {
	it("EVALUATION_TRIGGER_TYPE is 'evaluationTrigger'", () => {
		expect(EVALUATION_TRIGGER_TYPE).toBe("evaluationTrigger");
	});

	it("EVALUATION_TRIGGER_NATIVE_TYPE is the n8n node type", () => {
		expect(EVALUATION_TRIGGER_NATIVE_TYPE).toBe("n8n-nodes-base.evaluationTrigger");
	});

	it("EVALUATION_TRIGGER_VERSION is 4.7", () => {
		expect(EVALUATION_TRIGGER_VERSION).toBe(4.7);
	});
});

describe("registry integration", () => {
	it("evaluationTrigger is registered in NODE_TYPES", () => {
		expect(NODE_TYPES.some((n) => (n as { type: string }).type === "evaluationTrigger")).toBe(true);
	});

	it("evaluationTrigger is a valid workflow node type (registered enum)", () => {
		expect(workflowNodeTypeSchema.safeParse("evaluationTrigger").success).toBe(true);
	});
});

describe("native workflow fixture (wf2)", () => {
	let fixture: {
		description: string;
		native: {
			workflow: { name: string; status: string; n8nId: string };
			nodes: Array<{
				id: string;
				type: string;
				label: string;
				config: { typeVersion: number; originalN8nType: string; parameters: Record<string, unknown> };
				position: { x: number; y: number };
				isTrigger: boolean;
			}>;
			edges: unknown[];
			triggers: string[];
		};
	};

	beforeAll(() => {
		const raw = readFileSync(fixturePath, "utf-8");
		fixture = JSON.parse(raw);
	});

	it("has the correct workflow name and n8n id", () => {
		expect(fixture.native.workflow.name).toBe("My workflow");
		expect(fixture.native.workflow.n8nId).toBe("SkxlGdS2egKPhibM");
		expect(fixture.native.workflow.status).toBe("DRAFT");
	});

	it("recreates a single native evaluationTrigger node", () => {
		expect(fixture.native.nodes).toHaveLength(1);
		const node = fixture.native.nodes[0];
		expect(node.type).toBe("evaluationTrigger");
		expect(node.label).toBe("When fetching a dataset row");
		expect(node.isTrigger).toBe(true);
		expect(node.config.typeVersion).toBe(4.7);
		expect(node.config.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
		expect(node.config.parameters.dataTableId).toBeNull();
	});

	it("has zero edges (no connections)", () => {
		expect(fixture.native.edges).toHaveLength(0);
	});

	it("registers the trigger node id", () => {
		expect(fixture.native.triggers).toContain("node-eval-trigger-001");
	});

	it("is recognized by the handler predicate", () => {
		const node = fixture.native.nodes[0];
		expect(isEvaluationTrigger(node.config)).toBe(true);
	});

	it("runs the handler against the fixture node config", () => {
		const node = fixture.native.nodes[0];
		const result = executeEvaluationTrigger(node.config, { row: { id: 1 } });
		expect(result._trigger).toBe("evaluationTrigger");
		expect(result._config.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
		expect(result._config.dataTableId).toBeNull();
		expect(result.items[0].json).toEqual({ row: { id: 1 } });
	});
});

describe("store persistence (in-memory)", () => {
	beforeEach(() => resetStore());

	it("creates a native workflow with one evaluationTrigger node", async () => {
		const wf = await store.workflow.create({
			data: {
				id: "wf2-wf-test",
				name: "My workflow",
				description: null,
				status: "DRAFT",
				ownerId: "owner-test",
				orgId: "org-test",
			},
		});

		await store.workflowNode.createMany({
			data: [
				{
					id: "node-eval-trigger-001",
					type: "evaluationTrigger",
					label: "When fetching a dataset row",
					config: {
						typeVersion: 4.7,
						originalN8nType: "n8n-nodes-base.evaluationTrigger",
						originalN8nId: "SkxlGdS2egKPhibM",
						parameters: { dataTableId: null, runEvaluation: false },
					},
					position: { x: 250, y: 300 },
					width: 180,
					height: 60,
					workflowId: wf.id,
				},
			],
		});

		await store.workflowVersion.create({
			data: {
				id: "wf2-ver-test",
				version: 1,
				snapshot: { nodes: 1, edges: 0, trigger: "evaluationTrigger" },
				workflowId: wf.id,
			},
		});

		const nodes = Array.from(workflowNodes.values()).filter(
			(n) => n.workflowId === wf.id,
		);
		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe("evaluationTrigger");

		const edges = Array.from(workflowEdges.values()).filter(
			(e) => e.workflowId === wf.id,
		);
		expect(edges).toHaveLength(0);

		const versions = Array.from(workflowVersions.values()).filter(
			(v) => v.workflowId === wf.id,
		);
		expect(versions).toHaveLength(1);
		expect(versions[0].version).toBe(1);
	});

	it("executes the handler end-to-end via store node", async () => {
		const wf = await store.workflow.create({
			data: {
				id: "wf2-wf-e2e",
				name: "My workflow (e2e)",
				description: null,
				status: "DRAFT",
				ownerId: "owner-test",
				orgId: "org-test",
			},
		});

		const node = await store.workflowNode.create({
			data: {
				id: "node-eval-trigger-e2e",
				type: "evaluationTrigger",
				label: "When fetching a dataset row",
				config: buildEvaluationTriggerConfig("dt-e2e"),
				position: { x: 250, y: 300 },
				width: 180,
				height: 60,
				workflowId: wf.id,
			},
		});

		const result = executeEvaluationTrigger(
			node.config as Record<string, unknown>,
			{ id: 99, value: "row-data" },
		);

		expect(result._trigger).toBe("evaluationTrigger");
		expect(result._config.dataTableId).toBe("dt-e2e");
		expect(result.items[0].json).toEqual({ id: 99, value: "row-data" });
	});
});
