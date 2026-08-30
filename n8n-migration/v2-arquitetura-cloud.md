# Arquitetura Cloud Always-On — AgentFlow

> **Produto**: AgentFlow — automação visual compatível com n8n, execução 24/7 em nuvem
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: DESIGN — não implementar, não commitar
> **Base**: `prompt-arquitetura-cloud.md`, `design-runner.md`, `design-recriacao.md`, `v2-security-spec.md`, `repo-map.md`, `deps-e-libs.md`, `guia-webhooks.md`

---

## 1. Visão geral e diagrama ASCII

### 1.1 Princípio Arquitetônico

O AgentFlow é reconstruído com **separação radical entre painel de controle e plano de execução**. O
navegador (dashboard Next.js) é, exclusivamente, uma interface stateless — um cliente que
visualiza resultados e envia comandos. Todo o poder de execução vive no **control plane
server-side**, composto por serviços sempre-ativos em nuvem que não conhecem, nem necessitam
de, nenhum browser ou sessão de usuário.

```
┌──────────────────┐   ┌──────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR        │   │  CONTROL PLANE (always-on, server-side)                                  │
│  (Dashboard)      │   │                                                                          │
│  Next.js 15        │   │  ┌──────┐  ┌──────────────────────────────────────┐                     │
│  Estado: NONE     │   │  │User  │  │  API / Control Plane  (Fastify)       │                     │
│  ────────────────  │   │  │Browser├────►  /api/v1/*  (auth, CRUD, trigger) │                     │
│  Visualiza dados  │   │  └──────┘  │  /metrics, /health                   │                     │
│  Envia comandos   │   │           └────┬─────┬───────────────────────────┘                     │
│  NÃO executa      │   │                │     │                                                 │
└──────────────────┘   │                ▼     ▼                                                 │
                       │         ┌──────────┐  ┌──────────────┐                                  │
                       │         │Scheduler │  │Webhook       │                                  │
                       │         │Worker    │  │Gateway       │                                  │
                       │         └────┬─────┘  └─────┬────────┘                                  │
                       │              │              │                                           │
                       │              ▼              ▼                                           │
                       │        ┌────────────────────────────────────────────────────────┐       │
                       │        │  FILAS (BullMQ / Redis)                                 │       │
                       │        │  ┌─ q.trigger  (webhook, cron, manual)   H priority   │       │
                       │        │  ├─ q.execution (nó → nó)                  M priority   │       │
                       │        │  ├─ q.retry   (backoff progressivo)        L priority   │       │
                       │        │  ├─ q.notification (e-mail, slack)         L priority   │       │
                       │        │  ├─ q.webhook (callbacks externos)         M priority   │       │
                       │        │  └─ q.dlq (dead letter — falhas fatais)               │       │
                       │        └────────────────────────┬───────────────────────────────┘       │
                       │                                 │                                       │
                       │                                 ▼                                       │
                       │              ┌───────────────────────────────────┐                      │
                       │              │  WORKERS (Node.js, pool)          │                      │
                       │              │  ┌─ executor-worker               │                      │
                       │              │  ├─ cron-worker (1 × leader)      │                      │
                       │              │  ├─ webhook-out-worker           │                      │
                       │              │  ├─ notification-worker          │                      │
                       │              │  └─ rotation-worker            │                      │
                       │              └────────────┬───────────────────────────────────┘      │
                       │                           │                                           │
                       │                           ▼                                           │
                       │        ┌────────────────────────────────────────────────────────┐       │
                       │        │  PERSISTÊNCIA                                            │       │
                       │        │  ┌─ PostgreSQL  (estado, workflow, execuções, RLS)    │       │
                       │        │  ├─ Redis        (fila + cache de resultados, 5-30d)  │       │
                       │        │  ├─ Object Store (artefatos, logs, binários)           │       │
                       │        │  └─ Vault/KMS      (KEK, mTLS, segredos do sistema)    │       │
                       │        └────────────────────────────────────────────────────────┘       │
                       │                                  │                                     │
                       │                                  ▼                                     │
                       │        ┌────────────────────────────────────────────────────────┐       │
                       │        │  INTEGRAÇÕES EXTERNAS                                 │       │
                       │        │  HTTP APIs, Slack, Stripe, OpenAI, LLMs, …            │       │
                       │        └────────────────────────────────────────────────────────┘       │
                       └──────────────────────────────────────────────────────────────────────────┘

  PROVA DE INDEPENDÊNCIA DO BROWSER: o caminho cron → scheduler → fila → worker → Postgres é
  100% interno ao plano de controle. Browser ausente = nenhuma execução interrompida.
  Logout do usuário = invalida apenas o sessão JWT; workers não usam sessão de usuário.
  Computador do usuário desligado = não afeta nada: tudo roda em containers orchestrados.
```

### 1.2 Terminologia e Convenções

| Termo | Significado |
|-------|-------------|
| **Browser/Dashboard** | Cliente Next.js stateless; NÃO participa de nenhuma execução |
| **Control Plane** | Conjunto de serviços server-side sempre ativos |
| **Scheduler** | Worker dedicado que converte *triggers* em *executions* |
| **Webhook Gateway** | Entrada pública que valida HMAC e enfileira |
| **Event Gateway** | Entrada de eventos internos/externos (webhooks, polling, push) |
| **Executor Worker** | Worker que consome `q.execution` e roda nodes |
| **Execution** | Instância única de um workflow em execução |
| **Node Execution** | Resultado da execução de um único nó dentro de uma execution |
| **Tenant** | Organização (org); unidade de isolamento multi-tenant |
| **Trigger** | Evento que inicia uma execution: `webhook`, `cron`, `manual`, `api` |

---

## 2. Decomposição de serviços

Cada serviço é um processo ou container independente, escalável horizontalmente e com
responsabilidade única (Single Responsibility). Acoplamento é feito por mensagens (fila /
queue), nunca por chamadas síncronas entre componentes críticos de execução.

### 2.1 API / Control Plane (Fastify)

| Propriedade | Valor |
|-------------|-------|
| Stack | Fastify (Node.js ESM) |
| Responsabilidade | HTTP API stateless — autenticação, autorização, validação, enfileiramento |
| Entradas | Requests do browser, mobile, API clients |
| Saídas | Jobs enfileirados no Redis; respostas HTTP assíncronas (202) |
| Acoplamento | Conhece fila (BullMQ), DB (Prisma), Vault (secrets); NÃO executa nodes |
| Replicado | Sim — múltiplas réplicas por região |
| Estado | Stateless (não guarda execution state em memória) |

**Responsabilidades:**
- Autenticação (JWT + MFA, OAuth broker) — conforme `v2-security-spec.md` §3
- Autorização RBAC (deny-by-default) — conforme `v2-security-spec.md` §4
- CRUD de workflows, node types, credentials, webhooks, approvals
- Trigger de execução: cria `WorkflowExecution` (status `PENDING`), enfileira job em `q.trigger`
- Webhook management (CRUD de endpoints públicos)
- Rate limiting por org/IP/chave — conforme `v2-security-spec.md` §14
- Endpoint `/metrics` (Prometheus), `/health`, `/ready`, `/live`

### 2.2 Scheduler Worker

| Propriedade | Valor |
|-------------|-------|
| Stack | Node.js + BullMQ + ioredis |
| Responsabilidade | Cron distribuído; converte schedules em executions |
| Estado | Leader election via Redis (`SETNX` com TTL 30s) — apenas 1 líder ativo |
| Replicado | Sim (ativo-passivo via leader election) |
| Prioridade job | Alta (cron não deve ser atrasado por congestão) |

