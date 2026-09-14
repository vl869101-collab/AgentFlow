import assert from "node:assert/strict";
import test from "node:test";

delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [
  { prisma },
  { resetStore },
  { buildApp },
  {
    SubworkflowNodeHandler,
    ExecuteWorkflowNodeHandler,
  },
  {
    validateSubworkflowRecursion,
    detectSubworkflowCycle,
    extractSubworkflowTarget,
    CyclicSubworkflowError,
  },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/server.js"),
  import("../src/services/nodes/subworkflow.js"),
  import("../src/services/workflow-validator.js"),
]);

test.beforeEach(() => {
  resetStore();
});

test("WF-ENG Item 6: Canonical SubworkflowNodeHandler export and inheritance", () => {
  const handler = new SubworkflowNodeHandler();
  assert.equal(handler.type, "subworkflow");
  assert.equal(handler.category, "advanced");
  assert.ok(handler instanceof ExecuteWorkflowNodeHandler);
  assert.equal(typeof handler.execute, "function");
});

test("WF-ENG Item 6: Target identifier extraction from diverse node configurations", () => {
  // 1. Direct subworkflow node with workflowId
  const target1 = extractSubworkflowTarget({
    type: "subworkflow",
    config: { workflowId: "wf-child-1" },
  });
  assert.equal(target1, "wf-child-1");

  // 2. executeWorkflow node with parameters.alias
  const target2 = extractSubworkflowTarget({
    type: "executeWorkflow",
    config: { parameters: { alias: "order-processor" } },
  });
  assert.equal(target2, "order-processor");

  // 3. execute_workflow node with parameters.workflowName
  const target3 = extractSubworkflowTarget({
    type: "execute_workflow",
    config: { parameters: { workflowName: "Email Notifier" } },
  });
  assert.equal(target3, "Email Notifier");

  // 4. sub_workflow with data.config.workflowSlug
  const target4 = extractSubworkflowTarget({
    data: {
      type: "sub_workflow",
      config: { workflowSlug: "invoice-pdf-gen" },
    },
  });
  assert.equal(target4, "invoice-pdf-gen");

  // 5. Non-subworkflow node returns null
  const targetNone = extractSubworkflowTarget({
    type: "http",
    config: { url: "https://example.com" },
  });
  assert.equal(targetNone, null);
});

test("WF-ENG Item 6: Subworkflow execution with tenant-scoped alias resolution (id, name, slug)", async () => {
  const orgA = "org-alias-test-a";
  const orgB = "org-alias-test-b";

  // Create target child workflow in Org A
  const childWfA = await prisma.workflow.create({
    data: {
      id: "wf-child-target-1",
      name: "Customer Onboarding Flow",
      slug: "customer-onboarding",
      orgId: orgA,
      nodes: {
        create: [
          { id: "c-trig", type: "executeWorkflowTrigger", config: {} },
          { id: "c-out", type: "output", config: {} },
        ],
      },
      edges: {
        create: [{ id: "c-e1", source: "c-trig", target: "c-out" }],
      },
      versions: {
        create: {
          version: 1,
          snapshot: {
            nodes: [
              { id: "c-trig", type: "executeWorkflowTrigger", config: {} },
              { id: "c-out", type: "output", config: {} },
            ],
            edges: [{ id: "c-e1", source: "c-trig", target: "c-out" }],
          },
        },
      },
    },
  });

  // Create decoy child workflow in Org B with same name and slug
  await prisma.workflow.create({
    data: {
      id: "wf-child-decoy-b",
      name: "Customer Onboarding Flow",
      slug: "customer-onboarding",
      orgId: orgB,
      nodes: {
        create: [
          { id: "b-trig", type: "executeWorkflowTrigger", config: {} },
        ],
      },
    },
  });

  const handler = new SubworkflowNodeHandler();

  // Test 1: Resolve by exact ID
  const resultId = await handler.execute({
    executionId: "exec-parent-1",
    nodeId: "node-sub-1",
    workflowId: "wf-parent-main",
    orgId: orgA,
    nodeConfig: {
      type: "subworkflow",
      workflowId: childWfA.id,
      mode: "sync",
    },
    input: [{ user: "Alice" }],
  });
  assert.ok(resultId.items);

  // Test 2: Resolve by exact Name
  const resultName = await handler.execute({
    executionId: "exec-parent-2",
    nodeId: "node-sub-2",
    workflowId: "wf-parent-main",
    orgId: orgA,
    nodeConfig: {
      type: "subworkflow",
      workflowName: "Customer Onboarding Flow",
      mode: "sync",
    },
    input: [{ user: "Bob" }],
  });
  assert.ok(resultName.items);

  // Test 3: Resolve by Slug / Normalized Alias
  const resultSlug = await handler.execute({
    executionId: "exec-parent-3",
    nodeId: "node-sub-3",
    workflowId: "wf-parent-main",
    orgId: orgA,
    nodeConfig: {
      type: "subworkflow",
      alias: "customer-onboarding",
      mode: "sync",
    },
    input: [{ user: "Charlie" }],
  });
  assert.ok(resultSlug.items);

  // Test 4: Tenant isolation - Org B cannot access Org A's workflow even by name
  await assert.rejects(
    async () => {
      await handler.execute({
        executionId: "exec-parent-4",
        nodeId: "node-sub-4",
        workflowId: "wf-parent-main",
        orgId: "org-unauthorized-intruder",
        nodeConfig: {
          type: "subworkflow",
          workflowId: childWfA.id,
        },
        input: [],
      });
    },
    (err: any) => {
      return String(err.message).includes("not found or access denied");
    }
  );
});

