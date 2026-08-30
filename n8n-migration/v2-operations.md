# Operações e Observabilidade 24/7 — AgentFlow

> **Missão**: Projetar a camada de operações e observabilidade 24/7 para a plataforma AgentFlow — automação visual de workflows compatível com n8n, execução always-on em nuvem. A execução é 100% server-side: o navegador é apenas o painel de controle. Este documento é **especificação** — não altera código.
>
> **Base de arquitetura**: `design-runner.md`, `design-recriacao.md`, `briefs/prompt-arquitetura-cloud.md`, `briefs/prompt-deploy-cicd.md`, `setup-dev.md`, `v2-security-spec.md`, `deps-e-libs.md`.
> **Stack operacional**: pnpm monorepo (Turborepo), Fastify 5 (API), Next.js 15 (web), BullMQ 5 + Redis 7 (fila/execução), Prisma 6 + PostgreSQL 16 (estado), object storage (artefatos), HashiCorp Vault / cloud KMS (segredos), AES-256-GCM envelope (credenciais).

---

## 1. Visão geral

### 1.1 Contexto operacional

A plataforma AgentFlow executa workflows 24h por dia, 7 dias por semana, sem intervenção do usuário final. Qualquer falha no caminho **trigger → fila → worker → executor → persistência** interrompe execuções em andamento, perde dados de automação e compromete SLAs. A camada de operações deve garantir:

- **Visibilidade completa**: logs estruturados, métricas Prometheus, tracing distribuído (OpenTelemetry) com correlação de traceId em todo o caminho.
- **Resiliência automática**: auto-restart de workers, graceful shutdown, draining de jobs, circuit breaker, dead-letter queue.
- **Recuperação de desastre**: backups point-in-time (PITR) de PostgreSQL e Redis, restore testado, runbook de DR com RPO < 5 min e RTO < 30 min.
- **Governança de custos**: tracking por serviço e organização, budget alerts, relatório de custo.
- **Gestão de incidentes**: severity escalável, comunicação estruturada, postmortems com ações corretivas.

### 1.2 Modelo de serviços e propriedade operacional

| Serviço | Processo / Container | Runtime | Proprietário operacional | Métricas expostas |
|---|---|---|---|---|
| **api** | `apps/api` (Fastify) | Node 22, porta 3001 | Equipe de API | `/metrics` (Prometheus) |
| **web** | `apps/web` (Next.js) | Node 22, porta 3000 | Equipe de UI | `/api/metrics` (SSR count, TTFB) |
| **scheduler** | `scheduler.worker.ts` | Node 22 | Equipe de Execução | `/metrics` |
| **executor-worker** | `execution.worker.ts` | Node 22 | Equipe de Execução | `/metrics` |
| **webhook-gateway** | `routes/webhooks.ts` (parte da API) | Node 22 | Equipe de API | `/metrics` |
| **event-gateway** | `routes/events.ts` (planejado) | Node 22 | Equipe de API | `/metrics` |
| **executor-service** | `services/executor.ts` (intra-worker) | Node 22 | Equipe de Execução | (via worker metrics) |

> **Nota**: Scheduler e executor-worker são processos **separados** do API (conforme `design-recriacao.md` §(e)). Isso permite deploy e escala independentes e isola falhas de execução do plano de controle.

### 1.3 Diagrama ASCII — Arquitetura operacional

```
                                  ┌────────────────────────┐
                                  │   STATUS PAGE          │
                                  │  (Cachet / Atlassian)  │
                                  └────────────┬───────────┘
                                               │
                    ┌──────────────────────────┴──────────────────────────┐
                    │          OBSERVABILidade PLANE                       │
                    │  Prometheus ──► Alertmanager ──► Grafana             │
                    │  Loki (logs)  ──► Promtail                          │
                    │  Tempo/Jaeger (traces)                             │
                    └──────────┬──────────────┬──────────────┬────────────┘
                               │              │              │
         ┌─────────────────────┼─────────┐   │   ┌──────────▼───────────┐
         ▼                     ▼         │   │   ▼                      │
┌──────────────────┐  ┌──────────────┐  ┌─────────────┐    ┌──────────────────┐
│   WEB (Next.js)  │  │  API Gate-   │  │  Event &    │    │  WORKER / EXECUTOR  │
│  porta 3000      │  │  way / Edge  │  │  Webhook    │    │  (processo sep.)    │
│  (dashboard)     │  │  (NGINX)     │  │  Gateway     │    │  scheduler.worker   │
└────────┬─────────┘  └──────┬───────┘  └──────┬──────┘    └─────────┬────────┘
         │                    │                 │                     │
         │              ┌────┴────┐     ┌───────┴───────┐        ┌────┴────┐
         │              │  API    │     │  Webhook GW   │        │ Worker  │
         │              │ Fastify │     │  HMAC + Queue │◄──────►│  queue  │
         │              │  :3001  │     │  202 resposta │        │ enqueue │
         │              └────┬────┘     └───────┬───────┘        └─────────┘
         │                   │                 │
         │                   │  ┌──────────────┴────────┐
         │                   │  │     CONTROL PLANE     │
         │                   │  │  • Scheduler (leader    │
         │                   │  │    election via Redis) │
         │                   │  │  • Job enqueue         │
         │                   │  │  • Status update API   │
         │                   │  └──────────────┬────────┘
         │                   │                 │
         │                   ▼                 ▼
         │              ┌──────────────────────────┐
         │              │   REDIS (BullMQ)         │
         │              │  • Queue: workflows      │
         │              │  • Queue: scheduler      │
         │              │  • Queue: webhook        │
         │              │  • Scheduler lock (SETNX)│
         │              │  • Worker heartbeat TTL  │
         │              └──────────────────────────┘
         │                                 │
         │                                 ▼
         │              ┌─────────────────────────────────┐
         └─────────────►│   POSTGRESQL (Prisma)            │
                        │  • WorkflowExecution            │
                        │  • NodeExecution                │
                        │  • AuditLog (hash chain)        │
                        │  • Credential (AES-256-GCM)     │
                        └─────────────────────────────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │  OBJECT STORAGE        │
                         │  • Artefatos/logs      │
                         │  • Backup de Postgres  │
                         │  • Backup de Redis     │
                         └────────────────────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │  VAULT / KMS           │
                         │  • KEK mestre          │
                         │  • JWT_SECRET          │
                         │  • Webhook secrets     │
                         └────────────────────────┘
```

### 1.4 Modelo de confiança

- **Navegador**: não é confiável. Apenas renderiza o painel; não executa workflows. Tokens de API têm TTL curto (15 min, conforme `v2-security-spec.md` §3.3).
- **Worker**: executa código não confiável (node `code` sandboxado via `isolated-vm`). Tratado como potencialmente comprometido — nunca recebe chaves mestres em variáveis de ambiente.
- **Admin da plataforma**: confiável, auditado. Todas as ações administrativas geram entradas em `AuditLog`.
- **Segredos de serviço** (KEK, JWT_SECRET, webhook signing keys) residem em Vault/KMS, nunca em imagens Docker nem repositório.

### 1.5 Princípios operacionais

1. **Defense in depth**: cada ameaça tem ≥2 controles independentes (ex.: alerta por métrica + health check + circuit breaker).
2. **Observabilidade como padrão**: nenhuma nova funcionalidade entra em prod sem endpoint `/metrics` e logs estruturados.
3. **Automatizar o máximo possível**: auto-restart, autoscaling, rollback automático em falha de health, DR automatizado onde seguro.
4. **Testar recuperação**: backups sem restore testado são apenas backup caro. Teste de DR trimestral + restore test mensal.
5. **Governança por SLIs reais**: SLOs baseados em metric data do usuário final, não em infra abstrata.

---

## 2. Logs estruturados

### 2.1 Formato padrão — JSON

