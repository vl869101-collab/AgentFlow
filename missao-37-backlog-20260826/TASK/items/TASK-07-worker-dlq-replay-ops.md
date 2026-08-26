# TASK-07: Worker Dead Letter Queue (DLQ), Reprocessamento em Lote & Alertas

- **Prioridade:** P1 (Operações & Resiliência)
- **Domínio:** Queue Ops / DLQ / Incident Management
- **Alvo:** `apps/api/src/services/queue.ts`, `apps/api/src/routes/dlq.ts` & `apps/api/src/worker.ts`

## 1. Contexto & Problema
Jobs do BullMQ que falham após esgotar tentativas (max retries) precisam de quarentena estruturada (DLQ), auditoria de causa raiz e endpoints para reprocessamento unitário ou em lote por operadores.

## 2. Objetivos & Especificação
1. **Isolamento na DLQ:**
   - Encaminhamento automático de jobs falhos para fila `dead-letter-queue` com payload completo, stack trace e metadados de contexto.
2. **API Administrativa de DLQ:**
   - `GET /api/admin/dlq`: listagem paginada de jobs falhos com filtros por workflow, organização e data.
   - `POST /api/admin/dlq/replay`: re-enfileiramento de jobs selecionados ou em lote de volta para a fila de execução.
   - `DELETE /api/admin/dlq/purge`: expurgo controlado de jobs antigos.
3. **Alertas de Incidentes:**
   - Emissão de notificação e métricas quando a taxa de mensagens na DLQ ultrapassar o limiar de anomalia.

## 3. Critérios de Aceite
- [ ] Jobs com erro fatal são persistidos na DLQ sem perda de payload de entrada.
- [ ] Rota de replay reinjeta o job na fila principal mantendo rastreabilidade do ID de execução.
- [ ] Testes de integração validando ciclo completo de falha -> quarentena -> replay com sucesso.
