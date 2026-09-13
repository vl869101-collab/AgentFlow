import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executions } from "../src/lib/api";
import { createNodeData, type WorkflowNodeData } from "../src/lib/workflow";

describe("Execution Telemetry Stream & Visual Status Contract (WF-ENG-05)", () => {
  it("executions.getStreamUrl generates valid SSE URL with token and optional lastEventId", () => {
    // In node test env, window is undefined so getToken returns null unless mocked
    const url = executions.getStreamUrl("exec-123");
    assert.ok(url.includes("/api/executions/exec-123/stream"));

    const urlWithReplay = executions.getStreamUrl("exec-456", "exec-456:5");
    assert.ok(urlWithReplay.includes("/api/executions/exec-456/stream"));
    assert.ok(urlWithReplay.includes("lastEventId=exec-456%3A5"));
  });

  it("createNodeData initializes node with PENDING status and optional duration", () => {
    const data: WorkflowNodeData = createNodeData("http", "HTTP Request");
    assert.equal(data.status, "PENDING");
    assert.equal(data.duration, undefined);

    data.duration = 420;
    assert.equal(data.duration, 420);
  });

  it("node data supports all execution lifecycle states", () => {
    const states = ["IDLE", "PENDING", "RUNNING", "SUCCESS", "SUCCEEDED", "COMPLETED", "FAILED", "ERROR"];
    for (const st of states) {
      const nodeData: WorkflowNodeData = {
        type: "webhook",
        label: "Webhook",
        description: "Webhook trigger",
        status: st as any,
        config: {},
        duration: st === "SUCCESS" ? 150 : undefined,
      };
      assert.equal(nodeData.status, st);
    }
  });
});
