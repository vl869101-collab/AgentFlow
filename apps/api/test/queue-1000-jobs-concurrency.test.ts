import assert from "node:assert/strict";
import test from "node:test";
import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  {
    recordHeartbeat,
    getHeartbeat,
    getHeartbeatTTL,
    isHeartbeatActive,
    clearHeartbeat,
    resetMemoryHeartbeats,
    sendToDLQ,
    getDLQJobsList,
    purgeDLQ,
  },
  {
    reapOrphanExecutions,
    stopOrphanReaper,
  },
  { getExecutionAuditTrail },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/queue.js"),
  import("../src/services/orphan-recovery.js"),
  import("../src/services/audit-ledger.js"),
]);

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_URL = process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-2: BULLMQ 1,000 JOBS CONCURRENCY & ORPHAN-RECOVERY BENCHMARK
// ══════════════════════════════════════════════════════════════════════════════

let redisAvailable = false;
let redisProbeError: string | null = null;

async function checkRedisAvailability(): Promise<boolean> {
  const probe = new (IORedis as any)(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    await probe.connect();
    const pong = await probe.ping();
    await probe.quit();
    return pong === "PONG";
  } catch (err: any) {
    redisProbeError = err?.message || String(err);
    try {
      probe.disconnect();
    } catch {}
    return false;
  }
}

test.before(async () => {
  redisAvailable = await checkRedisAvailability();
  if (!redisAvailable) {
    console.warn(`[Gate G-2] Redis unavailable at ${REDIS_URL}: ${redisProbeError}. Test will record BLOCKED status.`);
  }
});

test.beforeEach(() => {
  resetStore();
  resetMemoryHeartbeats();
  purgeDLQ();
  stopOrphanReaper();
});

test.afterEach(() => {
  stopOrphanReaper();
  resetMemoryHeartbeats();
  purgeDLQ();
});

// Helper to create test workflow fixture for orphan recovery tests
async function createTestFixture() {
  const org = await prisma.organization.create({
    data: {
      name: "Gate G-2 Concurrency Org",
      slug: `g2-org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `g2-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "hash-g2",
      name: "G2 Benchmark User",
    },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });
  const workflow = await prisma.workflow.create({
    data: {
      name: "Gate G-2 Concurrency Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
    },
  });
  return { org, user, workflow };
}

test("Gate G-2 [Pre-flight]: Conectividade com Redis ou detecção explícita de status BLOCKED", async (t) => {
  if (!redisAvailable) {
    t.skip(`BLOCKED: Redis indisponível (${redisProbeError}). Gate G-2 em modo suspenso/bloqueado.`);
    return;
  }

  assert.equal(redisAvailable, true, "Redis deve responder PONG para execução do Gate G-2");
});

