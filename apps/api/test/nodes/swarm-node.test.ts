import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeItemsSchema } from "@agentflow/shared";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createWorkflowExecution, nodeRequiresApproval, assertExecutionNotCancelled },
  { SwarmNodeHandler, SwarmNodeError, loadSidecarConfig, resolveSwarmSidecar, interpolateNodeScope },
] = await Promise.all([
  import("../../src/lib/prisma.js"),
  import("../../src/lib/store.js"),
  import("../../src/services/executor.js"),
  import("../../src/services/nodes/swarm.js"),
]);

test.beforeEach(() => resetStore());

const VALID_CONTRACT = {
  job: "Assess the incoming order risk",
  sources: [],
  judgment: "Be conservative and justify every score",
  output: { type: "object" },
  forbidden: [],
  isExternalAction: false,
};

function baseContext(overrides: Record<string, unknown> = {}) {
  const { executionId, ...nodeOverrides } = overrides;
  return {
    executionId: (executionId as string | undefined) ?? "exec-swarm-1",
    nodeId: "swarm-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      mcpEndpoint: "http://127.0.0.1:45999/mcp",
      token: "test-token",
      contract: VALID_CONTRACT,
      ...nodeOverrides,
    },
    input: { orderId: "ord_42" },
  } as const;
}