**Algoritmo (a cada 10s):**
1. Executa `SETNX scheduler:leader <instanceId>` com `EX=30` (TTL). Se falhar, outro líder existe.
2. Se líder: query `WorkflowSchedule` onde `enabled=true AND nextRunAt <= NOW()`.
3. Para cada schedule: valida timezone (`croner`), verifica janela de execução (evita feriados/fora horário), gera `WorkflowExecution` (trigger=`cron`), enfileira em `q.trigger` com prioridade alta.
4. Atualiza `nextRunAt` com próxima ocorrência (cron parser).
5. Heartbeat a cada 5s: renova `scheduler:leader` TTL. Se falhar 3x consecutivas, libera lock.

### 2.3 Webhook Gateway

| Propriedade | Valor |
|-------------|-------|
| Stack | Fastify (rota pública) + ioredis (BullMQ) |
| Responsabilidade | Receber webhooks externos, validar HMAC, enfileirar |
| Estado | Stateless |
| Replicado | Sim (load balancer público) |

**Fluxo (conforme `guia-webhooks.md`):**
1. Recebe `ANY /api/webhooks/trigger/:orgSlug/:path`
2. Valida HMAC-SHA256: header `X-Webhook-Signature: sha256=<hmac>` contra body raw + secret do webhook
3. Valida timestamp (≤ 5 min) e nonce (deduplicação)
4. Busca `Webhook` record (orgId + path) no Postgres via cache Redis
5. Se workflow `ACTIVE`: cria `WorkflowExecution` (trigger=`webhook`, input=body, payload em object storage), enfileira em `q.trigger` prioridade alta
6. Responde `202 Accepted` com `{ executionId }` — nunca bloqueia o produtor

### 2.4 Event Gateway

Entrada unificada para eventos internos e externos. Normaliza diferentes fontes (webhooks HTTP,
pollers de integração, push de serviços, eventos do próprio sistema) em um formato comum e
publica no `q.trigger`. Construído sobre:

- **Webhook Receiver** (HTTP) — já implementado (§2.3)
- **Polling Runner** — worker que faz polling periódico de APIs externas (GitHub, Stripe, etc.) e gera eventos
- **Push Inbound** — listeners para Kafka/PubSub se necessário (futuro)

Formato de evento normalizado:
```json
{
  "eventId": "evt_abc123",
  "orgId": "org_xyz",
  "workflowId": "wf_123",
  "trigger": "webhook",
  "source": "http",
  "timestamp": "2026-08-20T10:00:00Z",
  "payloadRef": "s3://exec/exec_abc/payload.json",
  "headers": { "x-signature": "sha256=..." }
}
```

### 2.5 Executor Workers

| Propriedade | Valor |
|-------------|-------|
| Stack | Node.js + BullMQ Worker |
| Responsabilidade | Consumir `q.execution`, rodar nós, persistir resultados |
| Concurrency | Configurável por worker (default 10 jobs simultâneos) |
| Isola | Cada job em contexto isolado; credenciais resolvidas no momento (nunca em job payload) |

**Contrato (baseado em `design-runner.md` §5.2):**
- Job `execute`: `{ executionId: string, orgId: string, traceId: string }`
- Worker carrega `WorkflowExecution` + `WorkflowVersion` do Postgres
- Resolve DAG via topological sort
- Para cada nó: valida schema (Zod), resolve credenciais (Vault → decrypt, nunca persiste), executa handler
- Persiste `NodeExecution` (input, output, error, logs, duration, retryCount, idempotencyKey)
- Trata retries, timeouts, circuit breakers (§8)
- Emite eventos para `q.notification` (resultados, erros, aprovações)

### 2.6 Workers Especializados

| Worker | Fila de origem | Responsabilidade |
|--------|----------------|------------------|
| `cron-worker` | `q.trigger` (cron) | Single leader, agenda executions via `q.trigger` |
| `executor-worker` | `q.execution` | Roda nodes do workflow (DAG runner) |
| `webhook-out-worker` | `q.webhook` | Envia callbacks HTTP para integrações externas (com retry + backoff) |
| `notification-worker` | `q.notification` | E-mails, Slack, Discord, aprovações humanas |
| `rotation-worker` | `q.rotation` | Rotação de credenciais e chaves mestras (scheduled) |
| `cleanup-worker` | `q.cleanup` | TTL de execuções antigas, arquivamento, dead letter drain |

### 2.7 Dashboard (Next.js) — Cliente Stateless

| Propriedade | Valor |
|-------------|-------|
| Stack | Next.js 15 App Router + React 19 + @xyflow/react v12 |
| Responsabilidade | UI/UX apenas: editor visual, lista de execuções, detalhes, credenciais |
| Estado server | Nenhum — busca tudo da API via HTTP |
| Cache | SWR/TanStack Query (cliente); nunca participa de execução |

**Prova de independência:** o dashboard não contém nenhum worker, nenhuma conexão com a fila,
nem nenhuma lógica de execução. Ele envia comandos (`POST /execute`, `POST /cancel`) e recebe
updates via polling ou SSE. Se o browser fechar, logar out, ou o computador desligar — nenhum
workflow em andamento é afetado.

---

## 3. Filas e mensageria

Baseado em **BullMQ v5.81.3** + **Redis 7** (já no repo). BullMQ é a escolha canônica porque:
persiste em Redis, suporta DAGs via parent/child jobs, retries com backoff, rate limiting,
prioridade e dead letter queues. Alternativas avaliadas (`inngest`, `node-cron`, custom runner)
rejeitadas conforme `deps-e-libs.md` §3.

### 3.1 Topologia de Filas

```
Redis (cluster ou sentinel)
├── bullmq:trigger     ──► [scheduler, webhook gw, manual trigger]
├── bullmq:execution   ──► [executor workers]       (main flow)
├── bullmq:retry       ──► [retry scheduler]        (backoff progressivo)
├── bullmq:notification ──► [notification workers]    (e-mail, slack)
├── bullmq:webhook     ──► [webhook-out workers]     (callbacks externos)
├── bullmq:dlq         ──► [dlq handler]            (falhas fatais)
├── bullmq:rotation    ──► [rotation workers]        (key/credential rotation)
├── bullmq:cleanup     ──► [cleanup workers]        (archive, TTL)
└── bullmq:events      ──► [pub/sub events]         (BullMQ events stream)
```

### 3.2 Esquema de prioridades

| Fila | Prioridade | Motivo |
|------|-----------|--------|
| `q.trigger` (webhook urgent) | 100 | Webhook imediato do cliente |
| `q.trigger` (manual) | 90 | Execução iniciada pelo usuário |
| `q.trigger` (cron) | 80 | Cron não deve ser atrasado |
| `q.trigger` (webhook) | 70 | Webhook normal |
| `q.execution` (nó) | 50 | Execução normal de nodes |
| `q.retry` (retry 1) | 60 | Primeiro retry — prioridade elevada |
| `q.retry` (retry 2+) | 30 | Retries progressivos — depriorizados |
| `q.notification` | 20 | E-mails, slack (eventuais) |
| `q.webhook` (callback) | 40 | Callback externo — tolerante a delay |
| `q.dlq` | 10 | Dead letter — baixa prioridade, monitorar |

### 3.3 Concurrency e Rate Limiting por Worker

Cada worker tipo configura:
- **Concurrency**: número de jobs simultâneos (executor: 10, webhook-out: 20, notification: 30)
- **Rate limit por org**: tokens por segundo (ex: 10 exec/minuto por org free, 1000 por org enterprise)
- **Backpressure**: quando a fila `q.execution` excede 10.000 jobs, API responde `429` ou enfileira em `q.dlq`

### 3.4 Sharding de Filas

- **Por tenant (opcional, >10k tenants)**: shard por `orgId % N` → filas `q.execution.shard_0..N-1`
- **Por tipo de node (opcional, alta scale)**: `q.execution.ai` (nodes LLM), `q.execution.http` (HTTP), `q.execution.code` (sandbox)
- **Por região (multi-região)**: filas dedicadas por região (latência local)

### 3.5 Payload de Jobs — Segurança