test("WF-ENG Item 6: Anti-Recursion: Direct self-recursion (A -> A) is detected and blocked", async () => {
  const orgId = "org-recursion-direct";
  const wfA = await prisma.workflow.create({
    data: {
      id: "wf-direct-a",
      name: "Self Recursive Flow A",
      orgId,
    },
  });

  // Canvas of A references A itself by ID
  const directCycleNodes = [
    { id: "node-start", type: "manualTrigger", config: {} },
    { id: "node-sub", type: "subworkflow", config: { workflowId: wfA.id } },
  ];

  const cycle = await detectSubworkflowCycle(wfA.id, directCycleNodes, orgId, prisma);
  assert.deepEqual(cycle, [wfA.id, wfA.id]);

  await assert.rejects(
    async () => {
      await validateSubworkflowRecursion(wfA.id, directCycleNodes, orgId, prisma);
    },
    (err: any) => {
      assert.ok(err instanceof CyclicSubworkflowError);
      assert.equal(err.code, "CYCLIC_SUBWORKFLOW_REFERENCE");
      assert.equal(err.statusCode, 400);
      assert.deepEqual(err.cyclePath, [wfA.id, wfA.id]);
      assert.ok(err.message.includes("wf-direct-a -> wf-direct-a"));
      return true;
    }
  );
});

test("WF-ENG Item 6: Anti-Recursion: Direct self-recursion via Name/Slug alias", async () => {
  const orgId = "org-recursion-alias";
  const wfA = await prisma.workflow.create({
    data: {
      id: "wf-self-alias",
      name: "Invoice Generator",
      slug: "invoice-generator",
      orgId,
    },
  });

  // Node references self via alias "invoice-generator"
  const nodes = [
    { id: "node-sub", type: "subworkflow", config: { alias: "invoice-generator" } },
  ];

  const cycle = await detectSubworkflowCycle(wfA.id, nodes, orgId, prisma);
  assert.deepEqual(cycle, [wfA.id, wfA.id]);

  await assert.rejects(
    async () => {
      await validateSubworkflowRecursion(wfA.id, nodes, orgId, prisma);
    },
    (err: any) => {
      assert.equal(err.code, "CYCLIC_SUBWORKFLOW_REFERENCE");
      return true;
    }
  );
});

test("WF-ENG Item 6: Anti-Recursion: Two-hop transitive cycle (A -> B -> A) is detected and blocked", async () => {
  const orgId = "org-recursion-two-hop";

  // Create workflow B in DB which already calls A
  const wfB = await prisma.workflow.create({
    data: {
      id: "wf-two-b",
      name: "Workflow B",
      orgId,
      nodes: {
        create: [
          {
            id: "b-sub",
            type: "subworkflow",
            config: { workflowId: "wf-two-a" },
          },
        ],
      },
    },
  });

  // Create workflow A in DB
  const wfA = await prisma.workflow.create({
    data: {
      id: "wf-two-a",
      name: "Workflow A",
      orgId,
    },
  });

  // A attempts to save canvas calling B
  const nodesForA = [
    { id: "a-start", type: "manualTrigger", config: {} },
    { id: "a-sub", type: "subworkflow", config: { workflowId: wfB.id } },
  ];

  const cycle = await detectSubworkflowCycle(wfA.id, nodesForA, orgId, prisma);
  assert.deepEqual(cycle, [wfA.id, wfB.id, wfA.id]);

  await assert.rejects(
    async () => {
      await validateSubworkflowRecursion(wfA.id, nodesForA, orgId, prisma);
    },
    (err: any) => {
      assert.equal(err.code, "CYCLIC_SUBWORKFLOW_REFERENCE");
      assert.deepEqual(err.cyclePath, [wfA.id, wfB.id, wfA.id]);
      assert.ok(err.message.includes("wf-two-a -> wf-two-b -> wf-two-a"));
      return true;
    }
  );
});

