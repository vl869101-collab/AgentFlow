# Backlog Canônico de Fanout — 20 Missões de Engenharia (Missão 37)

Este diretório contém o conjunto oficial e canônico de 20 TASKs de especificação técnica e critérios de aceite para execução paralela (fanout) no AgentFlow.

> **Critérios Transversais Integrados nas 20 TASKs:**
> 1. **Chat Trigger & SSE Streaming**: Respostas interativas em streaming de tokens e eventos de nós via Server-Sent Events (TASK-02).
> 2. **Contrato de Items `{json, binary}`**: Padronização estrita de dados em coleções de itens no executor e nós (TASK-01).
> 3. **Motor de Expressões `$json`**: Resolução dinâmica de referências `$json.prop`, `$item("nodeName").json` e interpolação `{{ ... }}` (TASK-01).
> 4. **Autenticação HTTP Completa**: Suporte nativo a Basic Auth, Bearer Token, API Key (Header/Query), OAuth2 auto-injetado, Digest e mTLS/Client Certs (TASK-11).
> 5. **MCP Server & Client Completo**: Exposição de workflows como MCP tools/prompts/resources via SSE/stdio e nó MCP Client para consumo de servidores remotos com RBAC fino (TASK-08).

---

## Matriz de Priorização (P0 / P1 / P2)

### P0 — Bloqueadores de Execução & Core Engine
- [`TASK-01-handlers-switch-split-merge.md`](./items/TASK-01-handlers-switch-split-merge.md) — Nós `Switch`, `SplitInBatches`, `Merge` avançado, Contrato de Items `{json, binary}` e Motor de Expressões `$json`.
- [`TASK-02-handlers-wait-form-resume.md`](./items/TASK-02-handlers-wait-form-resume.md) — Nós `Wait`, `Form` (HITL), Suspensão/Retomada e `ChatTrigger` com streaming Server-Sent Events (SSE).
- [`TASK-03-handler-error-catch-subflow.md`](./items/TASK-03-handler-error-catch-subflow.md) — Nó `ErrorTrigger` e subfluxos de tratamento de falhas e fallback.
- [`TASK-04-cron-scheduler-daemon.md`](./items/TASK-04-cron-scheduler-daemon.md) — Daemon distribuído de agendamento cron com BullMQ Repeatable Jobs e locks Redis.
- [`TASK-05-vault-510-oauth2-refresh-engine.md`](./items/TASK-05-vault-510-oauth2-refresh-engine.md) — Motor autônomo de refresh de tokens OAuth2 on-demand e em background para 510 providers.
- [`TASK-06-billing-tier-limits-sync.md`](./items/TASK-06-billing-tier-limits-sync.md) — Sincronização Stripe bidirecional, ciclo de vida de planos e middleware de cotas.

### P1 — Resiliência, Segurança & Protocolos
- [`TASK-07-worker-dlq-replay-ops.md`](./items/TASK-07-worker-dlq-replay-ops.md) — Endpoints de reprocessamento, expurgo, alertas e histórico de incidentes na DLQ.
- [`TASK-08-mcp-rbac-scopes-enforcement.md`](./items/TASK-08-mcp-rbac-scopes-enforcement.md) — Arquitetura MCP Server & Client nativo com RBAC granular e validação de escopos por ferramenta.
- [`TASK-09-hmac-multi-provider-webhooks.md`](./items/TASK-09-hmac-multi-provider-webhooks.md) — Verificação criptográfica de webhooks HMAC multi-provedor (GitHub, Shopify, Stripe, Slack).
- [`TASK-10-otel-distributed-tracing.md`](./items/TASK-10-otel-distributed-tracing.md) — Instrumentação de spans OpenTelemetry em cada nó do grafo e propagação de contexto em filas.
- [`TASK-11-http-circuit-breaker.md`](./items/TASK-11-http-circuit-breaker.md) — Suíte completa de Autenticação HTTP (Basic, Bearer, API Key, OAuth2, mTLS) e Circuit Breaker resiliente.
- [`TASK-12-metering-usage-ledger-aggregation.md`](./items/TASK-12-metering-usage-ledger-aggregation.md) — Ledger contábil imutável de consumo de tokens/tempo/execuções por organização.
- [`TASK-13-dynamic-rate-limiting-per-tier.md`](./items/TASK-13-dynamic-rate-limiting-per-tier.md) — Rate limits dinâmicos em sliding window Redis vinculados ao plano contratado.
- [`TASK-14-e2e-load-and-chaos-testing.md`](./items/TASK-14-e2e-load-and-chaos-testing.md) — Suíte de testes de carga a 100 RPS (p95 < 300ms) e injeção de caos/falhas de infraestrutura.

### P2 — Expansão de Integrações & Developer Experience
- [`TASK-15-workflow-semantic-diff-versioning.md`](./items/TASK-15-workflow-semantic-diff-versioning.md) — Algoritmo de diff semântico entre versões de grafos e histórico de alterações.
- [`TASK-16-comms-nodes-teams-whatsapp.md`](./items/TASK-16-comms-nodes-teams-whatsapp.md) — Handlers nativos para Microsoft Teams (Adaptive Cards) e WhatsApp Cloud API.
- [`TASK-17-google-workspace-calendar-docs.md`](./items/TASK-17-google-workspace-calendar-docs.md) — Handlers nativos para Google Calendar e Google Docs com injeção OAuth2.
- [`TASK-18-openapi-client-sdk-generation.md`](./items/TASK-18-openapi-client-sdk-generation.md) — Geração e sincronização automática de SDK TypeScript/Zod a partir de contrato OpenAPI 3.1.
- [`TASK-19-secrets-dynamic-kms-rotation.md`](./items/TASK-19-secrets-dynamic-kms-rotation.md) — Rotação dinâmica de master key AES-256-GCM / KMS com re-encriptação sem downtime.
- [`TASK-20-audit-trail-tamper-proof-ledger.md`](./items/TASK-20-audit-trail-tamper-proof-ledger.md) — Trilha de auditoria criptograficamente encadeada (SHA-256 hash chain) para compliance.
