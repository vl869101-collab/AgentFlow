import assert from "node:assert/strict";
import test from "node:test";
import type { NodeItem } from "../src/services/nodes/types.js";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createConcurrencyPool },
  {
    recordHeartbeat,
    getHeartbeat,
    getHeartbeatTTL,
    isHeartbeatActive,
    clearHeartbeat,
    resetMemoryHeartbeats,
    getDLQJobsList,
    purgeDLQ,
  },
  { reapOrphanExecutions },
  { MergeNodeHandler, normalizeBranches },
  { recordWorkflowAuditEvent, verifyWorkflowAuditIntegrity, getExecutionAuditTrail },
  { wrapItems },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor/concurrency-pool.js"),
  import("../src/services/queue.js"),
  import("../src/services/orphan-recovery.js"),
  import("../src/services/nodes/merge.js"),
  import("../src/services/audit-ledger.js"),
  import("../src/services/nodes/types.js"),
]);

test.beforeEach(() => {
  resetStore();
  resetMemoryHeartbeats();
  purgeDLQ();
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-2 — PARTE 1: 1.000 JOBS CONCORRENTES SEM DEADLOCK OU PERDA
// ══════════════════════════════════════════════════════════════════════════════

test("Gate G-2 [Concorrência Massiva]: Executa 1.000 jobs concorrentes através do ConcurrencyPool com zero deadlocks e zero perda", async () => {
  const TOTAL_JOBS = 1000;
  const CONCURRENCY_LIMIT = 50;
  const pool = createConcurrencyPool(CONCURRENCY_LIMIT);

  assert.equal(pool.concurrency, CONCURRENCY_LIMIT);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.pendingCount, 0);

  let peakActive = 0;
  let completedCount = 0;
  const completedResults = new Set<number>();

  const startTime = Date.now();

  // Dispara 1.000 jobs simultaneamente
  const promises: Promise<number>[] = [];
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const jobId = i;
    const taskPromise = pool(async () => {
      peakActive = Math.max(peakActive, pool.activeCount);
      assert.ok(
        pool.activeCount <= CONCURRENCY_LIMIT,
        `Active count ${pool.activeCount} excedeu o limite ${CONCURRENCY_LIMIT}`
      );

      // Simula carga com micro-delay assíncrono não-bloqueante
      await new Promise<void>((resolve) => setImmediate(resolve));

      completedCount++;
      completedResults.add(jobId);
      return jobId;
    });
    promises.push(taskPromise);
  }

  // Verifica que os jobs estão enfileirados e controlados pelo pool
  assert.ok(pool.activeCount <= CONCURRENCY_LIMIT);
  assert.ok(pool.pendingCount > 0, "Deveria haver jobs pendentes na fila do pool");

  const results = await Promise.all(promises);
  const durationMs = Date.now() - startTime;

  // 1. Verificações de conclusão total (100% de sucesso)
  assert.equal(results.length, TOTAL_JOBS, "Exatamente 1.000 resultados devem ser retornados");
  assert.equal(completedCount, TOTAL_JOBS, "Exatamente 1.000 jobs devem ser completados");
  assert.equal(completedResults.size, TOTAL_JOBS, "Todos os 1.000 IDs de job devem ser únicos e processados");

  // 2. Verificações de integridade do Pool
  assert.equal(pool.activeCount, 0, "ActiveCount deve retornar a 0 ao finalizar");
  assert.equal(pool.pendingCount, 0, "PendingCount deve retornar a 0 ao finalizar");
  assert.ok(peakActive > 0 && peakActive <= CONCURRENCY_LIMIT, `Pico de concorrência foi ${peakActive}`);

  // 3. Garantia de ausência de deadlock (tempo razoável para 1.000 micro-tarefas)
  assert.ok(durationMs < 15_000, `Execução levou ${durationMs}ms, muito abaixo do teto de timeout de 15s`);
});