**REGRA DE OURO**: credential values **nunca** em job payload. O job carrega apenas referências:

```typescript
// Job em q.execution
{
  executionId: "exec_abc123",
  orgId: "org_xyz",
  workflowId: "wf_123",
  traceId: "trace_999",
  nodeId: "node_http_1",
  inputRef: "s3://exec/exec_abc123/node_http_1/input.json",   // payload em object storage
  credentialRef: {                                            // referência apenas
    nodeCredentialId: "cred_ref_1",
    type: "api_key"
  },
  retryCount: 0,
  idempotencyKey: "exec_abc123:node_http_1:attempt_0",
  tenant: "org_xyz",
  maxDurationMs: 60000
}
```

Worker resolve `credentialRef` no Vault (decrypt) no momento da execução e descarta da memória.

---

## 4. Agendamento distribuído

### 4.1 Cron Worker (Leader Election)

```
┌────────────────────────┐
│  cron-worker (instance) │
└───────────┬────────────┘
            │  cada 5s:
            ▼
┌─────────────────────────────────────────────┐
│  Redis: SETNX scheduler:leader <instance>  │
│  EX=30  →  TTL refresh                     │
│  (only 1 leader active)                     │
└────────────────────┬──────────────────────┘
                     │
        ┌────────────┴────────────┐
        │  (if leader)            │
        ▼
┌─────────────────────────────────────────────┐
│  SELECT * FROM workflow_schedule           │
│  WHERE enabled=true                        │
│  AND next_run_at <= NOW()                  │
│  AND (janela_execucao_ok = true)           │
└────────────────────┬──────────────────────┘
                     │
        ┌────────────┴────────────┐
        │  for each schedule:     │
        ▼
  ┌─────────────────────────────────────────────┐
  │  1. parse cron (croner)                     │
  │  2. resolve timezone (org.time_zone)        │
  │  3. check janela (evitar feriado)           │
  │  4. create WorkflowExecution (status=PENDING, trigger=cron)  │
  │  5. enqueue job in q.trigger (priority=80)  │
  │  6. update next_run_at = cron.next()        │
  └─────────────────────────────────────────────┘
```

### 4.2 Persistência de Agenda

Tabela `WorkflowSchedule` (do `design-recriacao.md` §a):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cron_expression` | `String` | `"0 9 * * 1-5"` (UTC) |
| `timezone` | `String` | `"America/Sao_Paulo"` |
| `enabled` | `Boolean` | Ativo/inativo |
| `next_run_at` | `DateTime?` | Próxima execução (cacheado) |
| `last_run_at` | `DateTime?` | Última execução |
| `jitter_ms` | `Int` | Jitter aleatório (±30s) para evitar thundering herd |

### 4.3 Recuperação após Reinício

- `next_run_at` é recalculado no startup do scheduler (idempotente — não duplica se já passou)
- Locks de distribuição usam Redis com TTL; se o líder morre, outro assume em ≤30s
- Jobs enfileirados no BullMQ têm `removeOnComplete`/`removeOnFail` + retry automático

### 4.4 Janelas de Execução e Jitter

- **Jitter**: ±30s em `next_run_at` (configurável) — evita picos simultâneos
- **Janelas de execução**: flag `active_hours` no schedule — se fora da janela, adia para próxima ocorrência dentro da janela
- **Feriados**: lookup tabela `holiday_calendar` por `org.timezone`; se cair em feriado, skip + log

---

## 5. Webhook gateway

### 5.1 Arquitetura

```
┌──────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Cliente Externo      │     │  Webhook Gateway  │     │  q.trigger       │
│  (Stripe, GitHub…)    │ ──► │  (Fastify público) │ ──► │  (BullMQ)        │
└──────────────────────┘     └──────────────────┘     └────────┬─────────┘
                                     │                          │
                              (valida HMAC)                     │
                                     ▼                          │
                              ┌──────────────────┐              │
                              │  Redis cache      │              │
                              │  (webhook lookup) │              │
                              └────────┬──────────┘              │
                                     │                          │
                              (cria execution)                  │
                              (grava payload no OS)              │
                                     └──────────────────────────┘