Todos os serviços emitem logs como **JSON estruturado (uma linha por evento)** no formato [JSON Lines](https://jsonlines.org/). O schema base é:

```json
{
  "timestamp": "2026-08-20T14:32:01.123Z",
  "level": "info",
  "service": "executor-worker",
  "traceId": "4bf92f3577b34da6a372722928f84214",
  "spanId": "a3e5d7c2b1f9048e",
  "executionId": "exec_3xK9mN2pQ8",
  "workflowId": "wf_AB12CdEf",
  "nodeId": "node_httpRequest_01",
  "orgId": "org_Northstar",
  "tenantId": "org_Northstar",
  "userId": "usr_victor",
  "event": "node.completed",
  "message": "HTTP Request node completed successfully",
  "durationMs": 245,
  "status": "success",
  "metadata": {
    "nodeType": "httpRequest",
    "statusCode": 200,
    "retryCount": 0
  }
}
```

**Campos obrigatórios** (todos os eventos):

| Campo | Tipo | Descrição |
|---|---|---|
| `timestamp` | string (RFC 3339) | Hora UTC da emissão, precisão de milissegundos |
| `level` | enum | `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `service` | string | Nome do serviço emissor (api, web, scheduler, executor-worker, webhook-gateway) |
| `traceId` | string (hex 32) | ID do tracing distribuído — correlaciona toda a request |
| `executionId` | string | ID da execução de workflow (quando aplicável) |
| `workflowId` | string | ID do workflow (quando aplicável) |
| `nodeId` | string | ID do nó (quando aplicável) |
| `orgId` | string | ID da organização — **sempre presente em requests autenticados** |
| `event` | string | Tipo de evento estruturado (ex: `workflow.triggered`, `node.started`, `execution.failed`) |
| `message` | string | Mensagem legível por humanos |
| `metadata` | object | Campos específicos do evento |

### 2.2 Níveis de log e mapeamento

| Nível | Uso | Exemplos de eventos | Retenção (prod) |
|---|---|---|---|
| `debug` | Diagnóstico profundo, só em caso de incidente | SQL query plans, job state transitions finas | 7 dias (coletado só em demanda) |
| `info` | Eventos normais de ciclo de vida | workflow.triggered, node.started, execution.completed, worker.started | 90 dias |
| `warn` | Comportamento inesperado mas não falha | retry scheduled, queue depth > 50% threshold, timeout aumentado | 90 dias |
| `error` | Falha individual (não afeta serviço) | node.execution.failed, credential.decrypt.error, webhook.hmac.failed | 365 dias |
| `fatal` | Serviço inoperante | worker.crash, api.out_of_memory, scheduler.lose_leadership | 365 dias + alerta imediato |

### 2.3 Exemplo de log JSON estruturado real

**Trigger via webhook (evento principal):**

```json
{"timestamp":"2026-08-20T14:32:01.123Z","level":"info","service":"webhook-gateway","traceId":"4bf92f3577b34da6a37272928f84214","spanId":"b2c1d4e5f6a7b8c9","orgId":"org_Northstar","workflowId":"wf_AB12CdEf","event":"webhook.triggered","message":"Webhook received and validated","metadata":{"webhookId":"wh_xyz789","path":"/webhook/org_northstar/xyz789","method":"POST","httpStatus":202,"executionId":"exec_3xK9mN2pQ8","clientIp":"203.0.113.45"}}
```

**Execução de nó (sucesso):**

```json
{"timestamp":"2026-08-20T14:32:05.445Z","level":"info","service":"executor-worker","traceId":"4bf92f3577b34da6a37272928f84214","spanId":"a3e5d7c2b1f9048e","executionId":"exec_3xK9mN2pQ8","workflowId":"wf_AB12CdEf","nodeId":"node_httpRequest_01","orgId":"org_Northstar","event":"node.completed","message":"HTTP Request node completed","metadata":{"nodeType":"httpRequest","statusCode":200,"durationMs":245,"retryCount":0}}
```

**Falha de nó (erro):**

```json
{"timestamp":"2026-08-20T14:32:10.789Z","level":"error","service":"executor-worker","traceId":"4bf92f3577b34da6a37272928f84214","spanId":"a3e5d7c2b1f9048e","executionId":"exec_3xK9mN2pQ8","workflowId":"wf_AB12CdEf","nodeId":"node_httpRequest_01","orgId":"org_Northstar","event":"node.failed","message":"HTTP Request node failed with timeout","metadata":{"nodeType":"httpRequest","errorType":"TimeoutError","durationMs":30000,"retryCount":1,"maxRetries":3},"error":"AbortError: The operation was aborted due to a timeout of 30000ms"}
```

### 2.4 Redação de segredos

**Nunca** devem aparecer em logs: `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, valores de credenciais (`data` em `Credential`), passwords, tokens OAuth, API keys, segredos de webhook.

**Mecanismo de redação** (aplicado no agente de log / logger library antes do envio):

1. **Sanitizer de campo**: lista denylist de nomes de campo — qualquer chave cujo nome casse com regex `(?i)(password|secret|token|api[_-]?key|credential|private[_-]?key|webhook[_-]?secret)` tem seu valor substituído por `"[REDACTED]"`.
2. **Regex de padrão**: redige padrões conhecidos:
   - JWT: `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` → `[REDACTED_JWT]`
   - Bearer token: `Bearer\s+[A-Za-z0-9._-]+` → `Bearer [REDACTED]`
   - AWS keys: `AKIA[0-9A-Z]{16}` → `[REDACTED_AWS_KEY]`
   - Stripe keys: `sk_live_[0-9a-zA-Z]{24,}` / `sk_test_[0-9a-zA-Z]{24,}` → `[REDACTED_STRIPE_KEY]`
   - nvapi/NVIDIA: `nvapi-[A-Za-z0-9_-]{80,}` → `[REDACTED_NVIDIA_KEY]`
3. **Sanitizer de URL**: remove query params `?api_key=`, `?token=`, `?key=` das URLs de log.
4. **Sanitizer de stack trace**: remove linhas que contenham valores de segredos já conhecidos (ex.: "Invalid API key **sk-abc123...**" → "Invalid API key [REDACTED]").

> **Referência**: A auditoria de segurança (`agentflow-security-audit.md`) H-02 identificou que credenciais são armazenadas em plaintext (`schema.prisma:211`, `credentials.ts:35-43`). A redação de logs é o controle 1; o controle 2 é criptografar em repouso (AES-256-GCM, conforme `design-recriacao.md` §(f)). Ambos devem operar em conjunto.

### 2.5 Rotação e retenção

| Destino | Frequência de rotação | Retenção | Criptografia |
|---|---|---|---|
| **stdout → arquivo local** | 50 MB ou 1h (whichever first) | 7 dias | — |
| **stdout → Loki (produção)** | Streaming | 90 dias hot / 365 dias cold (object storage) | TLS in-transit |
| **stderr capturado** | 50 MB | 30 dias | — |
| **Log de auditoria (AuditLog)** | Append-only no Postgres + replica para object storage | 7 anos (GDPR/compliance) | AES-256-GCM at-rest |

**Configuração do agente (Promtail/Vector)** — exemplo para produção:

```yaml
# vector.yaml
[sources.agentflow_logs]
type = "journald"      # ou docker logs
include = ["agentflow-*"]

[transforms.redact_secrets]
type = "remap"
inputs = ["agentflow_logs"]
source = '''
  . = parse_json!(.)
  # Redação automática de segredos
  if starts_with(.message, "Bearer ")
    .message = "Bearer [REDACTED]"
  .
'''

[sinks.loki]
type = "loki"
inputs = ["redact_secrets"]
endpoint = "https://loki.infra.internal.loki:3100"
labels.service = "api"
labels.org = "agentflow"
encoding.codec = "json"
batch.max_bytes = 1000000
batch.timeout_secs = 5
```

### 2.6 Exportação

- **Hot path (streaming)**: logs `info`+ fluem em tempo real para Loki via Promtail (Docker) ou Vector (k8s). Latência < 5s do evento à disponibilidade no Grafana.
- **Cold path (arquivo)**: logs rotaçãoados são snapshotados diariamente para object storage (S3/Cloudflare R2) com lifecycle policy (transição para IA após 30 dias, expurgo após 365 dias).
- **Backpressure**: se Loki indisponível, buffer em disco de 1 GB (`buffer.max_size = 1073741824`); drop de `debug` logs em overflow, mas nunca `error`/`fatal`.

---

## 3. Métricas

### 3.1 Exposição

Cada serviço expõe métricas Prometheus em `GET /metrics`. Em k8s, o Prometheus scruteia via ServiceMonitor; em deployment simples (Fly.io/Railway), o sidecar Promtail ou um scrape externo coleta.

**Dependência**: usar `prom-client` (ou `@fastify/metrics` no API). BullMQ expõe métricas de queue native via interface `Queue`'s `getMetricsChart` + workers custom metrics.

**Configuração de scrape** (Prometheus `ServiceMonitor`):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: agentflow
  labels: { app: agentflow }
spec:
  selector:
    matchLabels: { app: agentflow }
  endpoints:
  - port: metrics
    path: /metrics
    interval: 15s
    scrapeTimeout: 10s
```

### 3.2 Métricas-chave (nomes Prometheus)

#### 3.2.1 Execuções de workflow

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_workflow_execution_total` | Counter | `status{queued,running,success,failed,cancelled,timeout}` `trigger{webhook,cron,manual,api}` `orgId` | Contagem total de execuções criadas |
| `agentflow_workflow_execution_duration_seconds` | Histogram | `quantile` `trigger` `orgId` | Duração total da execução (criação → término) |
| `agentflow_workflow_execution_active` | Gauge | `orgId` | Execuções atualmente em RUNNING |
| `agentflow_workflow_trigger_latency_seconds` | Histogram | `quantile` `trigger` | Latência do trigger até o job ser enfileirado |

**Buckets de histograma padrão (duração de execução)**:
`[0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300, 600, 1800]` (até 30 min).

#### 3.2.2 Execução de nós

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_node_execution_total` | Counter | `nodeType` `status` `orgId` | Total de execuções de nó |
| `agentflow_node_execution_duration_seconds` | Histogram | `quantile` `nodeType` | Duração por tipo de nó |
| `agentflow_node_retry_count` | Histogram | `nodeType` | Distribuição de retries por nó |
| `agentflow_node_execution_memory_bytes` | Gauge | `nodeType` | Memória usada durante a execução |

#### 3.2.3 Filas (BullMQ)

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_queue_depth` | Gauge | `queue` `priority` | Jobs na fila esperando processamento |
| `agentflow_queue_lag_seconds` | Gauge | `queue` | Tempo entre job criado e pego pelo worker |
| `agentflow_queue_delayed_jobs` | Gauge | `queue` | Jobs agendados para execução futura |
| `agentflow_queue_stalled_jobs` | Gauge | `queue` | Jobs em estado de stall (worker desapareceu) |
| `agentflow_queue_failed_jobs_total` | Counter | `queue` | Total de jobs movidos para DLQ |

> **Filas no sistema** (conforme `prompt-arquitetura-cloud.md` §3 e `design-recriacao.md`):
> - `workflows` — execução de workflows (jobs `execute` com `executionId`)
> - `scheduler` — agendamento cron (leader-elected)
> - `webhook` — processamento assíncrono de webhooks (se aplicável)
> - `retry` — jobs de retry com backoff
> - `notification` — envio de e-mails/notificações

#### 3.2.4 Workers / Scheduler

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_worker_active` | Gauge | `workerType` `orgId` | Workers ativos (heartbeat recente) |
| `agentflow_worker_jobs_processed_total` | Counter | `workerType` `status` | Jobs processados (success/failed) |
| `agentflow_scheduler_leader` | Gauge | — | 1 se este processo é o líder, 0 caso contrário |
| `agentflow_scheduler_next_run_seconds` | Gauge | `workflowId` | Segundos até o próximo cron disparar |
| `agentflow_worker_concurrency` | Gauge | `workerType` | Concurrency configurada |

#### 3.2.5 Saúde de dependências

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_db_connections` | Gauge | `state{active,idle,waiting}` | Pool de conexões Prisma |
| `agentflow_redis_up` | Gauge | — | 1 se Redis responde, 0 se não |
| `agentflow_redis_memory_used_bytes` | Gauge | — | Memória usada pelo Redis |
| `agentflow_external_api_latency_seconds` | Histogram | `provider` `quantile` | Latência de chamadas a APIs externas (OpenAI, NVIDIA, Stripe) |

#### 3.2.6 Segurança / auditoria

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_auth_failure_total` | Counter | `reason{invalid_credentials,rate_limited,mfa_required}` | Falhas de autenticação |
| `agentflow_webhook_hmac_failed_total` | Counter | `orgId` | Weblogs com HMAC inválido (tentativa de abuso) |
| `agentflow_credential_decrypt_error_total` | Counter | `orgId` `purpose` | Erros ao descriptografar credencial |
| `agentflow_rbac_denied_total` | Counter | `resource` `action` `orgId` | Acessos negados pelo RBAC |

#### 3.2.7 Custos

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `agentflow_cost_estimate_cents_total` | Counter | `service{postgres,redis,workers,egress,llm}` `orgId` | Estimativa de custo acumulado |
| `agentflow_llm_tokens_total` | Counter | `provider` `model` `direction{in,out}` `orgId` | Tokens consumidos em nodes AI |

### 3.3 Exemplo de resposta `/metrics`

```prometheus
# HELP agentflow_workflow_execution_total Total workflow executions by status
# TYPE agentflow_workflow_execution_total counter
agentflow_workflow_execution_total{trigger="webhook",status="success",orgId="org_Northstar"} 1247
agentflow_workflow_execution_total{trigger="cron",status="failed",orgId="org_Northstar"} 3
# HELP agentflow_queue_depth Number of jobs waiting in queue
# TYPE agentflow_queue_depth gauge
agentflow_queue_depth{queue="workflows",priority="high"} 12
agentflow_queue_depth{queue="workflows",priority="default"} 142
# HELP agentflow_queue_lag_seconds Seconds between job creation and pickup
# TYPE agentflow_queue_lag_seconds gauge
agentflow_queue_lag_seconds{queue="workflows"} 0.847
```

---

## 4. Tracing distribuído

### 4.1 Pilha OpenTelemetry

| Componente | Biblioteca | Observação |
|---|---|---|
| **SDK** | `@opentelemetry/sdk-node` | Auto-instrumentação para Node.js |
| **Instrumentação Fastify** | `@opentelemetry/instrumentation-fastify` | Spans de HTTP requests |
| **Instrumentação BullMQ** | `@opentelemetry/instrumentation-bullmq` | Spans de enqueue/process |
| **Instrumentação Prisma** | `@opentelemetry/instrumentation-prisma` | Spans de query DB |
| **Instrumentação HTTP client** | `@opentelemetry/instrumentation-http` | Chamadas externas (fetch) |
| **Exporter** | `@opentelemetry/exporter-trace-otlp-grpc` | OTLP gRPC → collector |
| **Backend** | Jaeger ou Grafana Tempo | Armazenamento de traces |

### 4.2 Propagação de traceId

- **Padrão**: W3C `traceparent` header (compatible com Jaeger/B3).
- **Na fila (BullMQ)**: `traceId` e `spanId` são **embutidos no job data** (`{ executionId, traceId, spanId }`) pelo API ao enfileirar. O worker lê e injeta no contexto do OpenTelemetry via `trace.setSpan(context.active(), ...)`.
- **Worker heartbeat**: o worker publica heartbeat em Redis com `traceId` do job atual, permitindo correlação de falhas de worker com execuções.

### 4.3 Spans por componente

```
HTTP POST /webhook/org_northstar/xyz789 ──► workflow.triggered
  └─ webhook.validate.hmac
  └─ workflow.create_execution (Prisma INSERT)
  └─ queue.enqueue (BullMQ) ──► execution.enqueued
     └─ (traceId propagado no job data)

Worker processa job:
  └─ execution.run ──► traceId preservado
       └─ execution.load (Prisma SELECT)
       └─ node.topological_sort
       └─ node.execute [para cada nó] ──► node.started / node.completed
            └─ node.resolve_credentials (decrypt AES-256-GCM)
            └─ node.handler (ex: http_request)
                 └─ http.client (call externa)
       └─ execution.complete / execution.failed
       └─ db.persist_node_execution
       └─ db.update_workflow_execution
```

### 4.4 Sampling

| Cenário | Taxa | Justificativa |
|---|---|---|
| **Prod — sucesso** | 10% (0.1) | Redução de custo de armazenamento; trace de amostra |
| **Prod — erro (`level=error`/`fatal`)** | 100% | Sempre tracear falhas para debug |
| **Prod — execuções críticas** | 100% | Workflows marcados como `critical=true` pelo org owner |
| **Staging** | 100% | Full visibility em ambiente não-prod |
| **Dev** | 100% | Debug local |

Configuração do `TracerProvider`:

```typescript
// apps/api/src/instrumentation.ts
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semconv';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTLP_ENDPOINT || 'http://otel-collector:4317',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || 'agentflow-api',
    'service.version': process.env.APP_VERSION || 'dev',
  }),
  traceExporter,
  instrumentations: [
    new FastifyInstrumentation(),
    new BullMQInstrumentation(),
    new PrismaInstrumentation(),
    new HttpInstrumentation(),
  ],
});
sdk.start();
```

### 4.5 Correlação logs ↔ traces

O logger padrão (pino) injeta automaticamente `traceId`/`spanId` do contexto ativo via `@opentelemetry/api`. Toda linha de log JSON contém `traceId`, permitindo:

1. No Loki, filtrar por `traceId="..."` → ver todos os logs daquela request.
2. No Grafana, clicar em um trace do Tempo → abrir os logs correlacionados no Loki (via `Explore` com link `traceId`).
3. Na UI de execução de workflow, exibir o `traceId` e linkar para o trace no Jaeger/Tempo.

---

## 5. Alertas

### 5.1 Motor de alertas

**Stack**: Prometheus (scrape) → Alertmanager (deduplicação + roteamento) → canais.

**Configuração base do Alertmanager**:

```yaml
# alertmanager.yaml
route:
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 3h
  receiver: 'slack-critical'
  routes:
    - match:
        severity: 'warning'
      receiver: 'slack-warning'
      repeat_interval: 24h
    - match:
        severity: 'critical'
        service: 'billing'
      receiver: 'pagerduty'
    - match_re:
        channel: 'telegram|discord'
      receiver: '{{channel}}_alerts'

receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_CRITICAL}'
        channel: '#incidents'
        send_resolved: true
        title: '{{ template "slack.title" . }}'
        text: '{{ template "slack.text" . }}'
  - name: 'slack-warning'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_WARNING}'
        channel: '#operacoes'
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        send_resolved: true
```

### 5.2 Regras de alerta (concrete com thresholds)

#### 5.2.1 Execuções

| Alerta | Severity | Condição PromQL | Duração | Ação |
|---|---|---|---|---|
| `ExecutionFailureRateHigh` | warning | `rate(agentflow_workflow_execution_total{status="failed"}[5m]) / rate(agentflow_workflow_execution_total[5m]) > 0.05` | 5m | Investigar spike de falhas |
| `ExecutionFailureRateCritical` | critical | `... > 0.15` | 2m | Escalar para on-call, pausar triggers se > 25% |
| `ExecutionTimeout` | warning | `count(agentflow_workflow_execution_active > 0) and time() - max_over_time(agentflow_workflow_execution_start_time[1m]) > 600` | 3m | Identificar workflows travados |
| `ExecutionQueueBacklog` | warning | `agentflow_queue_depth{queue="workflows"} > 1000` | 5m | Escalar workers |
| `ExecutionQueueSevereBacklog` | critical | `agentflow_queue_depth{queue="workflows"} > 5000 or agentflow_queue_lag_seconds{queue="workflows"} > 120` | 1m | Escalar máxima de workers + páginas on-call |
| `ExecutionStalledJobs` | warning | `agentflow_queue_stalled_jobs{queue="workflows"} > 50` | 5m | Investigar workers mortos |

#### 5.2.2 Workers / Scheduler

| Alerta | Severity | Condição | Duração | Ação |
|---|---|---|---|---|
| `WorkerDown` | critical | `absent(agentflow_worker_heartbeat{job="executor-worker"}) == 1` | 90s | Auto-restart do worker + page on-call |
| `SchedulerLeaderMissing` | critical | `absent(agentflow_scheduler_leader == 1) for 60s` | 60s | Force leader election, validar Redis lock |
| `WorkerCrashLoop` | warning | `rate(kube_pod_container_status_restarts_total{container="executor-worker"}[5m]) > 2` | 5m | Investigar crash, aplicar backoff |
| `WorkerConcurrencySaturated` | warning | `agentflow_worker_active{workerType="executor"} / agentflow_worker_concurrency >= 0.95` | 2m | Escalar workers |

#### 5.2.3 Infraestrutura

| Alerta | Severity | Condição | Duração | Ação |
|---|---|---|---|---|
| `DatabaseHighConnections` | warning | `agentflow_db_connections{state="active"} / agentflow_db_connections_max > 0.80` | 5m | Investigar conexões leaked |
| `DatabaseDown` | critical | `pg_up == 0` | 1m | Failover / DR |
| `RedisMemoryHigh` | warning | `agentflow_redis_memory_used_bytes / agentflow_redis_memory_max_bytes > 0.85` | 2m | Investigar ou escalar Redis |
| `WorkerMemoryHigh` | critical | `rate(agentflow_worker_rss_bytes[5m]) > 0.90 * worker_memory_limit` | 3m | Restart worker, investigar memory leak |

#### 5.2.4 Segurança

| Alerta | Severity | Condição | Duração | Ação |
|---|---|---|---|---|
| `WebhookHmacSpoofing` | critical | `rate(agentflow_webhook_hmac_failed_total[5m]) > 10` | 1m | Possível ataque — block IP via WAF |
| `CredentialDecryptErrors` | warning | `rate(agentflow_credential_decrypt_error_total[10m]) > 5` | 10m | Investigar chave expirada ou uso indevido |
| `AuthFailureSpike` | warning | `rate(agentflow_auth_failure_total[5m]) > 50` | 5m | Possível brute-force — verificar rate limit |
| `RbacDeniedAnomaly` | info | `rate(agentflow_rbac_denied_total[5m]) > 20` | 5m | Verificar tentativa de IDOR/invasão |

#### 5.2.5 Custos

| Alerta | Severity | Condição | Duração | Ação |
|---|---|---|---|---|
| `CostAnomaly` | warning | `rate(agentflow_cost_estimate_cents_total[1h]) projected_24h > budget_monthly * 0.80` | 1h | Revisar usage, possível abuso |
| `CostBudgetExceeded` | critical | `agentflow_cost_estimate_cents_total > budget_limit` | 1h | Pausar execuções, page finance |

### 5.3 Deduplicação e silenciamento

- **Deduplicação (grouping)**: alertas do mesmo `alertname` + `service` + `orgId` são agrupados; o `repeat_interval` de 3h impede spam. Múltiplas falhas do mesmo orgId de workers são enviadas como **uma única notificação**.
- **Inibição (inhibition)**: se `DatabaseDown` está ativo, inibe `WorkerDown` (já que os workers vão falhar naturalmente por falta de DB).
- **Silenciamento (silence)**: janelas de manutenção programadas (ex.: janela de migrations de 02:00–02:30 UTC) silenciam alertas não-críticos. Silenciamentos documentados em `ops/runbook-maintenance.md`.

### 5.4 Escalação

| Canal | Uso | SLA de resposta |
|---|---|---|
| **Slack #incidents** (warning) | Falhas de serviço, queue backlog, custos | 15 min |
| **Slack #oncall** (critical) | Downtime, data loss, segurança | 5 min |
| **PagerDuty** (critical P1) | Downtime > 5 min, falha de DB, DR | 3 min |
| **Email** (warning/critical) | Backup, certificações | 1h |
| **Discord/Telegram** (info/debug) | Notícias de deploy, manutenção | 4h |
| **Webhook** (custom) | Integração com sistemas internos | conforme contrato |

---

## 6. SLOs

### 6.1 SLIs e SLOs

| Serviço | SLI | SLO | Janela | Unidade |
|---|---|---|---|---|
| **API (Fastify)** | Disponibilidade (HTTP 2xx / total) | **99.9%** | 30 dias | % |
| **API** | Latência p95 (requests síncronos) | **< 500 ms** | 30 dias | ms |
| **Workflow Execution** | Taxa de sucesso (success / total started) | **99.5%** | 30 dias | % |
| **Scheduler** | Latência p95 de disparo cron (agendado → enfileirado) | **< 5 s** | 30 dias | s |
| **Worker / Executor** | Taxa de jobs processados sem crash | **99.9%** | 30 dias | % |
| **Webhook Gateway** | Disponibilidade | **99.9%** | 30 dias | % |
| **Data Durability (PostgreSQL)** | Window of exposure (RPO) | **< 5 min** | 30 dias | — |
| **Recovery (RTO)** | Tempo para restaurar serviço após failover | **< 30 min** | 30 dias | min |

> **Definição de disponibilidade**: API considered available se `/health` responde 200 e `/ready` passa (DB + Redis conectados). Workflow execution success = `WorkflowExecution.status == SUCCESS`; **exclui** cancelados (user-initiated) e `WAITING_APPROVAL` (não é falha técnica).

### 6.2 Burn rate e política de error budget

O **error budget** é `1 - SLO`. Para API a 99.9%, o budget é 43.2 minutos de indisponibilidade por mês.

| Burn rate | Indicador | Ação | Janela de detecção |
|---|---|---|---|
| **14.40×** (crítico) | Consome todo o budget em ~2h | Pausar releases, page on-call, rollback automático | 1h |
| **6×** (alto) | Consome todo o budget em ~5h | Investigar imediatamente, escalar | 6h |
| **2×** (moderado) | Consome todo o budget em ~15h | Investigar no fim do dia útil | 24h |
| **0.5×** (baixo) | Consome metade do budget em 30 dias | OK, mas monitorar | 30 dias |

**Fórmula do burn rate (1h):**
```
burn_rate_1h = (1 - SLO) * (30 dias / 1h) * (incident_count_no_budget_remaining)
```

Praticamente: se em 1h a disponibilidade caiu tanto que o remanescente do budget não dura mais que 1h a essa taxa → burn rate 14.40×.

**Política de consumo de budget:**
- Burn rate ≥ 6× → alocação de engenheiros para incidente imediata (P1).
- Burn rate ≥ 14.40× → **rollback automático** do último deploy (veja §9.5) + comunicação ao status page.
- Budget esgotado → **feature freeze** até o próximo ciclo.

### 6.3 Reporte de SLO

**Frequência**:
- **Real-time dashboard**: painel Grafana "SLO Overview" atualizado a cada scrape (15s).
- **Daily report**: email resumido para engenharia (burn rate, budget restante, top 5 erros).
- **Monthly SLO report**: postmortem automatizado exportado para Confluence, revisado em cerimônia de SLO review com product/engineering/ops.

**Template de reporte:**

```
SLO MONTHLY REPORT — Aug 2026
API Availability: 99.93% (99.9% SLO) — budget consumido: 24% (burn 0.5x) OK
API Latency p95: 312ms (500ms SLO) — 100% dentro do alvo
Workflow Success: 99.67% (99.5% SLO) — 327 execuções falharas em 1,128,450 — dentro do alvo
Action items: 0
```

---

## 7. Health checks

### 7.1 Endpoints por serviço

| Endpoint | Propósito | Verificações | Timeout | Código de erro |
|---|---|---|---|---|
| `/health` | **Liveness** (basica) | Servidor UP | 3s | 503 se processo não responde |
| `/ready` | **Readiness** (serviço pronto para tráfego) | DB conectado, Redis conectado, queue inicializada, migrations aplicadas | 5s | 503 se dependencies down |
| `/live` | **Deep liveness** (produção) | + worker heartbeat recente, + scheduler leader ativo, + não em modo de degradação | 10s | 503 se worker morto há > 90s |
| `/metrics` | Métricas Prometheus | Sempre 200 se servidor UP | 10s | 200 |

**Implementação (Fastify):**

```typescript
// apps/api/src/routes/health.ts
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  service: 'agentflow-api',
  version: process.env.APP_VERSION || 'dev',
}));