test("Gate G-2 [Concorrência com I/O Simulado]: 1.000 jobs heterogêneos com delays variados processam ordenadamente", async () => {
  const TOTAL_JOBS = 1000;
  const pool = createConcurrencyPool(25);
  const resultsMap = new Map<number, string>();

  const promises = Array.from({ length: TOTAL_JOBS }, (_, index) => {
    return pool(async () => {
      // Simula latência variável de banco / rede (0 a 3ms)
      const delay = index % 4;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const outputHash = `job-output-${index}-${index * 7}`;
      resultsMap.set(index, outputHash);
      return { index, outputHash };
    });
  });

  const resolved = await Promise.all(promises);
  assert.equal(resolved.length, TOTAL_JOBS);
  assert.equal(resultsMap.size, TOTAL_JOBS);

  for (let i = 0; i < TOTAL_JOBS; i++) {
    assert.equal(resultsMap.get(i), `job-output-${i}-${i * 7}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-2 — PARTE 2: RESILIÊNCIA DE FILAS & DETECÇÃO DE HEARTBEAT CONCORRENTE
// ══════════════════════════════════════════════════════════════════════════════

test("Gate G-2 [Resiliência de Filas]: 100 Heartbeats concorrentes e recuperação em massa de execuções órfãs", async () => {
  const HEARTBEAT_COUNT = 100;
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("[Queue] Failed to")) return;
    originalWarn(...args);
  };

  try {
    const heartbeatPromises = Array.from({ length: HEARTBEAT_COUNT }, async (_, i) => {
      const execId = `concurrent-exec-${i}`;
      const ok = await recordHeartbeat(execId, 60, { nodeIndex: i });
      assert.equal(ok, true);

      const active = await isHeartbeatActive(execId);
      assert.equal(active, true);

      const ttl = await getHeartbeatTTL(execId);
      assert.ok(ttl > 0 && ttl <= 60);
    });

    await Promise.all(heartbeatPromises);
  } finally {
    console.warn = originalWarn;
  }

  // Cria 5 execuções travadas (sem heartbeat, iniciadas há mais de 150s)
  const org = await prisma.organization.create({
    data: { name: "G2 Orphan Org", slug: `g2-orphan-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `g2-user-${Date.now()}@test.local`, passwordHash: "h", name: "G2 User" },
  });
  const workflow = await prisma.workflow.create({
    data: { name: "G2 Orphan WF", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });

  const orphanIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const orphan = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 160_000),
        createdAt: new Date(Date.now() - 160_000),
        input: { batchNum: i },
      },
    });
    orphanIds.push(orphan.id);
  }

  // Executa o orphan reaper em lote
  const reapReport = await reapOrphanExecutions({
    thresholdMs: 120_000,
    policy: "fail",
  });

  assert.equal(reapReport.orphansFound, 5);
  assert.equal(reapReport.reaped.length, 5);

  for (const orphanId of orphanIds) {
    const dbExec = await prisma.workflowExecution.findUnique({ where: { id: orphanId } });
    assert.equal(dbExec?.status, "FAILED");
    assert.equal(dbExec?.error, "orphan_recovered");
  }

  // Valida que foram parar na DLQ
  const dlq = await getDLQJobsList();
  const dlqExecIds = dlq.jobs.map((j) => j.executionId);
  for (const orphanId of orphanIds) {
    assert.ok(dlqExecIds.includes(orphanId), `Orphan ${orphanId} deve constar na DLQ`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-2 — PARTE 3: MERGE MULTI-BRANCH 2D DETERMINÍSTICO E SEM PERDA DE DADOS
// ══════════════════════════════════════════════════════════════════════════════

test("Gate G-2 [Merge Multi-Branch]: Normalização 2D e junção de 10 ramificações paralelas com zero perda", async () => {
  const BRANCH_COUNT = 10;
  const ITEMS_PER_BRANCH = 50;

  // Cria 10 branches, cada uma com 50 itens únicos
  const inputBranches: NodeItem[][] = [];
  let expectedTotalItems = 0;

  for (let b = 0; b < BRANCH_COUNT; b++) {
    const branchItems: NodeItem[] = [];
    for (let i = 0; i < ITEMS_PER_BRANCH; i++) {
      branchItems.push({
        json: { branchId: b, itemId: i, globalIndex: expectedTotalItems },
      });
      expectedTotalItems++;
    }
    inputBranches.push(branchItems);
  }

  assert.equal(expectedTotalItems, BRANCH_COUNT * ITEMS_PER_BRANCH); // 500 itens

  // 1. Normalização das 10 branches garantindo estrutura 2D canônica e pairedItem
  const normalized = normalizeBranches({
    inputBranches,
    input: inputBranches,
    nodeConfig: {},
  } as any);

  assert.equal(normalized.length, BRANCH_COUNT);
  for (let b = 0; b < BRANCH_COUNT; b++) {
    assert.equal(normalized[b].length, ITEMS_PER_BRANCH);
    for (let i = 0; i < ITEMS_PER_BRANCH; i++) {
      const item = normalized[b][i];
      assert.deepEqual(item.pairedItem, { item: i, input: b });
    }
  }

  // 2. Execução do Merge em modo 'append'
  const mergeHandler = new MergeNodeHandler();
  const appendResult = await mergeHandler.execute({
    inputBranches,
    nodeConfig: { mode: "append" },
  } as any);

  assert.equal(appendResult.items.length, 500, "Append deve conter a união exata dos 500 itens");

  // 3. Execução do Merge em modo 'combineByPosition'
  const combineResult = await mergeHandler.execute({
    inputBranches: [inputBranches[0], inputBranches[1]],
    nodeConfig: { mode: "combineByPosition" },
  } as any);

  assert.equal(combineResult.items.length, ITEMS_PER_BRANCH);
  assert.equal(combineResult.items[0].json.branchId, 1, "Sobrescreve com valores da segunda branch");
  assert.equal(combineResult.items[0].json.itemId, 0);

  // 4. Execução do Merge em modo 'waitAll'
  const waitAllResult = await mergeHandler.execute({
    inputBranches,
    nodeConfig: { mode: "waitAll" },
  } as any);

  assert.equal(waitAllResult.items.length, 500);
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-2 — PARTE 4: INTEGRIDADE DA CADEIA CRIPTOGRÁFICA DO AUDIT LEDGER
// ══════════════════════════════════════════════════════════════════════════════

test("Gate G-2 [Audit Ledger Imutável]: Gravação paralela concorrente preserva a hash chain íntegra", async () => {
  const EXEC_COUNT = 10;
  const EVENTS_PER_EXEC = 20;

  // Cria eventos concorrentes para 10 execuções distintas
  const execPromises = Array.from({ length: EXEC_COUNT }, async (_, eIdx) => {
    const executionId = `g2-audit-exec-${eIdx}-${Date.now()}`;

    for (let ev = 0; ev < EVENTS_PER_EXEC; ev++) {
      await recordWorkflowAuditEvent({
        executionId,
        workflowId: `wf-${eIdx}`,
        action: `node.step_${ev}`,
        actor: `worker-${eIdx}`,
        decision: ev % 2 === 0 ? "allow" : "proceed",
        payload: { eventIndex: ev, value: Math.random() },
      });
    }

    return executionId;
  });

  const executionIds = await Promise.all(execPromises);

  // Validação da cadeia criptográfica de cada execução
  for (const execId of executionIds) {
    const auditTrail = await getExecutionAuditTrail(execId);
    assert.equal(auditTrail.entries.length, EVENTS_PER_EXEC);

    const verification = await verifyWorkflowAuditIntegrity(execId);
    assert.equal(
      verification.valid,
      true,
      `Hash chain da execução ${execId} deve ser 100% válida e sem violação`
    );
  }
});
