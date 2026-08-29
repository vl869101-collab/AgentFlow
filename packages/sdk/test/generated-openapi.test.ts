import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentFlowClient,
  componentSchemas,
  operationManifest,
  operationSchemas,
} from "../src/index.js";

test("TASK-18: generated SDK exports OpenAPI operations and Zod component contracts", () => {
  assert.ok(Object.keys(operationManifest).length >= 40);
  assert.equal(operationManifest.postApiAuthLogin.path, "/api/auth/login");
  assert.equal(operationManifest.getApiWorkflows.method, "GET");
  assert.equal(componentSchemas.ApiError.safeParse({ error: "Not found", code: "NOT_FOUND" }).success, true);
  assert.equal(operationSchemas.postApiAuthLogin.safeParse({
    path: {},
    query: {},
    body: { email: "dev@example.com", password: "StrongPass123" },
  }).success, true);
  assert.equal(operationSchemas.postApiAuthLogin.safeParse({ path: {}, query: {}, body: {} }).success, false);
});

test("TASK-18: generated requestOperation renders path/query and validates before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  globalThis.fetch = async (input) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ id: "wf-1", name: "Generated", status: "DRAFT" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new AgentFlowClient({ baseUrl: "https://sdk.example.test", token: "token" });
    await client.requestOperation("getApiWorkflowsById", {
      path: { id: "wf/1" },
      query: {},
      body: undefined,
    });
    assert.equal(calledUrl, "https://sdk.example.test/api/workflows/wf%2F1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