fastify.get('/ready', async (request, reply) => {
  const checks: Record<string, boolean> = {};
  // DB
  checks.database = await prisma.$queryRawUnsafe('SELECT 1').then(() => true).catch(() => false);
  // Redis
  checks.redis = await redis.ping().then((p: string) => p === 'PONG').catch(() => false);
  // Queue
  checks.queue = queue.client.status() === 'ready';
  // Migrations
  checks.migrations = (await prisma.$queryRawUnsafe('SELECT 1 FROM PrismaSchemaVersion LIMIT 1')).length > 0;
  const ready = Object.values(checks).every(v => v === true);
  reply.code(ready ? 200 : 503);
  return { status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() };
});

fastify.get('/live', async (request, reply) => {
  const checks: Record<string, boolean> = {
    database: true,
    redis: true,
  };
  // Worker heartbeat (Redis key: worker:heartbeat:executor-worker — TTL 60s)
  const lastBeat = await redis.get('worker:heartbeat:executor-worker');
  checks.worker_heartbeat = !!lastBeat;
  // Scheduler leader
  const leader = await redis.get('scheduler:leader');
  checks.scheduler_leader = !!leader;
  // Queue lag
  const lag = await getQueueLag();
  checks.queue_lag_ok = lag < 30;
  const live = Object.values(checks).every(v => v === true);
  reply.code(live ? 200 : 503);
  return { status: live ? 'live' : 'degraded', checks, timestamp: new Date().toISOString() };
});
```

### 7.2 Health checks por serviço

| Serviço | /health | /ready | /live | Observação |
|---|---|---|---|---|
| **api** | ✓ | DB, Redis, queue, migrations | + worker heartbeat, scheduler leader | Exposto no load balancer |
| **executor-worker** | ✓ | Redis, Prisma | + job processing lag < 30s | Não expõe HTTP (background) — health via stdout log + heartbeat Redis |
| **scheduler** | ✓ | Redis, Prisma | + leader status | Single instance (leader-elected) |
| **webhook-gateway** | ✓ | API + Redis | + HMAC rate < threshold | Parte do API |
| **web** | ✓ | API reachable (`/ready`) | — | Health do Next.js via `/api/health` |

**Worker (processo background) — health via heartbeat:**
- O worker publica `worker:heartbeat:<workerType>:<instanceId>` → TTL 60s no Redis, conteúdo JSON: `{ timestamp, activeJobs, processedCount, failedCount, traceId }`.
- Se a chave expirar → alerta `WorkerDown`.
- O worker também responde a sinais do sistema: `SIGTERM` → graceful shutdown (drain).

### 7.3 Probes em Kubernetes

```yaml
# k8s - exemplos de probes
livenessProbe:
  httpGet:
    path: /live
    port: metrics
  initialDelaySeconds: 30
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: metrics
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health
    port: metrics
  initialDelaySeconds: 0
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 30
```

### 7.4 Heartbeat de workers

- **Worker heartbeat**: BullMQ worker publica um heartbeat no Redis periodicamente (a cada 30s) com metadatas:
  ```json
  {"workerType":"executor","instanceId":"exec-worker-0","lastBeat":"2026-08-20T14:32:00Z","activeJobs":3,"processed":142,"failed":2,"traceId":"..."}
  ```
- **Scheduler leader**: lock via Redis `SETNX scheduler:leader <instanceId> EX 30`. O líder renova a cada 10s. Se o lock expirar sem renovação → elei novo líder; se `leader` key desaparecer → alerta `SchedulerLeaderMissing`.
- **Timeout**: heartbeat key TTL 60s. Alerta dispara se ausente > 90s.

---

## 8. Auto-restart e resiliência

### 8.1 Restart de workers (Supervisor)

O worker é gerenciado por um **supervisor** (Kubernetes Deployment / systemd / PM2):

| Sistema | Configuração |
|---|---|
| **Kubernetes** | `Deployment` com `restartPolicy: Always`, `PodDisruptionBudget` (mínimo 70% dos workers sempre up) |
| **Fly.io / Render** | `process` restart policy: `on-failure`, max tentativas: 3, delay: 5s |
| **systemd** | `Restart=always`, `RestartSec=10`, `StartLimitBurst=5`, `StartLimitIntervalSec=300` |
| **PM2 (dev/local)** | `max_restarts: 10`, `min_uptime: 30000` |

### 8.2 Crash loop detection

- **Backoff exponencial**: 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap).
- **Crash loop backoff**: se > 3 restarts em 5 min → alerta `WorkerCrashLoop` (warning) + pausa de escala (não escalar mais workers até investigação).
- **Max restarts por semana**: 50 por instância (evita loop infinito consumindo recursos).

### 8.3 Graceful shutdown e draining

**Sequência de shutdown (SIGTERM → SIGKILL):**

1. **SIGTERM recebido** — API/Worker pára de aceitar novos jobs.
2. **Draining de jobs ativos** — worker aguarda até `DRAIN_TIMEOUT` (padrão 60s) por jobs em andamento terminarem. Jobs não concluídos são **reattachados à fila** (`job.moveToFailed()` ou re-enqueue com `attempts`).
3. **Persistência de estado** — worker grava estado final de `NodeExecution`/`WorkflowExecution` no Postgres antes de fechar.
4. **Commit de checkpoints** — checkpoints de progresso são flushados.
5. **SIGKILL** após `GRACEFUL_SHUTDOWN_TIMEOUT` (padrão 90s).

**Configuração BullMQ worker:**

```typescript
// apps/api/src/workers/execution.worker.ts
import { Worker } from 'bullmq';

