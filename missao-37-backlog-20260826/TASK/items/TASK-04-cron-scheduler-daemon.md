# TASK-04: Cron Scheduler Daemon Distribuído com Quartz & Redis Locks

- **Prioridade:** P0 (Agendamento & Automação)
- **Domínio:** Scheduler / Background Workers
- **Alvo:** `apps/api/src/services/cron-scheduler.ts` & `apps/api/src/worker.ts`

## 1. Contexto & Problema
Nós de agendamento temporal (`cronTrigger`) necessitam de um daemon autônomo e distribuído que gerencie agendamentos sem duplicação entre múltiplos nós de worker da API.

## 2. Objetivos & Especificação
1. **CronSchedulerService:**
   - Inicialização no boot da aplicação, carregando workflows ativos com nó `cronTrigger`.
   - Registro de jobs repetitivos no BullMQ com suporte a expressões cron padrão Quartz (5 ou 6 campos) e timezones (IANA).
2. **Sincronização Dinâmica em Tempo Real:**
   - Listeners de eventos de ativação, desativação e atualização de workflows no banco/Redis.
   - Remoção ou reagendamento atômico de jobs do BullMQ ao alterar o cron.
3. **Proteção Anti-Overlap & Concorrência:**
   - Distributed Lock via Redis (Redlock pattern) impedindo execução simultânea do mesmo job cron se o anterior ainda estiver ativo (`preventOverlap: true`).

## 3. Critérios de Aceite
- [ ] Workflows ativos com cron são registrados no Redis e disparados no minuto exato.
- [ ] Alteração de workflow reflete imediatamente no agendamento BullMQ sem restart manual do worker.
- [ ] Execuções concorrentes são bloqueadas pelo lock distribuído com aviso nos logs de auditoria.
- [ ] Testes unitários e de integração cobrindo parsing de cron, fuso horário e sincronização.
