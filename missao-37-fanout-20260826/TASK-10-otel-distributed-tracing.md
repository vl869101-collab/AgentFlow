# TASK-10: Rastreamento Distribuído OpenTelemetry em Grafo e Filas

- **Prioridade:** P1 (Observabilidade & APM)
- **Status:** **DONE / APROVADO**
- **Arquivos Fonte:**
  - `apps/api/src/lib/otel.ts`
  - `apps/api/src/services/executor.ts`
  - `apps/api/src/services/queue.ts`
  - `apps/api/src/worker.ts`
  - `apps/api/src/routes/webhooks.ts`
  - `apps/api/src/routes/executions.ts`
  - `apps/api/test/otel-distributed-tracing.test.ts`
- **Commits Associados:** `23de552`, `700d19a`, `7f24057`

---

## 1. Escopo & Implementação Técnica

1. **Árvore Hierárquica de Spans OpenTelemetry por Nó:**
   - Criação de span raiz para cada workflow: `workflow.execution <name>`.
   - Criação de spans hierárquicos para cada nó: `agentflow.node.<nodeType>`.
   - Vinculação de parentesco garantida: todos os spans de nós de uma execução compartilham o mesmo `traceId` do workflow e possuem `parentSpanId === wfSpan.spanId`.
   - Atributos padronizados em cada nó:
     - `workflow.id`
     - `execution.id`
     - `node.id`
     - `node.type`
     - `org.id`
     - `items.count`
     - `node.status` (`SUCCESS`, `CANCELLED`, `HANDLED_ERROR`, `FAILED`)
     - `node.duration_ms`
2. **Propagação de Contexto W3C Trace Context (`traceparent` / `tracestate`):**
   - Implementação de `telemetry.formatTraceParent()`, `telemetry.parseTraceParent()`, `telemetry.injectTraceContext()` e `telemetry.extractTraceContext()`.
   - Injeção automática de `traceparent` no payload de jobs do BullMQ via `enqueueExecution`.
   - Extração de `traceparent` no worker BullMQ (`worker.ts`) e vinculação do span `bullmq.job.workflows` com a execução do workflow.
   - Injeção de `traceparent` em headers de requisições HTTP de saída em nós de integração HTTP.
   - Propagação de contexto a partir de rotas de webhook HTTP para o enfileiramento assíncrono.
3. **Registro de Erros e Exceções nos Spans:**
   - Falhas em nós disparam `nodeSpan.recordException(error)`, status `ERROR` e evento `exception` estruturado (`exception.type`, `exception.message`, `exception.stacktrace`).
   - Nós com política de tolerância (`onError: continue` ou `onError: routeToErrorBranch`) finalizam o span com status `OK` e atributo `node.status = "HANDLED_ERROR"`.
4. **Exportação OTLP & Endpoints de Telemetria:**
   - `telemetry.exportSpansOTLP()` gera representação compatível com o formato OpenTelemetry OTLP (`resourceSpans`, `scopeSpans`, `attributes`, `events`, `status`).
   - Endpoints disponíveis:
     - `GET /api/telemetry/traces` — Export OTLP JSON.
     - `GET /api/telemetry/otlp` — Alias OTLP JSON.
     - `GET /api/telemetry/spans` — Listagem paginada de spans JSON.
     - `GET /api/telemetry/stats` — Métricas resumidas e conformidade com SLO (budget p95 < 300ms).
     - `GET /metrics` — Métricas no formato Prometheus text.
     - `GET /api/executions/:id/traces` — Traces de nós e árvore OTel `otelSpans`.

---

## 2. Testes & Cobertura

- **Suíte de Testes:** `apps/api/test/otel-distributed-tracing.test.ts`
- **Total de Testes:** 7/7 passando
- **Exit Code:** `0`
