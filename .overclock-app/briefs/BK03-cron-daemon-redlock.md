---
id: BK03-cron-1
missionId: BK03CRON0001
titulo: Cron Daemon com BullMQ Repeatable Jobs + Redlock Leader Election
status: aberto
---

# Missão: Cron Daemon com BullMQ Repeatable Jobs + Redlock Leader Election

> **ID da Missão:** `BK03CRON0001`  
> **Brief ID:** `BK03-cron-1`  
> **Squad Delegado:** `executor/queue (w-architect, w-api)`  
> **Stack:** Fastify 5 + Prisma 6 + BullMQ + Redis + JWT + Stripe + Zod + Vitest  
> **Arquivos Alvo:** `apps/api/src/services/cron.ts`, `apps/api/src/lib/redis.ts`, `apps/api/src/worker.ts`

---

## 1. Contexto & Diagnóstico
No âmbito do plano de 7 horas e do gap audit do backend AgentFlow, este componente foi identificado como melhoria urgente para garantir segurança, resiliência, escalabilidade e conformidade com ambientes de produção de alta demanda.

## 2. Objetivo & Requisitos
Implementar daemon de agendamento cron para workflows usando Repeatable Jobs do BullMQ sincronizados com a tabela Workflow no Prisma. Implementar Redlock (distlock) via Redis para garantir leader election segura em clusters multi-instância, prevenindo disparos duplicados em deploys horizontais. Adicionar sincronização automática ao criar/atualizar/desativar nós cronTrigger.

### Critérios de Aceite:
1. Implementação completa do comportamento especificado sem regressões no ecossistema Fastify/Prisma.
2. Tratamento estrito de erros com tipagem TypeScript e validação de esquemas via Zod.
3. Testes unitários/integração correspondentes cobrindo cenários de sucesso, erro e borda.
4. Preservação de conformidade de tipos (`tsc --noEmit` com 0 erros).

---

## Worker Contract (Mandatory, in order):
1. `pwd` — Confirm the repository root.
2. Read the pointed files (+ parent context if necessary).
3. Execute strictly within the specified file scope: apps/api/src/services/cron.ts, apps/api/src/lib/redis.ts, apps/api/src/worker.ts.
4. Write the result and findings back into the item under `## Resultado`.
5. Run typecheck and tests to guarantee zero regressions.
6. Commit with pathspec citing item ID `BK03-cron-1` (PRE-AUTHORIZED).
7. Submit handoff via `handoff_submit({ briefId: "BK03-cron-1", summary, status: "concluido" })`.

## Resultado

Implementação concluída com sucesso:
- **Quartz Cron & Timezones:** Parser robusto com suporte a 5/6 campos, aliases (@daily, @hourly etc.), meses/dias da semana e fusos horários IANA via `Intl.DateTimeFormat`.
- **BullMQ Repeatables:** Registro e remoção atômica de jobs repetitivos integrados a BullMQ.
- **Sincronização em Tempo Real:** Sincronização atômica na inicialização e via Redis Pub/Sub (`agentflow:cron:sync`) ao alterar/deletar workflows no banco.
- **Redlock Anti-Overlap:** Distributed Lock seguro via Redis com tokens únicos e script Lua de liberação segura, prevenindo concorrência.
- **Testes & Typecheck:** 10/10 testes em `cron-scheduler.test.ts` e 22/22 testes em `executor-queue-group.test.ts` passando, 0 erros no typecheck (`tsc --noEmit`).
