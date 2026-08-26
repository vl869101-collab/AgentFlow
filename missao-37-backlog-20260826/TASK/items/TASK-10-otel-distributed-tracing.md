# TASK-10: Rastreamento Distribuído OpenTelemetry em Grafo e Filas

- **Prioridade:** P1 (Observabilidade & APM)
- **Domínio:** Observability / Tracing / OpenTelemetry
- **Alvo:** `apps/api/src/lib/otel.ts`, `apps/api/src/services/executor.ts` & `apps/api/src/worker.ts`

## 1. Contexto & Problema
Execuções de workflows distribuídos entre API, BullMQ e Workers exigem visibilidade ponta a ponta para identificar gargalos, latências de terceiros e falhas em cada nó individual.

## 2. Objetivos & Especificação
1. **Spans OpenTelemetry por Nó de Execução:**
   - Criação de span hierárquico para cada nó: `agentflow.node.<nodeType>`.
   - Atributos padronizados: `workflow.id`, `execution.id`, `node.id`, `node.type`, `org.id`, `items.count`.
2. **Propagação de Contexto W3C Trace Context:**
   - Injeção e extração de cabeçalhos `traceparent` / `tracestate` nos jobs do BullMQ e chamadas HTTP de saída.
3. **Exportador OTel:**
   - Suporte a exportação via OTLP (gRPC / HTTP) para Jaeger, Tempo, Honeycomb ou Datadog.

## 3. Critérios de Aceite
- [ ] Cada execução gera árvore completa de traces com spans individuais por nó.
- [ ] Erros em nós são gravados com status de span `ERROR` e registro de exceção.
- [ ] Contexto de trace é preservado através de enfileiramento no BullMQ.
- [ ] Testes unitários validando criação de spans e propagação de contexto.