function rpcResponse(result: Record<string, unknown>) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function createCancelledExecution(status = "CANCELLED") {
  const org = await prisma.organization.create({ data: { name: "Swarm Org", slug: `swarm-${Date.now()}-${Math.random()}` } });
  const user = await prisma.user.create({
    data: { email: `swarm-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "Swarm User" },
  });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  const workflow = await prisma.workflow.create({
    data: { name: "Swarm Fixture", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });
  const execution = await createWorkflowExecution(workflow.id, { orderId: "ord_42" }, { trigger: "manual" });
  if (status !== "RUNNING") {
    await prisma.workflowExecution.update({ where: { id: execution.id }, data: { status } });
  }
  return execution;
}

// ═════════════════════════════════════════════════════════════════
// 1. Convergência com output estruturado
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: converges with structured output and sends Bearer auth over JSON-RPC", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    captured = { url: String(url), init };
    return rpcResponse({ output: { summary: "ok", agents: 3 }, usage: { totalTokens: 120 } });
  }) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    const result = await handler.execute(baseContext() as any);

    assert.equal(handler.type, "swarm");
    assert.equal(handler.category, "agents");
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].json.output, { summary: "ok", agents: 3 });
    assert.equal(result.items[0].json.iterations, 1);
    assert.equal(result.items[0].json.totalTokens, 120);
    assert.ok(NodeItemsSchema.safeParse(result.items).success);

    assert.equal(captured?.url, "http://127.0.0.1:45999/mcp");
    const headers = captured?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-token");
    const body = JSON.parse(String(captured?.init.body));
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.arguments.job, VALID_CONTRACT.job);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SwarmNodeHandler: iterates until output converges", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls < 3 ? rpcResponse({ usage: { totalTokens: 10 } }) : rpcResponse({ output: { done: true } });
  }) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    const result = await handler.execute(baseContext({ maxIterations: 3 }) as any);
    assert.equal(calls, 3);
    assert.equal(result.items[0].json.iterations, 3);
    assert.deepEqual(result.items[0].json.output, { done: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ═════════════════════════════════════════════════════════════════
// 2. Timeout estrito (SWARM_TIMEOUT)
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: aborts with SWARM_TIMEOUT when the sidecar hangs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ timeoutMs: 20 }) as any),
      (error: any) => {
        assert.equal(error.code, "SWARM_TIMEOUT");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ═════════════════════════════════════════════════════════════════
// 3. Orçamento de tokens (SWARM_TOKEN_BUDGET_EXCEEDED)
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: throws SWARM_TOKEN_BUDGET_EXCEEDED when tokens overflow", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => rpcResponse({ usage: { totalTokens: 150 } })) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ tokenBudget: 100 }) as any),
      (error: any) => {
        assert.equal(error.code, "SWARM_TOKEN_BUDGET_EXCEEDED");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SwarmNodeHandler: accumulates prompt + completion tokens against the budget", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    rpcResponse({ usage: { promptTokens: 60, completionTokens: 60 } })) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ tokenBudget: 100 }) as any),
      (error: any) => {
        assert.equal(error.code, "SWARM_TOKEN_BUDGET_EXCEEDED");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ═════════════════════════════════════════════════════════════════
// 4. Cancelamento em voo (assertExecutionNotCancelled)
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: fails fast when the execution is already CANCELLED", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return rpcResponse({ output: { ok: true } });
  }) as typeof fetch;

  try {
    const execution = await createCancelledExecution("CANCELLED");
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ executionId: execution.id }) as any),
      /cancel/i,
    );
    assert.equal(fetchCalled, false, "must not call the sidecar for a cancelled execution");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SwarmNodeHandler: re-checks cancellation between iterations", async () => {
  const originalFetch = globalThis.fetch;
  const execution = await createCancelledExecution("RUNNING");
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await prisma.workflowExecution.update({ where: { id: execution.id }, data: { status: "CANCELLED" } });
    return rpcResponse({ usage: { totalTokens: 5 } });
  }) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ executionId: execution.id, maxIterations: 3 }) as any),
      /cancel/i,
    );
    assert.equal(calls, 1, "second iteration must be blocked by the cancellation guard");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("assertExecutionNotCancelled: resolves for a live execution and rejects once cancelled", async () => {
  const execution = await createCancelledExecution("RUNNING");
  await assert.doesNotReject(assertExecutionNotCancelled(execution.id));
  await prisma.workflowExecution.update({ where: { id: execution.id }, data: { status: "CANCELLED" } });
  await assert.rejects(assertExecutionNotCancelled(execution.id));
});

// ═════════════════════════════════════════════════════════════════
// 5. Contrato de 5 campos
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: rejects a missing 5-field contract", async () => {
  const handler = new SwarmNodeHandler();
  await assert.rejects(
    handler.execute(baseContext({ contract: undefined, job: undefined }) as any),
    (error: any) => {
      assert.equal(error.code, "SWARM_CONTRACT_INVALID");
      return true;
    },
  );
});

test("SwarmNodeHandler: rejects a malformed 5-field contract", async () => {
  const handler = new SwarmNodeHandler();
  await assert.rejects(
    handler.execute(baseContext({ contract: { sources: [], forbidden: [] } }) as any),
    (error: any) => {
      assert.equal(error.code, "SWARM_CONTRACT_INVALID");
      return true;
    },
  );
});

test("SwarmNodeHandler: rejects isExternalAction=true with empty forbidden rules", async () => {
  const handler = new SwarmNodeHandler();
  await assert.rejects(
    handler.execute(
      baseContext({ contract: { ...VALID_CONTRACT, isExternalAction: true, forbidden: [] } }) as any,
    ),
    (error: any) => {
      assert.equal(error.code, "SWARM_CONTRACT_INVALID");
      return true;
    },
  );
});

test("SwarmNodeHandler: accepts isExternalAction=true when a forbidden rule exists", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => rpcResponse({ output: { ok: true } })) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    const result = await handler.execute(
      baseContext({
        contract: { ...VALID_CONTRACT, isExternalAction: true, forbidden: ["never delete data"] },
      }) as any,
    );
    assert.equal(result.items[0].json.isExternalAction, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ═════════════════════════════════════════════════════════════════
// 6. Sidecar ausente/corrompido (SWARM_SIDECAR_UNAVAILABLE)
// ═════════════════════════════════════════════════════════════════

test("SwarmNodeHandler: fails cleanly when the sidecar file is absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "swarm-sidecar-"));
  const missing = join(dir, "does-not-exist.json");

  assert.deepEqual(loadSidecarConfig(missing), {});
  await assert.rejects(
    (async () => {
      const handler = new SwarmNodeHandler();
      return handler.execute(
        baseContext({ mcpEndpoint: undefined, sidecarUrl: undefined, token: undefined, sidecarPath: missing }) as any,
      );
    })(),
    (error: any) => {
      assert.equal(error.code, "SWARM_SIDECAR_UNAVAILABLE");
      return true;
    },
  );
});

test("SwarmNodeHandler: fails cleanly when the sidecar file is corrupted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "swarm-sidecar-"));
  const corrupt = join(dir, "sidecar.json");
  writeFileSync(corrupt, "{ this is not json", "utf8");

  assert.deepEqual(loadSidecarConfig(corrupt), {});
  await assert.rejects(
    (async () => {
      const handler = new SwarmNodeHandler();
      return handler.execute(
        baseContext({ mcpEndpoint: undefined, sidecarUrl: undefined, token: undefined, sidecarPath: corrupt }) as any,
      );
    })(),
    (error: any) => {
      assert.equal(error.code, "SWARM_SIDECAR_UNAVAILABLE");
      return true;
    },
  );
});

test("resolveSwarmSidecar: reads mcp/token from a well-formed sidecar file", () => {
  const dir = mkdtempSync(join(tmpdir(), "swarm-sidecar-"));
  const file = join(dir, "sidecar.json");
  writeFileSync(file, JSON.stringify({ mcp: "http://127.0.0.1:41001/mcp", token: "from-disk" }), "utf8");
  const resolved = resolveSwarmSidecar({ sidecarPath: file });
  assert.equal(resolved.endpoint, "http://127.0.0.1:41001/mcp");
  assert.equal(resolved.token, "from-disk");
});

// ═════════════════════════════════════════════════════════════════
// 7. Isolamento de env (SWARM_ENV_ISOLATION_ERROR)
// ═════════════════════════════════════════════════════════════════

test("interpolateNodeScope: expands node-scoped variables", () => {
  const out = interpolateNodeScope("Order {{ input.orderId }} for {{ params.customer }}", {
    input: { orderId: "ord_9" },
    params: { customer: "ACME" },
  });
  assert.equal(out, "Order ord_9 for ACME");
});

test("SwarmNodeHandler: blocks process.env access in interpolations", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return rpcResponse({ output: { ok: true } });
  }) as typeof fetch;

  try {
    const handler = new SwarmNodeHandler();
    await assert.rejects(
      handler.execute(baseContext({ prompt: "Use {{process.env.SWARM_HOST_SECRET}}" }) as any),
      (error: any) => {
        assert.equal(error.code, "SWARM_ENV_ISOLATION_ERROR");
        return true;
      },
    );
    assert.equal(fetchCalled, false, "must never reach the sidecar after an env isolation violation");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("interpolateNodeScope: blocks env roots and host globals", () => {
  for (const template of ["{{env.SECRET}}", "{{global.process}}", "{{require('fs')}}"]) {
    assert.throws(() => interpolateNodeScope(template, {}), (error: any) => error.code === "SWARM_ENV_ISOLATION_ERROR");
  }
});

test("SwarmNodeError: carries a machine-readable code", () => {
  const error = new SwarmNodeError("boom", "SWARM_TIMEOUT", 504);
  assert.equal(error.code, "SWARM_TIMEOUT");
  assert.equal(error.statusCode, 504);
  assert.ok(error instanceof Error);
});

// ═════════════════════════════════════════════════════════════════
// 8. Approval gate (EXP-ESS-01 integration)
// ═════════════════════════════════════════════════════════════════

test("nodeRequiresApproval: swarm external actions pause for approval", () => {
  assert.equal(
    nodeRequiresApproval({ id: "s1", type: "swarm", config: { isExternalAction: true } } as any),
    true,
  );
  assert.equal(
    nodeRequiresApproval({ id: "s2", type: "swarm_node", config: { parameters: { isExternalAction: "true" } } } as any),
    true,
  );
  assert.equal(
    nodeRequiresApproval({ id: "s3", type: "swarmNode", config: { contract: { isExternalAction: true } } } as any),
    true,
  );
  assert.equal(
    nodeRequiresApproval({ id: "s4", type: "swarm", config: { isExternalAction: false } } as any),
    false,
  );
  assert.equal(nodeRequiresApproval({ id: "s5", type: "swarm", config: {} } as any), false);
});