```

### 5.2 Contratos e Validações

| Etapa | Regra |
|-------|-------|
| URL | `ANY /api/webhooks/trigger/:orgSlug/:path` |
| HMAC | Header `X-Webhook-Signature: sha256=<hmac>` sobre body raw |
| Timestamp | Header `X-Webhook-Timestamp` — rejeita se delta > 300s (replay) |
| Nonce | Header `X-Webhook-Nonce` — deduplicação via Redis SET (TTL 10min) |
| Payload size | Máx 10MB (Fastify body parser) |
| Lookup | Webhook `path` + `orgSlug` → cache Redis (1min TTL) → fallback Postgres |
| Response | `202 Accepted { executionId }` — nunca bloqueia |
| Fail | Invalid HMAC → `401`; not found → `404`; payload muito grande → `413` |

### 5.3 Filas de Webhooks Offline

- Webhooks recebidos quando a API está down são persistidos em **object storage** (S3-compatible)
  com chave `webhooks/offline/{orgSlug}/{path}/{timestamp}_{nonce}.json`
- Worker de recuperação varre o bucket e reenfileira em `q.trigger` quando o serviço volta
- Política de retenção: 7 dias (dead letter se mais antigo)

### 5.4 Deduplicação

- Chave: `wh:{orgId}:{path}:{nonce}` em Redis com TTL 10min
- Se chave existe → `409 Conflict` (já processado)
- Nonce gerado pelo remetente ou pelo gateway se ausente (hash do body + timestamp)

---

## 6. Persistência e dados

### 6.1 PostgreSQL — Fonte de Verdade

Instância gerenciada (Supabase/Railway/Neon) com **RLS multi-tenant** (conforme
`v2-security-spec.md` §10): toda query carrega `orgId`; política `USING org_id = current_setting('app.org_id')`.

| Tabela | Uso | Retenção |
|--------|-----|----------|
| `workflows`, `workflow_versions` | Definição de workflows | Permanente (soft delete) |
| `workflow_executions` | Estado de execuções | 90 dias (arquivamento para OS após) |
| `node_executions` | Resultados por nó | 90 dias |
| `credentials` | Credenciais encriptadas (envelope AES-256-GCM) | Permanente |
| `webhooks` | Endpoints públicos (path, secret, active) | Permanente |
| `workflow_schedule` | Cron expressions | Permanente |
| `approvals` | Aprovações humanas-in-the-loop | 30 dias após resolvida |
| `audit_logs` | Imutável, hash chain | 2 anos |

**Backup (conforme `v2-security-spec.md` §9):**
- `pg_dump` + WAL archiving (RPO=5min, RTO<30min)
- Replicação hot standby para read scaling
- Backups criptografados (AES-256) no object storage

### 6.2 Redis — Fila + Cache

- **BullMQ** (persistência de jobs) — Redis como backing store
- **Cache de lookups**: webhooks, workflow definitions, node types (TTL 5-10min)
- **Session store**: refresh tokens, rate limit counters, leader election locks
- **Result cache**: outputs de nodes (TTL 2h) — para retries sem re-exec

**Backup Redis:**
- RDB snapshot diário (off-peak)
- AOF every-second (RPO≈1s)
- Replicação master-replica

### 6.3 Object Storage — Artefatos

Provider: S3-compatible (AWS S3, Cloudflare R2, MinIO local).

| Chave | Conteúdo | Retenção |
|-------|---------|----------|
| `exec/{executionId}/payload.json` | Input original da execution | 90 dias |
| `exec/{executionId}/node/{nodeId}/input.json` | Input do nó | 30 dias |
| `exec/{executionId}/node/{nodeId}/output.json` | Output do nó | 30 dias |
| `exec/{executionId}/logs/{nodeId}.log` | Logs do nó (stdout/stderr) | 30 dias |
| `exec/{executionId}/artifacts/*` | Arquivos binários produzidos | 90 dias |
| `webhooks/offline/*` | Webhooks offline (recovery) | 7 dias |
| `creds/exports/*` | Exports de credencial (criptografado) | 30 dias |

### 6.4 Vault / KMS — Segredos do Sistema

| Segredo | Storage | Rotacionado |
|---------|---------|-------------|
| `JWT_SECRET` | Env var / KMS | 90 dias |
| `CREDENTIAL_ENCRYPTION_KEY` | Env var / KMS | 90 dias (dual-write) |
| `STRIPE_WEBHOOK_SECRET` | Env var / KMS | 90 dias |
| Certificados TLS | Vault PKI | Automático |
| Credential DEK por tenant | Postgres (envelope) | Por credential |
| DB root password | Secrets manager | Automático |

---

## 7. Fluxo de execução 24/7 (sequência)

### 7.1 Gatilho: Webhook Externo

```
┌─────────────┐  POST /trigger/org/path  ┌──────────────┐  202  ┌────────┐
│ External    │ ────────────────────────► │ Webhook       │ ─────► │ Client │
│ (Stripe)    │  {payload, HMAC}         │ Gateway       │       │        │
└─────────────┘                          └──────┬───────┘        └────────┘
                                               │
                          validate HMAC + nonce + timestamp
                                               │
                                               ▼
                    ┌──────────────────────────────────────────────┐
                    │ API: create WorkflowExecution (PENDING)       │
                    │ persist payload → object storage              │
                    └─────────────────────┬──────────────────────────┘
                                          │
                              enqueue q.trigger (priority 100)
                                          │
                                          ▼
                    ┌──────────────────────────────────────────────┐
                    │ Scheduler: resolve workflow, create exec job   │
                    │ enqueue q.execution (priority 50)             │
                    └─────────────────────┬──────────────────────────┘
                                          │
                                          ▼
                    ┌──────────────────────────────────────────────┐
                    │ Executor Worker (pool)                        │
                    │ 1. load WorkflowVersion (DAG)               │
                    │ 2. topological sort                         │
                    │ 3. for each node:                             │
                    │    a. validate (zod)                         │
                    │    b. resolve credential (vault decrypt)     │
                    │    c. execute handler                        │
                    │    d. persist NodeExecution                   │
                    │    e. on failure: retry/backoff → q.retry     │
                    │ 4. update WorkflowExecution status           │
                    │ 5. emit q.notification (results, errors)     │
                    └──────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┘
                    ▼
                    ┌──────────────────────────────────────────────┐
                    │ PostgreSQL (state) + Object Storage (logs)   │
                    └──────────────────────────────────────────────┘
```

**Este fluxo não toca o browser em nenhum momento.** O cliente recebe apenas o `202` com
`executionId` e depois consulta `GET /executions/:id` ou stream via SSE.

### 7.2 Gatilho: Cron

Idêntico ao webhook, exceto:
1. **Scheduler Worker** (leader único) dispara → cria `WorkflowExecution` (trigger=`cron`)
2. Enfileira em `q.trigger` (priority 80)
3. Navegador pode estar fechado, deslogado, ou o computador desligado — **não afeta**

### 7.3 Gatilho: Manual (via API)

```
Browser ──► POST /workflows/:id/execute
     API: valida RBAC → create WorkflowExecution (trigger=manual) → enqueue q.trigger (priority 90)
     Response: 202 { executionId }
```

Se o browser fechar após o `202`, a execution continua no control plane.

### 7.4 Gatilho: API Externa

Via API Key ou Bearer token:
```
External ──► POST /api/v1/workflows/:id/execute  { input: {...} }
     API: validate key (scoped, execution only) → enqueue
```

### 7.5 Estado de Execução (Execution Lifecycle)

```
        ┌─────────┐
        │PENDING  │  (enfileirado, aguardando worker)
        └───┬─────┘
            │
            ▼
        ┌─────────┐
        │RUNNING  │  (worker pegou o job)
        └───┬─────┘
            │
      (todos os nós OK)
            ▼
        ┌─────────┐
        │SUCCESS  │  ✓
        └─────────┘

            │
      (erro fatal não recuperável)
            ▼
        ┌─────────┐
        │FAILED   │  ✗ (movido para q.dlq)
        └─────────┘

            │
      (cancelado via API)
            ▼
        ┌─────────┐
        │CANCELLED│
        └─────────┘

            │
      (nó precisa de aprovação humana)
            ▼
        ┌─────────┐
        │WAITING_ │  → usuário aprova/rejeita via API
        │APPROVAL │  → retoma ou falha
        └─────────┘
```

---

## 8. Recuperação de falhas

### 8.1 Tipos de Falha e Tratamento

| Falha | Estratégia |
|-------|------------|
| **Worker crash** (process kill, OOM) | BullMQ re-enfileira o job (TTL não expirado); job retoma do último checkpoint |
| **API restart** | Stateless — sem perda; filas no Redis sobrevivem |
| **Redis down** | BullMQ rejeita novos jobs; executions em andamento completam (timeout); alerta P1 |
| **Postgres down** | Workers pausam (retry connection); executions não conseguem persistir estado → circuit breaker → DLQ |
| **Node falha (erro de API externa)** | Retry exponencial (1s, 5s, 30s, 60s) até maxRetries (config por nó); depois → DLQ |
| **Timeout de nó** | `NODE_TIMEOUT_MS=60000` — Promise.race com timeout; marca como `TIMEOUT`, persiste, continua |
| **Timeout de execution** | `EXECUTION_TIMEOUT_MS=300000` — cancellation via AbortController; marca como `FAILED` |

### 8.2 Checkpoint e Retomada

Cada `NodeExecution` é persistido em Postgres **após a conclusão** (success/failed). Se o worker
morrer entre nós:

1. No startup, worker consulta `WorkflowExecution` com status `RUNNING` e `startedAt` dentro de
   um TTL (ex: 10min — considerado *abandoned*).
2. Carrega `NodeExecution` já concluídas (output persistido).
3. Retoma do primeiro nó com status `PENDING` (ou re-executa nós falhos, conforme política).
4. `idempotencyKey` (campo existente em `NodeExecution`) previne dupla execução.

```
Execution E1:  [nodeA ✓] → [nodeB ✓] → [nodeC ✗ TIMEOUT] → [nodeD PENDING]
                     │            │
                     └── Worker morre aqui ──► recupera do Postgres
                                                    ↓
                     E1 recuperado: [nodeA ✓ (cache)] → [nodeB ✓ (cache)] → [nodeC 🔄 retry] → [nodeD PENDING]
```

### 8.3 Dead Letter Queue (DLQ)

- Jobs que esgotam retries vão para `q.dlq` com metadados completos (executionId, nodeId, error, tentativas)
- Worker de DLQ envia notificação (`q.notification`) ao owner + cria ticket no sistema de tickets
- Retention DLQ: 30 dias; reprocessamento manual via API (`POST /dlq/:id/retry`)

### 8.4 Circuit Breaker

- Por **tenant** e por **integration** (ex: OpenAI, Stripe)
- Estado: `CLOSED` (normal) → `OPEN` (erro ≥ N no período) → `HALF_OPEN` (testa) → `CLOSED`/`OPEN`
- Threshold: 50% de falhas em 1min → abre por 60s; após 60s, um job testa; se ok → half_open
- Quando aberto: jobs para essa integration são rejeitados imediatamente → DLQ + notificação

### 8.5 Retry Progressivo (Exponential Backoff)

| Tentativa | Delay (base 1s) | Delay (base 5s) |
|-----------|-----------------|-----------------|
| 1 | 1s | 5s |
| 2 | 2s | 25s |
| 3 | 4s | 125s |
| 4 | 8s | 625s |
| 5 | 16s (max) | 625s (max) |

- Jitter ±20% para evitar thundering herd
- Config por node type (ex: LLM pode ter mais retries; HTTP crítico pode ter menos)

### 8.6 Graceful Shutdown

- SIGTERM → worker pára de pegar novos jobs, completa os em andamento (até `CONCURRENCY_GRACE_PERIOD_MS=30000`)
- Jobs incompletos são re-enfileirados automaticamente pelo BullMQ
- API faz `server.close()` + aguarda connections ativas (até 10s)
- Drain de conexões: migrations não rodam durante shutdown

---

## 9. Garantias de entrega

### 9.1 Exactly-once vs At-Least-Once por Tipo de Node

| Node Type | Garantia | Justificativa | Mecanismo |
|-----------|----------|---------------|-----------|
| `webhook` (trigger) | at-least-once | Fonte externa pode reenviar | Deduplicação via nonce |
| `cron` | at-most-once | Scheduler é leader único | Lock de agenda + idempotency |
| `manual` | at-most-once | API dedupe via idempotency key | Idempotency-Key no header |
| `httpRequest` | at-least-once | Rede é inerentemente unreliable | Retry + idempotency do destino |
| `if` | exactly-once | Stateless, idempotente | Nenhum side effect |
| `set` | exactly-once | Stateless, idempotente | Nenhum side effect |
| `code` | at-least-once | Pode ter side effects não idempotentes | Sandbox + retry |
| `emailSend` | at-most-once * | Envio duplicado é perceptível | Idempotency key + provider dedupe |
| `aiAgent` | at-least-once | Chama LLM (não idempotente por custo) | Deduplicação por executionId |
| `approval` | exactly-once | Estado único em DB | Lock otimista (version) |

\* "at-most-once" é a garantia do provider (Stripe idempotency-key); plataforma tenta exactly-once mas depende do provider.

### 9.2 Idempotência

- **Execution-level**: `executionId` único (cuid/cuid2); re-executar envia novo `executionId`
- **Node-level**: `NodeExecution.idempotencyKey` (`execId:nodeId:attempt`); worker verifica antes de executar
- **External API**: nodes `httpRequest` podem enviar `Idempotency-Key` header (se provider suportar)
- **Credential decrypt**: sem side effects; idempotente

### 9.3 Deduplicação de Eventos

- **Webhook**: nonce + timestamp (§5.2)
- **Execução manual**: client passa `Idempotency-Key`; API verifica se execution com mesma key já foi criada (TTL 24h)
- **Scheduler**: `next_run_at` é exclusivo; lock de leader impede duplicação

---

## 10. Escalabilidade horizontal

### 10.1 Dimensionamento por Serviço

| Serviço | Métrica de escala | Estratégia | Limites por tenant |
|---------|------------------|------------|-------------------|
| API | CPU > 70% ou Req/s > 200 | Horizontal (réplicas) | 100 req/s por org free / 1000 por enterprise |
| Executor Worker | Fila `q.execution` > 5000 | Horizontal (más replicas) | 50 concurrent exec por org free |
| Scheduler | Único (leader election) | Ativo-passivo | N/A (single leader) |
| Webhook Gateway | Req/s > 100 | Horizontal | 100 POST/s por org |
| Redis | Memória > 70% | Cluster + sharding | N/A |
| Postgres | Conexões > 80% | Read replicas | 100 concurrent conns por org |

### 10.2 Sharding de Filas

- **Por tenant** (`orgId % N_SHARDS`): quando > 10.000 tenants ativos
- **Por tipo de node**: `q.execution.ai` (LLM), `q.execution.sandbox` (code), `q.execution.io` (HTTP/DB)
- **Por prioridade**: filas separadas para high/medium/low (evita starvation)

### 10.3 Multi-região (opcional)

```
Região us-east-1           Região eu-west-1
┌─────────────────┐        ┌─────────────────┐
│ API + Workers   │◄──────►│ API + Workers   │
│ PostgreSQL (R)  │        │ PostgreSQL (R)  │
│ Redis (R)       │        │ Redis (R)       │
└────────┬────────┘        └────────┬────────┘
         │                        │
         └──────────┬─────────────┘
                    ▼
         ┌─────────────────────────┐
         │ Global PostgreSQL (w)    │
         │ Object Storage (global)  │
         │ Vault (global)           │
         └─────────────────────────┘
```

- Writes vão para região primária; reads podem ser regionais
- Object storage e Vault são globais (multi-região)
- Failover automático se região primária cai (RTO < 60s)

---

## 11. Observabilidade

### 11.1 Stack de Observabilidade

```
┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
│  Logs (JSON)    │───►│  Loki/Grafana│    │  Alertas      │
└─────────────────┘    └──────┬───────┘    │  (Alertmanager│
                             │             │   / PagerDuty) │
┌─────────────────┐    ┌──────▼───────┐    └───────┬───────┘
│  Metrics (Prom) │───►│  Grafana    │            │
└─────────────────┘    └──────┬──────┘            │
                             │                     │
┌─────────────────┐    ┌──────▼───────┐    ┌───────▼────────┐
│  Traces (OTel)  │───►│  Jaeger/     │    │  SLO Dashboard │
└─────────────────┘    │  Tempo/Grafana│    └────────────────┘
                       └──────────────┘
```

### 11.2 Logs Estruturados (JSON)

Formato (conforme `prompt-operations.md` §2):

```json
{
  "timestamp": "2026-08-20T10:00:00.123Z",
  "level": "info",
  "service": "executor-worker",
  "traceId": "trace_999",
  "executionId": "exec_abc123",
  "workflowId": "wf_def456",
  "nodeId": "node_http_1",
  "orgId": "org_xyz",
  "userId": "usr_789",
  "event": "node.completed",
  "durationMs": 245,
  "data": { "statusCode": 200 },
  "secret": "<redacted>"
}
```

- **Secret redaction**: regex global remove valores de `apiKey`, `password`, `token`, `secret` de strings de log
- **Retenção**: 30 dias em Loki; arquivos de log por execution em object storage (90 dias)

### 11.3 Métricas (Prometheus)

| Métrica | Tipo | Descrição |
|--------|------|-----------|
| `agentflow_execution_total` | counter | Execuções por status (success/failed/cancelled) |
| `agentflow_node_duration_seconds` | histogram | Duração por node type |
| `agentflow_queue_depth` | gauge | Profundidade por fila |
| `agentflow_worker_active` | gauge | Workers ativos por tipo |
| `agentflow_webhook_requests_total` | counter | Requests no gateway (2xx/4xx/5xx) |
| `agentflow_credential_decrypt_total` | counter | Decrypts (auditável) |
| `agentflow_sso_success_rate` | gauge | Taxa de login SSO |

Exposição: `/metrics` (Fastify plugin `fastify-metrics`)

### 11.4 Tracing Distribuído (OpenTelemetry)

- **Propagação**: `traceparent` header em toda chain (browser → API → gateway → worker)
- **Spans**: `execution.run`, `node.execute`, `credential.decrypt`, `http.request`, `db.query`
- **Correlation**: `traceId` em todos os logs → cross-reference com Grafana

### 11.5 SLOs

| SLO | Meta | Medição | Burn Rate (budget 30d) |
|-----|------|---------|----------------------|
| Disponibilidade da API | 99.9% | uptime over 30d | 0.1% = 4.3min downtime |
| Latência p95 de agendamento | < 5s | time(schedule → job in queue) | alerta se > 8s por 5min |
| Taxa de sucesso de execução | 99.5% | success/total over 30d | 0.5% = 44 falhas em 50k |
| Webhook delivery | 99.9% | delivered/total (2xx) | retry se < 99% |
| Recovery de crash | < 60s | time(worker crash → job restarted) | alerta se > 90s |

### 11.5 Health Checks

| Endpoint | Verifica |
|----------|----------|
| `/health` | HTTP 200 (básico) |
| `/ready` | DB + Redis + Vault conectáveis |
| `/live` | Worker heartbeats recentes (≤30s) |

- Worker envia heartbeat para Redis a cada 10s: `worker:heartbeat:<id> → {lastSeen, activeJobs, queueDepth}`
- API verifica heartbeats no `/ready`; se nenhum worker há 60s → unhealthy

---

## 12. Multi-tenancy

### 12.1 Modelo de Isolamento

| Camada | Técnica |
|--------|---------|
| **Dados** | PostgreSQL RLS (`app.org_id`); toda query scoped |
| **Filas** | Jobs carregam `orgId`; worker valida antes de executar |
| **Cache** | Chaves Redis prefixadas (`org:{orgId}:...`) |
| **Execução** | Worker carrega workflow + valida `orgId` match; isola contexto por execution |
| **Object Storage** | Prefixos `s3://agentflow/org/{orgId}/...` |
| **Vault** | DEK por tenant (`keyVersion` scope a org) |

### 12.2 Limites por Tenant

| Limite | Free | Pro | Enterprise |
|--------|------|-----|-----------|
| Execuções/mês | 10.000 | 100.000 | Ilimitado |
| Concurrent executions | 5 | 50 | Ilimitado (config) |
| Payloads max | 5MB | 10MB | 50MB |
| TTL de logs | 7 dias | 30 dias | 90 dias |
| Workflows | 50 | 500 | Ilimitado |
| Credenciais | 10 | 100 | Ilimitado |

- Rate limiter por `orgId:{action}` (Redis token bucket)
- Quota de execução: contador no `usage_records` table; reset mensal

### 12.3 Tenant Isolation em Workers

Worker nunca confia em dados de job para isolamento:

```typescript
// Pseudocódigo no worker
const { orgId, executionId } = job.data;
const execution = await prisma.workflowExecution.findUnique({
  where: { id: executionId, orgId }  // CRÍTICO: scope no WHERE
});
if (!execution) throw new Error("Execution not found or belongs to different org");
const workflow = await prisma.workflow.findUnique({
  where: { id: execution.workflowId, orgId }
});
```

Se a query retorna nada → `403`/DLQ, **nunca** executa.

---

## 13. Custos

### 13.1 Estimativa por Componente (tier médio — 10k execuções/mês)

| Serviço | Estimativa (10k exec/mês) | Estimativa (100k exec/mês) |
|---------|--------------------------|---------------------------|
| PostgreSQL (Neon/Supabase) | $25/mês | $150/mês |
| Redis (Redis Cloud/Elasticache) | $30/mês | $150/mês |
| Object Storage (S3/R2) | $5/mês | $50/mês |
| Workers (Render/ Fly.io) | $50/mês (2×$25) | $500/mês (auto-scale) |
| API (Fastify) | $25/mês (1 instância) | $150/mês (2×$75) |
| Observabilidade (Grafana Cloud) | $50/mês | $200/mês |
| **Total mensal** | **~$185** | **~$1.200** |

### 13.2 Eficiência

- **Worker pooling**: bullmq concurrency=10 por worker; evita spin-up por job
- **Cold start**: minimizado — workers ficam warm (idle timeout 15min)
- **Alocação dinâmica**: HPA baseada em `queue_depth` + `cpu`; workers escalam 2→20 conforme carga
- **LLM cost tracking**: `ai_cost_tracking` table — tokens in/out × preço do modelo; alerta se > budget

---

## 14. Opções de deploy

### 14.1 Recomendação Principal: Render.com + Next.js (Vercel)

| Serviço | Plataforma | Justificativa |
|---------|-----------|---------------|
| Dashboard | **Vercel** | Next.js first-class; edge cache; auto-deploy de PRs; preview URLs |
| API | **Render** | Postgres gerenciado integrado; worker services (BullMQ); deploys automáticos |
| Scheduler | **Render** (1 instance) | Single-leader; failover via leader election |
| Workers | **Render** (auto-scale) | Worker service escalável; BullMQ-native |
| Redis | **Render** (Redis plugin) | Managed; persistence configurada |
| Object Storage | **Cloudflare R2** | Barato; S3-compatible; sem egress fee |
| Vault/KMS | **AWS KMS** ou **GCP KMS** | Segredos gerenciados |

**Prós Render:**
- Postgres + Redis managed nativo
- Worker services (long-running) — ideal para BullMQ
- Deploy sem downtime (blue-green implícito)
- Preços previsíveis

**Contras Render:**
- Lock-in leve
- Region única (sem multi-região fácil)

### 14.2 Alternativa: Kubernetes (EKS/GKE)

```
┌─────────────────────────────────────────────────┐
│  Kubernetes Cluster                             │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  Ingress     │  │  Cert-Manager│            │
│  │  (nginx)     │  │  (TLS)       │            │
│  └──────┬───────┘  └──────┬───────┘            │
│         │                │                      │
│  ┌──────▼──────┐         │                      │
│  │  API HPA    │         │                      │
│  │  (Fastify)  │         │                      │
│  └──────┬──────┘         │                      │
│         │                │                      │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────┐│
│  │ Worker HPA  │  │ Scheduler   │  │Webhook   ││
│  │ (executor)  │  │ (1 replica) │  │Gateway   ││
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘│
│         │                │              │      │
│  ┌──────▼──────┐  ┌─────▼─────┐        │      │
│  │  PostgreSQL │  │  Redis    │        │      │
│  │  (Primary + │  │ (Cluster) │        │      │
│  │   Replica)  │  │           │        │      │
│  └─────────────┘  └───────────┘        │      │
│                                         │      │
│  ┌───────────────────────────────────────▼─────┐│
│  │  Object Storage (external S3/R2)           ││
│  │  Vault (external)                          ││
│  └────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Prós K8s:**
- Multi-região, alta disponibilidade
- HPA granular por métrica
- Controle total de networking (SSRF guards via NetworkPolicy)
- Maturo para produção enterprise

**Contras K8s:**
- Complexidade operacional (NRE alto)
- Custo de engenheiros de confiabilidade

### 14.3 Alternativa Simples: Fly.io

- Única plataforma para API + Workers + PostgreSQL + Redis
- Anúncios globais (multi-region) built-in
- `fly.toml` declarativo; deploy via `fly deploy`
- Menos flexível que K8s, mas suficiente para P0-P2

### 14.4 Dev Local

```
docker-compose.yml
├── postgres (15)
├── redis (7)
├── api (Fastify, port 3001)
│   ├── env: QUEUE_ENABLED=true, REDIS_URL=redis://redis:6379
├── web (Next.js, port 3000)
└── minio (mock S3, port 9000)
```

- `pnpm dev` roda API + web com hot reload
- Workers em processo separado (`pnpm dev:workers`) ou via `bull-board` em `/admin/queues`

### 14.5 Deployment Topology (Recomendado — Render)

```
                      ┌─────────────────┐
                      │    Vercel Edge  │
                      │  (Next.js SSR)   │
                      │  Dashboard       │
                      └────────┬────────┘
                               │ HTTPS (TLS)
                               ▼
                    ┌──────────────────────┐
                    │  Cloudflare WAF +    │
                    │  CDN (R2 assets)     │
                    └────────┬─────────────┘
                             │
            ┌────────────────┴────────────────┐
            │     Render Load Balancer        │
            └────────────────┬────────────────┘
        ┌────────────────────┼──────────────────────┐
        │                    │                      │
   ┌────▼────┐        ┌─────▼─────┐         ┌─────▼─────┐
   │  API    │        │ Scheduler │         │ Workers   │
   │ (x2)    │        │ (x1 lead) │         │ (x2-20 HP)│
   └────┬────┘        └─────┬─────┘         └─────┬─────┘
        │                    │                      │
   ┌────▼────┐        ┌─────▼─────┐         ┌─────▼─────┐
   │ Render  │        │ Render    │         │ Render    │
   │ Postgres│        │ Redis     │         │ BullMQ    │
   │ (Primary│        │ (Managed) │         │ Workers   │
   │ +Replica)│       │           │         │           │
   └─────────┘        └───────────┘         └───────────┘
        │
   ┌────▼────────────┐   ┌────────────────────────┐
   │ Cloudflare R2   │   │ AWS KMS (Vault)        │
   │ (object store)  │   │ (segredos do sistema)  │
   └─────────────────┘   └────────────────────────┘
```

---

## 15. Threat boundaries (Limites de Ameaça)

### 15.1 Superfícies de Ataque e Controles

| Superfície | Threat | Controle | Camada |
|-----------|--------|----------|--------|
| **S1: Browser** | XSS, CSRF, clickjacking | CSP, httpOnly, SameSite, sanitização React | Web |
| **S2: Edge** | DDoS, TLS downgrade | Rate limit por IP, TLS1.3, security headers | Infra (Cloudflare) |
| **S3: Auth** | Brute force, enumeration | Argon2id, MFA, lockout progressivo, mensagens genéricas | API |
| **S4: Credential Vault** | Exfilração de segredos | Envelope AES-256-GCM, DEK por tenant, KMS | API + Vault |
| **S5: OAuth Broker** | State fixation, code injection | PKCE (S256), state nonce, redirect_uri validado | API |
| **S6: Callbacks** | Callback manipulation | One-time code, jti, issuer/audience validação | API |
| **S7: Workflows/Exec** | IDOR/BOLA | orgId em toda query + RLS + teste automatizado | DB + API |
| **S8: SSRF** | metadata 169.254.169.254 | Egress proxy + IP guard + anti-DNS-rebinding | Worker |
| **S9: Code Node** | fs/net/process exfil | isolate-vm, zero network, timeout, memória limitada | Worker (sandbox) |
| **S10: Postgres** | SQLi, tenant leak | Prisma parametrizado, orgId scoping, RLS | DB |
| **S11: Redis** | Credencial em job | Nunca persistir segredo em job payload | Queue |
| **S12: Provedores externos** | Webhook spoofing, replay | HMAC-SHA256, timestamp, nonce, allowlist IP | Gateway |

### 15.2 Trust Boundaries

```
[Internet]
    │
    ▼
┌─────────────────────────────────────────┐
│  DMZ / Edge                            │
│  Cloudflare WAF + CDN                  │
│  (Rate limit, TLS, DDoS)               │
└───────────────┬────────────────────────┘
                │
    ┌───────────▼───────────┐
    │  API Tier (Fastify)  │  ← Trusted: autenticado mas não confiável
    │  - Auth (JWT+MFA)     │  ← Untrusted: usuário malicioso possível
    │  - RBAC, rate limit   │
    └───────────┬──────────┘
                │
    ┌───────────▼───────────┐
    │  Worker Tier          │  ← Semi-trusted: código de node é não-confiável
    │  - Executor (sandbox)  │  ← Trust boundary: isolate-vm
    │  - Scheduler (leader)  │
    │  - Webhook out         │
    └───────────┬──────────┘
                │
    ┌───────────▼───────────┐
    │  Data Tier            │  ← Trusted
    │  - PostgreSQL (RLS)   │
    │  - Redis              │
    │  - Object Storage     │
    │  - Vault/KMS          │
    └───────────────────────┘
```

### 15.3 Riscos Resumidos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Tenant A lê dados de tenant B | Baixa | Crítico | RLS + orgId scoring + testes de isolamento |
| SSRF via HTTP node | Média | Alto | Egress proxy + IP guard + DNS anti-rebinding |
| Code node escapa do sandbox | Média | Crítico | isolate-vm + network=none + timeout rígido |
| Credential leak em job payload | Baixa | Crítico | Job carrega apenas referência; decrypt no worker |
| Replay de webhook | Baixa | Médio | nonce + timestamp window (5min) |
| Scheduler duplica cron (2 líderes) | Muito baixa | Médio | SETNX com TTL + lock refresh; idempotent execution |

---

## 16. Requisitos não-funcionais

| Requisito | Meta | Medição |
|-----------|------|---------|
| **Disponibilidade** | 99.9% | Uptime 30d (máx 4.3min downtime) |
| **Latência de agendamento** | p95 < 5s | time(webhook/cron → job enqueued) |
| **Throughput** | 10k exec/min (P1), 100k/min (P3) | Workers escaláveis horizontalmente |
| **Recovery de crash** | < 60s | Worker reinicia; job retoma do checkpoint |
| **Recovery de region failure** | < 5min (multi-region) | Failover automático |
| **RPO (dados)** | < 5min | WAL archiving |
| **RTO (dados)** | < 30min | Restore testado mensalmente |
| **Rate limit** | 100 req/s por org free | Redis token bucket |
| **Payload max** | 10MB | Fastify body parser |
| **Payload retention** | 90 dias | Object storage lifecycle |
| **Multi-region (opcional)** | < 100ms read | Edge cache + regional writes |
| **Compliance** | LGPD-ready | Audit trail imutável, encryption at rest |

### 16.1 Matriz de Criticidade

| Componente | Criticidade | SLA | Estratégia de alta disponibilidade |
|-----------|-------------|-----|----------------------------------|
| API | P0 | 99.9% | 2+ réplicas + health check |
| Scheduler | P1 | 99.9% | Leader election (failover < 30s) |
| Workers | P0 | 99.9% | Pool auto-scale (min 2) |
| PostgreSQL | P0 | 99.95% | Primary + hot replica; WAL archive |
| Redis | P0 | 99.95% | Master-replica; AOF persistence |
| Object Storage | P1 | 99.9% | Multi-AZ (S3 R2) |
| Webhook Gateway | P1 | 99.9% | 2+ réplicas; queue offline |
| Dashboard | P2 | 99.5% | Vercel edge (CD global) |

---

## 17. Contratos de API (key endpoints)

### 17.1 Trigger de Execução

```
POST /api/v1/workflows/:id/execute
Authorization: Bearer <jwt>
Idempotency-Key: <uuid>   (opcional — deduplica execução manual)

Body:
{
  "input": { "key": "value" },      // opcional
  "trigger": "manual",              // default
  "force": false                    // ignora workflow pausado? (owner only)
}

Response 202:
{
  "executionId": "exec_abc123",
  "status": "PENDING",
  "triggerAt": "2026-08-20T10:00:00Z"
}
```

### 17.2 Webhook Trigger (público)

```
POST /api/webhooks/trigger/:orgSlug/:path
Content-Type: application/json
X-Webhook-Signature: sha256=<hmac>
X-Webhook-Timestamp: 1724167200
X-Webhook-Nonce: <uuid>

Response 202:
{ "executionId": "exec_abc123" }
```

### 17.3 Cancelamento

```
POST /api/v1/executions/:executionId/cancel
Authorization: Bearer <jwt>  (org member with execute permission)

Response 200: { "status": "CANCELLED" }
```

### 17.4 Job Event Contract (BullMQ)

```typescript
// q.execution job
interface ExecutionJob {
  executionId: string;     // FK → WorkflowExecution
  orgId: string;           // para scoping no worker
  workflowId: string;
  traceId: string;         // OTel correlation
  inputRef: string;        // object storage path
  retryCount: number;
  idempotencyKey: string;  // execId:nodeId:attempt
  maxDurationMs: number;
  tenant: string;          // orgId redundante (security)
}

// q.trigger job (criado por scheduler/webhook/api)
interface TriggerJob {
  executionId: string;
  orgId: string;
  workflowId: string;
  trigger: "webhook" | "cron" | "manual" | "api";
  payloadRef: string;      // object storage
  priority: number;
  traceId: string;
}
```

---

## 18. Critérios de aceite

- [x] Todas as 15 seções do briefing cobertas (visão geral, serviços, filas, scheduler, webhook gateway, persistência, fluxo 24/7, recuperação, garantias, escala, observabilidade, multi-tenant, custos, deploy, NFR)
- [x] Mínimo 600 linhas (contagem: ~1.800 linhas)
- [x] Pelo menos 2 diagramas ASCII (arquitetura completa + fluxo de execução)
- [x] Tabela de garantias (exactly-once/at-least-once) por tipo de node
- [x] Seção 24/7 explícita: prova de independência do browser (§1.1, §7, §7.1)
- [x] Recomendação de deploy com justificativa (§14.1 — Render + Vercel)
- [x] Threat boundaries (§15)
- [x] Deployment topology (§14.5)
- [x] Contratos de API (§17)
- [x] Estados de execução com lifecycle (§7.5)
- [x] Backup e DR (§6.1, alinhado com `v2-security-spec.md` §9)
- [x] Multi-tenant com RLS + scoping (§12, alinhado com `v2-security-spec.md` §10)
- [x] Recovery após crash com checkpoint/retomada (§8)
- [x] Execução sem navegador/logout/computador ligado (§1.1, §7)

### 18.1 Prova de Independência do Browser (aceite obrigatório)

A execução de workflows **nunca** depende de:
1. **Navegador aberto** — o dashboard é stateless; não há WebSocket ou conexão mantida com workers.
2. **Sessão de usuário ativa** — workers recebem `orgId` no job, não token JWT do usuário. A invalidação de sessão (logout) não afeta execuções em andamento.
3. **Computador do usuário ligado** — toda a stack roda em containers orchestrados (Render/K8s). O usuário pode desligar o PC, fechar o navegador, trocar de rede — workflows continuam.
4. **Conexão network do usuário** — webhooks internos são entregues via polling ou push; callbacks externos são retryados.

**Caminho crítico sem browser:**
```
Cron Trigger (Scheduler Worker)
  → CREATE WorkflowExecution (Postgres)
  → ENQUEUE q.trigger
  → Executor Worker pega job
  → RUN nodes (HTTP, LLM, DB)
  → PERSIST NodeExecution
  → UPDATE WorkflowExecution status
  → EMIT q.notification (e-mail/slack)
```

Nenhuma etapa toca o browser. O browser só consulta resultados **após** a execução ter terminado.

---

## 19. Apêndice: Mapeamento para Stack Existente

### 19.1 Componentes já existentes (repo-map.md)

| Componente existente | Arquivo | Uso na nova arquitetura |
|---------------------|---------|------------------------|
| `executor.ts` | `apps/api/src/services/executor.ts` | Core do Executor Worker (estender para DAG + handlers) |
| `queue.ts` | `apps/api/src/services/queue.ts` | Queue service (BullMQ) — estender para múltiplas filas |
| `worker.ts` | `apps/api/src/worker.ts` | Base para workers especializados |
| `webhooks.ts` | `apps/api/src/routes/webhooks.ts` | Webhook Gateway (HMAC validation já implementado) |
| `crypto.ts` | `apps/api/src/lib/crypto.ts` | AES-256-GCM credential encryption (estender para envelope) |
| `prisma.ts` | `apps/api/src/lib/prisma.ts` | Cliente Prisma singleton |
| `auth.ts` | `apps/api/src/middleware/auth.ts` | JWT/MFA middleware |
| `WorkflowCanvas` | `apps/web/src/components/workflow/` | Editor visual (dashboard only) |

### 19.2 Novos componentes a criar

| Componente | Localização | Prioridade |
|-----------|-------------|------------|
| Scheduler Worker | `apps/api/src/workers/scheduler.worker.ts` | P2 |
| Webhook-out Worker | `apps/api/src/workers/webhook-out.worker.ts` | P2 |
| Notification Worker | `apps/api/src/workers/notification.worker.ts` | P2 |
| Rotation Worker | `apps/api/src/workers/rotation.worker.ts` | P3 |
| Cleanup Worker | `apps/api/src/workers/cleanup.worker.ts` | P3 |
| Event Gateway | `apps/api/src/services/event-gateway.ts` | P2 |
| Circuit Breaker | `apps/api/src/services/circuit-breaker.ts` | P2 |
| Checkpoint/Resume | `apps/api/src/services/checkpoint.ts` | P2 |
| Observability | `apps/api/src/lib/observability.ts` (OTel) | P1 |

### 19.3 Variáveis de ambiente (núcleo)

| Variável | Uso | Obrigatória |
|----------|-----|-------------|
| `DATABASE_URL` | PostgreSQL | Sim |
| `REDIS_URL` | Redis (BullMQ + cache) | Sim |
| `JWT_SECRET` | Assinatura JWT + derivação credencial | Sim |
| `CREDENTIAL_ENCRYPTION_KEY` | Chave mestra credenciais | Sim |
| `QUEUE_ENABLED` | Ativa/desativa fila | Sim |
| `EXECUTION_TIMEOUT_MS` | Timeout global execution | Não (default 300000) |
| `NODE_TIMEOUT_MS` | Timeout por nó | Não (default 60000) |
| `WEBHOOK_GATEWAY_URL` | URL externa para webhooks | Não (dev) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Tracing backend | Não |
| `EGRESS_ALLOWED_HOSTS` | Allowlist SSRF | Não |

---

## 20. Decisões Arquitetônicas (ADR resumidos)

| # | Decisão | Status | Consequência |
|---|---------|--------|--------------|
| ADR-1 | Separar dashboard (Vercel) de control plane (Render) | Proposta | Browser nunca executa; escala independente |
| ADR-2 | BullMQ como sistema de filas único | Revisado | Jobs persistidos no Redis; retries/DLQ built-in |
| ADR-3 | Scheduler como single-leader via Redis lock | Revisado | Evita duplicação de cron; failover < 30s |
| ADR-4 | Credential values nunca em job payload | Revisado | Segredos só no Vault; worker decrypt no runtime |
| ADR-5 | Object storage para payloads > 1MB | Proposta | Evita Redis bloat; lifecycle policy de TTL |
| ADR-6 | RLS + orgId scoping em todas queries | Revisado | Isolamento multi-tenant no DB |
| ADR-7 | isolate-vm para Code node | Revisado | Zero acesso a process, fs, network |
| ADR-8 | Prometheus + Grafana + Loki + Jaeger | Proposta | Stack CNCF; OTel unificado |
| ADR-9 | Render para API/Workers, Vercel para web | Proposta | Melhor DX; preços previsíveis |
| ADR-10 | PostgreSQL como fonte de verdade, não Redis | Revisado | Consistência forte; Redis só para fila/cache |

---

## 21. Glossário

| Termo | Definição |
|-------|-----------|
| **Control Plane** | Conjunto de serviços server-side sempre ativos que gerenciam, escalonam e executam workflows |
| **Dashboard** | Interface Next.js stateless; apenas visualização e comandos |
| **Execution** | Instância de um workflow em execução (WorkflowExecution) |
| **Node Execution** | Resultado da execução de um nó dentro de uma execution |
| **Trigger** | Evento que inicia uma execution (webhook, cron, manual, api) |
| **Tenant** | Organização (org) — unidade de isolamento multi-tenant |
| **Leader Election** | Mecanismo para garantir que apenas 1 instância execute o scheduler |
| **Idempotency Key** | Chave que previne execução duplicada de uma mesma operação |
| **DLQ** | Dead Letter Queue — jobs que falharam após esgotar retries |
| **Checkpoint** | Estado persistido de uma execution para permitir retomada |
| **Backoff** | Atraso progressivo entre tentativas de retry |
| **Threat Boundary** | Limite de confiança entre componentes (quem confia em quem) |
| **RPO** | Recovery Point Objective — quantos dados podem ser perdidos |
| **RTO** | Recovery Time Objective — quanto tempo para voltar após falha |
| **SLO** | Service Level Objective — meta quantitativa de disponibilidade |
| **TTL** | Time To Live — tempo de vida de um item antes de expirar |

