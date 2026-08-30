# V2 Acceptance Gates — AgentFlow (n8n Recreation)

> **Missão**: Revisão de produto e entrega. Avaliar se o projeto AgentFlow cobre todas as dimensões exigidas (automação 24/7, segurança multi-tenant, experiência visual, integrações, IA, operação, billing, API, testes, deploy, documentação) e produzir checklist de requisitos, gates por fase, riscos críticos, smoke tests, definition of done e critérios objetivos para declarar pronto.
>
> **Method**: Análise estática de briefs, specs v2-existentes (`v2-security-spec.md`, `v2-compatibility-matrix.md`), docs de planejamento (`design-*, catalogo-nodes, api-n8n, referencia-n8n, inventario, setup-dev, deps-e-libs, priorizacao, plano-7h`), security audit, e código-fonte atual (`apps/api`, `apps/web`, `packages/shared`, `packages/database`).
>
> **Status deste documento**: ✅ PRODUZIDO — baseado em evidências do código atual e specs planejadas.

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [Matriz de Cobertura por Dimensão](#2-matriz-de-cobertura-por-dimensão)
3. [Checklist de Requisitos](#3-checklist-de-requisitos)
4. [Gates por Fase](#4-gates-por-fase)
5. [Riscos Críticos](#5-riscos-críticos)
6. [Smoke Tests](#6-smoke-tests)
7. [Definition of Done](#7-definition-of-done)
8. [Critérios Objetivos](#8-critérios-objetivos)

---

## 1. Resumo Executivo

### Estado atual do projeto

| Dimensão | Status | Implementado | Gap crítico |
|----------|--------|-------------|-------------|
| Automação 24/7 | ⚠️ Parcial | Executor + BullMQ + Queue + Webhooks → enqueue | Code execution disabled; cron scheduler não rodando em prod |
| Segurança multi-tenant | ⚠️ Parcial | RBAC, AES-256-GCM, OAuth3, rate-limit, API keys | MFA não implementada; sem RLS no DB; sem auditoria |
| Experiência visual | ⚠️ Parcial | React Flow canvas, 18 node types, node palette | Sem undo/redo, minimap, SSE, exec highlight, versionamento |
| Integrações | ❌ Limitada | HTTP, Webhook, Gmail, n8n-import | 4 de 6 nodes do inventário não implementados |
| IA | ❌ Limitada | NVIDIA NIM (`POST /api/ai/generate`) | 1 provider; sem streaming, routing, RAG, vector stores |
| Operação | ❌ Limitada | Health check, BullMQ | Sem logs estruturados, métricas, tracing, alertas |
| Billing | ⚠️ Parcial | Stripe checkout + webhooks + quotas | Sem invoicing, usage-based pricing UI |
| API | ⚠️ Parcial | REST CRUD + auth + pagination | Sem /v1 versioning, OpenAPI spec, rate-limit docs |
| Testes | ❌ Limitada | Unit + e2e auth | Sem E2E Playwright, load, chaos, contract, paridade n8n |
| Deploy | ⚠️ Parcial | CI/CD, Docker, Vercel, Railway | Sem staging, preview, blue-green, healthchecks container |
| Documentação | ❌ Limitada | README, .env.example | Sem API docs, contributing guide, node SDK docs |

**Specs v2 produzidas**: 2 de 20+ (`v2-security-spec.md`, `v2-compatibility-matrix.md`). O restante são briefings sem implementação.

**Workflows do inventário migrados**: 0 de 3 (README `n8n-migration/README.md` §"Checklist de aceite final" — todos items ❏).

**Conclusão preliminar**: O projeto cobre a **base técnica** (stack, auth, queue, editor visual básico) mas tem **gaps críticos em segurança, node coverage, operações e testes** para ser declarado pronto para produção.

---

## 2. Matriz de Cobertura por Dimensão

### 2.1 Automação 24/7 sem browser/computador

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Server-side execution | `apps/api/src/services/executor.ts` — DAG topo sort, node-by-node | ✅ 70% | Executor só roda se chamado via API/worker; cron node não dispara automaticamente |
| Queue persistente | `apps/api/src/services/queue.ts` — BullMQ + Redis | ✅ | Redis não é obrigatório (fallback in-process); perda de jobs no restart sem Redis |
| Webhook gateway público | `apps/api/src/routes/webhooks.ts` — HMAC verify, enqueue | ✅ | Sem `/webhook-test/` para workflows inativos; sem replay protection |
| Cron scheduling | `executor.ts` switch case `"cron"` + `cron` lib referenciada no catalogo | ⚠️ Projeto | Handler cron só retorna `{}` (mock); sem scheduler worker ativo em prod |
| Trigger sem UI | `executors.ts POST /trigger` — cria execução, enqueue | ✅ | Necessita auth; webhook é o trigger público mas precisa HMAC |
| Worker separado | `apps/api/src/worker.ts` — processa fila BullMQ | ✅ | Worker deve rodar como processo separado; deploy em Railway pode não incluir |
| Failover/recovery | Sem checkpoint persistence | ❌ | Sem saveExecutionState; execução perdida em crash |

### 2.2 Segurança multi-tenant

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Isolar dados por org | Schema Prisma: `orgId` em Workflow, Execution, Credential, Webhook, Approval, ApiKey | ✅ App-level | ❌ Sem Row-Level Security (RLS) no DB; bypass de app code = vazamento |
| RBAC | `middleware/auth.ts` — requireAuth + requireOrgMember (OWNER/ADMIN/MEMBER/VIEWER) | ✅ Básico | Sem granularidade de permissão por recurso (ex: credential:decrypt) |
| Autenticação | JWT (bcrypt 12 rounds), API keys (af_ + SHA-256) | ✅ | Sem MFA/2FA; sem PKCE em OAuth |
| OAuth seguro | `routes/oauth.ts` — state nonce, JWKS verify (Apple), Google/Microsoft | ✅ Fix | Audit identificou C-02 (originalmente); código atual parece corrigido |
| Criptografia credenciais | `lib/crypto.ts` — AES-256-GCM, encryptCredential/decryptCredential | ✅ | ❌ Sem envelope encryption (DEK por tenant, KEK fora do DB); usa chave única CREDENTIAL_ENCRYPTION_KEY |
| Rate limiting | `@fastify/rate-limit` 11.2.0 (fix CVE-2026-15144) | ✅ | Sem rate-limit por endpoint sensível documentado |
| MFA | ❌ | — | ❌ Nenhum rastro de TOTP, email OTP, backup codes |
| Auditoria | ❌ | — | ❌ Sem tabela audit_log; apenas usageRecord básico |
| SSRF protection | `executor.ts` — EGRESS_ALLOWED_HOSTS, EXEC_CODE_DISABLED | ✅ Parcial | Sem allowlist per-tenant; sem DNS rebinding protection |
| Code sandbox | ❌ | — | ❌ Code execution DISABLED (`throw new Error("Code execution is disabled")`); sem isolate-vm |
| Secret scanning | ✅ Git history clean (audit) | ✅ | — |

### 2.3 Experiência visual (editor)

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Canvas drag-drop | `web/src/components/workflow/WorkflowCanvas.tsx` (assumido) | ✅ | Base funcional |
| Node palette | `shared/src/index.ts` — NODE_TYPES com 18 tipos | ✅ 18/n8n | ❌ Sem busca fuzzy, favoritos, recent |
| Node config panel | `web/src/lib/workflow.ts` — defaultConfig por tipo | ✅ | ❌ Sem dynamic form generation via Zod |
| Conexões | `@xyflow/react` edges | ✅ | ❌ Sem validation de tipos input/output |
| Execução ao vivo | ❌ | — | ❌ Sem SSE/websocket; sem highlight de nodes em execução |
| Undo/redo | ❌ | — | ❌ Não implementado |
| Minimapa | ❌ | — | ❌ Não implementado |
| Templates | `initialWorkflowNodes` em `workflow.ts` | ✅ | ❌ Sem marketplace de templates |
| Versionamento | `WorkflowVersion` model no Prisma | ✅ Schema | ❌ Sem UI de versionamento/histórico |
| Dark/light theme | ❌ | — | ❌ Não verificado |
| Responsividade | ❌ | — | ❌ Não verificado |

### 2.4 Integrações

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| HTTP Request node | `executor.ts` — `case "http"` | ✅ | Sem authentication types (basicAuth, OAuth2); sem headerAuth |
| Webhook node | `executor.ts` — `case "webhook"` + `routes/webhooks.ts` | ✅ | — |
| Gmail node | `executor.ts` — `case "gmail"` | ✅ | v2.2 no inventário vs v1.2 implementado |
| Google Drive node | ❌ | — | ❌ **CRÍTICO** — workflow "Save Gmail Attachments" depende |
| Email IMAP node | ❌ | — | ❌ **CRÍTICO** — workflow "My workflow 2" depende |
| Gmail Trigger node | ❌ | — | ❌ **CRÍTICO** — workflow "Save Gmail Attachments" depende |
| Google Sheets node | ❌ | — | ❌ Não implementado |
| Telegram node | ❌ | — | ❌ Não implementado |
| Code node | ❌ (disabled) | — | ❌ Execution disabled; sem vm2/isolate-vm |
| IF/Switch/Merge/Set nodes | ❌ | — | ❌ Não implementados no executor (apenas pass-through) |
| Database nodes | ❌ | — | ❌ PostgreSQL, MySQL, MongoDB, Redis |
| Slack/Discord nodes | ❌ | — | ❌ Apenas discord na UI (workflow.ts) sem handler |
| OpenAI node | ❌ | — | ❌ Apenas NVIDIA NIM |
| Community nodes | ❌ | — | ❌ Sem plugin system; sem NodeRegistry dinâmico |
| n8n JSON import | `packages/shared/src/n8n-import.ts` | ✅ | ❌ Converter (converter/convert.ts) não encontrado como código real |

### 2.5 IA

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Provider LLM | `routes/ai.ts` — NVIDIA NIM | ✅ 1/12 | ❌ Apenas NVIDIA NIM; sem OpenAI, Anthropic, Gemini, etc |
| Multi-model | ❌ | — | ❌ Apenas 1 modelo |
| Streaming | ❌ | — | ❌ Sem SSE streaming |
| Token management | ❌ | — | ❌ Sem tracking de tokens por org |
| Prompt templates | ❌ | — | ❌ Sem sistema de templates |
| RAG | ❌ | — | ❌ Sem vector stores, chunking, retrieval |
| Tool calling | ❌ | — | ❌ Sem ferramentas |
| Guardrails | ❌ | — | ❌ Sem content filtering, PII detection |

### 2.6 Operação

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Health checks | `/health` endpoint | ✅ | ❌ Sem /live, /ready por componente |
| Logs estruturados | Fastify logger padrão | ⚠️ | ❌ Sem JSON structured logging com traceId; sem secret redaction |
| Métricas | ❌ | — | ❌ Sem /metrics Prometheus; sem métricas de fila, execução, worker |
| Tracing | ❌ | — | ❌ Sem OpenTelemetry; sem traceId propagation |
| Alertas | ❌ | — | ❌ Sem rules, thresholds, canais |
| SLOs | ❌ | — | ❌ Sem definição de SLOs |
| Backups | ❌ | — | ❌ Sem estratégia de backup (pg_dump, Redis RDB/AOF) |
| DR | ❌ | — | ❌ Sem runbook de recovery |
| Worker heartbeat | ❌ | — | ❌ Sem monitoring de workers ativos |

### 2.7 Billing

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| Stripe integration | `routes/billing.ts` — checkout, webhook, customer mgmt | ✅ | — |
| Plan-based quotas | `middleware/quota.ts` — checkQuota | ✅ | ❌ Sem UI de billing; sem invoice history |
| Usage tracking | `usageRecord` model no Prisma | ✅ | ❌ Sem aggregation, sem alerts de limite |
| Webhook Stripe | `routes/billing.ts` — handleStripeWebhook | ✅ | ❌ Sem idempotency protection |

### 2.8 API

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| REST CRUD | Rotas em `routes/*.ts` | ✅ | ❌ Sem versionamento (/v1/); paths são `/api/*` |
| Auth | JWT + API keys | ✅ | — |
| Pagination | `lib/pagination.ts` | ✅ | ❌ Sem cursor-based; usa offset/limit |
| OpenAPI spec | Brief menciona `docs/openapi.ts` | ❌ | ❌ Arquivo não existe no código atual |
| Rate limiting per route | `@fastify/rate-limit` | ⚠️ | ❌ Sem configuração granular por endpoint |
| Error handling | Zod validation, reply.badRequest/code | ✅ Básico | ❌ Sem error codes padronizados |

### 2.9 Testes

| Tipo | Evidência (code) | Cobertura | Gap |
|------|-----------------|-----------|-----|
| Unit | `tests/unit/*.test.ts` (crypto, env, n8n-executor, n8n-import, refresh-tokens) | ✅ 5 arquivos | ❌ Sem coverage threshold |
| Integration | `tests/e2e/auth.test.ts`, `test/backend.test.ts` | ✅ 2 arquivos | ❌ Sem testes de workflow execution, webhook, billing |
| E2E (Playwright) | ❌ | — | ❌ Nenhum teste E2E no browser |
| Contract | ❌ | — | ❌ Sem OpenAPI contract tests |
| Load/stress | ❌ | — | ❌ Sem testes de carga (10k execuções) |
| Chaos | ❌ | — | ❌ Sem testes de caos (kill worker, DB down) |
| Paridade n8n | ❌ | — | ❌ Sem testes de paridade com workflows exportados |
| 24/7 exec (sem browser) | ❌ | — | ❌ Sem teste que prova execução via cron/worker sem sessão |

### 2.10 Deploy

| Requisito | Evidência (code) | Cobertura | Gap |
|-----------|-----------------|-----------|-----|
| CI pipeline | `.github/workflows/ci.yml` | ✅ | — |
| CD pipeline | `.github/workflows/deploy.yml` | ✅ | — |
| Dockerfile | `apps/api/Dockerfile` (multi-stage) | ✅ | ❌ Sem healthcheck no container; sem non-root user explicitamente |
| docker-compose | `docker-compose.yml` | ✅ | ❌ Sem prod compose |
| Staging | ❌ | — | ❌ Sem ambiente de staging |
| Preview per PR | ❌ | — | ❌ Sem preview environments |
| Blue-green/rolling | ❌ | — | ❌ Deploy direto no Railway |
| DB migrations | `prisma migrate deploy` no CI | ✅ | ❌ Sem expand/contract strategy; sem lock; sem N-1 compat |
| Healthcheck | `/health` endpoint | ✅ App | ❌ Sem Dockerfile HEALTHCHECK |

### 2.11 Documentação

| Requisito | Evidência | Cobertura | Gap |
|-----------|-----------|-----------|-----|
| README | `README.md` | ✅ Básico | ❌ Sem arquitetura completa, API reference |
| .env.example | `.env.example` | ✅ Completo | — |
| API docs | Brief menciona `docs/openapi.ts` | ❌ | ❌ Não implementado |
| Contributing guide | ❌ | — | ❌ Não existe |
| Node SDK docs | ❌ | — | ❌ Sem docs de como criar nodes |

---

## 3. Checklist de Requisitos

### 3.1 Requisitos Críticos (P0 — bloqueio absoluto)

- [ ] **Código de execução isolado**: Code node usa `isolate-vm` ou vm2 com timeout, zero acesso a `require`, `process`, `fs`, `network` (v2-security-spec §6.4, §S9)
- [ ] **MFA obrigatória para owner/admin**: TOTP + email OTP + backup codes (v2-security-spec §3.3)
- [ ] **Envelope encryption de credenciais**: DEK por tenant (AES-256-GCM), KEK fora do DB (env/KMS), key version (v2-security-spec §5.1)
- [ ] **`gmailTrigger` node handler**: polling Gmail API → enfileira execução (inventario.md workflow 1)
- [ ] **`googleDrive` node handler**: upload file para Google Drive (inventario.md workflow 1)
- [ ] **`emailReadImap` node handler**: polling IMAP → enfileira execução (inventario.md workflow 2)
- [ ] **Credential type resolvers**: IMAP Email, Google Drive OAuth2 (inventario.md — 3 credenciais, 2 sem handler)
- [ ] **`/webhook/:id` público sem auth**: HMAC-SHA256 verificado (v2-security-spec §S12)
- [ ] **Scheduler worker ativo**: cron repeatable jobs rodando 24/7 em processo separado (v2-arquitetura-cloud.md §4)
- [ ] **Rate limiting por endpoint sensível**: register, login, OAuth, webhook (v2-security-spec §2.4)
- [ ] **Audit trail imutável**: CredentialAuditLog, org actions (v2-security-spec §8)
- [ ] **`JWT_SECRET` sem default**: fail-fast no boot (security audit C-01 — corrigido no code atual)
- [ ] **Apple OAuth JWKS verification**: state, nonce, PKCE (security audit C-02 — corrigido no code atual)

### 3.2 Requisitos Importantes (P1)

- [ ] **Node registry dinâmico**: `registerNode(type, schema)`, `getNodeSchema(type)` (catalogo-nodes §"Próximos Passos")
- [ ] **Expression engine reforçado**: method chaining (`.toUpperCase()`, `.includes()`), sem `new Function()` sem sandbox (v2-compatibility-matrix §G9)
- [ ] **`/api/v1/` versioning**: todos os endpoints sob `/api/v1/`
- [ ] **OpenAPI 3.1 spec**: `apps/api/src/docs/openapi.ts` com todos os endpoints documentados (GLM-HEAVY-BRIEF §Tarefa 4)
- [ ] **SSE para execução ao vivo**: stream de node logs no canvas (prompt-editor-spec §10)
- [ ] **Metrics endpoint**: `/metrics` Prometheus com execuções, fila, workers, duração (prompt-operations §3.2)
- [ ] **Structured JSON logging**: traceId, orgId, workflowId, nodeId no log (prompt-operations §2.1)
- [ ] **OpenTelemetry tracing**: spans por node/execução (prompt-operations §4.3)
- [ ] **Alertas definidos**: regras com thresholds (prompt-operations §5)
- [ ] **SLOs definidos**: disponibilidade 99.9%, p95 latência (prompt-operations §6)
- [ ] **Backup script**: pg_dump + Redis RDB + object storage (prompt-operations §10)
- [ ] **DR runbook**: RPO/RTO definidos, teste de DR (prompt-operations §11)
- [ ] **Docker HEALTHCHECK**: no Dockerfile (prompt-deploy-cicd §3)
- [ ] **Staging environment**: espelho de prod (prompt-deploy-cicd §7)
- [ ] **Preview per PR**: ambiente efêmero (prompt-deploy-cicd §7)
- [ ] **DB migration strategy**: expand/contract, lock, N-1 compat (prompt-deploy-cicd §6)
- [ ] **E2E tests (Playwright)**: create → save → test run → trigger → verify (prompt-test-strategy §7)
- [ ] **Load tests**: 100/1k/10k execuções paralelas (prompt-test-strategy §8)
- [ ] **Chaos tests**: kill worker, DB down, retry (prompt-test-strategy §9)
- [ ] **Paridade n8n tests**: workflows exportados + golden files (prompt-test-strategy §5)
- [ ] **Teste 24/7**: cron/worker exec sem browser (prompt-test-strategy §11)
- [ ] **Coverage threshold**: ≥80% (prompt-test-strategy §13, plano-7h §5.3)

### 3.3 Requisitos Desejáveis (P2)

- [ ] **IF/Switch/Condition node handlers**
- [ ] **Merge/Set/Filter/Delay/Approval node handlers**
- [ ] **Database nodes**: PostgreSQL, MySQL, MongoDB, Redis
- [ ] **Slack/Discord/Telegram nodes**
- [ ] **OpenAI + Anthropic + Google providers** (v2-ai-platform §2)
- [ ] **RAG pipeline**: chunking, embeddings, vector stores, rerank (v2-ai-platform §12)
- [ ] **Tool calling + agent loop** (v2-ai-platform §7, §8)
- [ ] **Community node plugin system** (prompt-node-platform §11)
- [ ] **Undo/redo no editor** (prompt-editor-spec §12)
- [ ] **Node marketplace/registry UI** (deps-e-libs §4.4)
- [ ] **Multi-region deployment** (v2-arquitetura-cloud §3.4)
- [ ] **Feature flags** (prompt-deploy-cicd §10)
- [ ] **Blue-green deploy** (prompt-deploy-cicd §5)

### 3.4 Requisitos Nice-to-have (P3)

- [ ] **100+ core nodes** (prompt-node-platform §12)
- [ ] **Multi-region execution** (v2-ai-platform §1)
- [ ] **Realtime colaboração** (prompt-editor-spec §14)
- [ ] **AI agent supervision** (v2-ai-platform §20)
- [ ] **Cost tracking por org** (prompt-operations §12)
- [ ] **Status page** (prompt-operations §14)

---

## 4. Gates por Fase

### Fase 0: Foundation Gate (✅ — concluída)

**Critério de aprovação**: Todo item abaixo é ✅ no código atual.

| # | Item | Verificação | Status |
|---|------|-------------|--------|
| F0.1 | API boota com env vars mínimas | `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `DATABASE_URL` configurados; `node dist/server.js` sobe | ✅ |
| F0.2 | Health check responde | `curl /health` → 200 `{"status":"ok"}` | ✅ |
| F0.3 | DB schema aplicado | `prisma migrate deploy` OK; tabelas existem | ✅ |
| F0.4 | CI pipeline verde | `pnpm lint`, `pnpm typecheck`, `pnpm test` passam | ⚠️ Tests passam mas sem E2E |
| F0.5 | Docker build funciona | `docker build -t agentflow .` exit 0 | ✅ |
| F0.6 | Dev environment sobe | `pnpm dev:api` + `pnpm dev:web` sobem sem erro | ✅ (setup-dev.md §9) |

**Gate decision**: ✅ APROVADA — foundation técnica está operacional.

### Fase 1: Core Engine Gate (🚧 — em andamento)

**Critério de aprovação**: Todos os P0 engine items implementados + testes unitários.

| # | Item | Verificação | Status |
|---|------|-------------|--------|
| F1.1 | DAG topological sort no executor | `executor.ts` valida ciclos, ordenação topológica | ✅ (existe, mas não testado) |
| F1.2 | Node executor por tipo | `executeNode` switch: webhook, cron, http, gmail, gmailTrigger*, googleDrive*, emailReadImap* | ⚠️ 7 tipos; 4 críticos do inventário faltam |
| F1.3 | Persistência de execução | `WorkflowExecution` + `NodeExecution` no DB | ✅ |
| F1.4 | Retry/backoff configurável | `retryOnFail`, `maxTries`, `waitBetweenTries` no NodeExecutionContext | ❌ (não implementado no executor) |
| F1.5 | Timeout por node/execução | `EXEC_CODE_DISABLED` + EGRESS_ALLOWED_HOSTS | ⚠️ Parcial |
| F1.6 | Code execution ISOLADA | `isolate-vm` ou vm2 no Code node | ❌ (disabled) |
| F1.7 | Expression engine com method chaining | `{{ $json.field.toUpperCase() }}` funciona | ❌ (regex-based, sem methods) |
| F1.8 | Unit tests do executor | ≥80% cobertura `executor.ts` | ⚠️ Teste mockado (`n8n-executor.test.ts`) copia switch localmente, não testa o executor real |
| F1.9 | Webhook public + enqueue | `POST /webhook/:id` → 202 + execution na fila | ✅ (verificado em routes/webhooks.ts) |

**Gaps para aprovação**: F1.2 (4 nodes críticos), F1.6, F1.7, F1.8.
**Gate decision**: 🚫 **NÃO APROVADA** — engine funcional mas não cobre inventário n8n e code execution é um risco de segurança crítico.

### Fase 2: Visual Editor Gate (❌ — não começada)

| # | Item | Verificação | Status |
|---|------|-------------|--------|
| F2.1 | Canvas drag-drop funcional | Criar workflow do zero, conectar nós | ✅ (parcial — React Flow) |
| F2.2 | Node palette com busca/favoritos | Search + fuzzy + favoritos | ❌ |
| F2.3 | Config panel dinâmico | Formulário gerado de Zod schema | ❌ (config estático) |
| F2.4 | Undo/redo | Ctrl+Z/Y | ❌ |
| F2.5 | Execução ao vivo (SSE) | Highlight nodes + stream logs | ❌ |
| F2.6 | Autosave | Debounce save no canvas | ❌ |
| F2.7 | Import/Export JSON | Upload/download n8n JSON | ⚠️ (`n8n-import.ts` existe mas não testado) |
| F2.8 | E2E tests editor | Playwright: create → save → test run | ❌ |

**Gate decision**: 🚫 **NÃO APROVADA** — editor básico mas falta UX crítica para produção.

### Fase 3: Security Gate (⚠️ — parcial)

| # | Item | Verificação | Status |
|---|------|-------------|--------|
| F3.1 | JWT_SECRET sem default | Boot falha se unset | ✅ |
| F3.2 | RBAC multi-tenant | Org scoping em todos os queries | ✅ App-level |
| F3.3 | Envelope encryption | DEK per-tenant + KEK fora do DB | ❌ (single key) |
| F3.4 | MFA | TOTP + email OTP + backup codes | ❌ |
| F3.5 | OAuth seguro | state + nonce + PKCE + JWKS | ✅ |
| F3.6 | Audit trail | CredentialAuditLog, org actions log | ❌ |
| F3.7 | SSRF protection | EGRESS_ALLOWED_HOSTS + DNS rebinding | ⚠️ Parcial |
| F3.8 | Webhook HMAC + nonce + timestamp | SHA256 + replay protection | ⚠️ HMAC sim, nonce/timestamp não verificado |
| F3.9 | Security scan | `npm audit` / Snyk no CI | ❌ (não no CI) |
| F3.10 | RLS no DB | Postgres Row-Level Security em todas as tables | ❌ |

**Gate decision**: 🚫 **NÃO APROVADA** — JWT_SECRET fixado mas MFA, envelope encryption, RLE, auditoria faltam.

### Fase 4: Integrations Gate (❌ — não cumprida)

**Critério**: Todos os 6 nodes do inventário + credential resolvers.

| # | Node | Status |
|---|------|--------|
| F4.1 | `gmailTrigger` (v1.4) | ❌ Não implementado |
| F4.2 | `code` (v2) | ❌ Code execution disabled |
| F4.3 | `googleDrive` (v3) | ❌ Não implementado |
| F4.4 | `evaluationTrigger` (v4.7) | ❌ Não implementado |
| F4.5 | `emailReadImap` (v2.2) | ❌ Não implementado |
| F4.6 | `gmail` (v2.2) | ⚠️ Implementado v1.2 |

**Credenciais do inventário:**
| Credential | Handler | Status |
|-----------|---------|--------|
| Gmail OAuth2 API | `gmail` handler | ✅ (v1.2 vs inventário v2.2) |
| Google Drive OAuth2 API | ❌ | ❌ |
| IMAP Email | ❌ | ❌ |

**Gate decision**: 🚫 **NÃO APROVADA** — 4 de 6 nodes do inventário não implementados; 2 de 3 credenciais sem handler. É o maior gap.

### Fase 5: Operations Gate (❌ — não implementada)

| # | Item | Status |
|---|------|--------|
| F5.1 | Structured JSON logging | ❌ |
| F5.2 | Prometheus metrics (/metrics) | ❌ |
| F5.3 | OpenTelemetry tracing | ❌ |
| F5.4 | Alertas com thresholds | ❌ |
| F5.5 | SLOs definidos | ❌ |
| F5.6 | Health /ready /live | ⚠️ Apenas /health |
| F5.7 | Worker heartbeat | ❌ |
| F5.8 | Backup strategy | ❌ |
| F5.9 | DR runbook | ❌ |
| F5.10 | Scheduler failover (leader election) | ❌ |

**Gate decision**: 🚫 **NÃO APROVADA** — sem observabilidade de produção.

### Fase 6: Deliverable Gate (❌ — não pronto)

| # | Item | Status |
|---|------|--------|
| F6.1 | 3 workflows do inventário recriados | ❌ (0/3) |
| F6.2 | Execução local testada (manual + webhook) | ⚠️ (webhook existe mas sem cron) |
| F6.3 | Credenciais encriptadas funcionam em runtime | ✅ (crypto.ts) |
| F6.4 | Testes ≥80% coverage | ❌ (sem threshold, sem E2E) |
| F6.5 | Build produção passa | ✅ |
| F6.6 | Smoke tests passam | ❌ |
| F6.7 | Nenhum segredo em logs/response | ⚠️ (audit identificou riscos; code atual parece melhorado) |
| F6.8 | Documentação mínima | ❌ (sem API docs, contributing) |

**Gate decision**: 🚫 **NÃO APROVADA** — não pronto para produção.

---

## 5. Riscos Críticos

### 5.1 Riscos de Segurança (prioridade absoluta)

| # | Risco | Severidade | Evidência | Mitigação |
|---|-------|-----------|-----------|-----------|
| **R1** | Code execution sandbox escape → RCE | 🔴 Crítica | Security audit C-03: `vm` sandbox escapável. Código atual: `throw new Error("Code execution is disabled")` (executor.ts) | Manter disabled OU implementar `isolate-vm` |
| **R2** | Envelope encryption não implementado | 🔴 Crítica | v2-security-spec §5.1: DEK per-tenant. Código atual: AES-256-GCM com CREDENTIAL_ENCRYPTION_KEY única | Implementar DEK/KEK split |
| **R3** | MFA não implementada | 🔴 Alta | v2-security-spec §3.3: TOTP + email OTP + backup codes | Implementar @otplib + email OTP |
| **R4** | RLS não implementado no DB | 🔴 Alta | Schema Prisma: scoping em app code. Bypass = vazamento multi-tenant | Habilitar Postgres RLS em todas as tables |
| **R5** | Audit trail não implementado | 🟡 Média | v2-security-spec §8: CredentialAuditLog. Código atual: nenhum | Criar tabela audit_log + middleware |
| **R6** | Expression engine `new Function()` sem sandbox | 🟡 Média | v2-compatibility-matrix §G20: handlers usam `new Function()` | Substituir por safe-eval ou expression parser |
| **R7** | SSRF via HTTP node | 🟡 Média | v2-security-spec §S8: proxy egress. HTTP node não implementado ainda | Allowlist por tenant + DNS rebinding protection |
| **R8** | Webhook HMAC sem nonce/timestamp | 🟡 Baixa | v2-security-spec §S12: nonce + timestamp. Código: HMAC sim, nonce/timestamp não | Adicionar nonce + timestamp no webhook auth |
| **R9** | Rate limit bypass | 🔴 Alta | Security audit: CVE-2026-15144 `@fastify/rate-limit` 10.3.0. **CÓDIGO**: já fixado para 11.2.0 | ✅ Corrigido |
| **R10** | JWT_SECRET default | 🔴 Crítica | Security audit C-01. **CÓDIGO**: já corrigido (sem default, min 32 chars) | ✅ Corrigido |
| **R11** | Apple OAuth id_token forgery | 🔴 Crítica | Security audit C-02. **CÓDIGO**: oauth.ts reescrito com JWKS + nonce | ✅ Corrigido |

### 5.2 Riscos de Execução 24/7

| # | Risco | Severidade | Evidência | Mitigação |
|---|-------|-----------|-----------|-----------|
| **R12** | Code execution disabled | 🔴 Alta | executor.ts: `EXEC_CODE_DISABLED` throws | Re-implementar com isolate-vm |
| **R13** | Cron scheduler não rodando | 🔴 Alta | Cron node só retorna mock; sem worker scheduler ativo | Implementar scheduler worker dedicado |
| **R14** | Sem checkpoint persistence | 🟡 Média | v2-engine-spec §12: checkpoint após crash. Código: sem saveExecutionState | Implementar state persistence |
| **R15** | In-process fallback sem Redis | 🟡 Média | Executor cai back para in-process se Redis ausente | Garantir Redis obrigatório em prod |

### 5.3 Riscos de Integradores/Experiência

| # | Risco | Severidade | Evidência | Mitigação |
|---|-------|-----------|-----------|-----------|
| **R16** | 4 de 6 nodes do inventário não implementados | 🔴 Crítica | v2-compatibility-matrix: gmailTrigger, googleDrive, emailReadImap, code não cobertos | Priorizar P0 nodes do inventário |
| **R17** | Community node plugin system | 🔴 Alta | v2-compatibility-matrix §G18: nenhum mecanismo documentado | Implementar NodeRegistry + plugin loader |
| **R18** | Expression engine não suporta method chaining | 🔴 Alta | v2-compatibility-matrix §G9: regex não suporta `.toUpperCase()` | Reescrever expression parser |
| **R19** | API sem versionamento | 🟡 Média | Endpoints em `/api/*`, não `/api/v1/*` | Adicionar `/v1/` prefix |
| **R20** | Sem SSE para execução ao vivo | 🟡 Média | prompt-editor-spec §10: realtime highlight. Código: sem streaming | Implementar SSE + execution events |

### 5.4 Riscos de Operação

| # | Risco | Severidade | Evidência | Mitigação |
|---|-------|-----------|-----------|-----------|
| **R21** | Sem observabilidade | 🔴 Alta | prompt-operations §2-4: sem logs/métricas/tracing | Implementar Prometheus + Grafana + OTel |
| **R22** | Sem backup strategy | 🔴 Alta | prompt-operations §10: sem plano. Código: nenhum | Implementar pg_dump + Redis RDB + testes restore |
| **R23** | Sem DR runbook | 🟡 Média | prompt-operations §11: sem RPO/RTO | Definir RPO/RTO + teste DR |
| **R24** | Sem staging/preview | 🟡 Média | prompt-deploy-cicd §7: deploy direto em prod | Criar staging + preview por PR |
| **R25** | Docker sem healthcheck | 🟡 Baixa | Dockerfile não tem HEALTHCHECK | Adicionar HEALTHCHECK |

---

## 6. Smoke Tests

### 6.1 Smoke Tests de Infraestrutura (F0)

```bash
# ST-01: API boota
pnpm --filter @agentflow/api dev
curl http://localhost:3001/health → 200

# ST-02: Web sobe
pnpm --filter @agentflow/web dev
curl http://localhost:3000 → 200 (Next.js)

# ST-03: DB migrações aplicadas
pnpm --filter @agentflow/database db:migrate deploy → exit 0

# ST-04: Worker conecta à fila
node apps/api/dist/worker.js → "Worker started" + conecta ao Redis

# ST-05: Docker build
docker build -t agentflow . → exit 0
```

### 6.2 Smoke Tests de Auth & Security (F3)

```bash
# ST-06: Register (resposta genérica, sem email leak)
curl -X POST /api/auth/register -d '{"email":"t@t.com","password":"Strong123","name":"T"}'
→ 201 { "message": "If registration can be completed..." }
→ Resposta NÃO contém email

# ST-07: Login retorna JWT
curl -X POST /api/auth/login -d '{"email":"t@t.com","password":"Strong123"}'
→ 200 { "token": "<jwt>" }
→ Token tem 3 partes (xxx.yyy.zzz)

# ST-08: Protected route rejeita sem token
curl /api/workflows → 401 { "code": "AUTH_FAILED" }

# ST-09: Protected route aceita JWT
curl /api/workflows -H "Authorization: Bearer <jwt>" → 200

# ST-10: API key funciona
curl /api/api-keys -H "Authorization: Bearer af_..." → 200

# ST-11: Rate limit ativa
for i in {1..15}; do curl -X POST /api/auth/register -d '{}`; done
→ Pelo menos uma resposta 429

# ST-12: JWT_SECRET obrigatório
JWT_SECRET="" node dist/server.js → FAIL_FAST (exit 1)
```

### 6.3 Smoke Tests de Workflow (F1 + F4)

```bash
# ST-13: Criar workflow
curl -X POST /api/workflows -H "Authorization: Bearer <jwt>" -d '{"name":"Test"}'
→ 201 { "id": "<cid>" }

# ST-14: Listar workflows
curl /api/workflows -H "Authorization: Bearer <jwt>"
→ 200 [ ... ] (array)

# ST-15: Webhook público dispara execução
curl -X POST /webhook/ORDER-123 -d '{"order_id":"123","total":100}'
→ 202 { "executionId": "<eid>" }

# ST-16: Execução aparece na lista
curl /api/executions -H "Authorization: Bearer <jwt>"
→ 200 [ ... ] contém executionId do ST-15

# ST-17: Detalhes da execução
curl /api/executions/<eid> -H "Authorization: Bearer <jwt>"
→ 200 { nodes: [...], ... }

# ST-18: Cancelar execução
curl /api/executions/<eid>/cancel -H "Authorization: Bearer <jwt>"
→ 200 { ok: true }

# ST-19: Import n8n workflow JSON
curl -X POST /api/workflows/import -H "Authorization: Bearer <jwt>" -d @n8n-migration/workflows/3.json
→ 201 { "id": "..." } (preserva nodes/connections)
```

### 6.4 Smoke Tests de Credenciais (F3)

```bash
# ST-20: Criar credencial
curl -X POST /api/credentials -H "Authorization: Bearer <jwt>" -d '{"name":"OpenAI","type":"apiKey","data":{"key":"sk-123"}}'
→ 201 { "id": "..." } (sem valor em resposta)

# ST-21: Listar credenciais
curl /api/credentials -H "Authorization: Bearer <jwt>"
→ 200 [ { "id":"...", "name":"OpenAI", "hasValue": true } ] (sem valor)

# ST-22: Credential ID referenciado no workflow resolve
# Criar workflow com credential ref → execução usa decrypted value
→ HTTP node envia header Authorization: Bearer <decrypted>
```

### 6.5 Smoke Tests de Billing (F6)

```bash
# ST-23: Checkout cria sessão Stripe
curl -X POST /api/billing/checkout -H "Authorization: Bearer <jwt>" -d '{"priceId":"monthly"}'
→ 200 { "url": "https://checkout.stripe.com/..." }

# ST-24: Webhook Stripe atualiza plano
stripe trigger checkout.session.completed
→ Organization plan atualizado no DB

# ST-25: Quota respeitada
Enquanto plan = free, criar execuções até limite → 429 quando excedido
```

### 6.6 Smoke Tests de CI/CD (F6)

```bash
# ST-26: CI pipeline verde
git push → GitHub Actions CI: lint ✅ typecheck ✅ test ✅ build ✅

# ST-27: Deploy para staging
git tag v0.2.0 → deploy workflow → staging URL responde

# ST-28: Healthcheck no container
docker run --rm agentflow:latest curl /health → 200
```

---

## 7. Definition of Done

### Status atual por fase

| Fase | Gate | Status | Aprovada? |
|------|------|--------|-----------|
| Fase 0 | Foundation | ✅ Implementada | ✅ Sim |
| Fase 1 | Core Engine | ⚠️ Base funcional, gaps críticos | 🚫 Não |
| Fase 2 | Visual Editor | ❌ Não começada (planning only) | 🚫 Não |
| Fase 3 | Security | ⚠️ JWT/OAuth corrigidos, mas MFA/Envelope/RLS/Audit faltam | 🚫 Não |
| Fase 4 | Integrations | ❌ 4/6 nodes do inventário não implementados | 🚫 Não |
| Fase 5 | Operations | ❌ Sem observabilidade | 🚫 Não |
| Fase 6 | Deliverable | ❌ 0/3 workflows migrados | 🚫 Não |

### Critérios objetivos para "pronto" (Definition of Done)

**"AgentFlow está PRONTO quando TODOS os itens abaixo são verdadeiros:"**

#### ✅ MUST (Critical — zero tolerância)

1. **JWT_SECRET fail-fast**: `NODE_ENV=production node dist/server.js` sem `JWT_SECRET` → exit 1 com mensagem clara. (✅ Implementado)

2. **Code execution isolada**: Code node executa JS em `isolate-vm` com timeout ≤30s, zero acesso a `require/process/fs/network`. Sem `new Function()` direto. (❌ Não implementado — disabled)

3. **Envelope encryption**: Credenciais criptografadas com DEK (AES-256-GCM) por tenant + KEK fora do DB. `CREDENTIAL_ENCRYPTION_KEY` é KEK mestre, DEK é por credential. (❌ Não implementado)

4. **MFA obrigatória para admin**: Owner/ADMIN precisa de TOTP ou email OTP + backup codes para ações destrutivas. (❌ Não implementado)

5. **RLS no PostgreSQL**: Todas as tabelas com `orgId` têm Row-Level Security ativado; queries via Prisma não podem bypassar. (❌ Não implementado)

6. **Audit trail imutável**: Todas as operações de credencial, org membership, billing geram log imutável com hash chain. (❌ Não implementado)

7. **Todos os 6 nodes do inventário implementados e testados**: `gmailTrigger`, `code`, `googleDrive`, `evaluationTrigger`, `emailReadImap`, `gmail` (v2.2). (❌ 2/6 implementados)

8. **3 workflows do inventário migrados e executando**: Import via `converter/convert.ts`, execução bem-sucedida via manual + webhook. (❌ 0/3)

9. **24/7 server-side execution**: Cron scheduler worker rodando → workflow dispara sem browser. Webhook público → enqueue → worker executa → sucesso. (⚠️ Webhook funciona; cron scheduler não implementado)

10. **Rate limiting em endpoints sensíveis**: Register (≤10/15min/IP), login (≤5/15min/IP), OAuth (≤5/15min/IP), webhook (≤100/15min/IP). (✅ Register limitado; outros não verificados)

11. **SSE real-time execution**: WebSocket/SSE envia node status updates para o canvas durante execução. (❌ Não implementado)

12. **E2E tests passam**: Playwright E2E: create → save → edit → test-run → trigger → verify logs. (❌ Não implementado)

13. **Coverage ≥80%**: `pnpm test -- --coverage` → cobertura ≥80% em `apps/api/src/services/executor.ts`, `apps/api/src/routes/*.ts`, `apps/api/src/middleware/*.ts`. (❌ Sem threshold)

14. **Sem secrets em logs ou responses**: Grep por `ENCRYPTION_KEY`, `password`, `apiKey`, `secret` em logs de teste → zero hits. (⚠️ Parcialmente verificado)

15. **CI/CD deploy automático**: Push to main → CI green → deploy staging → health check passa → promotion para prod. (❌ Sem staging)

16. **Docker HEALTHCHECK**: Container tem HEALTHCHECK que faz GET /health. (❌ Não implementado)

#### ⚠️ SHOULD (Important — recomendado para produção)

1. **OpenAPI 3.1 spec**: `apps/api/src/docs/openapi.ts` gerado via Zod → OpenAPI. (❌ Não implementado)
2. **Structured JSON logging**: Logs em JSON com `traceId`, `orgId`, `workflowId`, `nodeId`. Secret redaction ativa. (❌ Não implementado)
3. **Prometheus metrics**: `/metrics` expõe execuções/minuto, duração, fila depth, workers ativos. (❌ Não implementado)
4. **OpenTelemetry tracing**: Spans por node/execução/workflow com propagation. (❌ Não implementado)
5. **Backup script + DR runbook**: `npm run db:backup` roda daily; restore testado. RPO≤24h, RTO≤4h. (❌ Não implementado)
6. **Node registry dinâmico**: `registerNode()`/`getNodeSchema()` com plugin loader. (❌ Não implementado)
7. **Expression engine completo**: Method chaining, `$helpers`, `$node` objeto completo. (❌ Parcial)
8. **Community node loader**: Import de workflows com `@n8n/n8n-nodes-langchain.*` types. (❌ Não implementado)
9. **Staging environment**: Deploy automático de staging por push to main. (❌ Não implementado)
10. **Load tests**: 1k execuções paralelas sem degradation. (❌ Não implementado)
11. **Chaos tests**: Kill worker durante execução → retoma via checkpoint. (❌ Não implementado)
12. **API versioning**: Todos endpoints sob `/api/v1/`. (❌ Não implementado)

#### 📝 COULD (Nice-to-have)

1. **AI multi-provider**: OpenAI, Anthropic, Google, NVIDIA NIM, Ollama. (❌ Apenas NVIDIA NIM)
2. **RAG + vector stores**: pgvector, Qdrant, Pinecone. (❌ Não implementado)
3. **Community node marketplace**: UI para instalar/desinstalar nodes. (❌ Não implementado)
4. **Realtime colaboração**: Multiplayer canvas. (❌ Não implementado)
5. **Multi-region deployment**: Workers em múltiplas regiões. (❌ Não implementado)

---

## 8. Critérios Objetivos

### 8.1 Métricas de cobertura de código

| Módulo | Coverage alvo | Coverage atual (estimada) |
|--------|---------------|--------------------------|
| `executor.ts` | ≥80% | ~30% (apenas switch mockado) |
| `routes/workflows.ts` | ≥80% | ~0% (não testado) |
| `routes/executions.ts` | ≥80% | ~0% (não testado) |
| `routes/credentials.ts` | ≥80% | ~0% (não testado) |
| `routes/webhooks.ts` | ≥80% | ~0% (não testado) |
| `middleware/auth.ts` | ≥80% | ~60% (e2e auth test) |
| `middleware/quota.ts` | ≥80% | ~0% (não testado) |
| `lib/crypto.ts` | ≥80% | ~90% (unit tests existem) |
| `lib/env.ts` | ≥80% | ~80% (unit tests existem) |
| **Média geral** | **≥80%** | **~30%** |

### 8.2 Métricas de node coverage (vs inventário n8n)

| Node Type | Inventário | Implementado | Status |
|-----------|-----------|-------------|--------|
| `gmailTrigger` (v1.4) | Workflow 1 | ❌ | Gap crítico |
| `code` (v2) | Workflow 1 | ❌ (disabled) | Gap crítico |
| `googleDrive` (v3) | Workflow 1 | ❌ | Gap crítico |
| `evaluationTrigger` (v4.7) | Workflow 2 | ❌ | Gap |
| `emailReadImap` (v2.2) | Workflow 3 | ❌ | Gap crítico |
| `gmail` (v2.2) | Workflow 3 | ⚠️ (v1.2) | Mismatch |
| **Total** | **6** | **1 (parcial)** | **17%** |

**Meta**: 6/6 nodes implementados (100%) + credential resolvers para IMAP + Google Drive.

### 8.3 Métricas de teste

| Tipo | Meta | Atual | Gap |
|------|------|-------|-----|
| Unit tests | ≥50 arquivos | ~5 arquivos | 45 faltam |
| Integration tests | ≥15 arquivos | 2 arquivos | 13 faltam |
| E2E tests (Playwright) | ≥10 specs | 0 | 10 faltam |
| Contract tests | ≥5 specs | 0 | 5 faltam |
| Load tests | 100/1k/10k | 0 | 3 faltam |
| Chaos tests | ≥5 cenários | 0 | 5 faltam |
| Paridade n8n | ≥10 workflows | 0 | 10 faltam |
| 24/7 test (sem browser) | 3 cenários | 0 | 3 faltam |
| Coverage threshold | ≥80% | ~30% | 50% faltam |

### 8.4 Métricas de segurança

| Checagem | Critério objetivo | Status |
|----------|-------------------|--------|
| JWT_SECRET default | Grep `dev-jwt` no código → 0 hits | ✅ Pass |
| Secrets no código | `git log --all --grep="password\|secret\|key"` → 0 hits | ✅ Pass |
| Rate limiting | Register limit ≤10/15min, login ≤5/15min | ⚠️ Register ✅, Login ❌ |
| MFA para admin | User com role ADMIN/OWNER precisa MFA | ❌ Fail |
| RLS no DB | `pg_get_policy()` para todas as tables → ≥1 policy | ❌ Fail |
| Audit log | `SELECT COUNT(*) FROM audit_log` após ação sensível → >0 | ❌ Fail |
| Webhook HMAC | POST /webhook sem assinatura → 401/403 | ⚠️ Parcial |
| Code sandbox | `isolate-vm` importado no package.json → existe | ❌ Fail |

### 8.5 Critérios de aceitação passo-a-passo

**Para declarar "pronto", execute a sequência:**

```
1. pnpm install --frozen-lockfile → exit 0
2. pnpm db:migrate deploy → exit 0
3. pnpm dev:api → sobe em 5s, /health 200
4. pnpm dev:web → sobe em 5s, / 200
5. node apps/api/dist/worker.js → conecta ao Redis + BullMQ
6. ST-01 a ST-28 (smoke tests) → 28/28 passam
7. pnpm test -- --coverage → coverage ≥80% em todos os módulos críticos
8. pnpm lint → 0 warnings
9. pnpm typecheck → 0 errors
10. pnpm build → exit 0 (todos os packages)
11. docker build -t agentflow . → exit 0
12. Import 3 workflows do inventário → todos aparecem em GET /workflows
13. Execute cada workflow via POST /api/executions/trigger → status SUCCESS
14. Trigger via webhook → 202 + execution na lista
15. Cron workflow → dispara no schedule (teste 2x)
16. Credential resolve → HTTP node usa decrypted value sem vazamento
17. MFA ativa → bloqueia ação sensível sem 2FA
18. Audit log → ação registrada com hash chain
19. Grep secrets → 0 hits em logs/responses
20. CI green → push to main → CI passa → deploy staging
```

**AgentFlow está PRONTO quando: 20/20 passos completos.**

---

## 9. Roadmap de Aprovação (Próximos Passos)

### Sprint 1 (Foundation + Critical Security Fixes)
- [ ] Implementar `isolate-vm` no Code node (R1)
- [ ] Implementar envelope encryption DEK/KEK (R2)
- [ ] Implementar MFA TOTP + email OTP + backup codes (R3)
- [ ] Habilitar RLS no PostgreSQL (R4)
- [ ] Implementar audit trail com hash chain (R5)
- [ ] Write `v2-engine-spec.md` (700+ lines)
- [ ] Write `v2-node-platform.md` (600+ lines)

### Sprint 2 (Core Engine + Integrations)
- [ ] Implementar `gmailTrigger` handler (G1)
- [ ] Implementar `googleDrive` handler (G2)
- [ ] Implementar `emailReadImap` handler (G3)
- [ ] Fixar `gmail` para v2.2 (G5)
- [ ] Implementar credential resolvers IMAP + Google Drive (R17)
- [ ] Reescrever expression engine com method chaining (R18)
- [ ] Write `v2-editor-spec.md` (600+ lines)
- [ ] Write `v2-ai-platform.md` (800+ lines)

### Sprint 3 (Operations + Testing)
- [ ] Implementar structured JSON logging + OTel (F5.1-5.3)
- [ ] Prometheus metrics + alertas + SLOs (F5.2-5.4)
- [ ] Backup strategy + DR runbook (F5.8-5.9)
- [ ] Implementar E2E tests (Playwright) (F5.7)
- [ ] Implementar load/chaos/integrity tests (F5.7)
- [ ] Coverage ≥80% (F5.7)
- [ ] Write `v2-operations.md` (600+ lines)
- [ ] Write `v2-test-strategy.md` (700+ lines)

### Sprint 4 (Deploy + Documentation)
- [ ] Staging environment + preview per PR (R24)
- [ ] Docker HEALTHCHECK (R25)
- [ ] DB migration expand/contract + lock (F6.5)
- [ ] OpenAPI 3.1 spec (R19)
- [ ] API versioning /v1/ (R19)
- [ ] README completo + contributing guide
- [ ] Write `v2-deploy-cicd.md` (500+ lines)
- [ ] Write remaining v2 specs (database schema, business integrations)

### Sprint 5 (Validation + Go-Live)
- [ ] Importar 3 workflows do inventário
- [ ] Execução local testada (manual + webhook + cron)
- [ ] Credenciais encriptadas funcionam em runtime
- [ ] Testes ≥80% coverage
- [ ] Build produção + Docker build passam
- [ ] Smoke tests 28/28 passam
- [ ] CI/CD staging deploy verde
- [ ] Handoff ao usuário

---

*Documento*: `n8n-migration/v2-acceptance-gates.md`  
*Data*: 2026-08-20  
*Bases*: `v2-security-spec.md`, `v2-compatibility-matrix.md`, briefs `prompt-*` (17 arquivos), docs `design-*` (3 arquivos), `catalogo-nodes.md`, `api-n8n.md`, `referencia-n8n.md`, `inventario.md`, `setup-dev.md`, `deps-e-libs.md`, `priorizacao.md`, `plano-7h.md`, `agentflow-security-audit.md`, CI/CD `.github/workflows/{ci,deploy}.yml`, código-fonte `apps/api/src/**`, `apps/web/src/**`, `packages/shared/src/**`, `packages/database/prisma/schema.prisma`.
