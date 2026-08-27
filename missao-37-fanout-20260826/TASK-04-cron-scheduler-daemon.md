# TASK-04: Cron Scheduler Daemon Distribuído com Quartz & Redis Locks

- **Prioridade:** P0 (Agendamento & Automação)
- **Domínio:** Scheduler / Background Workers
- **Alvo:** `apps/api/src/services/cron-scheduler.ts` & `apps/api/src/worker.ts`
- **Status:** CONCLUÍDO

---

## 1. Contexto & Problema
Nós de agendamento temporal (`cronTrigger`) necessitam de um daemon autônomo e distribuído que gerencie agendamentos sem duplicação entre múltiplos nós de worker da API e execute tarefas repetitivas em horários precisos, respeitando fusos horários e prevenção contra sobreposição concorrente (anti-overlap).

---

## 2. Objetivos & Especificação Implementada

1. **CronSchedulerService & Quartz Cron Parser (`apps/api/src/services/cron-scheduler.ts`):**
   - Suporte completo a expressões cron padrão Quartz de 5 e 6 campos (`sec min hour dom month dow`).
   - Suporte a aliases como `@daily`, `@hourly`, `@weekly`, `@monthly`, `@yearly`, `@midnight`, `@every_minute`, `@every_second`.
   - Suporte a nomes de meses (`JAN`..`DEC`) e dias da semana (`SUN`..`SAT`, `MON-FRI`).
   - Suporte a ranges (`1-5`), steps (`*/15`, `10-30/10`), listas (`1,15`) e curinga Quartz `?`.
   - Suporte a fusos horários IANA (ex: `America/Sao_Paulo`, `America/New_York`, `UTC`) com parsing e matching de tempo via `Intl.DateTimeFormat`.
   - Cálculo de próxima execução (`getNextCronDate`) considerando o fuso horário configurado.

2. **Sincronização Dinâmica em Tempo Real & BullMQ Repeatables:**
   - Registro e remoção atômica de jobs repetitivos no BullMQ (`registerBullMQRepeatable` / `removeBullMQRepeatable`).
   - Sincronização automática no boot da aplicação com `syncAllWorkflows()`.
   - Sincronização atômica ao criar, atualizar, desativar, reverter ou deletar workflows via `syncWorkflow()` e Redis Pub/Sub (`CRON_SYNC_CHANNEL: agentflow:cron:sync`).
   - Hooks integrados em `apps/api/src/routes/workflows.ts` para disparar eventos de sincronização em tempo real sem necessidade de restart de workers.

3. **Proteção Anti-Overlap & Concorrência Distribuída (Redlock Pattern):**
   - Classe `DistributedLock` com aquisição via Redis `SET lock:cron:<workflowId> <token> PX <ttlMs> NX`.
   - Liberação atômica com script Lua verificando ownership do token, evitando cancelamento indevido de locks expirados.
   - Fallback em memória com token tracking para ambientes offline/testes.
   - Flag `preventOverlap: true` nos nós cron para bloquear execuções concorrentes com logs de aviso / auditoria.

4. **Integração Isolada e Aditiva com Worker (`apps/api/src/worker.ts`):**
   - Suporte aditivo para processamento de jobs repetitivos BullMQ (`cron-trigger` / `isCron`) com proteção de lock distribuído.
   - Finalização graciosa com shutdown de timers e desconexão de subscribers.

---

## 3. Arquivos Modificados / Criados

- `apps/api/src/services/cron-scheduler.ts`: Implementação completa do serviço de cron scheduler distribuído, parser Quartz/Unix, timezones, Redlock e Redis Pub/Sub.
- `apps/api/src/worker.ts`: Suporte aditivo a jobs `cron-trigger` repetitivos do BullMQ e graceful shutdown.
- `apps/api/src/routes/workflows.ts`: Integração de live synchronization nos endpoints de workflows.
- `apps/api/src/lib/store.ts`: Suporte a `findUnique` e inserção nested de nós/arestas no mock in-memory.
- `apps/api/test/cron-scheduler.test.ts`: Suíte focada cobrindo parsing de cron Quartz/Unix, timezones, Redlock e sincronização.
- `apps/api/package.json`: Registro de `cron-scheduler.test.ts` no script de testes.

---

## 4. Evidências de Aceite & Testes

### Execução dos Testes Focados (`npx tsx --test test/cron-scheduler.test.ts`):
```text
TAP version 13
# [api] ALLOW_MEMORY_DB=1 — using the in-memory database
# Subtest: TASK-04: Cron Parser - 5 fields standard unix cron
ok 1 - TASK-04: Cron Parser - 5 fields standard unix cron
# Subtest: TASK-04: Cron Parser - 6 fields Quartz cron with seconds and question mark
ok 2 - TASK-04: Cron Parser - 6 fields Quartz cron with seconds and question mark
# Subtest: TASK-04: Cron Parser - Month names and Day names
ok 3 - TASK-04: Cron Parser - Month names and Day names
# Subtest: TASK-04: Cron Parser - Handles invalid expressions cleanly
ok 4 - TASK-04: Cron Parser - Handles invalid expressions cleanly
# Subtest: TASK-04: Cron Parser - Standard aliases (@daily, @hourly, @weekly, @monthly, @yearly)
ok 5 - TASK-04: Cron Parser - Standard aliases (@daily, @hourly, @weekly, @monthly, @yearly)
# Subtest: TASK-04: Timezone matching - UTC vs America/Sao_Paulo vs America/New_York
ok 6 - TASK-04: Timezone matching - UTC vs America/Sao_Paulo vs America/New_York
# Subtest: TASK-04: getNextCronDate with Timezone
ok 7 - TASK-04: getNextCronDate with Timezone
# Subtest: TASK-04: DistributedLock - acquire, isLocked, release with token verification
ok 8 - TASK-04: DistributedLock - acquire, isLocked, release with token verification
# Subtest: TASK-04: CronSchedulerService - register, unregister, preventOverlap, and execution
ok 9 - TASK-04: CronSchedulerService - register, unregister, preventOverlap, and execution
# Subtest: TASK-04: CronSchedulerService - Live sync event handling
ok 10 - TASK-04: CronSchedulerService - Live sync event handling
1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### Typecheck (`pnpm --filter @agentflow/api typecheck`):
```text
> @agentflow/api@0.1.0 typecheck C:\Users\VICTOR\Downloads\Claude Code\AgentFlow\apps\api
> tsc --noEmit

Exit code: 0 (0 errors)
```