test("Gate G-2 [Carga 1,000 Jobs]: Enfileiramento e processamento concorrente com invariante Processados + DLQ == 1000", async (t) => {
  if (!redisAvailable) {
    t.skip(`BLOCKED: Redis indisponível (${redisProbeError})`);
    return;
  }

  const queueName = `gate-g2-benchmark-${Date.now()}`;
  const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  };

  const queue = new Queue(queueName, { connection });

  // 1. Gera 1,000 jobs heterogêneos:
  // - 950 jobs com sucesso e durações simuladas variáveis (0ms, 1ms, 2ms, 4ms)
  // - 50 jobs configurados para falhar deliberadamente e serem roteados para a DLQ
  const TOTAL_JOBS = 1000;
  const DELIBERATE_FAILS = 50;
  const EXPECTED_PROCESSED = TOTAL_JOBS - DELIBERATE_FAILS; // 950

  const jobsData = Array.from({ length: TOTAL_JOBS }, (_, i) => {
    const shouldFail = i % 20 === 0; // i = 0, 20, 40, ... 980 (exatamente 50 jobs)
    const durationMs = i % 5; // 0, 1, 2, 3, 4 ms de processamento
    return {
      name: "workflow-node-job",
      data: {
        jobIndex: i,
        executionId: `g2-exec-${i}`,
        workflowId: `wf-g2-${i % 10}`,
        orgId: "org-g2-bench",
        shouldFail,
        durationMs,
      },
      opts: {
        attempts: 1, // Falha imediata para roteamento rápido à DLQ
        removeOnComplete: 2000,
        removeOnFail: 2000,
      },
    };
  });

  const enqueueStart = Date.now();
  await queue.addBulk(jobsData);
  const enqueueDurationMs = Date.now() - enqueueStart;

  assert.ok(enqueueDurationMs < 10000, `Enfileiramento em lote de 1000 jobs deve levar <10s (levou ${enqueueDurationMs}ms)`);

  // 2. Processa com concorrência de 30 slots no Worker
  const WORKER_CONCURRENCY = 30;
  let processedCount = 0;
  let dlqCount = 0;
  const completedJobIndices = new Set<number>();
  const failedJobIndices = new Set<number>();

  const processStart = Date.now();
  const TIME_CEILING_MS = 180_000; // < 3 minutos

  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout excedido: processamento de 1000 jobs ultrapassou o teto de 3 minutos (< 180s)`));
    }, TIME_CEILING_MS);

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const { jobIndex, executionId, shouldFail, durationMs } = job.data;

        // Simula tempo de execução de nós heterogêneos
        if (durationMs > 0) {
          await new Promise((r) => setTimeout(r, durationMs));
        }

        if (shouldFail) {
          throw new Error(`Deliberate node execution failure for job index ${jobIndex}`);
        }

        return { success: true, jobIndex, executionId };
      },
      {
        connection,
        concurrency: WORKER_CONCURRENCY,
      }
    );

    worker.on("completed", (job: Job) => {
      processedCount++;
      completedJobIndices.add(job.data.jobIndex);

      if (processedCount + dlqCount === TOTAL_JOBS) {
        clearTimeout(timeoutHandle);
        worker.close().then(() => resolve());
      }
    });

    worker.on("failed", async (job: Job | undefined, err: Error) => {
      if (job) {
        dlqCount++;
        failedJobIndices.add(job.data.jobIndex);

        // Roteia job falho para a Dead Letter Queue da aplicação
        await sendToDLQ(job.data.executionId, err.message, {
          jobId: job.id,
          jobIndex: job.data.jobIndex,
          workflowId: job.data.workflowId,
          orgId: job.data.orgId,
          attemptsMade: 1,
        });

        if (processedCount + dlqCount === TOTAL_JOBS) {
          clearTimeout(timeoutHandle);
          worker.close().then(() => resolve());
        }
      }
    });

    worker.on("error", (workerErr) => {
      clearTimeout(timeoutHandle);
      worker.close().then(() => reject(workerErr));
    });
  });

  const totalProcessingDurationMs = Date.now() - processStart;

  // 3. Verificação do Invariante Contábil Estrito
  assert.equal(processedCount, EXPECTED_PROCESSED, `Total de jobs processados com sucesso deve ser ${EXPECTED_PROCESSED}`);
  assert.equal(dlqCount, DELIBERATE_FAILS, `Total de jobs roteados para a DLQ deve ser ${DELIBERATE_FAILS}`);
  assert.equal(processedCount + dlqCount, TOTAL_JOBS, "INVARIANTE CRÍTICO: Processados + DLQ DEVE ser exatamente igual a 1000");

  // Zero perda e zero duplicatas
  assert.equal(completedJobIndices.size, EXPECTED_PROCESSED);
  assert.equal(failedJobIndices.size, DELIBERATE_FAILS);
  for (const failedIdx of failedJobIndices) {
    assert.equal(completedJobIndices.has(failedIdx), false, `Job ${failedIdx} não pode estar simultaneamente em completed e failed`);
  }

  // Teto de execução estrito: < 3 minutos (< 180s)
  assert.ok(
    totalProcessingDurationMs < TIME_CEILING_MS,
    `Tempo total de processamento (${totalProcessingDurationMs}ms) deve ser estritamente inferior a 180s`
  );

  // 4. Verificação de registros na DLQ
  const dlqSnapshot = await getDLQJobsList({ limit: 1000 });
  assert.ok(dlqSnapshot.total >= DELIBERATE_FAILS, `DLQ deve conter pelo menos ${DELIBERATE_FAILS} registros (encontrados ${dlqSnapshot.total})`);

  // Limpeza dos recursos BullMQ
  await queue.obliterate({ force: true });
  await queue.close();
});

test("Gate G-2 [Não-Interferência de Heartbeats]: Concorrência sob carga pesada sem corrupção ou race conditions", async (t) => {
  if (!redisAvailable) {
    t.skip(`BLOCKED: Redis indisponível (${redisProbeError})`);
    return;
  }

  const HEARTBEAT_BATCH = 100;
  const heartbeatPromises: Promise<boolean>[] = [];

  // 1. Registra 100 heartbeats simultâneos simulando workers em execução
  for (let i = 0; i < HEARTBEAT_BATCH; i++) {
    const execId = `g2-concurrent-hb-${i}`;
    heartbeatPromises.push(recordHeartbeat(execId, 60, { nodeIndex: i, workerId: `worker-slot-${i % 20}` }));
  }

  const recordResults = await Promise.all(heartbeatPromises);
  assert.equal(recordResults.every((r) => r === true), true, "Todos os 100 heartbeats devem ser registrados com sucesso");

  // 2. Consulta paralela de status ativo e TTL sem race conditions
  const activeChecks = await Promise.all(
    Array.from({ length: HEARTBEAT_BATCH }, (_, i) => isHeartbeatActive(`g2-concurrent-hb-${i}`))
  );
  assert.equal(activeChecks.every((active) => active === true), true, "Todos os 100 heartbeats devem reportar ativos");

  const ttlChecks = await Promise.all(
    Array.from({ length: HEARTBEAT_BATCH }, (_, i) => getHeartbeatTTL(`g2-concurrent-hb-${i}`))
  );
  assert.equal(ttlChecks.every((ttl) => ttl > 0 && ttl <= 60), true, "Todos os TTLs devem ser válidos (> 0 e <= 60)");

  // 3. Renovação concorrente de TTL (heartbeat renewal)
  const renewPromises = Array.from({ length: HEARTBEAT_BATCH }, (_, i) =>
    recordHeartbeat(`g2-concurrent-hb-${i}`, 120, { renewed: true, cycle: 2 })
  );
  const renewResults = await Promise.all(renewPromises);
  assert.equal(renewResults.every((r) => r === true), true, "Renovação concorrente de TTL deve ter 100% de sucesso");

  const renewedTTLChecks = await Promise.all(
    Array.from({ length: HEARTBEAT_BATCH }, (_, i) => getHeartbeatTTL(`g2-concurrent-hb-${i}`))
  );
  assert.equal(renewedTTLChecks.every((ttl) => ttl > 50 && ttl <= 120), true, "TTLs renovados devem refletir nova expiração");

  // 4. Limpeza concorrente de heartbeats
  const clearPromises = Array.from({ length: HEARTBEAT_BATCH }, (_, i) =>
    clearHeartbeat(`g2-concurrent-hb-${i}`)
  );
  const clearResults = await Promise.all(clearPromises);
  assert.equal(clearResults.every((r) => r === true), true, "Limpeza de heartbeats concorrentes deve ter 100% de sucesso");

  const postClearActive = await Promise.all(
    Array.from({ length: HEARTBEAT_BATCH }, (_, i) => isHeartbeatActive(`g2-concurrent-hb-${i}`))
  );
  assert.equal(postClearActive.every((active) => active === false), true, "Nenhum heartbeat deve permanecer ativo após limpeza");
});

test("Gate G-2 [Resiliência do Orphan Reaper]: Zero falsos positivos em execuções ativas e recuperação exata de stale jobs", async (t) => {
  const { workflow } = await createTestFixture();

  // Cenário 1: 5 Execuções ativas com heartbeats válidos
  const activeExecIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const activeExec = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 150_000), // Iniciado há 150s, mas heartbeat foi renovado há 5s
        createdAt: new Date(Date.now() - 150_000),
      },
    });
    activeExecIds.push(activeExec.id);
    await recordHeartbeat(activeExec.id, 60, { node: `active_step_${i}` });
  }

  // Cenário 2: 5 Execuções recentes (< thresholdMs) ainda sem heartbeat emitido
  const recentExecIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const recentExec = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 25_000), // Iniciado há apenas 25s (threshold é 120s)
        createdAt: new Date(Date.now() - 25_000),
      },
    });
    recentExecIds.push(recentExec.id);
  }

  // Cenário 3: 5 Execuções verdadeiramente órfãs (> 120s e sem heartbeat por queda de worker)
  const staleExecIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const staleExec = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 180_000), // Iniciado há 180s sem nenhum heartbeat
        createdAt: new Date(Date.now() - 180_000),
      },
    });
    staleExecIds.push(staleExec.id);
  }

  // Executa o reapOrphanExecutions
  const reaperReport = await reapOrphanExecutions({
    thresholdMs: 120_000,
    policy: "fail",
  });

  // Validações do reaper
  assert.equal(reaperReport.scanned, 15, "Deve ter escaneado as 15 execuções em status RUNNING");
  assert.equal(reaperReport.orphansFound, 5, "Deve detectar exatamente as 5 execuções órfãs (zero falsos positivos)");
  assert.equal(reaperReport.reaped.length, 5);

  const reapedIds = new Set(reaperReport.reaped.map((r) => r.executionId));
  for (const staleId of staleExecIds) {
    assert.equal(reapedIds.has(staleId), true, `Execução órfã ${staleId} deve constar na lista de recuperadas`);
  }

  // Valida que as 5 ativas com heartbeat NÃO sofreram interferência
  for (const activeId of activeExecIds) {
    const exec = await prisma.workflowExecution.findUnique({ where: { id: activeId } });
    assert.equal(exec?.status, "RUNNING", `Execução ativa ${activeId} com heartbeat DEVE permanecer RUNNING`);
    await clearHeartbeat(activeId);
  }

  // Valida que as 5 recentes (< 120s) NÃO foram prematuramente marcadas
  for (const recentId of recentExecIds) {
    const exec = await prisma.workflowExecution.findUnique({ where: { id: recentId } });
    assert.equal(exec?.status, "RUNNING", `Execução recente ${recentId} (< threshold) DEVE permanecer RUNNING`);
  }

  // Valida que as 5 órfãs transicionaram para FAILED com trilha auditada
  for (const staleId of staleExecIds) {
    const exec = await prisma.workflowExecution.findUnique({ where: { id: staleId } });
    assert.equal(exec?.status, "FAILED", `Execução órfã ${staleId} deve transicionar para FAILED`);
    assert.equal(exec?.error, "orphan_recovered");

    const auditTrail = await getExecutionAuditTrail(staleId);
    const orphanEvent = auditTrail.entries.find((e: any) => e.action === "execution.orphan_recovered");
    assert.ok(orphanEvent, `Trilha de auditoria da execução ${staleId} deve conter evento orphan_recovered`);
    assert.equal(orphanEvent.actor, "orphan-reaper");
    assert.equal(orphanEvent.decision, "marked_failed");
  }
});

test("Gate G-2 [DLQ Contabilidade & Drenagem]: Roteamento completo, integridade de incidentes e purge sem vazamento", async (t) => {
  purgeDLQ();

  // Envia 20 jobs deliberados para DLQ
  const NUM_DLQ = 20;
  for (let i = 0; i < NUM_DLQ; i++) {
    await sendToDLQ(`g2-dlq-exec-${i}`, `Deliberate failure reason ${i}`, {
      attemptsMade: 3,
      workflowId: `wf-test-${i}`,
      orgId: "org-test",
    });
  }

  const dlqList = await getDLQJobsList({ limit: 100 });
  assert.equal(dlqList.total, NUM_DLQ, `DLQ deve reportar exatamente ${NUM_DLQ} registros`);
  assert.equal(dlqList.jobs.length, NUM_DLQ);

  // Drenagem / Purge
  const purgedCount = await purgeDLQ();
  assert.equal(purgedCount, NUM_DLQ, `purgeDLQ deve remover exatamente ${NUM_DLQ} registros`);

  const postPurgeList = await getDLQJobsList();
  assert.equal(postPurgeList.total, 0, "DLQ deve estar vazia após purgeDLQ");
});