test("WF-ENG Item 6: Anti-Recursion: Multi-hop deep cycle (A -> B -> C -> A) is detected and blocked", async () => {
  const orgId = "org-recursion-multi-hop";

  // C calls A
  await prisma.workflow.create({
    data: {
      id: "wf-tri-c",
      name: "Workflow C",
      orgId,
      nodes: {
        create: [
          { id: "c-sub", type: "subworkflow", config: { workflowId: "wf-tri-a" } },
        ],
      },
    },
  });

  // B calls C
  await prisma.workflow.create({
    data: {
      id: "wf-tri-b",
      name: "Workflow B",
      orgId,
      nodes: {
        create: [
          { id: "b-sub", type: "subworkflow", config: { workflowId: "wf-tri-c" } },
        ],
      },
    },
  });

  // A exists in DB
  await prisma.workflow.create({
    data: {
      id: "wf-tri-a",
      name: "Workflow A",
      orgId,
    },
  });

  // A attempts to call B
  const nodesForA = [
    { id: "a-sub", type: "subworkflow", config: { workflowId: "wf-tri-b" } },
  ];

  const cycle = await detectSubworkflowCycle("wf-tri-a", nodesForA, orgId, prisma);
  assert.deepEqual(cycle, ["wf-tri-a", "wf-tri-b", "wf-tri-c", "wf-tri-a"]);

  await assert.rejects(
    async () => {
      await validateSubworkflowRecursion("wf-tri-a", nodesForA, orgId, prisma);
    },
    (err: any) => {
      assert.equal(err.code, "CYCLIC_SUBWORKFLOW_REFERENCE");
      assert.deepEqual(err.cyclePath, ["wf-tri-a", "wf-tri-b", "wf-tri-c", "wf-tri-a"]);
      return true;
    }
  );
});

test("WF-ENG Item 6: Valid acyclic DAG with multiple subworkflows passes validation", async () => {
  const orgId = "org-dag-valid";

  // Diamond DAG: A -> B, A -> C; both B and C -> D (no cycles)
  const wfD = await prisma.workflow.create({
    data: { id: "wf-dag-d", name: "Worker D", orgId, nodes: { create: [] } },
  });

  const wfB = await prisma.workflow.create({
    data: {
      id: "wf-dag-b",
      name: "Worker B",
      orgId,
      nodes: {
        create: [{ id: "b-sub", type: "subworkflow", config: { workflowId: wfD.id } }],
      },
    },
  });

  const wfC = await prisma.workflow.create({
    data: {
      id: "wf-dag-c",
      name: "Worker C",
      orgId,
      nodes: {
        create: [{ id: "c-sub", type: "subworkflow", config: { workflowId: wfD.id } }],
      },
    },
  });

  const wfA = await prisma.workflow.create({
    data: { id: "wf-dag-a", name: "Master A", orgId },
  });

  const nodesForA = [
    { id: "a-sub-b", type: "subworkflow", config: { workflowId: wfB.id } },
    { id: "a-sub-c", type: "subworkflow", config: { workflowId: wfC.id } },
  ];

  const cycle = await detectSubworkflowCycle(wfA.id, nodesForA, orgId, prisma);
  assert.equal(cycle, null);

  // Must not throw
  await validateSubworkflowRecursion(wfA.id, nodesForA, orgId, prisma);
});

test("WF-ENG Item 6: HTTP PUT /api/workflows/:id/canvas returns 400 with CYCLIC_SUBWORKFLOW_REFERENCE on circular canvas", async () => {
  const app = await buildApp();

  // Create Org, User, and Workflows via database fixtures
  const org = await prisma.organization.create({
    data: { name: "Cycle HTTP Org", slug: `cycle-http-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `user-cycle-${Date.now()}@test.local`, passwordHash: "hash", name: "Cycle User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  // JWT Token for authenticated requests
  const token = (app as any).jwt.sign({
    sub: user.id,
    id: user.id,
    userId: user.id,
    email: user.email,
    orgId: org.id,
    role: "OWNER",
  });

  const wf1 = await prisma.workflow.create({
    data: {
      id: `wf-http-1-${Date.now()}`,
      name: "Workflow 1",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
    },
  });

  const wf2 = await prisma.workflow.create({
    data: {
      id: `wf-http-2-${Date.now()}`,
      name: "Workflow 2",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: {
        create: [
          {
            id: "n-sub-back",
            type: "subworkflow",
            config: { workflowId: wf1.id },
          },
        ],
      },
    },
  });

  // Attempt to save canvas on wf1 referencing wf2 -> creates cycle wf1 -> wf2 -> wf1
  const response = await app.inject({
    method: "PUT",
    url: `/api/workflows/${wf1.id}/canvas`,
    headers: {
      authorization: `Bearer ${token}`,
      "x-org-id": org.id,
    },
    payload: {
      nodes: [
        {
          id: "node-trigger",
          type: "manualTrigger",
          position: { x: 0, y: 0 },
        },
        {
          id: "node-call-2",
          type: "subworkflow",
          position: { x: 200, y: 0 },
          config: { workflowId: wf2.id },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "node-trigger",
          target: "node-call-2",
        },
      ],
    },
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.code, "CYCLIC_SUBWORKFLOW_REFERENCE");
  assert.ok(body.error.includes("Cyclic subworkflow reference detected"));
  assert.deepEqual(body.cyclePath, [wf1.id, wf2.id, wf1.id]);

  await app.close();
});