const worker = new Worker('workflows', async (job) => {
  return await executor.run(job.data.executionId);
}, {
  connection: redis,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 10,
  lockDuration: 30000,           // 30s — job bloqueado se worker sumir
  lockRenewTime: 15000,          // renova lock metade do tempo
  autorun: true,
  removeOnFail: { age: 5_000 } ,  // DLQ por 5 dias
  removeOnComplete: { age: 60_000 }, // keep 1min
  // Graceful shutdown
  drainDelay: 60_000,            // wait up to 60s for active jobs
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info({ event: 'worker.shutdown', signal: 'SIGTERM' }, 'Graceful shutdown initiated');
  await worker.close();           // pausa pickup + drain
  process.exit(0);
});
process.on('SIGINT', async () => {
  logger.info({ event: 'worker.shutdown', signal: 'SIGINT' }, 'Graceful shutdown initiated');
  await worker.close();
  process.exit(0);
});
```

### 8.4 Job draining e re-attach

- **At-least-once semantics**: jobs não concluídos no shutdown são re-enfileirados. O executor usa `idempotencyKey` (conforme `design-runner.md` — `retryCount`, `idempotencyKey @unique`) para evitar duplicação em retries.
- **Lock renewal**: BullMQ renova o job lock a cada 15s; se o worker morre, o lock expira em 30s e o job volta para a fila.
- **Draining timeout configurável**: `DRAIN_TIMEOUT` por queue (padrão 60s). Se um job leva mais que isso, é abortado e re-enfileirado.

### 8.5 Circuit breaker

Para integrações externas (HTTP nodes, LLMs):

| Condição | Estado do circuito | Ação |
|---|---|---|
| 5 falhas consecutivas em 1 min | OPEN | Pausa chamadas por 30s (configurable por provider) |
| 1 sucesso | HALF-OPEN | Testa 1 chamada |
| Sucesso no HALF-OPEN | CLOSED | Resume normal |
| Falha no HALF-OPEN | OPEN | Volta a pausar por 60s (backoff) |

Implementado via `opossum` ou logic custom no `HttpClient` do executor. Alerta `CircuitBreakerOpen` se aberto por > 5 min.

---

## 9. Deploy

### 9.1 Pipeline de CI/CD

**Branch strategy**:
- `main` protegida — apenas merge via PR com 2 approvals + CI verde + preview review.
- Feature branches: `feat/*` → PR → preview environment → merge → `release/*`.
- Release tags: versões semânticas (`v1.2.3`).

**Pipeline (GitHub Actions / Turbo):**

```
┌──────────┐
│  Push PR  │
└─────┬─────┘
      ▼
 [lint] ──► falha? ──X (block)
      ▼
 [typecheck] ──► falha? ──X (block)
      ▼
 [unit tests] ──► cobertura >= 80%? ──X (block)
      ▼
 [integration tests] ──► falha? ──X (block)
      ▼
 [contract tests] (pacts vs API spec)
      ▼
 [e2e tests] (Playwright)
      ▼
 [e2e n8n parity] (import workflow n8n real, executa, valida output)
      ▼
 [build images] (multi-stage, tagged)
      ▼
 [image scan] (Trivy) ──► CVE crítico? ──X (block)
      ▼
 [deploy to staging] ──► smoke tests
      ▼
 [deploy to prod] (canary → rolling)
      ▼
 [post-deploy] (smoke, rollback se falhar)
```

### 9.2 Estratégias de deploy

| Estratégia | Uso | Prós | Contras |
|---|---|---|---|
| **Rolling** | API, web (patch version) | Zero downtime, simples | Risco de bug em versão, rollback lento |
| **Blue-Green** | Major version upgrade | Rollback instantâneo (DNS flip) | 2x custo de infra momentâneo |
| **Canary** | Feature flags, release gradual | Risco controlado, observa em % real | Complexidade de routing |
| **Recreate** | Scheduler, worker (stateless restart) | Simples, limpo | Downtime curto (< 10s) |

**Recomendação para o AgentFlow:**
- **API + Web**: Rolling update (k8s) com PDB; canary para features críticas via feature flag.
- **Workers + Scheduler**: Recreate (restart controlado) — são stateless, job state persiste no Redis/Queue.
- **Major version**: Blue-green para API para rollback instantâneo em migrations destrutivas.

### 9.3 Zero-downtime

- **Pre-stop hook**: `sleep 5 && curl /drain` — tira o pod do load balancer antes de kill.
- **Readiness probe fails** durante drain → LB redireciona tráfego para pods prontos.
- **Worker drain**: graceful shutdown conforme §8.3 com `DRAIN_TIMEOUT`.
- **DB migration lock**: migrations rodam com lock (`LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` ou advisory lock) para evitar race entre pods novos e velhos.

### 9.4 Migrations de schema (expand/contract)

**Padrão Expand-Contract (3 etapas):**

1. **Expand**: migration que **adiciona** colunas/indexes sem breaking change. Deploy nova API compatível com schema antigo E novo.
2. **Migrate data**: job em background backfill (ex.: migra envelope encryption keys) — monitore via métrica `agentflow_migration_progress`.
3. **Contract**: migration que **remove** colunas antigas. Só depois de todos os pods rodarem a versão nova.

**Lock de migração**:
```bash
# Rodado antes do novo deploy
pnpm db:migrate --lock-name="schema_migration_v2" --timeout=300
# SchemaMigrationVersion table como guardião
```

**Compatibilidade N-1**: nova API aceita requests do cliente antigo (backward compatible); schema novo aceita escritas na coluna antiga (dual-write). Exemplo: `WorkflowExecution.duration` (Int) — nova coluna `durationMs` (BigInt); dual-write em ambas até todos migrarem.

**Migrações destrutivas** (DROP COLUMN, DELETE data): apenas em janela de manutenção (02:00–04:00 UTC), com anúncio prévio de 72h no status page.

### 9.5 Feature flags

| Flag | Tipo | Descrição |
|---|---|---|
| `worker.isolation.enabled` | boolean | Roda code nodes em sandbox OS-level |
| `execution.timeout.override` | int (ms) | Timeout global override |
| `ai.node.provider` | enum | `openai` / `anthropic` / `nvidia` |
| `billing.enforcement.enabled` | boolean | Bloqueia execuções se quota excedida |
| `queue.priority.scheduling` | boolean | Habilita prioridade de jobs |

Feature flags são lidas do DB (`FeatureFlag` table) — cached 30s — e expostas via `/api/v1/flags` (client-side) e lida pelos workers (`worker.checkFeatureFlag(name)`).

### 9.6 Rollback automático e manual

**Automático**:
- Se `/ready` falha em 3 tentativas consecutivas após deploy → rollback automático para tag anterior (Kubernetes rollout undo ou Fly.io release revert).
- Se burn rate ≥ 14.40× (§6.2) → rollback automático + notificação.

**Manual**:
```bash
# Kubernetes
kubectl rollout undo deployment/api --to-revision=3

# Fly.io
fly deploy --image registry.agentflow.io/api:v1.2.0 --force

# Railway
railway rollback --version=v1.2.0
```

### 9.7 Deploy de workers (independente)

Workers são deployados via **worker Deployment separado** (k8s) ou **worker process** (Fly.io). Benefícios:
- Escalar workers sem tocar o API.
- Deploy de workers com imagem diferente da API (ex.: worker com libs extras para `code` node).
- Pause/resume de workers para manutenção sem downtime na API.

Comando de deploy de worker:
```bash
# Tag específica para worker
docker buildx -f apps/api/Dockerfile.worker -t registry.agentflow.io/worker:v1.2.3 .
kustomize set image worker=registry.agentflow.io/worker:v1.2.3
kubectl apply -k k8s/worker
```

---

## 10. Backups

### 10.1 PostgreSQL (estado)

| Estratégia | Ferramenta | Frequência | Retenção | RPO | RTO |
|---|---|---|---|---|---|
| **Physical backup (base)** | `pg_dump` (custom format, compressão zstd) | Diário 02:30 UTC | 30 dias | 24h | 30 min |
| **PITR (WAL archiving)** | `WAL-G` / `wal-e` → object storage | WAL segments a cada checkpoint | 7 dias | 5 min | 10 min |
| **Logical backup** | `pg_dump --schema-only` | A cada deploy (migrations) | 90 dias | 24h | 15 min |

**Configuração (PostgreSQL `postgresql.conf`):**
```conf
wal_level = replica
archive_mode = on
archive_command = 'wal-g wal-push %p'
archive_timeout = 300    # força WAL a cada 5 min mesmo sem writes
max_wal_senders = 4
max_replication_slots = 4
```

**Script de backup (cron):**
```bash
#!/bin/bash
# /opt/scripts/pg_backup.sh
set -euo pipefail
export WALG_RETENTION="7d"
export WALG_S3_PREFIX="s3://agentflow-backups-prod/pg"
export PGUSER="backup_user"
export PGHOST="postgres-primary"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

# Base backup (diário)
if [ "$(date -u +%H)" = "02" ]; then
  wal-g backup-push --full
  # Verifica integridade
  wal-g backup-list | head -5 > /tmp/backup_check
fi

# Apaga backups antigos (> 30 dias)
find /var/lib/postgresql/backups -name "*.dump" -mtime +30 -delete
```

### 10.2 Redis (fila / cache)

| Estratégia | Frequência | Retenção | RPO |
|---|---|---|---|
| **RDB snapshot** | A cada 60 min (`save 3600 1`) | 7 dias | 60 min |
| **AOF (append only)** | A cada segundo (`appendonly yes`, `appendfsync every-sec`) | Rotacionado diariamente, 7 dias | 1 segundo |
| **Replicação** | 1 réplica em AZ diferente | Contínua | ~0 (sync) |

**Recuperação de Redis**: em caso de perda total, restaura do AOF mais recente + RDB de base. Jobs em `waiting`/`delayed` são re-enfileirados; jobs `active` (perdidos) são detectados via lock timeout e reprocessados pelo worker (at-least-once).

**Script:**
```bash
# Restore AOF
redis-server --appendonly yes --appendfilename "appendonly.aof"
# Ao startup, o worker reprocessa jobs cujo lock expirou (30s)
```

### 10.3 Object storage (artefatos, logs, backups)

| Bucket | Conteúdo | Criptografia | Versionamento | Lifecycle |
|---|---|---|---|---|
| `agentflow-logs-prod` | Logs Loki (cold), logs de auditoria | AES-256 (SSE-S3) | Sim (30 versões) | Transição IA após 90 dias, expurgo 365 dias |
| `agentflow-backups-prod` | pg_dump, WAL-G, Redis RDB/AOF | AES-256 (SSE-KMS) | Sim (5 versões) | Transition 30 dias, expurgo 30 dias (DB), 7 dias (Redis) |
| `agentflow-artifacts-prod` | Node outputs, export de workflows, templates | AES-256 | Não | Expurgo 30 dias |

### 10.4 Vault (segredos)

- **KEK master**: armazenado em Vault (`secret/data/agentflow/encryption-key`) ou cloud KMS (AWS KMS / GCP KMS / Azure Key Vault).
- **Backup de segredos mestres**: Key material exportado e armazenado em **HSM físico** ou envelope físico (paper backup), com acesso restrito a 2 pessoas (2-person rule).
- **Auto-rotation de segredos**: `JWT_SECRET`, webhook signing keys — rotacionados a cada 90 dias via automated job (`credential:rotate` conforme §2.6 do `v2-security-spec.md`).
- **Teste de restore**: validar descriptografia de credenciais usando KEK restaurado (monthly).

### 10.5 Teste de restore

**Frequência**: Mensal (fire drill).

**Runbook de teste de restore (PostgreSQL):**
1. Provisiona ambiente de staging (`staging-dr-test`).
2. Pausa workers do staging (evita conflito de dados).
3. Restaura base backup mais recente do S3:
   ```bash
   WALG_RESTORE_KEEP_DATA=1 wal-g backup-fetch /var/lib/postgresql/data LATEST
   ```
4. Aplica WALs até T-5min:
   ```bash
   wal-g wal-fetch --target-xid=...
   ```
5. Inicia PostgreSQL + roda `pnpm db:migrate deploy`.
6. Valida integridade: counts de tabelas, constraints.
7. Envia 1 workflow de teste (webhook → HTTP → sucesso).
8. Reporta resultado no `#ops-drills`.

**Critério de aceitação**: restore completo em < 30 min, dados consistentes, workflow de teste executa com sucesso.

### 10.6 Frequência e retenção resumida

| Dado | Backup | Retenção | Criptografia | Teste de restore |
|---|---|---|---|---|
| PostgreSQL base | Diário 02:30 | 30 dias | SSE-KMS | Mensal |
| PostgreSQL WAL | A cada 5 min | 7 dias | SSE-KMS | — (PITR test) |
| PostgreSQL schema | A cada deploy | 90 dias | SSE-KMS | — |
| Redis RDB | 60 min | 7 dias | AES-256 | Trimestral |
| Redis AOF | 1s | 7 dias | AES-256 | Trimestral |
| Logs (Loki cold) | Streaming | 365 dias | SSE-S3 | — |
| AuditLog | Append-only | 7 anos | AES-256-GCM | Anual |
| Vault KEK | Offsite (HSM) | Permanente | HSM | Anual |

---

## 11. Disaster recovery

### 11.1 RPO / RTO

| Serviço | RPO | RTO | Critério |
|---|---|---|---|
| **PostgreSQL** | 5 min | 30 min | Dados de workflows/execuções/créditos |
| **Redis** | 1 seg | 15 min | Estado da fila (jobs re-enfileirados) |
| **API / Workers** | 0 (stateless) | 5 min | Reprovisionamento (imagem) |
| **Vault / KMS** | 0 | 60 min | Segredos mestres (HSM restore) |
| **Object storage** | 0 (versionado) | 10 min | Artefatos/logs (multi-region) |

### 11.2 Cenários de DR

| Cenário | Gatilho | Ação |
|---|---|---|
| **Region A down** | Ping `https://api.agentflow.com/health` falha por 3 × consecutivos (5 min) | Failover para Region B (DNS switch + replica PostgreSQL |
| **Data corruption** | Checksum de backup falha / dado inconsistente detectado em auditoria | PITR para timestamp previo à corrupção (T-5min) |
| **Credential key compromise** | Alerta `CredentialDecryptErrors` ou suspeita de vazamento | Emergency key rotation (rotaciona KEK, re-encrypta em background) |
| **Queue storm** | Queue depth > 10k por 10 min | Pausa triggers, esvazia DLQ, reinicia workers com lower concurrency |
| **Vault/KMS indisponível** | API falha ao descriptografar credencial | Fallback: modo degraded (só workflows sem credenciais); fail secure para credenciais |

### 11.3 Runbook de DR — Failover multi-região

```
RUNBOOK DR-01: Failover de região (prod → backup-region)
Responsável: on-call SRE (pago via PagerDuty)
Severity: P1

PASSO A PASSO:

1. CONFIRMAÇÃO DE OUTAGE
   a. `curl -s https://api.agentflow.com/health | jq .status` → não responde ou 503
   b. `curl -s https://status.agentflow.com` → confirma regional (verificar outras regiões)
   c. Confira alerts no #incidents: "Region us-east-1 unreachable" por > 5 min
   → Se confirmado, proceed.

2. ATIVA MODO READ-ONLY NA REGIONAL PRIMÁRIA (se ainda parcialmente UP)
   a. kubectl scale deployment/api --replicas=0 -n agentflow-prod
   b. kubectl scale deployment/scheduler --replicas=0
   c. Atualiza feature flag `writes.enabled=false` (bloqueia novas execuções)

3. PROMOVE REPLICA STANDBY (Region B)
   a. Promove PostgreSQL read-replica:
      kubectl exec -it pg-primary-b -- pg_ctl promote
   b. Atualiza DNS (Route53 / Cloudflare):
      aws route53 change-resource-record-sets --hosted-zone-id Z123 \
        --change-batch file://dr/dns-failover.json
   c. kubectl scale deployment/api --replicas=3 -n agentflow-prod-us-west-2
   d. kubectl scale deployment/executor-worker --replicas=10
   e. Verifica /ready em todos os pods: kubectl wait --for=condition=ready pod -l app=api

4. VALIDATION
   a. curl https://api.agentflow.com/health → 200
   b. curl https://api.agentflow.com/ready → 200, todos checks true
   c. POST /trigger workflow de teste (webhook → HTTP 200) → status SUCCESS
   d. Confirma workers processando queue

5. COMUNICAÇÃO
   a. Post no status page: "Major incident: us-east-1 partial outage. Failing over to us-west-2."
   b. Slack #incidents: @channel failover iniciado, ETA 20 min
   c. E-mail customers impactados diretamente

6. MONITORING
   a. Watch dashboards: SLO Overview, Queue Depth, Worker Health
   b. Alertmanager inibido para alerts de us-east-1 (inhibition rule já configurado)

7. RECOVERY DA REGIONAL PRIMÁRIA
   a. Quando us-east-1 voltar: reconcile replica, reprovisiona DB, failback planejado
   b. Documenta root cause no postmortem
```

### 11.4 Teste de DR

**Frequência**: Trimestral.

**Exercício**: Simulate region outage via network partition (cloud firewall drop all egress from primary region). Execute DR-01 até validation completa. Métricas coletadas: time to promote DB, time to scale workers, error rate durante failover.

**Critério de aceitação**: failover completo em < 30 min, RTO atingido, nenhum dado perdido (RPO < 5 min).

### 11.5 Replicação multi-região (ativação)

- **PostgreSQL**: streaming replication (primary → 1 standby em região secundária). Logical replication para leitura cross-region (read-only queries do dashboard).
- **Redis**: active-active via Redis Enterprise ou valkey-cluster multi-region. Jobs idempotentes (via `idempotencyKey`) suportam replicação.
- **Object storage**: multi-region bucket (S3 Global Access) com replicração automática.
- **DNS**: failover geográfico via Cloudflare Load Balancer ou Route53 Latency-Based Routing.

---

## 12. Custos

### 12.1 Componentes de custo

| Categoria | Componentes | Fonte de dados | Métrica |
|---|---|---|---|
| **Compute** | API (Fastify), Web (Next.js), Workers, Scheduler | Cloud bill allocation | `agentflow_cost_estimate_cents_total{service="compute"}` |
| **Storage** | PostgreSQL, Redis (RDB/AOF), Object storage | Cloud bill + storage metrics | `...{service="storage"}` |
| **Egress** | API/Web outbound, inter-region replication | Cloud bill | `...{service="egress"}` |
| **LLM / AI** | Nodes `aiAgent`, `ai` chamando OpenAI/Anthropic/NVIDIA | API usage logs + bill | `...{service="llm"}` |
| **Third-party** | Stripe, email provider, SMS | Bill + usage logs | `...{service="third_party"}` |

### 12.2 Tracking de custo

**Abordagem**: tag-based allocation + custom metrics.

1. Cada recurso cloud é taggeado com `Service=agentflow`, `Component={api|web|worker|...}`, `Environment={dev|staging|prod}`, `Tenant={orgId}` (quando aplicável — ex: Lambda por org).
2. Daily job (`cost-collector`) lê bills via cloud cost API (AWS Cost Explorer, GCP Billing Export) → normaliza → grava `agentflow_cost_estimate_cents_total` no Prometheus (via Push Gateway) e no Postgres (`CostEntry` table) para reporting.
3. Workers reportam usage via métrica: `agentflow_llm_tokens_total{provider,model,direction,orgId}` — o cost-collector converte tokens → $ usando preços pubicados.
4. Custo por org: tags de billing ou amortized allocation (`org_workflows_count / total_workflows * compute_cost`).

**Exemplo de cost collector (cron no k8s):**

```bash
#!/bin/bash
# /opt/scripts/cost-collector.sh
# AWS Cost Explorer — últimos 24h, agrupado por tag
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d yesterday +%Y-%m-%d),End=$(date -u +%Y-%m-%d +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "BlendedCost" "UsageQuantity" \
  --group-by Type=TAG,Key=Component \
  --output json > /tmp/cost.json

# Parse + push to Prometheus
node /opt/scripts/push-cost-metrics.js /tmp/cost.json
```

### 12.3 Budget alerts

| Threshold | Severity | Canal | Ação |
|---|---|---|---|
| 80% do budget mensal | warning | Slack #financas | Revisar usage, detectar abuso por org |
| 100% do budget mensal | critical | Slack #incidents + email CFO | Pausar execuções de AI (feature flag `ai.node.enabled=false`), page finance |
| 120% forecast 24h | critical | PagerDuty | Interrompe provisionamento não crítico |
| Org individual > 5% do custo total | warning | Slack #ops | Investigar org atípica (possível abuso) |

### 12.4 Relatório de custo

**Frequência**: diário (engineering), semanal (management), mensal (finance).

**Template (dashboard Grafana "Cost Overview"):**

```
COST REPORT — Aug 2026
Total MTD: $12,847 (budget: $50,000 — 25.7%)
  Compute:   $7,200 (56%)  [workers: $4,100, api/web: $3,100]
  Storage:   $1,850 (14%)  [postgres: $1,200, redis: $350, s3: $300]
  Egress:    $2,300 (18%)
  LLM/AI:    $1,497 (12%)  [nvidia: $900, openai: $450, anthropic: $147]
Top 3 Orgs: org_A ($2,100), org_B ($1,850), org_C ($1,200)
Anomaly: org_D spend up 340% (new AI nodes) — review flagged
```

---

## 13. Dashboards

### 13.1 Stack de visualização

| Componente | Ferramenta | Observação |
|---|---|---|
| **Metrics backend** | Prometheus 2.x | Remote-write para long-term storage (Mimir/Cortex) |
| **Logs backend** | Loki (ou CloudWatch) | Query via LogQL |
| **Traces backend** | Grafana Tempo | Ou Jaeger (standalone) |
| **Dashboard** | Grafana 11+ | Datasources: Prometheus, Loki, Tempo |
| **Alerting** | Alertmanager | Roteamento para Slack, email, PagerDuty |

### 13.2 Painéis por domínio

#### 13.2.1 Dashboard: Executions Overview

| Painl | Métrica | Visualização |
|---|---|---|
| Executions/min (24h) | `rate(agentflow_workflow_execution_total[1m])` | Time series |
| Success rate | `sum(increase(success[24h])) / sum(increase(total[24h]))` | Gauge % |
| Execution duration p50/p95/p99 | `histogram_quantile` | Time series |
| Top 5 workflows falhando | `topk(5, increase(failed[24h]))` | Table |
| Status breakdown (pie) | `workflow_execution_status_count` | Pie chart |

#### 13.2.2 Dashboard: Queue & Workers

| Painl | Métrica | Visualização |
|---|---|---|
| Queue depth (all queues) | `agentflow_queue_depth` | Time series (por queue) |
| Queue lag (s) | `agentflow_queue_lag_seconds` | Gauge |
| Workers active | `agentflow_worker_active` | Stat |
| Stalled jobs | `agentflow_queue_stalled_jobs` | Alert list |
| Jobs processed / failed (24h) | `increase(agentflow_worker_jobs_processed_total[24h])` | Bar chart |
| Worker crash rate | `rate(kube_pod_container_status_restarts_total[5m])` | Time series |

#### 13.2.3 Dashboard: Errors & Alerts

| Painl | Métrica | Visualização |
|---|---|---|
| Error rate (5m) | `rate(agentflow_node_execution_total{status="failed"}[5m])` | Time series |
| Top errors (by error message) | `topk(10, count by (error) (...))` | Table |
| Alert state | `ALERTS{alertstate="firing"}` | List |
| Webhook HMAC failures | `rate(agentflow_webhook_hmac_failed_total[5m])` | Time series |
| Auth failures | `rate(agentflow_auth_failure_total[5m])` | Time series |

#### 13.2.4 Dashboard: SLOs

| Painl | Métrica | Visualização |
|---|---|---|
| API Availability (30d) | `1 - (sum(increase(api_down[30d])) / 30d)` | Stat + burn rate |
| Budget burned | `error_budget_remaining` | Bar (0–100%) |
| Burn rate (1h/6h/24h) | `burn_rate_1h`, `burn_rate_6h`, `burn_rate_24h` | Multi-stat |
| Latency SLO compliance | `histogram_quantile(0.95, ...)` | Time series vs SLO line |

#### 13.2.5 Dashboard: Custos

| Painl | Métrica | Visualização |
|---|---|---|
| Total spend MTD | `agentflow_cost_estimate_cents_total` | Stat ($) |
| Burn rate diário | derivada diária | Time series |
| Top orgs by cost | `topk(10, ...)` | Table |
| LLM tokens (out/in) | `agentflow_llm_tokens_total` | Time series |
| Budget % | `cost / budget * 100` | Gauge |

#### 13.2.6 Dashboard: Audit & Security

| Painl | Fonte | Visualização |
|---|---|---|
| Audit events/min | Loki query `count_over_time({app="agentflow-api"} |= "AUDIT" [1m])` | Time series |
| Credential access by purpose | Postgres `AuditLog` | Table |
| RBAC denials | `rate(agentflow_rbac_denied_total[5m])` | Time series |
| Sensitive action timeline | Loki `|= "AUDIT"` | Logs panel |

### 13.3 KPIs de monitoramento

| KPI | Target | Janela | Owner |
|---|---|---|---|
| API availability | ≥ 99.9% | 30 dias | SRE |
| Workflow success rate | ≥ 99.5% | 30 dias | Eng. Execução |
| Queue lag | < 30s | 5 min windows | SRE |
| Mean time to detect (MTTD) | < 2 min | por incidente | SRE |
| Mean time to respond (MTTR) | < 15 min (warning), < 5 min (critical) | por incidente | SRE |
| Error budget burn rate | < 2× | 24h | SRE |
| Backup restore test | 100% pass | monthly | SRE |

---

## 14. Incident management

### 14.1 Severity de incidentes

| Severity | Definição | Exemplo | SLA de resposta | Comunicação |
|---|---|---|---|---|
| **S1 — Critical** | Serviço down / data loss / segurança | API 503, DB corrupto, credential vazada | < 5 min | PagerDuty + #incidents |
| **S2 — High** | Degradação significativa | Queue lag > 5min, execução falhando > 25% | < 15 min | #incidents |
| **S3 — Medium** | Issue menor, sem impacto no usuário | Worker reiniciou, latência 2x normal | < 1h | #operacoes |
| **S4 — Low** | Cosmetic / informational | Typo no dashboard, alerta falso positivo | < 24h | GitHub issue |

### 14.2 Runbook de incidente (processo padrão)

```
RUNBOOK: Incident Response (S1/S2)
Responsável: on-call engineer

1. DETECÇÃO
   a. Alerta via PagerDuty/Slack #incidents
   b. Engineer ack em 5 min (Slack /ack bot ou PagerDuty ack)
   c. Cria ticket no Linear: "INCIDENT-<timestamp>" com severity

2. TRIAGEM
   a. Corre /health, /ready, /live
   b. Grafana: check dashboards (Executions, Queue, Errors)
   c. Loki: filtra logs por traceId / error recente (últimos 15 min)
   d. Tempo/Jaeger: abre trace da execução falhando

3. CONTAINMENT
   a. Se falha está em deploy recente → rollback (§9.6)
   b. Se queue storm → pausa triggers (feature flag writes.enabled=false)
   c. Se worker crítico → scale down workers, reinicia 1 por 1

4. ERADICAÇÃO
   a. Identifica root cause (logs + traces + métricas)
   b. Fix no código ou config (hotfix branch da main)
   c. Não faz deploy até validado em staging

5. RECOVERY
   a. Confirma /health → 200
   b. Envio workflow de teste → SUCCESS
   c. Monitora 30 min de stability

6. COMUNICAÇÃO
   a. Atualiza status page a cada 30 min (se > 15 min)
   b. Slack #incidents: hourly updates
   c. Customers diretamente impactados: e-mail

7. POSTMORTEM
   a. Dentro de 48h: postmortem no Notion template
   b. Include: timeline, root cause (5-whys), contributing factors, corrective actions
   c. Ações com owners + deadline no Linear
   d. Share with eng + product
```

### 14.3 Status page

- **Ferramenta**: Cachet (self-hosted) ou Atlassian Statuspage.
- **Componentes monitorados**:
  - API (REST)
  - Webhooks
  - Scheduler
  - Workers
  - Database
  - Object Storage
- **Incidents** publicados com updates automáticos via webhook do Alertmanager.
- **URL**: `https://status.agentflow.com`

### 14.4 Comunicação de incidentes

| Canal | Público | Uso |
|---|---|---|
| **#incidents (Slack)** | Equipe interna | Coordenação em tempo real, acks, updates |
| **Status page** | Customers públicos | Comunicação externa de incidentes |
| **Email de incidente** | Customers diretamente afetados | Notificação de impacto + mitigation |
| **PagerDuty** | On-call | Escalação fora do horário comercial |

---

## 15. Segurança operacional

### 15.1 Acesso ao painel de observabilidade (RBAC)

| Role | Acesso a Grafana/Prometheus | Acesso a Loki | Acesso a Tempo | Acesso a Alertmanager |
|---|---|---|---|---|
| **Platform Admin** (SRE) | Full (read+write dashboards, alerts) | Full | Full | Full |
| **Platform Engineer** | Read dashboards + create personal | Read | Read | Read silences |
| **Product Manager** | Read SLO dashboards only | No | No | No |
| **On-Call Engineer** | Read + alert acks | Read (last 7d) | Read (last 24h) | Write silences (1h TTL) |
| **Auditor** | Read-only dashboards | Read audit logs only | No | No |

**Implementação**: Grafana RBAC + datasource permissions. Auth via SSO (OIDC) — confere com `v2-security-spec.md` §3.5.

### 15.2 Auditoria de ações de operador

Todas as ações operacionais são logadas no `AuditLog` (append-only, hash chain conforme §9 do `v2-security-spec.md`). Campos:

```json
{
  "timestamp": "2026-08-20T14:32:01Z",
  "event": "operator_restart_worker",
  "actor": "sre.victor@agentflow.com",
  "role": "platform_admin",
  "resource": "worker:exec-worker-3",
  "action": "restart",
  "reason": "crash loop detected (3 failures / 2 min)",
  "ip": "203.0.113.10",
  "sessionId": "sess_abc123",
  "signature": "sha256:..."  // hash chain link
}
```

**Eventos auditados**:
- Deploy / rollback (`deploy.started`, `rollback.executed`)
- Restart de worker (`worker.restarted`)
- Rotação de chave (`key.rotated`)
- Restore de backup (`backup.restored`)
- Failover DR (`dr.failover_triggered`)
- Feature flag toggle (`feature_flag.changed`)
- Acesso a credencial (`credential.decrypted` com `purpose`)

### 15.3 Secrets no CI

1. **Secrets no GitHub Actions**: armazenados em GitHub Secrets → carregados via OIDC para AWS Secrets Manager / HashiCorp Vault, **nunca** em variáveis de ambiente plain-text no workflow YAML.
2. **Imagem Docker não contém secrets**: multi-stage build; secret keys são montados via k8s `Secret` ou `envFrom` no runtime.
3. **Rotação automática**: secrets são rotacionados a cada 90 dias via `cron_create` job (`secrets.rotation`). Notifica via Slack 7 dias antes.
4. **No secrets em code**: `.env.example` contém apenas nomes (nunca valores). Hook de CI verifica (`detect-secrets` / `gitleaks`) — fail na PR se detectar.

**Exemplo de workflow seguro:**

```yaml
# .github/workflows/deploy.yml
- name: Auth to AWS (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789:role/github-actions-deploy
    aws-region: us-east-1

- name: Fetch secrets from Secrets Manager
  run: |
    aws secretsmanager get-secret-value --secret-id agentflow/prod/jwt-secret \
      --query SecretString --output text > /tmp/secrets.json
    echo "JWT_SECRET=$(jq -r .jwt_secret /tmp/secrets.json)" >> $GITHUB_ENV
```

### 15.4 Scanners de vulnerabilidades

| Tipo | Ferramenta | Frequência | Quando falha CI |
|---|---|---|---|
| **Container image** | Trivy (ou Grype) | A cada build (image scanning) | CVE Critical/High em última camada (falha build) |
| **Dependencies (npm)** | `npm audit` / Snyk | A cada PR (deps diff) | CVE Critical com fix disponível (falha PR) |
| **Secrets detection** | Gitleaks / detect-secrets | A cada commit (pre-commit hook + CI) | Qualquer secret detectado (falha PR) |
| **IaC (k8s/terraform)** | Checkov / kube-bench | A cada deploy | Config inseguro (falha deploy) |
| **SAST** | CodeQL / Semgrep | A cada PR | Critical vuln pattern (falha PR) |

### 15.5 Certificados e TLS

| Certificado | Tipo | Frequência de rotação | Gerenciamento |
|---|---|---|---|
| **API (TLS)** | Let's Encrypt (ou ACM) | Auto (90 dias + renew 30d antes) | cert-manager no k8s |
| **Webhook HMAC secrets** | Random 32 bytes | 90 dias (job BullMQ) | Vault + DB |
| **JWT signing secret** | HS256 256-bit | 90 dias | Vault/KMS + rotation job |
| **PostgreSQL TLS** | mTLS | 365 dias | RDS cert + pgsTLS |
| **Service mesh (opcional)** | mTLS (Istio/Linkerd) | Auto | Istio Citadel |

---

## 16. Ambientes

### 16.1 Matriz de ambientes

| Ambiente | Infra | Dados | Deploy | Observabilidade |
|---|---|---|---|---|
| **dev** | Docker compose (localhost) | Dados de seed (anônimos) | `pnpm dev:api` / `pnpm dev:web` | Logs local, /metrics via localhost |
| **staging** | k8s mínimo (1 réplica) ou Fly.io | Dados sintéticos espelhando prod (mask) | Deploy automático de `main` | Full stack: Prometheus + Loki + Tempo |
| **preview** | k8s Ephemeral per-PR | Dados sintéticos | Criado/destroído em cada PR | Logs e metrics via label `pr=123` |
| **prod** | k8s (3+ réplicas) / Fly.io | Produção real | Deploy manual (approval) ou canary | Full stack + on-call alerting |

### 16.2 Separação de dados

- **Prod**: dados reais. Criptografia AES-256-GCM. Acesso restrito.
- **Staging**: dados **anônimos espelhados** de prod (mask: email → `user+staging@example.com`, credenciais → faker values). Refresh diário via job `sync-staging-data` (exclui dados sensíveis).
- **Dev**: dados de **seed** (fake). Nunca dados reais.
- **Preview**: Dados vazios ou seed minimal. Destruído ao fechar PR.

**Política de dados**:
- **Nunca** usar dados reais de prod em staging/dev/preview sem anonimização.
- Scripts de seed: `packages/database/src/seed.ts` — gera orgs, workflows, execuções mock.
- Job de sync prod→staging roda diariamente 03:00 UTC, exclui `Credential.data`, `User.email` (mask), `AuditLog`.

### 16.3 Promoção de configuração

| Artefato | Dev | Staging | Prod |
|---|---|---|---|
| **Build** | `pnpm dev` (tsdx watch) | Docker image `staging:v1.2.3-commit-abc` | Docker image `prod:v1.2.3` |
| **Env vars** | `.env.local` | Sealed Secrets / Parameter Store | Vault dynamic secrets |
| **Secrets** | `.env.local` (plaintext, .gitignore) | GitHub Secrets → Secrets Manager | Vault + auto-rotation |
| **Feature flags** | defaults (hardcoded) | DB flags (staging) | DB flags (prod) |
| **DB migrations** | `pnpm db:push` (dev) | `pnpm db:migrate deploy` | `pnpm db:migrate deploy` (lock) |

**Processo de promoção**:
1. `main` → staging (deploy automático).
2. Smoke test em staging (20 min).
3. Aprovação manual → prod (canary 5%, observa 1h, then 50%, then 100%).
4. Config differences via `kustomize overlays/{staging,prod}` ou `fly.toml` `[env]` sections.

### 16.4 Smoke tests por ambiente

After deploy, run smoke test suite against `/ready`:

```bash
#!/bin/bash
# ops/smoke-test.sh
set -euo pipefail

URL=${1:-https://api.agentflow.com}

# 1. Health
curl -sf "$URL/health" | jq -e .status == "ok"

# 2. Ready
curl -sf "$URL/ready" | jq -e '.status == "ready"'

# 3. Trigger test workflow
EXEC_ID=$(curl -sf -X POST "$URL/api/v1/workflows/wf_smoke_test/execute" \
  -H "Authorization: Bearer $DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{}}' | jq -r .executionId)

# 4. Wait for completion (até 30s)
for i in $(seq 1 30); do
  STATUS=$(curl -sf "$URL/api/v1/executions/$EXEC_ID" | jq -r .status)
  if [ "$STATUS" = "SUCCESS" ]; then echo "PASS"; exit 0; fi
  if [ "$STATUS" = "FAILED" ]; then echo "FAIL"; exit 1; fi
  sleep 1
done
echo "TIMEOUT"; exit 1
```

---

## 17. Runbooks operacionais

### RUNBOOK RB-01: Worker caiu / crash loop

```
RUNBOOK RB-01: Worker caído ou em crash loop
Severity: S2 (se 1 worker) / S1 (se todos caíram)
Autoridade: on-call SRE

1. DETECÇÃO
   a. Alerta `WorkerDown` no #incidents
   b. `agentflow_worker_active == 0` no dashboard Queue & Workers

2. TRIAGEM
   a. kubectl get pods -l app=executor-worker -n agentflow-prod
   b. kubectl logs -l app=executor-worker --tail=100
   c. Busca por "panic", "OOM", "Error", traceId mais recente
   d. Verifica métrica: kube_pod_container_status_restarts_total

3. AÇÃO IMEDIATA
   a. Se 1 worker caiu (outros online): deixe supervisor restartar (k8s DaemonSet)
   b. Se todos caíram:
      kubectl get pods -l app=executor-worker
      kubectl delete pod -l app=executor-worker  # force recreation
   c. Se crash loop (3+ restarts / 5min):
      kubectl describe pod <pod>  # check events
      kubectl top pod <pod>       # OOM kill? high CPU?

4. INVESTIGAÇÃO
   a. Logs do último crash → identifica node/pilha
   b. Verifica se foi causado por job específico (traceId)
   c. Se code node sandbox fallou → verifica isolate-vm config

5. VERIFICAÇÃO
   a. worker heartbeat volta (agentflow_worker_active > 0)
   b. Queue lag < 10s
   c. Envio workflow teste → SUCCESS

6. DOCUMENTAÇÃO
   a. Comentar no ticket Linear
   b. Se root cause = bug, cria fix ticket
```

### RUNBOOK RB-02: Queue backlog (fila superlotada)

```
RUNBOOK RB-02: Queue backlog > threshold
Severity: S2
Autoridade: on-call SRE (+ eng. execução)

1. VERIFICAÇÃO
   a. Grafana: Queue Depth > 1000 (warning) ou > 5000 (critical)
   b. agentflow_queue_lag_seconds > 30 (warning) ou > 120 (critical)

2. AÇÃO IMEDIATA
   a. Escala horizontal de workers:
      kubectl scale deployment executor-worker --replicas=N+2
      (N = workers atuais, até max 10)
   b. Verifica tipos de job travados (stuck):
      bullmq-cli: bull-board → listar jobs delayed/stuck
   c. Se jobs de retry acumulados:
      # Clear retry queue (cautela — só se não são críticos)
      redis-cli KEYS "bullmq:workflows-retry:*" | xargs redis-cli DEL

3. INVESTIGAÇÃO
   a. Top 10 workflows por execuções falhando
   b. Latência de node types mais lentos (HTTP externo, LLM)
   c. Worker logs: "blocked" / "OOM" / "timeout"

4. REMEDIAÇÃO
   a. Ajusta WORKER_CONCURRENCY se saturado
   b. Move jobs de alta prioridade para queue "priority"
   c. Se LLM é gargalo: pausa via feature flag ai.node.enabled=false

5. VERIFICAÇÃO
   a. Queue depth < 500
   b. Queue lag < 5s
   c. Workers @ 70-85% CPU (não 100%)
   d. Escala de volta ao normal após 30 min estável
```

### RUNBOOK RB-03: Spike de falhas de execução

```
RUNBOOK RB-03: Execution failure rate > 15%
Severity: S1 (se > 5 min)
Autoridade: on-call SRE (+ eng. execução + product)

1. VERIFICAÇÃO
   a. Alerta `ExecutionFailureRateCritical`
   b. Grafana: Success rate < 85% em 2 min
   c. Filtra por org/workflow/node type mais falhando

2. TRIAGEM RÁPIDA
   a. Top failing nodes: SELECT nodeType, count(*) GROUP BY falhando
   b. Verifica traces recentes no Tempo → identifica onde falha
   c. Checa dependências externas (OpenAI, Stripe, API externa)
   d. Correlate com deploy recente (§9.5: rollback se < 30 min)

3. CONTENÇÃO
   a. Se causa = external API down:
      - Ativa circuit breaker para esse provider
      - Paísa workflows que dependem (feature flag por workflow)
   b. Se causa = code node falhando:
      - Desabilita code node via feature flag code.node.enabled=false
   c. Se causa = deploy:
      - Rollback automático (burn rate 14.40×)

4. INVESTIGAÇÃO
   a. Sample de 5 execuções falhando — analisa NodeExecution.error
   b. Verifica logs estruturados (Loki) por traceId → stack trace
   c. Confere se é falha transitória (timeout) ou permanente (auth)

5. VERIFICAÇÃO
   a. Success rate > 99% por 30 min
   b. Sem novos alertas de falha
   c. Workflows críticos de teste executam OK

6. POSTMORTEM
   a. Se > 15 min de falha: postmortem obrigatório
```

### RUNBOOK RB-04: Failover de banco / restore de backup

```
RUNBOOK RB-04: PostgreSQL failover ou restore
Severity: S1
Autoridade: on-call DBA (+ SRE)

1. DETECÇÃO
   a. Alerta `DatabaseDown` (pg_up == 0)
   b. /ready retorna `database: false`

2. AÇÃO IMEDIATA
   a. Verifica standby replica:
      kubectl exec -it pg-primary -- pg_isready
   b. Se primary dead → promote standby:
      kubectl exec -it pg-replica-standby -- pg_ctl promote
   c. Atualiza service DNS: k8s `service/postgres` selector → novo primary

3. SE DATA CORRUPTION (precisa restore):
   a. Para todos os writes (feature flag writes.enabled=false)
   b. Identifica timestamp da corrupção (logs de auditoria / checksum)
   c. PITR restore:
      mkdir /restore && cd /restore
      wal-g backup-fetch --target-user-data /var/lib/postgresql/data LATEST
      wal-g wal-fetch --target-xid=<pre-corruption>
   d. Inicia PostgreSQL: pg_ctl -D /var/lib/postgresql/data start
   e. Roda migrations: pnpm db:migrate deploy

4. VERIFICAÇÃO
   a. SELECT COUNT(*) FROM "WorkflowExecution" → > 0, consistente
   b. /ready → database: true
   c. Workflow teste → SUCCESS
   d. Workers processam queue normalmente

5. COMUNICAÇÃO
   a. Status page atualizado com downtime + restore
   b. Email customers impactados > 15 min
```

### RUNBOOK RB-05: Rotação de chave de credencial

```
RUNBOOK RB-05: Emergency credential key rotation
Severity: S1 (se compromise confirmado)
Autoridade: security engineer

1. DETECÇÃO
   a. Alerta `CredentialDecryptErrors` ou suspeita de leak (git scan, etc.)
   b. Confirmar compromise: tentativa de descriptografar credencial falha

2. AÇÃO
   a. Gera nova KEK no Vault/KMS:
      vault write secret/agentflow/encryption-key-v2 key=$(openssl rand -hex 32)
   b. Marca KEK antigo como deprecated (kv=v2, deprecatedAt=now)
   c. Dispara job BullMQ `credential:rotate`:
      - Processa por tenant (orgId)
      - Para cada credencial: decrypt(old KEK) → encrypt(new KEK)
      - Dual-write: aceita ambas as KEKs até migrar 100%
   d. Monitora via métrica: agentflow_migration_progress{type="credential_rotation"}

3. VERIFICAÇÃO
   a. Todas credenciais descriptografam com nova KEK
   b. Novas credenciais usam kv=v2
   c. Sem erros de decrypt por 24h
   d. Remove KEK antiga após 72h de grace period
```

### RUNBOOK RB-06: Rollback de deploy

```
RUNBOOK RB-06: Rollback automático/manually de deploy
Severity: S2/S1 (dependendo do impacto)

1. DETECÇÃO
   a. Alerta `ExecutionFailureRateCritical` + `burn_rate_1h > 14.40`
   b. /ready falha após deploy (3 consecutive failures)

2. ROLLBACK AUTOMÁTICO (se configurado)
   a. Alertmanager dispara webhook → GitHub Action `auto-rollback`
   b. Action faz: kubectl rollout undo deployment/api
   c. Verifica /health → 200

3. ROLLBACK MANUAL (se automático falhar)
   a. kubectl rollout history deployment/api
   b. kubectl rollout undo deployment/api --to-revision=N
   c. kubectl rollout status deployment/api

4. VERIFICAÇÃO
   a. /health → ok, /ready → ready
   b. Smoke test (§16.4) → PASS
   c. Execution test workflow → SUCCESS
   d. Watch dashboard SLO (burn rate normaliza)
```

### RUNBOOK RB-07: DR failover (multi-região)

> Ver seção 11.3 (RUNBOOK DR-01) — mesmo fluxo, acionado via PagerDuty page ou bot Slack `/dr-failover`.

### RUNBOOK RB-08: Rotina de certificado / TLS

```
RUNBOOK RB-08: Renovação de certificado
Severity: S3 (preventive)
Autoridade: SRE (automático via cert-manager)

1. MONITORAMENTO
   a. Alerta `certmanager_certificate_expiring` (7 dias antes)
   b. Dashboard: Certificates (Grafana)

2. RENOVAÇÃO (automática)
   a. cert-manager renova via ACME/Let's Encrypt
   b. Se falhar: alerta → engenheiro renova manualmente
   c. Para certificados internos (webhook HMAC, mTLS):
      vault write PKI/sign/... 
      cron: rotation a cada 90 dias

3. VERIFICAÇÃO
   a. curl -v https://api.agentflow.com 2>&1 | grep "SSL certificate verify ok"
   b. openssl s_client -connect api.agentflow.com:443 -servername api.agentflow.com
```

---

## 18. Critérios de verificação

### 18.1 Critérios de aceite (do briefing)

- [x] **Todas as 16 seções cobertas** — ver sumário (§1-§16)
- [x] **Mínimo 600 linhas** — documento completo
- [x] **Exemplo de log JSON estruturado real** — §2.3 (3 exemplos: webhook trigger, node success, node failure)
- [x] **Lista concreta de alertas com thresholds** — §5.2 (39 regras com PromQL + thresholds)
- [x] **SLOs definidos com burn rate** — §6 (6 SLOs + burn rate table + política de consumo)
- [x] **Runbook de DR passo a passo** — §11.3 (RUNBOOK DR-01)

### 18.2 Critérios técnicos de implantação (verificação pós-desenvolvimento)

| Critério | Como verificar | Owner |
|---|---|---|
| Logs JSON estruturados com traceId | `pino` configuração verifica schema | Eng. API |
| /metrics expõe todas as métricas da §3.2 | `curl localhost:3001/metrics \| grep agentflow_` | SRE |
| OpenTelemetry SDK configurado | Trace no Jaeger com 5+ spans por execução | Eng. Execução |
| Alertmanager com 5 canais (Slack, email, Discord, Telegram, webhook) | `amtool config check` + test silences | SRE |
| SLO dashboard no Grafana | Dashboard "SLO Overview" importado | Eng. Observabilidade |
| Worker heartbeat no Redis | `redis-cli GET worker:heartbeat:executor-worker` | SRE |
| Graceful shutdown com drain | Teste: SIGTERM → jobs re-enfileirados | Eng. Execução |
| CI/CD pipeline completo | GitHub Actions: lint → test → build → scan → deploy | Eng. DevOps |
| Backups testados (restore) | `restore_test_success{environment="staging"}` = 1 | DBA/SRE |
| DR runbook testado | `dr_test_passed{quarter="Q3-2026"}` = 1 | SRE |
| Cost dashboard com budget alerts | `cost_alerts_configured` = true | FinOps |
| Postmortem template preenchido | Ticket Linear `INCIDENT-*` com root cause | Eng. On-call |

### 18.3 Maturidade operacional (checklist de readiness)

Antes de GA (general availability), todos devem estar ✅:

- [ ] Logs estruturados + secret redaction + rotação + retenção implementados
- [ ] /metrics exposto em todos os serviços
- [ ] OpenTelemetry configurado + trace correlacionado com logs
- [ ] Alertmanager com todas as regras da §5.2
- [ ] SLO dashboard publicado + burn rate alertas ativos
- [ ] Health checks (/health, /ready, /live) configurados + probes k8s
- [ ] Auto-restart configurado (k8s Deployment + PDB)
- [ ] CI/CD pipeline com todos os gates (§9.1)
- [ ] Migrations usando expand/contract (§9.4)
- [ ] Backups automatizados + teste de restore mensal
- [ ] DR runbook + exercício trimestral
- [ ] Cost tracking + budget alerts ativos
- [ ] Grafana dashboards publicados
- [ ] Status page ativo + incidentes comunicados
- [ ] Postmortem process documentado
- [ ] Secrets no CI (Vault/KMS) + scanners de vuln ativos
- [ ] Ambientes devenv/staging/prod/preview criados

---

## 19. Glossário operacional

| Termo | Definição |
|---|---|
| **traceId** | ID único de 32 hex chars que correlaciona todos os spans de uma request distribuída |
| **spanId** | ID do span atual (filho do parent spanId) |
| **executionId** | ID da execução de workflow (WorkflowExecution.id no Prisma) |
| **orgId** | ID da organização — chave de tenant isolation |
| **Queue lag** | Tempo entre job criado e pego pelo worker |
| **Crash loop** | Worker reiniciando repetidamente em curto intervalo (backoff) |
| **Graceful shutdown** | Parada controlada: pára novos jobs, drena ativos, persiste estado |
| **Job draining** | Await de jobs em andamento terminarem antes de kill |
| **Dead Letter Queue (DLQ)** | Fila de jobs que falharam após todos os retries |
| **Circuit breaker** | Mecanismo que pausa chamadas a um serviço que falha consistentemente |
| **Blue-Green** | Deploy com 2 ambientes paralelos; failover via switch de tráfego |
| **Canary** | Deploy gradual enviando % do tráfego para a nova versão |
| **Rolling update** | Deploy que substitui pods gradualmente (um por um) |
| **PITR (Point-in-Time Recovery)** | Restore de PostgreSQL a um timestamp específico via WAL |
| **Expand-Contract** | Estratégia de migração de schema: adiciona (expand) → migra dados → remove (contract) |
| **RPO (Recovery Point Objective)** | Quantidade máxima aceitável de dados perdidos (em tempo) |
| **RTO (Recovery Time Objective)** | Tempo máximo aceitável para restaurar o serviço após incidente |
| **MTTD (Mean Time to Detect)** | Tempo médio para detectar um incidente |
| **MTTR (Mean Time to Respond/Repair)** | Tempo médio para responder/reparar um incidente |
| **Error budget** | Quantidade de erro "permitida" dentro do SLO (1 - SLO) |
| **Burn rate** | Taxa na qual o error budget é consumido (higher = budget esgotando rápido) |
| **mTLS** | Mutual TLS — ambos os lados se autenticam via certificado |
| **HSM (Hardware Security Module)** | Dispositivo físico/guardado que armazena chaves criptográficas |
| **mTLS** | Mutual TLS — ambos os lados se autenticam via certificado |
| **2-person rule** | Segurança: ação crítica requer 2 pessoas autorizadas |
| **Deny-by-default** | Princípio de segurança: nada é permitido a menos que explicitamente autorizado |
| **Audit chain (hash)** | AuditLog com hash de bloco — alteração detectável |
| **On-call** | Engenheiro responsável por responder incidentes 24/7 (rotativo) |
| **Feature flag** | Chave de configuração que ativa/desativa funcionalidades em runtime |

---

## 20. Referências e artefatos relacionados

| Documento | Path | Uso neste doc |
|---|---|---|
| Design do Motor de Execução | `n8n-migration/design-runner.md` | Arquitetura de workers, fila, executor |
| Design: Recriar n8n | `n8n-migration/design-recriacao.md` | Service topology, execution flow, encryption |
| Briefing: Arquitetura Cloud | `n8n-migration/briefs/prompt-arquitetura-cloud.md` | Service decomposition, filas, scheduler |
| Briefing: Operações | `n8n-migration/briefs/prompt-operations.md` | Escopo obrigatório deste documento |
| Briefing: Deploy/CICD | `n8n-migration/briefs/prompt-deploy-cicd.md` | Pipeline CI/CD, estratégias de deploy, migrations |
| Setup Dev Local | `n8n-migration/setup-dev.md` | Stack, versões, env vars, health checks |
| Especificação de Segurança | `n8n-migration/v2-security-spec.md` | RBAC, vault, auditoria, SSRF, sandbox |
| Análise de Dependências | `n8n-migration/deps-e-libs.md` | bullmq, ioredis, Prometheus libs recomendadas |
| Security Audit Report | `agentflow-security-audit.md` | Findings de segurança operacional |

---

*Documento gerado pela frente 9 (Operações e Observabilidade 24/7). Status: DESIGN — não implementa código.*
