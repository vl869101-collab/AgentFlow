import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeCodeInSandbox,
  detectDangerousPatterns,
  CodeExecutionDisabledError,
} from "../../src/services/nodes/code-sandbox.js";
import { CodeNodeHandler } from "../../src/services/nodes/code.js";

describe("Code Sandbox & Security", () => {
  const originalEnv = process.env.EXEC_CODE_DISABLED;

  beforeEach(() => {
    process.env.EXEC_CODE_DISABLED = "false";
  });

  afterEach(() => {
    process.env.EXEC_CODE_DISABLED = originalEnv;
  });

  it("executes safe JavaScript code and returns results with logs", async () => {
    const code = `
      console.log("Processing item:", $json.name);
      return { transformed: $json.name.toUpperCase(), count: $json.count * 2 };
    `;

    const n8nVars = {
      $json: { name: "AgentFlow", count: 21 },
      $input: { item: { json: { name: "AgentFlow", count: 21 } } },
    };

    const { result, logs } = await executeCodeInSandbox(code, n8nVars);
    expect(result).toEqual({ transformed: "AGENTFLOW", count: 42 });
    expect(logs.some((l) => l.includes("Processing item: AgentFlow"))).toBe(true);
  });

  it("blocks dangerous patterns (require, process, eval, Function, fetch, Buffer)", async () => {
    const patterns = [
      "const fs = require('fs');",
      "process.exit(1);",
      "eval('1 + 1');",
      "new Function('return 1')();",
      "fetch('https://malicious.site');",
      "Buffer.from('test');",
    ];

    for (const code of patterns) {
      expect(detectDangerousPatterns(code).length).toBeGreaterThan(0);
      await expect(executeCodeInSandbox(code, {})).rejects.toThrow("CODE_SECURITY_BLOCK");
    }
  });

  it("enforces timeout on long-running code (infinite loops)", async () => {
    const infiniteLoop = "while(true) {}";
    await expect(
      executeCodeInSandbox(infiniteLoop, {}, { timeoutMs: 100 }),
    ).rejects.toThrow("CODE_TIMEOUT");
  });

  it("throws CodeExecutionDisabledError when EXEC_CODE_DISABLED is true", async () => {
    process.env.EXEC_CODE_DISABLED = "true";

    const code = "return { ok: true };";
    await expect(executeCodeInSandbox(code, {})).rejects.toThrow(CodeExecutionDisabledError);

    const handler = new CodeNodeHandler();
    await expect(
      handler.execute({
        executionId: "1",
        nodeId: "code-1",
        workflowId: "wf-1",
        orgId: "org-1",
        nodeConfig: { parameters: { jsCode: code } },
        input: { name: "test" },
      }),
    ).rejects.toThrow(CodeExecutionDisabledError);
  });

  it("CodeNodeHandler executes runOnceForEachItem and runOnceForAllItems", async () => {
    process.env.EXEC_CODE_DISABLED = "false";
    const handler = new CodeNodeHandler();

    // Mode 1: runOnceForEachItem
    const resultItem = await handler.execute({
      executionId: "1",
      nodeId: "code-1",
      workflowId: "wf-1",
      orgId: "org-1",
      nodeConfig: {
        parameters: {
          mode: "runOnceForEachItem",
          jsCode: "return { itemValue: $json.val * 10 };",
        },
      },
      input: [{ val: 1 }, { val: 2 }, { val: 3 }],
    });

    expect(resultItem.items).toEqual([
      { json: { itemValue: 10 } },
      { json: { itemValue: 20 } },
      { json: { itemValue: 30 } },
    ]);

    // Mode 2: runOnceForAllItems
    const resultAll = await handler.execute({
      executionId: "2",
      nodeId: "code-2",
      workflowId: "wf-1",
      orgId: "org-1",
      nodeConfig: {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: "const items = $input.all(); return { totalCount: items.length };",
        },
      },
      input: [{ val: 1 }, { val: 2 }, { val: 3 }],
    });

    expect(resultAll.items).toEqual([{ json: { totalCount: 3 } }]);
  });
});
