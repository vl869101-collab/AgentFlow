# Master Roadmap — AgentFlow v2 (Plataforma de Automação de Workflows)

> **Missão**: Consolidar todos os documentos de especificação `v2-*.md` em um roadmap executável e ordenado para a reconstrução do n8n como AgentFlow.
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: DESIGN — não implementar, não commitar código
> **Formato**: Português (identificadores e nomes técnicos em inglês)

---

## 1. Visão Geral

### 1.1 Objetivo

Este documento é o **documento mestre** que transforma todos os planos de especificação (`v2-*.md`) em um roadmap executável e ordenado para a construção da plataforma AgentFlow — uma plataforma de automação de workflows equivalente ao n8n, com execução 24/7 server-side, editor visual, credenciais seguras, multi-tenant enterprise, camada de IA, integrações de comunicação e negócios, observabilidade e deploy em nuvem.

Este roadmap cobre:
1. O status de todos os 17 documentos de especificação `v2-*.md` (16 PENDING, 1 concluído)
2. Um grafo de dependências explícito entre épicos e fases
3. Fases de implementação incremental com escopo, entregáveis, critérios de pronto (DoD), dependências, estimativas, paralelização e marcos
4. Lanes de trabalho paralelo sem conflito de arquivos
5. Marcos verificáveis com critérios de aceite mensuráveis
6. Backlog inicial priorizado com itens acionáveis (1–2 dias cada)
7. Matriz de ownership (RACI) por lane
8. Gates de revisão obrigatórios entre fases
9. Estratégia incremental de entrega (onde valor é entregue cedo)
10. Riscos e mitigações
11. Próximos passos imediatos

### 1.2 Contexto do Projeto

O workspace AgentFlow é um monorepo gerenciado por `pnpm` + `Turborepo`:

```
AgentFlow/
├── apps/
│   ├── web/        # Next.js 15 App Router (UI editor, dashboard)
│   └── api/        # Fastify (API REST + worker + executor)
├── packages/
│   ├── database/   # Prisma schema + seed
│   └── shared/     # Tipos, schemas Zod, utils compartilhados
├── n8n-migration/  # Documentos de especificação (este documento)
├── turbo.json, pnpm-workspace.yaml, package.json
```

**Stack tecnológica** (conforme `deps-e-libs.md` e `repo-map.md`):
- **Frontend**: Next.js 15 + React 19 + `@xyflow/react` v12 + Tailwind v4 + `lucide-react` + `framer-motion`
- **Backend**: Fastify (Node/ESM) + TypeScript 5.9
- **Banco**: Prisma + PostgreSQL 16
- **Fila/Execução**: BullMQ v5 + Redis + `ioredis`
- **Validação**: Zod 3.25 + `@asteasolutions/zod-to-openapi`
- **Testes**: Vitest 3.x (unit/integration), Playwright (E2E)

**Status atual do código** (conforme `repo-map.md` e `design-recriacao.md`):
Aproximadamente 70% da infraestrutura núcleo já existe:
- ✅ Modelos Prisma: `Workflow`, `WorkflowVersion`, `WorkflowNode`, `WorkflowEdge`, `WorkflowExecution`, `NodeExecution`, `Credential`, `Webhook`, `Approval`, `User`, `Organization`
- ✅ API routes: workflows, executions, credentials, webhooks, approvals, auth, orgs, oauth, billing
- ✅ Queue (BullMQ) + enqueueExecution
- ✅ Web: lista de workflows, editor canvas base (`@xyflow/react`), `NodePalette`, `NodeConfigPanel`, `AIGeneratorModal`
- ✅ Criptografia: `apps/api/src/lib/crypto.ts` (AES-256-GCM)
- ✅ Executor: `apps/api/src/services/executor.ts` (parcial)
- ✅ Worker: `apps/api/src/worker.ts`

**Inventário de migração** (conforme `inventario.md`):
3 workflows do n8n cloud (victor11111.app.n8n.cloud) com 6 nodes únicos:
- Workflow 1 (3 nodes): `gmailTrigger` → `code` → `googleDrive`
- Workflow 2 (1 node): `evaluationTrigger`
- Workflow 3 (2 nodes): `emailReadImap` → `gmail` (com webhook)

**Credenciais**: Gmail OAuth2, Google Drive OAuth2, IMAP Email

### 1.3 Requisitos Não-Negociáveis do Produto

Este roadmap **deve** cobrir todos os seguintes requisitos (definidos no brief original `prompt-roadmap-mestre.md`):

1. **Execução 24/7 server-side**: Control plane, scheduler, workers, filas — sem navegador/computador do usuário ligado
2. **Compatibilidade n8n**: Importação de JSON de workflow do n8n (mesmo schema)
3. **Editor visual completo**: Canvas drag-and-drop, node config, expressões
4. **Credenciais seguras**: Vault (envelope encryption), OAuth2
5. **Segurança multi-tenant enterprise**: RBAC, isolamento, auditoria, MFA, SSO
6. **Camada de IA**: LLM providers, agentes, RAG, guardrails
7. **Integrações de comunicação e negócios**: email, WhatsApp, Slack, Google, Stripe, bancos, CRM
8. **Observabilidade e operação**: logs, alertas, backups, DR, SLOs
9. **Testes de paridade com n8n**: Workflows exportados rodam com comportamento equivalente

### 1.4 Princípios de Ordenação

O roadmap é ordenado pelos seguintes princípios:

| # | Princípio | Aplicação |
|---|-----------|-----------|
| P1 | **Security-first** | Autenticação, RBAC e vault vêm antes de qualquer funcionalidade de usuário |
| P2 | **MVP early** | Primeira fase entrega engine mínimo + 1 trigger + 1 action + API + editor básico |
| P3 | **Incremental waves** | Cada onda adiciona valor usável; o produto é usável após cada fase |
| P4 | **Parallel-safe** | Lanes definidas para evitar conflitos de arquivos entre agentes |
| P5 | **Parity-driven** | Testes de paridade n8n correm desde a fase 2 para garantir compatibilidade |
| P6 | **Spec-gated** | Implementação não começa até a spec v2-*.md ter review gate aprovado |

### 1.5 Estratégia Incremental de Entrega

O roadmap é organizado em **ondas** que entregam valor incrementalmente:

```
Wave 0: Foundation         → Specs + DB + Security baseline
Wave 1: MVP Core           → "Hello Workflow" — webhook → HTTP executa end-to-end
Wave 2: Editor + Engine    → Editor completo + todos os nós de controle de fluxo
Wave 3: Integrations      → Gmail, Sheets, Telegram, Stripe, DBs, etc.
Wave 4: AI Platform        → LLM, agentes, RAG, guardrails
Wave 5: Polish & Ops       → Templates, collaboration, exec debug, observability
Wave 6: Testing & Deploy   → Parity tests, CI/CD, canary deploy
```

**Princípio de entrega incremental**: Após a Wave 1, o produto já é **usável** para criar e executar workflows simples. Cada onda subsequente expande a capacidade sem quebrar nada. O roadmap usa **backward compatibility** — novas specs e implementações não quebram APIs ou funcionalidades existentes. A entrega é **continuous** — features mergulham para produção via CI/CD canary após gates de revisão.

---

## 2. Status dos Documentos de Especificação v2-*.md

### 2.1 Tabela de Status

| # | Spec Document | Área | Status | Brief Origem | Mínimo Linhas |
|---|--------------|------|--------|--------------|---------------|
| 1 | `v2-auditoria-repo.md` | Auditoria n8n | **PENDING** | `prompt-auditoria-repo.md` | 500 |
| 2 | `v2-arquitetura-cloud.md` | Cloud Architecture | **PENDING** | `prompt-arquitetura-cloud.md` | 600 |
| 3 | `v2-engine-spec.md` | Execution Engine | **PENDING** | `prompt-engine-spec.md` | 700 |
| 4 | `v2-node-platform.md` | Node SDK | **PENDING** | `prompt-node-platform.md` | 600 |
| 5 | `v2-editor-spec.md` | Visual Editor | **PENDING** | `prompt-editor-spec.md` | 600 |
| 6 | `v2-security-spec.md` | Security | **✅ CONCLUÍDO** | — | 650 |
| 7 | `v2-communication-integrations.md` | Communication | **PENDING** | `prompt-comunicacao.md` | 800 |
| 8 | `v2-business-integrations.md` | Business/Data | **PENDING** | `prompt-business-integrations.md` | 700 |
| 9 | `v2-ai-platform.md` | AI Platform | **PENDING** | `prompt-ai-platform.md` | 800 |
| 10 | `v2-operations.md` | Observability | **PENDING** | `prompt-operations.md` | 600 |
| 11 | `v2-test-strategy.md` | Testing | **PENDING** | `prompt-test-strategy.md` | 700 |
| 12 | `v2-api-spec.md` | API REST | **PENDING** | `prompt-api-spec.md` | 700 |
| 13 | `v2-database-schema.md` | Database | **PENDING** | `prompt-database-schema.md` | 800 |
| 14 | `v2-deploy-cicd.md` | Deploy | **PENDING** | `prompt-deploy-cicd.md` | 500 |
| 15 | `v2-executions-debug.md` | Executions | **PENDING** | `prompt-execucoes.md` | 500 |
| 16 | `v2-templates-collaboration.md` | Templates | **PENDING** | `prompt-templates-collaboration.md` | 500 |
| 17 | `v2-approvals.md` | Approvals | **PENDING** | `prompt-aprovacoes.md` | 450 |

### 2.2 Pendências Críticas

> **IMPORTANTE**: Este roadmap foi construído com base nos briefs (`prompt-*.md`) que contêm os requisitos detalhados para cada spec. Os documentos `v2-*.md` listados como PENDING **não existem ainda**. A implementação NÃO deve começar nessas áreas até que as specs sejam produzidas e aprovadas. As decisões arquiteturais neste roadmap são baseadas nos briefs, mas **devem ser validadas** contra os documentos de spec quando produzidos.

**Pendências documentais**:
- `v2-auditoria-repo.md` — necessário para análise de licença (SUL) e decisão fork vs clean-room vs inspiração
- `v2-database-schema.md` — necessário para RLS multi-tenant, estendendo schema atual
- `v2-engine-spec.md` — necessário para DAG validation, expressões, wait/resume, checkpoints
- `v2-node-platform.md` — necessário para SDK de nodes, community nodes, 100+ nodes core
- `v2-editor-spec.md` — necessário para stack recomendada, UX, atalhos, performance
- `v2-api-spec.md` — necessário para contrato REST completo
- `v2-arquitetura-cloud.md` — necessário para cloud always-on, filas, workers, recuperação
- `v2-communication-integrations.md` — necessário para email, WhatsApp, Slack, etc.
- `v2-business-integrations.md` — necessário para Stripe, Google, bancos, CRM
- `v2-ai-platform.md` — necessário para LLM, agentes, RAG, guardrails
- `v2-operations.md` — necessário para observabilidade 24/7
- `v2-test-strategy.md` — necessário para pirâmide de testes, paridade n8n
- `v2-deploy-cicd.md` — necessário para pipeline de entrega
- `v2-executions-debug.md` — necessário para histórico e depuração
- `v2-templates-collaboration.md` — necessário para templates, import/export
- `v2-approvals.md` — necessário para aprovação humana e human-in-the-loop

### 2.3 Docs de Apoio Existentes (base para specs)

Os seguintes documentos já existem em `n8n-migration/` e servem como base para as specs PENDING:

| Documento | Status | Fornece base para |
|-----------|--------|-------------------|
| `design-seguranca.md` | ✅ | `v2-security-spec.md` (ja concluído) |
| `design-recriacao.md` | ✅ | `v2-engine-spec.md`, `v2-editor-spec.md`, `v2-arquitetura-cloud.md` |
| `design-runner.md` | ✅ | `v2-engine-spec.md` |
| `design-testes.md` | ✅ | `v2-test-strategy.md` |
| `catalogo-nodes.md` | ✅ | `v2-node-platform.md`, `priorizacao.md` |
| `priorizacao.md` | ✅ | P0-P3 node priorities |
| `plano-7h.md` | ✅ | Timeline de implementação |
| `inventario.md` | ✅ | 3 workflows n8n alvo |
| `deps-e-libs.md` | ✅ | Decisões de stack |
| `repo-map.md` | ✅ | Estado atual do código |
| `glossario.md` | ✅ | Vocabulário unificado |
| `padroes-conformidade.md` | ✅ | Padrões de código |

---

## 3. Grafo de Dependências

### 3.1 Épicos → Fases

O projeto é decomposto em 18 épicos, cada um mapeando a um documento de spec `v2-*.md` ou a uma área de implementação. Os épicos são implementados em 9 fases (ondas), onde cada fase entrega valor incremental.

```
ÉPICOS (E1-E18)
═══════════════════════════════════════════════════════════════════════════════
E1  [Database]     E2  [Security]    E3  [Engine]    E4  [Editor]      E5  [Node Platform]
E6  [Node Catalog] E7  [Comm.Int.]   E8  [Biz.Int.]  E9  [AI Platform]  E10 [API REST]
E11 [Operations]   E12 [Testing]     E13 [Deploy]    E14 [Templates]   E15 [Approvals]
E16 [Executions]   E17 [Cloud Arch]  E18 [Migration]

STATUS: █ = spec concluído  ·  ░ = spec pending  ·  ▓ = implementação

GRAFO DE DEPENDÊNCIAS (épicos → fases, setas de dependência)
═══════════════════════════════════════════════════════════════════════════════

F0: Foundation
  ░ E1[Database Schema]         ──┐
  █ E2[Security]                ──┼──→ (Security-first: auth, RBAC, vault)
  ░ E17[Cloud Architecture]     ──┤
  ░ E10[API REST]               ──┤
                                    │
F1: MVP Core
                                    │
  ░ E3[Engine] ◄────────────────────┼── E1, E2, E10
  ░ E5[Node Platform] ◄──────────────┼── E1, E2
  ░ E4[Editor] ◄──────────────────────┼── E3, E5, E10
  ░ E18[Migration] ◄──────────────────┼── E3, E5
                                    │
F2: Engine Robusto
                                    │
  ░ E3[Engine] (extensão) ──→ ✓
  ░ E5[Node Platform] (extensão) ──→
                                    │
F3: Integradoções
                                    │
  ░ E6[Node Catalog] ◄──────────────┼── E5
  ░ E7[Comm. Integrations] ◄────────┼── E5, E3
  ░ E8[Biz. Integrations] ◄─────────┼── E5, E3
                                    │
F4: AI Platform
                                    │
  ░ E9[AI Platform] ◄─────────────────┼── E5, E3, E7
                                    │
F5: Executions, Templates & Approvals
                                    │
  ░ E16[Executions Debug] ◄─────────┼── E3
  ░ E14[Templates] ◄────────────────┼── E4, E10
  ░ E15[Approvals] ◄──────────────────┼── E3, E2, E7
                                    │
F6: Operations & Observability
                                    │
  ░ E11[Operations] ◄─────────────────┼── E17, E3, E7, E8, E9
                                    │
F7: Testing & Deploy
                                    │
  ░ E12[Testing] ◄────────────────────┼── E3, E4, E5, E10
  ░ E13[Deploy/CICD] ◄────────────────┼── E11, E17
```

### 3.2 Grafo Detalhado (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        F0: FOUNDATION                                   │
│                                                                         │
│  E1[Database] ──→ E2[Security] ──→ E17[Cloud Arch] ──→ E10[API REST]   │
│    (schema)       (auth,RBAC,      (always-on,         (endpoints,      │
│                    vault,MFA,        filas,workers)     rate limit)     │
│                    audit,SSRF,                                                    │
│                    sandbox)                                              │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F1: MVP CORE                                     │
│                                                                         │
│  E3[Engine] ──→ E5[Node Platform] ──→ E4[Editor] ──→ E18[Migration]    │
│   (DAG,         (SDK, node          (React Flow,     (n8n JSON         │
│    executor,     registry)           palette,         import/export)   │
│    triggers,                                                              │
│    handlers)                                                              │
│                                                                         │
│  Dependências: E1, E2, E10                                              │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F2: ENGINE ROBUSTO                               │
│                                                                         │
│  E3[Engine] (extensão: retry, timeout, wait/resume,                     │
│            error workflow, checkpoints)                                 │
│  E5[Node Platform] (extensão: community nodes,                           │
│                     versionamento)                                      │
│                                                                         │
│  Dependências: F1                                                       │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F3: INTEGRAÇÕES                                  │
│                                                                         │
│  E6[Node Catalog] ──→ E7[Comm. Integrations]                            │
│  E8[Biz. Integrations]                                                      │
│                                                                         │
│  Dependências: F2, E5                                                   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F4: AI PLATFORM                                  │
│                                                                         │
│  E9[AI Platform] (LLM, agents, RAG, guardrails)                       │
│                                                                         │
│  Dependências: F3, E3, E5                                                │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F5: EXECUTIONS, TEMPLATES, APPROVALS           │
│                                                                         │
│  E16[Executions] ──→ E14[Templates] ──→ E15[Approvals]                  │
│                                                                         │
│  Dependências: F1, F3, E2                                               │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F6: OPERATIONS                                   │
│                                                                         │
│  E11[Operations] (logging, metrics, tracing, alerts,                   │
│                   SLOs, health checks, auto-restart,                    │
│                   backups, DR)                                          │
│                                                                         │
│  Dependências: E17, F1-F5 (cross-cutting)                               │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        F7: TESTING & DEPLOY                             │
│                                                                         │
│  E12[Testing] ──→ E13[Deploy/CICD]                                      │
│  (pirâmide, parity, chaos)  (pipeline, blue-green, canary)             │
│                                                                         │
│  Dependências: F1-F6                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Fases Detalhadas

### Fase 0 — Foundation: Specs & Security Baseline

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E1 (Database), E2 (Security), E10 (API), E17 (Cloud Arch) |
| **Objetivo** | Produzir specs faltantes, implementar security baseline, estender schema |
| **Escopo** | Produzir 16 specs v2-*.md PENDING; implementar v2-security-spec.md (MFA, RBAC, SSO, envelope encryption, audit); estender schema Prisma (NodeType, WorkflowSchedule, WorkflowTrigger, CredentialKeyVersion, CredentialAuditLog); definir cloud architecture |
| **Entregáveis** | Todos os 17 v2-*.md specs (16 produzidos + 1 já concluído); Schema Prisma estendido; Security baseline implementado |
| **Critérios de pronto** | `n8n-migration/` contém todos os 17 v2-*.md aprovados; Schema estendido rodando; Auth/RBAC/Vault funcionando |
| **Dependências** | Nenhuma (fase inicial) |
| **Estimativa** | XL (8-10 sprints de spec + 2 sprints de impl) |
| **Paralelizável?** | ✅ Sim — Specs em 16 lanes paralelas; impl security/database paralela |
| **Marcos** | M0: Specs 50% produzidos; M0.5: Security baseline live |
| **Ownership** | Architect (specs), Security Engineer (E2), Backend Engineer (E1, E10), DevOps (E17) |
| **Gate de revisão** | G0: Architecture Review — todas specs aprovadas pelo Technical Lead antes de F1 |
| **Entrega incremental** | Specs produzidas em paralelo; security impl incremental (MFA → RBAC → Vault → SSO) |

**Sub-tarefas**:
- [PENDING] Produzir `v2-auditoria-repo.md` (licença SUL, riscos legais)
- [PENDING] Produzir `v2-database-schema.md` (17 tabelas DDL + RLS + índices)
- [PENDING] Produzir `v2-api-spec.md` (16 seções, todos endpoints)
- [PENDING] Produzir `v2-arquitetura-cloud.md` (always-on, filas, workers, recuperação)
- [PENDING] Produzir `v2-engine-spec.md` (DAG, expressões, wait/resume, retry, 20 seções)
- [PENDING] Produzir `v2-node-platform.md` (SDK, registry, 100+ nodes core, 15 seções)
- [PENDING] Produzir `v2-editor-spec.md` (stack, canvas, UX, 18 seções)
- [PENDING] Produzir `v2-communication-integrations.md` (10 integrações, 800 linhas)
- [PENDING] Produzir `v2-business-integrations.md` (40+ integrações, matriz)
- [PENDING] Produzir `v2-ai-platform.md` (20 seções, providers, RAG)
- [PENDING] Produzir `v2-operations.md` (16 seções, SLOs, DR, runbooks)
- [PENDING] Produzir `v2-test-strategy.md` (pirâmide, parity, chaos, 15 seções)
- [PENDING] Produzir `v2-deploy-cicd.md` (Docker, K8s, pipeline, 10 seções)
- [PENDING] Produzir `v2-executions-debug.md` (timeline, replay, debugging, 8 seções)
- [PENDING] Produzir `v2-templates-collaboration.md` (templates, import/export, collaboration)
- [PENDING] Produzir `v2-approvals.md` (human-in-the-loop, security, 11 seções)
- [IN PROGRESS] Implementar v2-security-spec.md (Argon2id, MFA, RBAC, SSO, envelope encryption, audit, rate limit)
- [TODO] Estender schema Prisma (NodeType, WorkflowSchedule, WorkflowTrigger, CredentialKeyVersion, CredentialAuditLog)
- [TODO] Definir cloud architecture (based on `v2-arquitetura-cloud.md` brief)

---

### Fase 1 — MVP Core: "Hello Workflow"

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E3 (Engine), E5 (Node Platform), E4 (Editor), E18 (Migration) |
| **Objetivo** | Entregar engine mínimo + 1 trigger + 1 action + API + editor básico, capaz de executar um workflow webhook→HTTP end-to-end |
| **Escopo** | DAG execution engine; Webhook trigger handler; HTTP Request action handler; Basic IF/Set handlers; API CRUD workflows + webhook receiver + credential resolve; React Flow canvas com drag-drop + node palette + config panel; AES-256-GCM credential vault; n8n JSON import (1 workflow) |
| **Entregáveis** | `executor.ts` com DAG topo-sort; Handlers: `webhook.ts`, `http-request.ts`, `if.ts`, `set.ts`; API: `POST/GET/PUT/DELETE /workflows`, `POST /webhook/:path`, `GET /credentials/:id/decrypt`; Editor: `WorkflowCanvas`, `NodePalette`, `NodeConfigPanel`; Crypto: envelope encryption |
| **Critérios de pronto** | Webhook → HTTP Request workflow executa end-to-end; `curl -X POST /webhook/:path -d '{"test":1}'` → 202 + executionId; `GET /executions/:id` mostra log por nó; `GET /workflows/:id` retorna canvas completo; import de JSON n8n do inventário funciona |
| **Dependências** | F0 (specs aprovadas, security baseline, schema estendido) |
| **Estimativa** | L (12-16 dias) |
| **Paralelizável?** | ✅ Sim — Lane Engine (DAG + handlers), Lane API (CRUD + webhook), Lane Editor (canvas + palette) |
| **Marcos** | M1: Engine DAG topo-sort ✓; M1.5: Webhook→HTTP executa ✓ |
| **Ownership** | Backend Engineer (E3, E5), Frontend Engineer (E4), Backend Engineer (E18) |
| **Gate de revisão** | G1: Code Review + DoD check — engine executa workflow sample; testes unitários ≥80% em handlers |
| **Entrega incremental** | Handler por handler: webhook → http → if → set → engine complete |

**Sub-tarefas**:
- [TODO] `apps/api/src/services/executor.ts` — DAG topo-sort, node-a-node execution loop
- [TODO] `apps/api/src/services/nodes/handlers/webhook.ts` — WebhookTriggerHandler
- [TODO] `apps/api/src/services/nodes/handlers/http-request.ts` — HttpRequestHandler
- [TODO] `apps/api/src/services/nodes/handlers/if.ts` — IfNodeHandler
- [TODO] `apps/api/src/services/nodes/handlers/set.ts` — SetNodeHandler
- [TODO] `apps/api/src/services/node-registry.ts` — Node handler factory
- [TODO] `apps/api/src/routes/workflows.ts` — CRUD + activate/deactivate + execute
- [TODO] `apps/api/src/routes/webhooks.ts` — Public webhook receiver + HMAC
- [TODO] `apps/api/src/services/queue.ts` — BullMQ enqueue
- [TODO] `apps/api/src/workers/execution.worker.ts` — Worker process
- [TODO] `apps/web/src/components/workflow/WorkflowCanvas.tsx` — React Flow canvas
- [TODO] `apps/web/src/components/workflow/NodePalette.tsx` — Node palette
- [TODO] `apps/web/src/components/workflow/NodeConfigPanel.tsx` — Dynamic config panel
- [TODO] `apps/web/src/app/(dashboard)/workflows/[id]/editor/page.tsx` — Editor page
- [TODO] `packages/shared/src/workflow/n8n-import.ts` — Import logic (basic)

---

### Fase 2 — Engine Robusto & Node Platform

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E3 (Engine), E5 (Node Platform) |
| **Objetivo** | Engine com todos os recursos de controle de fluxo, retry, timeout, wait/resume, error workflow, checkpoints; Node SDK completo |
| **Escopo** | Flow control nodes (Switch, Merge, SplitInBatches, Delay, Wait); Code node sandbox (isolate-vm); Worker process com leader election; Cron scheduler; Retry com exponential backoff; Timeout por node + workflow; Error workflow + dead-letter queue; Expressão engine (`{{ $json }}`, `{{ $node }}`); Checkpoints para retomada após crash; Idempotência |
| **Entregáveis** | Handlers: `switch.ts`, `merge.ts`, `split-in-batches.ts`, `delay.ts`, `wait.ts`, `code.ts` (sandbox); `scheduler.worker.ts`; Expression engine (`packages/shared/src/expressions/`); Checkpoint manager |
| **Critérios de pronto** | Workflow com IF + Switch + Merge + SplitInBatches executa corretamente; retry 3x com backoff; timeout de nó funcionando; error workflow dispara em falha; cron workflow agenda e dispara; code node sandbox isolado (no `require`, no `fs`) |
| **Dependências** | F1 (engine básico) |
| **Estimativa** | L (10-14 dias) |
| **Paralelizável?** | ✅ Sim — Lane Engine (nodes + scheduler), Lane Security (sandbox), Lane Testing (testes engine) |
| **Marcos** | M2: Todos flow control nodes ✓; M2.5: Retry + timeout + error workflow ✓ |
| **Ownership** | Backend Engineer (E3), Security Engineer (sandbox, Code node), Node Platform Engineer (E5) |
| **Gate de revisão** | G2: Security Review — sandbox code node aprovado; Parity Tests — workflows n8n de teste passam |
| **Entrega incremental** | Switch → Merge → SplitInBatches → Delay/Wait → Code sandbox → Retry → Error handling → Checkpoint |

**Sub-tarefas**:
- [TODO] `apps/api/src/services/nodes/handlers/switch.ts`
- [TODO] `apps/api/src/services/nodes/handlers/merge.ts`
- [TODO] `apps/api/src/services/nodes/handlers/split-in-batches.ts`
- [TODO] `apps/api/src/services/nodes/handlers/delay.ts`
- [TODO] `apps/api/src/services/nodes/handlers/wait.ts` (wait/resume)
- [TODO] `apps/api/src/services/nodes/handlers/code.ts` (isolate-vm sandbox)
- [TODO] `apps/api/src/workers/scheduler.worker.ts` (cron scheduler)
- [TODO] `apps/api/src/services/expression-engine.ts` (template engine)
- [TODO] `apps/api/src/services/checkpoint.ts` (crash recovery)
- [TODO] `packages/shared/src/nodes/types.ts` (NodeHandler interface, NodeExecutionContext)
- [TODO] `packages/shared/src/nodes/registry.ts` (node registry singleton)

---

### Fase 3 — Node Catalog & Integrations

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E6 (Node Catalog), E7 (Comm. Integrations), E8 (Biz. Integrations) |
| **Objetivo** | Implementar todos os nós P0-P1 do `priorizacao.md` + integrações de comunicação e negócios |
| **Escopo** | P0: Webhook, Schedule Trigger; P1: HTTP Request, Gmail, Google Sheets, Telegram; P2: IF, Switch, Code, Merge, Set; Comunicação: SMTP/IMAP, WhatsApp (Meta Cloud API), Slack, Discord, Teams; Negócios: PostgreSQL, MySQL, MongoDB, Redis, Supabase, Stripe, PayPal, HubSpot, Salesforce, GitHub |
| **Entregáveis** | Handlers para 25+ integration nodes; OAuth2 broker (refresh token management); Credencial types para cada serviço; Webhook gateway para triggers de integração |
| **Critérios de pronto** | Workflow Gmail Trigger → HTTP Request → Telegram executa end-to-end; Credenciais OAuth2 configuradas e refresh automático; Webhooks de integração recebem e disparam workflows |
| **Dependências** | F2 (engine robusto + node platform) |
| **Estimativa** | XL (14-18 dias) |
| **Paralelizável?** | ✅ Sim — Lane Comm. Integrations (email, WhatsApp, Slack, Discord), Lane Biz. Integrations (PostgreSQL, Stripe, etc.) |
| **Marcos** | M3: 10 nodes implementados ✓; M3.5: Gmail + Sheets + Telegram funcionando ✓ |
| **Ownership** | Integration Engineer (E7, E8), OAuth Specialist (E8), Backend Engineer (E6) |
| **Gate de revisão** | G3: Integration Review — cada integração testada com API real/mock; OAuth flow validado |
| **Entrega incremental** | P0 nodes → P1 nodes (Gmail, Sheets, Telegram) → P2 nodes (IF, Switch, etc.) → Comms (SMTP, WhatsApp, Slack) → Biz (PostgreSQL, Stripe, etc.) |

**Sub-tarefas** (baseado em `catalogo-nodes.md` e `priorizacao.md`):
- [TODO] Gmail node (trigger + send + labels) — OAuth2
- [TODO] Google Sheets node (read/write/update) — OAuth2
- [TODO] Telegram node (sendMessage/sendPhoto) — Bot API
- [TODO] SMTP/IMAP node (send/read email) — credentials
- [TODO] HTTP Request node (extendido: todos os métodos, auth types)
- [TODO] IF/Switch/Set/Merge/SplitInBatches/Delay/Wait nodes
- [TODO] PostgreSQL node (CRUD, query)
- [TODO] MySQL node (CRUD, query)
- [TODO] MongoDB node (CRUD)
- [TODO] Redis node (get/set/pubsub)
- [TODO] Stripe node (charges, subscriptions, webhooks)
- [TODO] GitHub node (triggers: push/PR/issue; actions: create issue)
- [TODO] Slack node (sendMessage, threads)
- [TODO] WhatsApp node (Meta Cloud API)
- [TODO] OAuth2 broker (refresh token management)

---

### Fase 4 — AI Platform

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E9 (AI Platform) |
| **Objetivo** | Implementar plataforma de IA completa: LLM providers, agentes, RAG, guardrails, memory, tools |
| **Escopo** | LLM abstraction layer (OpenAI, Anthropic, Google, Ollama, Azure OpenAI, AWS Bedrock); Model routing (por custo/disponibilidade); Prompt templates; Agentes (loop, tool calling, limits); Tools (internos + externos); Memory (short/long-term); Embeddings; Vector stores (pgvector, Qdrant, Pinecone); RAG pipeline completo; Structured output; Guardrails (content filter, PII, jailbreak); Human-in-the-loop; Multimodal; Avaliação de IA; Observabilidade de IA; Casos de uso (customer support, lead classification) |
| **Entregáveis** | `packages/ai/` (abstraction layer, agents, RAG); Node handlers: `ai-agent.ts`, `llm.ts`, `embeddings.ts`, `vector-query.ts`; Dashboard de custos por org |
| **Critérios de pronto** | AI agent node executa workflow com tool calling + RAG; Guardrails bloqueiam PII; Custos trackados por execução; Structured output validado |
| **Dependências** | F3 (integrations) |
| **Estimativa** | XL (10-14 dias) |
| **Paralelizável?** | ✅ Sim — Lane AI (providers, abstraction layer, agents), Lane AI Testing |
| **Marcos** | M4: LLM abstraction layer ✓; M4.5: Agente com RAG funciona ✓ |
| **Ownership** | AI Engineer (E9), Backend Engineer (integração com engine) |
| **Gate de revisão** | G4: AI Security Review — guardrails aprovados; Provider Review — APIs configuradas |
| **Entrega incremental** | LLM abstraction → Prompt templates → Agent (single tool) → Tools → Memory → Embeddings → Vector store → RAG → Guardrails → Multimodal → Cases de uso |

**Sub-tarefas** (baseado em `prompt-ai-platform.md`):
- [TODO] LLM abstraction layer (interface única: chat, streaming, tools, structured output)
- [TODO] Provider adapters: OpenAI, Anthropic, Google Gemini, Ollama, Azure OpenAI, AWS Bedrock
- [TODO] Model router (por custo, disponibilidade, tarefa)
- [TODO] Prompt templates (sistema, versionamento, registry)
- [TODO] Agent framework (loop, tool calling, limits, stops)
- [TODO] Tools framework (HTTP, código, pesquisa, cálculo)
- [TODO] Memory (short-term, long-term, window)
- [TODO] Embeddings (providers, cache)
- [TODO] Vector stores (pgvector, Qdrant, Pinecone, Weaviate)
- [TODO] RAG pipeline (ingestão, chunking, embedding, retrieval, rerank, assembly)
- [TODO] Structured output (JSON Schema, validation)
- [TODO] Guardrails (content filter, PII, jailbreak, allowlist)
- [TODO] Human-in-the-loop (approval, clarification)
- [TODO] Multimodal (imagem, áudio, vídeo)
- [TODO] Observability (trace, custo, latência)
- [TODO] Cases de uso (customer support RAG, lead classification)

---

### Fase 5 — Executions, Templates & Approvals

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E16 (Executions Debug), E14 (Templates), E15 (Approvals) |
| **Objetivo** | Histórico de execuções, debugging avançado, replay, templates gallery, import/export, real-time collaboration, human approvals |
| **Escopo** | Execution history (listagem, filtros, busca, paginação); Detalhe de execução (timeline, data inspection, binary preview); Pin/unpin data; Partial re-execution (from any node); Replay (same/different input, dry-run); Debug step-by-step (breakpoints, time-travel); Templates gallery (create, publish, version, instantiate); Import/Export n8n JSON ↔ AgentFlow; Real-time collaboration (presence, cursor, lock); Comments & review (threads, @mentions, diff); Approvals (human-in-the-loop, security tokens, escalation); Compartilhamento (link, permissões, expiração) |
| **Entregáveis** | UI de execuções; UI de templates; Sistema de aprovação; Engine support para replay/pin; Colab real-time |
| **Critérios de pronto** | User vê timeline de execução com dados de cada nó; Importa workflow n8n → edita → salva → executa; 2 users editam workflow simultaneamente (presence + lock); Approval pausa workflow → email → aprovação → retoma |
| **Dependências** | F1 (editor + engine) |
| **Estimativa** | L (10-14 dias) |
| **Paralelizável?** | ✅ Sim — Lane Executions Debug, Lane Templates, Lane Approvals |
| **Marcos** | M5: Histórico de execuções ✓; M5.5: Templates + Import/Export ✓; M6: Collaboration + Approvals ✓ |
| **Ownership** | Frontend Engineer (E16, E14 UI), Backend Engineer (E15, E16 engine), UX Designer (E14 collaboration) |
| **Gate de revisão** | G5: Feature Review — cada feature validada com teste E2E |
| **Entrega incremental** | Execution history → Debug panel → Replay → Templates → Import/Export → Collaboration → Approvals |

**Sub-tarefas**:
- [TODO] Execution list (filtros, busca, paginação)
- [TODO] Execution detail (timeline, node drill-down, data inspection, binary preview)
- [TODO] Pin/unpin data (test fixt)
- [TODO] Partial re-execution (from any node)
- [TODO] Replay (same/different input, dry-run)
- [TODO] Step-by-step debugging + breakpoints
- [TODO] Templates gallery (CRUD, search, versioning)
- [TODO] Template instantiation (map credentials, validate nodes)
- [TODO] Import n8n JSON → AgentFlow (map nodes, expressions)
- [TODO] Export AgentFlow → n8n JSON
- [TODO] Real-time collaboration (WebSocket/SSE, presence, cursor)
- [TODO] Comments & review (threads, mentions, diff)
- [TODO] Sharing (link, permissions, expiration)
- [TODO] Approval system (pause, notify, resume, escalation, security tokens)

---

### Fase 6 — Operations & Observability

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E11 (Operations) |
| **Objetivo** | Produzir observabilidade 24/7 completa: logs, métricas, tracing, alertas, SLOs, health, auto-restart, deploy, backup, DR |
| **Escopo** | Structured logging (JSON, redação de segredos); Métricas (Prometheus, /metrics); Tracing distribuído (OpenTelemetry); Alertas (regras, canais, escalonamento); SLOs (99.9% disponibilidade, latência p95); Health checks (/health, /ready, /live); Auto-restart + graceful shutdown; Deploy (CI/CD, blue-green, canary, feature flags); Backups (PostgreSQL, Redis, object storage, vault); DR (RPO/RTO, failover); Cost tracking por serviço/org; Dashboards Grafana; Incident management (runbook, status page); Security operacional (RBAC dashboard, auditoria, secrets no CI) |
| **Entregáveis** | `apps/api/src/lib/logging.ts`; `apps/api/src/lib/metrics.ts`; Pipeline CI/CD completo; Docker-compose/K8s manifests; Runbooks; Grafana dashboards |
| **Critérios de pronto** | Logs estruturados em JSON com redaction de segredos; /metrics exponha contagens de execuções; Tracing correlaciona logs com traces; Alertas disparam para falha ≥ 3x; SLOs definidos (99.9%, p95 < 200ms); Backup diário testado; DR runbook executável |
| **Dependências** | F1-F5 (necessita de todos os componentes em produção) |
| **Estimativa** | L (8-10 dias) |
| **Paralelizável?** | ✅ Sim — Lane Operations (logging, metrics), Lane Deploy (CI/CD, K8s), Lane SRE (SLOs, DR) |
| **Marcos** | M6: Logs + metrics ✓; M6.5: SLOs + alertas ✓; M7: CI/CD + deploy ✓ |
| **Ownership** | SRE (E11), DevOps (E13), Backend Engineer (logging/metrics integration) |
| **Gate de revisão** | G6: SRE Review — SLOs, runbooks, DR testados; Security Review — secrets management, scanner de vulnerabilidades |
| **Entrega incremental** | Logging → Metrics → Tracing → Alertas → SLOs → Health → Auto-restart → Deploy → Backup → DR → Dashboards → Cost → Incident mgmt |

**Sub-tarefas**:
- [TODO] Structured logging (formato JSON, campos padrão, redação)
- [TODO] Prometheus metrics (/metrics endpoint, exporters)
- [TODO] OpenTelemetry tracing (spans, propagação, exportação)
- [TODO] Alertas (regras, canais: email/Slack/Telegram/Discord, escalonamento)
- [TODO] SLOs (disponibilidade 99.9%, latência p95, taxa de sucesso)
- [TODO] Health checks (/health, /ready, /live por serviço)
- [TODO] Auto-restart + graceful shutdown + draining
- [TODO] CI/CD pipeline (lint → typecheck → unit → integration → parity → E2E → build → scan → deploy)
- [TODO] Docker manifests (multi-stage, healthcheck, non-root)
- [TODO] K8s manifests (HPA, PDB, probes) ou alternativa (Fly/Railway)
- [TODO] Backups (PostgreSQL pg_dump/PITR, Redis RDB/AOF, object storage, vault)
- [TODO] DR plano (RPO/RTO, runbook, teste periódico)
- [TODO] Cost tracking (por serviço, org, budget alerts)
- [TODO] Grafana dashboards
- [TODO] Incident management (runbook, status page, postmortem)

---

### Fase 7 — Testing, Parity & Deploy Final

| Campo | Detalhe |
|-------|---------|
| **Epic associado** | E12 (Testing), E13 (Deploy/CICD) |
| **Objetivo** | Pirâmide de testes completa, paridade n8n, tests de carga/chaos, pipeline CI/CD aprovado |
| **Escopo** | Pirâmide: 65% unit (Vitest), 25% integration (Testcontainers), 10% E2E (Playwright); Paridade n8n (workflows reais, golden files, matriz node→teste→status); Fixtures (workflows n8n, dados mock, credenciais mock, servidores mock); Testes de carga (100/1k/10k execuções paralelas, throughput, latência); Testes de caos (kill worker, DB/Redis down, restart, duplicação); Testes de segurança (SSRF, injection, sandbox, exfil); Tests 24/7 (sem browser); CI/CD pipeline com gates; Coverage ≥80%; Type checking; Análise estática |
| **Entregáveis** | `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/regression/`; `playwright.config.ts`, `vitest.config.ts`; CI pipeline atualizado; Coverage report |
| **Critérios de pronto** | `pnpm test` → 100% pass; Coverage ≥80% (shared: 95%, api: 90%, web: 70%); Parity: 45/47 workflows testados passam; Load: 1000 execuções paralelas < 500ms latência; Chaos: recovery automático após kill worker; CI: lint → test → build → deploy (green) |
| **Dependências** | F1-F6 (todos os componentes implementados) |
| **Estimativa** | L (8-12 dias) |
| **Paralelizável?** | ✅ Sim — Lane Unit Testing, Lane Integration Testing, Lane E2E Testing, Lane Deploy |
| **Marcos** | M7: Testes unitários 80% ✓; M7.5: Parity suite ✓; M8: CI/CD green ✓ |
| **Ownership** | Test Engineer (E12), DevOps (E13), Backend Engineer (integration), Frontend Engineer (E2E) |
| **Gate de revisão** | G7: Test Gate — coverage ≥80%; G8: Parity Gate — ≥90% workflows n8n passam; G9: Deploy Gate — CI/CD pipeline passes |
| **Entrega incremental** | Unit tests (engine) → Integration (API) → E2E (editor) → Parity → Load → Chaos → Security → CI/CD |

**Sub-tarefas**:
- [TODO] `vitest.config.ts` + `playwright.config.ts` (coverage thresholds, aliases)
- [TODO] Unit tests: shared (schemas, converter, expressions), api (executor, nodes, crypto)
- [TODO] Integration tests: API CRUD, webhooks, execution, Prisma
- [TODO] E2E tests: editor flows (create, save, execute), webhook trigger, cron
- [TODO] Parity suite: fixtures n8n + harness de comparação
- [TODO] Load tests: 100/1k/10k execuções paralelas
- [TODO] Chaos tests: kill worker, DB/Redis down
- [TODO] Security tests: SSRF, injection, sandbox, auth
- [TODO] CI pipeline (lint → typecheck → unit → integration → parity → E2E → build → scan → deploy)
- [TODO] Coverage enforcement (≥80% lines, ≥75% branches)

---

## 5. Lanes de Trabalho Paralelo & Matriz de Ownership

### 5.1 Lanes de Trabalho Paralelo

Lanes são frentes de trabalho que podem ser executadas em paralelo por agentes diferentes sem conflito de arquivos. Cada lane tem propriedade clara de arquivos.

| Lane | Fases | Arquivos | Agente Sugerido | Status de Conflito |
|------|-------|----------|-------------------|-------------------|
| **L-A: Database & Shared** | F0, F1 | `packages/database/prisma/schema.prisma`, `packages/database/src/seed.ts`, `packages/shared/src/**` | Backend Engineer + Types Engineer | Sem conflito |
| **L-B: Security & Auth** | F0, F2 | `apps/api/src/lib/crypto.ts`, `apps/api/src/lib/credential-crypto.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/services/audit.service.ts` | Security Engineer | Sem conflito (com L-A) |
| **L-C: API Backend** | F0, F1 | `apps/api/src/routes/**`, `apps/api/src/lib/env.ts`, `apps/api/src/lib/prisma.ts` | Backend Engineer | ⚠️ Parcial (L-B toca middleware) |
| **L-D: Execution Engine** | F1, F2 | `apps/api/src/services/executor.ts`, `apps/api/src/services/queue.ts`, `apps/api/src/services/nodes/handlers/**`, `apps/api/src/workers/**` | Backend Engineer | Sem conflito (com L-A, L-E) |
| **L-E: Frontend Editor** | F1, F3, F5 | `apps/web/src/components/workflow/**`, `apps/web/src/app/(dashboard)/workflows/**` | Frontend Engineer | Sem conflito |
| **L-F: Frontend Credentials/UI** | F1, F5 | `apps/web/src/app/(dashboard)/credentials/**`, `apps/web/src/components/credentials/**` | Frontend Engineer | Sem conflito |
| **L-G: Integrations** | F3 | `apps/api/src/services/nodes/handlers/{gmail,telegram,slack,http}.ts`, `packages/shared/src/integrations/**` | Integration Engineer | Sem conflito (com L-D) |
| **L-H: AI Platform** | F4 | `packages/ai/src/**`, `apps/api/src/services/ai/**`, `apps/web/src/components/ai/**` | AI Engineer | ⚠️ Leve conflito (L-E imports) |
| **L-I: Operations** | F6 | `apps/api/src/lib/logging.ts`, `apps/api/src/lib/metrics.ts`, configurações de monitoramento | SRE | Sem conflito |
| **L-J: Testing** | F7 | `apps/api/tests/**`, `apps/web/tests/**`, `tests/fixtures/**` | Test Engineer | ⚠️ Parcial (toda lane) |
| **L-K: Deploy & CI/CD** | F6, F7 | `Dockerfile*`, `docker-compose*.y*ml`, `.github/workflows/**`, `Makefile` | DevOps | Sem conflito |
| **L-L: Documentation** | F0 | `n8n-migration/v2-*.md` | Technical Writer + Architect | Sem conflito |

### 5.2 Matriz de Ownership (RACI)

| Épico | Responsável (R) | Aprovador (A) | Consultado (C) | Informado (I) |
|-------|-----------------|----------------|-----------------|---------------|
| E1 Database | Backend Engineer | Technical Lead | Security Engineer, DevOps | All |
| E2 Security | Security Engineer | Technical Lead | Backend Engineer, SRE | All |
| E3 Engine | Backend Engineer | Technical Lead | Security Engineer, Node Platform | Frontend, Integrations |
| E4 Editor | Frontend Engineer | Technical Lead | Backend Engineer, UX Designer | Product |
| E5 Node Platform | Node Platform Engineer | Architect | Backend Engineer, Security | Integrations, Editor |
| E6 Node Catalog | Backend Engineer | Technical Lead | Priorizacao, Integration | Product |
| E7 Comm. Integrations | Integration Engineer | Technical Lead | OAuth Specialist, Security | Product |
| E8 Biz. Integrations | Integration Engineer | Technical Lead | OAuth Specialist, Security | Product |
| E9 AI Platform | AI Engineer | AI Lead | Backend Engineer, Security | Product |
| E10 API REST | Backend Engineer | Technical Lead | Security Engineer, Editor | All |
| E11 Operations | SRE | Technical Lead | DevOps, Backend, Security | All |
| E12 Testing | Test Engineer | Technical Lead | All Engineers | Product |
| E13 Deploy/CICD | DevOps | Technical Lead | SRE, Backend Engineer | All |
| E14 Templates | Frontend Engineer | Product | Backend, UX | Editors |
| E15 Approvals | Backend Engineer | Technical Lead | Security, Comm. Integration | Product |
| E16 Executions | Backend Engineer | Technical Lead | Frontend, Editor | Users |
| E17 Cloud Arch | DevOps | Technical Lead | SRE, Backend, Architect | All |
| E18 Migration | Backend Engineer | Technical Lead | Integration, Editor | Product |

### 5.3 Matrix de Conflito entre Lanes

| | L-A | L-B | L-C | L-D | L-E | L-F | L-G | L-H | L-I | L-J | L-K | L-L |
|--|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| L-A | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| L-B | 0 | - | ⚠️ | 0 | 0 | 0 | 0 | 0 | 0 | ⚠️ | 0 | 0 |
| L-C | 0 | ⚠️ | - | ⚠️ | 0 | 0 | 0 | 0 | 0 | ⚠️ | 0 | 0 |
| L-D | 0 | 0 | ⚠️ | - | 0 | 0 | ⚠️ | 0 | 0 | ⚠️ | 0 | 0 |
| L-E | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | 0 | ⚠️ | 0 | 0 |
| L-F | 0 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | ⚠️ | 0 | 0 |
| L-G | 0 | 0 | 0 | ⚠️ | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 |
| L-H | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0 | ⚠️ | 0 | 0 |
| L-I | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | ⚠️ | 0 | 0 |
| L-J | 0 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 0 | ⚠️ | ⚠️ | - | 0 | 0 |
| L-K | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0 |
| L-L | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |

Legenda: 0 = sem conflito (paralelo total), ⚠️ = conflito parcial (requer sincronização)

---

## 6. Estratégia Incremental de Entrega

### 6.1 Princípio de Entrega por Valor

Cada fase entrega um conjunto de funcionalidades que é **imediatamente utilizável**. O usuário final não precisa esperar por todas as fases para começar a usar a plataforma. A estratégia de entrega incremental é a seguinte:

**Wave 0 (Foundation)**: Specs + security baseline
- O que o usuário vê: Nenhuma (fase de planejamento)
- Entregável: Documentação de specs + auth/ RBAC/ vault funcionando

**Wave 1 (MVP Core)**: "Hello Workflow"
- O que o usuário vê: Editor com canvas, pode criar workflow webhook→HTTP, executar e ver resultados
- Entregável: `curl /webhook/:path → http→api.exemplo.com → 200` funcionando
- Critério: 1 workflow n8n do inventário importado e executado

**Wave 2 (Engine Robusto)**: Workflows complexos
- O que o usuário vê: Workflows com branching (IF/Switch), loops (SplitInBatches), retry automático, error workflow
- Entregável: Workflow de 5-10 nós executa com retry, timeout, error handling
- Critério: Workflows do inventário com IF/merge funcionam

**Wave 3 (Integrations)**: Integrações reais
- O que o usuário vê: Conectar Gmail, Sheets, Telegram, Stripe — workflows disparam/reagem a eventos reais
- Entregável: Workflow Gmail Trigger → HTTP Request → Telegram executa com OAuth2
- Critério: 3 workflows do inventário recriados e funcionando

**Wave 4 (AI Platform)**: Automação inteligente
- O que o usuário vê: AI agent nodes, RAG, guardrails
- Entregável: Workflow com AI agent que classifica dados usando RAG
- Critério: n8n compatível: OpenAI node funciona

**Wave 5 (Polish & Ops)**: Produto enterprise
- O que o usuário vê: Templates gallery, colaboração real-time, debug avançado, dashboards de observabilidade
- Entregável: Sistema pronto para produção com monitoramento, backups, DR
- Critério: Parity test suite passa, CI/CD green, deploy produção

### 6.2 Critérios de Entrega por Wave

| Wave | Features Entregues | Usuário Pode... | Critério de Aceite |
|------|-------------------|-----------------|-------------------|
| Wave 0 | Specs + Security | — | Todos 17 v2-*.md produzidos |
| Wave 1 | Engine basic, webhook trigger, HTTP action, editor básico | Criar workflow webhook→HTTP e executar | 1 workflow n8n importado + executado |
| Wave 2 | Flow control, retry, timeout, error workflow, code sandbox | Criar workflows complexos com branching | 2 workflows n8n importados + executados |
| Wave 3 | 25+ integration nodes, OAuth2 broker | Conectar Gmail/Sheets/Telegram/Stripe | 3 workflows n8n recriados + funcionando |
| Wave 4 | AI agents, RAG, guardrails | Criar workflows com IA | OpenAI/Claude nodes funcionam |
| Wave 5 | Templates, collaboration, debug, ops | Produto completo em produção | Parity suite 90% pass; CI/CD green; deploy ok |

### 6.3 Feature Flags

Features avançadas são entregues por **feature flags** para permitir lançamento gradual:
- `flag:node-platform`: Ativa SDK de nodes customizados (Wave 2)
- `flag:community-nodes`: Ativa instalação de community nodes (Wave 2)
- `flag:ai-platform`: Ativa AI platform nodes (Wave 4)
- `flag:collaboration`: Ativa real-time collaboration (Wave 5)
- `flag:debug-mode`: Ativa step-by-step debugging (Wave 5)

---

## 7. Marcos e Critérios de Aceite

### Marco 0: Foundation Completo (M0)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Specs produzidos | 16 v2-*.md specs escritos | `ls n8n-migration/v2-*.md` → 17 arquivos |
| Security baseline | Auth, RBAC, MFA, Vault funcionando | Login com MFA; RBAC 403 para viewer; credential decrypt auditado |
| Schema estendido | NodeType, WorkflowSchedule, CredentialKeyVersion | `prisma studio` mostra novos models |
| Cloud arch definido | Always-on, filas, workers | Documento de arquitetura aprovado |

### Marco 1: MVP Core — "Hello Workflow" (M1)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Engine DAG | Topological sort executa nós em ordem | `POST /workflows/:id/execute` → log por nó em ordem |
| Webhook trigger | `/webhook/:path` recebe e dispara | `curl -X POST /webhook/test -d '{"x":1}'` → 202 + executionId |
| HTTP Request action | Chama API externa | Response HTTP aparece em `GET /executions/:id` |
| Editor básico | Canvas drag-drop, conectar, salvar | Criar workflow no UI → save → reload → nodes persistem |
| Credential vault | AES-256-GCM, never exposto | `GET /credentials` retorna `{hasValue: true}` nunca plaintext |

### Marco 2: Engine Robusto (M2)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Flow control | IF, Switch, Merge, SplitInBatches | Workflow com branching executa corretamente |
| Retry + backoff | 3 tentativas com exponential backoff | Node falha 2x, succeed na 3ª |
| Timeout | Timeout por node + workflow | Node que demora demais é abortado |
| Error workflow | Workflow dedicado recebe falhas | Node falha → error workflow disparado |
| Code sandbox | JS/TS sandboxado (no fs/net) | `require('fs')` → error no sandbox |
| Cron scheduler | Agendamento + leader election | Workflow cron dispara no horário correto |

### Marco 3: Node Catalog & Integrations (M3)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| P0-P1 nodes | Webhook, Schedule, HTTP, Gmail, Sheets, Telegram | Todos os nodes do inventário funcionam |
| OAuth2 broker | Refresh token automático | Token expira → refresh automático → workflow continua |
| n8n parity | 3 workflows do inventário recriados | Comparar JSON node-a-node com exports originais |
| Integration coverage | 20+ integration nodes | `GET /node-types` lista 25+ types |

### Marco 4: AI Platform (M4)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| LLM abstraction | OpenAI, Anthropic, Google no mesmo interface | Mesmo prompt → 3 providers → outputs |
| Agentes | Tool calling, limits | Agente chama 3 tools, para após limite |
| RAG | Ingestão → chunking → embedding → retrieval → rerank | Query "contract" → retorna doc relevante |
| Guardrails | PII detection, content filter | Input com PII → bloqueado + auditado |

### Marco 5: Executions, Templates & Approvals (M5)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Execution history | Timeline, data inspection, binary preview | `GET /executions` lista; detalhe mostra timeline |
| Templates gallery | Create, publish, version, instantiate | Template "Slack Alert" → instantiate → workflow criado |
| Import/Export n8n | JSON n8n → AgentFlow, invertido | Import `inventario.md` workflow → funciona |
| Real-time collaboration | Presence, cursor, lock | 2 users editam → veem cursor um do outro |
| Approvals | Pause, notify, resume | Workflow pausa → email → approve → retoma |

### Marco 6: Operations (M6)

| Critério | O que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Observability | Logs JSON, /metrics, tracing | `curl /metrics` → contagens; trace correlaciona logs |
| SLOs | 99.9% disponibilidade, p95 < 200ms | Dashboard SLO mostra burn rate |
| Health checks | /health, /ready, /live | `/healthz` → 200 quando healthy |
| Backup & DR | Backup diário, restore testado | `restore_test` → dados recuperados |
| Deploy | CI/CD + blue-green | Push → deploy automático, rollback em fail |

### Marco 7: Testing & Deploy (M7)

| Critério | o que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| Coverage | ≥80% lines, ≥90% shared | `pnpm test:coverage` → thresholds pass |
| Parity suite | 90% workflows n8n passam | `pnpm test:parity` → 45/50 pass |
| Load test | 1000 execuções paralelas < 500ms | `pnpm test:load` → p95 < 500ms |
| CI/CD green | All stages pass | GitHub Actions → all green |
| E2E tests | Critical flows pass | Playwright → 100% |

### Marco 8: Migration Complete (M8)

| Critério | o que deve estar funcionando | Como verificar |
|----------|------------------------------|----------------|
| 3 workflows | Todos recriados e executando | `GET /workflows` lista 3 + cada executa |
| Execução ponta-a-ponta | Trigger → action → resposta | Webhook dispara → HTTP → response |
| Credenciais encriptadas | AES-256-GCM, auditado | Grep `ENCRYPTION_KEY` → zero hits |
| Tests ≥80% | Cobertura mínima atingida | `pnpm coverage` → ≥80% |
| Build passa | Production build OK | `pnpm build` + `docker build` |

---

## 8. Backlog Priorizado Inicial

### 8.1 Fase 0 — Foundation (Wave 0)

| ID | Epic | Tarefa | Est. | Prioridade | Owner |
|----|------|--------|------|------------|-------|
| F0-01 | E18 | Produzir `v2-auditoria-repo.md` (licença, arquitetura n8n) | 2d | P0 | Architect |
| F0-02 | E1 | Produzir `v2-database-schema.md` (17 tabelas DDL + RLS) | 3d | P0 | Backend Engineer |
| F0-03 | E10 | Produzir `v2-api-spec.md` (todos endpoints REST) | 3d | P0 | Backend Engineer |
| F0-04 | E17 | Produzir `v2-arquitetura-cloud.md` (always-on, filas, workers) | 3d | P0 | DevOps |
| F0-05 | E3 | Produzir `v2-engine-spec.md` (DAG, expressões, wait/resume) | 3d | P0 | Backend Engineer |
| F0-06 | E5 | Produzir `v2-node-platform.md` (SDK, registry, 100+ nodes) | 3d | P0 | Node Platform |
| F0-07 | E4 | Produzir `v2-editor-spec.md` (stack, canvas, UX) | 2d | P0 | Frontend Engineer |
| F0-08 | E7 | Produzir `v2-communication-integrations.md` (10 integrações) | 3d | P0 | Integration Engineer |
| F0-09 | E8 | Produzir `v2-business-integrations.md` (40+ integrações) | 3d | P0 | Integration Engineer |
| F0-10 | E9 | Produzir `v2-ai-platform.md` (20 seções, providers, RAG) | 4d | P0 | AI Engineer |
| F0-11 | E11 | Produzir `v2-operations.md` (16 seções, SLOs, DR) | 3d | P0 | SRE |
| F0-12 | E12 | Produzir `v2-test-strategy.md` (pirâmide, parity, chaos) | 3d | P0 | Test Engineer |
| F0-13 | E13 | Produzir `v2-deploy-cicd.md` (Docker, K8s, pipeline) | 2d | P0 | DevOps |
| F0-14 | E16 | Produzir `v2-executions-debug.md` (timeline, replay, debug) | 2d | P0 | Backend Engineer |
| F0-15 | E14 | Produzir `v2-templates-collaboration.md` (templates, import/export) | 2d | P0 | Frontend Engineer |
| F0-16 | E15 | Produzir `v2-approvals.md` (human-in-the-loop, segurança) | 2d | P0 | Backend Engineer |
| F0-17 | E2 | Implementar v2-security-spec.md (MFA, RBAC, envelope encryption) | 4d | P0 | Security Engineer |
| F0-18 | E1 | Estender schema Prisma (NodeType, WorkflowSchedule, etc.) | 2d | P0 | Backend Engineer |

### 8.2 Fase 1 — MVP Core (Wave 1)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F1-01 | E3 | `executor.ts`: DAG topo-sort + execution loop | 2d | P0 | Backend Engineer | F0-05, F0-18 |
| F1-02 | E3 | Handler: `nodes/handlers/webhook.ts` | 1d | P0 | Backend Engineer | F1-01 |
| F1-03 | E3 | Handler: `nodes/handlers/http-request.ts` | 1d | P0 | Backend Engineer | F1-01 |
| F1-04 | E3 | Handler: `nodes/handlers/if.ts` | 1d | P1 | Backend Engineer | F1-01 |
| F1-05 | E3 | Handler: `nodes/handlers/set.ts` | 1d | P1 | Backend Engineer | F1-01 |
| F1-06 | E3 | `node-registry.ts`: factory de node handlers | 1d | P0 | Backend Engineer | F1-02, F1-03 |
| F1-07 | E10 | API: CRUD `/workflows` + activate/deactivate + execute | 2d | P0 | Backend Engineer | F0-03 |
| F1-08 | E10 | API: `POST /webhook/:path` (HMAC + enqueue) | 1d | P0 | Backend Engineer | F0-03, F1-06 |
| F1-09 | E2 | Resolve credencial no executor (`decryptForExecution`) | 1d | P0 | Security Engineer | F0-17 |
| F1-10 | E4 | Editor: `WorkflowCanvas` (React Flow canvas) | 2d | P0 | Frontend Engineer | F1-07 |
| F1-11 | E4 | Editor: `NodePalette` (drag-drop, search) | 1d | P0 | Frontend Engineer | F1-10 |
| F1-12 | E4 | Editor: `NodeConfigPanel` (form dinâmico) | 2d | P0 | Frontend Engineer | F1-10 |
| F1-13 | E4 | Editor page: `app/(dashboard)/workflows/[id]/editor` | 1d | P0 | Frontend Engineer | F1-10 |
| F1-14 | E18 | Import n8n JSON (1 workflow básico) | 1d | P1 | Backend Engineer | F1-01 |
| F1-15 | F2 | Worker: `execution.worker.ts` (BullMQ consumer) | 1d | P0 | Backend Engineer | F1-01 |

### 8.3 Fase 2 — Engine Robusto (Wave 2)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F2-01 | E3 | Handler: `nodes/handlers/switch.ts` | 1d | P2 | Backend Engineer | F1-06 |
| F2-02 | E3 | Handler: `nodes/handlers/merge.ts` | 1d | P2 | Backend Engineer | F1-06 |
| F2-03 | E3 | Handler: `nodes/handlers/split-in-batches.ts` | 1d | P2 | Backend Engineer | F1-06 |
| F2-04 | E3 | Handler: `nodes/handlers/delay.ts` | 1d | P2 | Backend Engineer | F1-06 |
| F2-05 | E3 | Handler: `nodes/handlers/wait.ts` (wait/resume) | 1d | P1 | Backend Engineer | F1-06 |
| F2-06 | E3 | Handler: `nodes/handlers/code.ts` (isolate-vm sandbox) | 2d | P2 | Security Engineer | F1-06 |
| F2-07 | E3 | Expression engine (`packages/shared/src/expressions/`) | 2d | P0 | Backend Engineer | F1-01 |
| F2-08 | E3 | Retry + exponential backoff + timeout config | 1d | P0 | Backend Engineer | F1-01 |
| F2-09 | E3 | Error workflow + dead-letter queue | 1d | P1 | Backend Engineer | F1-01 |
| F2-10 | E3 | Checkpoint manager (crash recovery) | 2d | P1 | Backend Engineer | F1-01 |
| F2-11 | E3 | Cron scheduler (`scheduler.worker.ts`) + leader election | 2d | P0 | Backend Engineer | F1-06 |
| F2-12 | E5 | Node SDK: interfaces (`INodeType`, `INodeExecutionData`) | 2d | P0 | Node Platform | F0-06 |
| F2-13 | E5 | Node registry: register/discovery/lazy-load | 2d | P0 | Node Platform | F2-12 |

### 8.4 Fase 3 — Node Catalog & Integrations (Wave 3)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F3-01 | E6 | Seed `NodeType` com 15+ built-in types | 1d | P0 | Backend Engineer | F0-02 |
| F3-02 | E6 | API: `GET /node-types` + `/node-types/:key` | 1d | P0 | Backend Engineer | F0-03 |
| F3-03 | E7 | Gmail node (trigger + send) — OAuth2 | 2d | P1 | Integration Engineer | F2-12 |
| F3-04 | E7 | Google Sheets node (read/write) — OAuth2 | 2d | P1 | Integration Engineer | F2-12 |
| F3-05 | E7 | Telegram node (sendMessage) — Bot API | 1d | P1 | Integration Engineer | F2-12 |
| F3-06 | E7 | SMTP/IMAP node (send/read email) | 1d | P1 | Integration Engineer | F2-12 |
| F3-07 | E8 | PostgreSQL node (CRUD, query) | 1d | P2 | Integration Engineer | F2-12 |
| F3-08 | E8 | Stripe node (charges, subscriptions, webhooks) | 2d | P2 | Integration Engineer | F2-12 |
| F3-09 | E8 | GitHub node (triggers + actions) | 1d | P2 | Integration Engineer | F2-12 |
| F3-10 | E8 | OAuth2 broker (refresh token management) | 2d | P1 | OAuth Specialist | F0-17 |
| F3-11 | E7 | Slack node (sendMessage, threads) | 1d | P2 | Integration Engineer | F2-12 |
| F3-12 | E7 | WhatsApp node (Meta Cloud API) | 2d | P2 | Integration Engineer | F2-12 |

### 8.5 Fase 4 — AI Platform (Wave 4)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F4-01 | E9 | LLM abstraction layer (chat, streaming, tools) | 2d | P0 | AI Engineer | F0-10 |
| F4-02 | E9 | Provider adapters: OpenAI, Anthropic, Google | 2d | P0 | AI Engineer | F4-01 |
| F4-03 | E9 | Model router (cost, availability, task) | 1d | P1 | AI Engineer | F4-01 |
| F4-04 | E9 | Prompt templates (system, versioning, registry) | 1d | P1 | AI Engineer | F4-01 |
| F4-05 | E9 | Agent framework (loop, tool calling, limits) | 2d | P0 | AI Engineer | F4-01 |
| F4-06 | E9 | Tools framework (HTTP, código, search) | 1d | P1 | AI Engineer | F4-05 |
| F4-07 | E9 | Embeddings + vector stores (pgvector, Qdrant) | 2d | P1 | AI Engineer | F4-01 |
| F4-08 | E9 | RAG pipeline (ingestão, chunking, retrieval, rerank) | 2d | P0 | AI Engineer | F4-07 |
| F4-09 | E9 | Guardrails (PII detection, content filter, jailbreak) | 2d | P0 | Security + AI | F4-01 |
| F4-10 | E9 | Observability de IA (trace, custo, latência) | 1d | P2 | AI Engineer | F4-01 |
| F4-11 | E9 | Node handler: `ai-agent.ts` | 1d | P0 | AI Engineer | F2-12, F4-05 |

### 8.6 Fase 5 — Executions, Templates & Approvals (Wave 5)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F5-01 | E16 | Execution history (list, filtros, busca) | 1d | P0 | Backend Engineer | F1-07 |
| F5-02 | E16 | Execution detail (timeline, node drill-down) | 2d | P0 | Backend + Frontend | F5-01 |
| F5-03 | E16 | Pin/unpin data + partial re-execution | 2d | P1 | Backend Engineer | F1-01 |
| F5-04 | E16 | Replay (same/different input, dry-run) | 1d | P1 | Backend Engineer | F1-01 |
| F5-05 | E16 | Step-by-step debug + breakpoints | 2d | P2 | Backend + Frontend | F5-02 |
| F5-06 | E14 | Templates gallery (CRUD, search, versioning) | 2d | P1 | Frontend Engineer | F3-01, F3-02 |
| F5-07 | E14 | Template instantiation (map credentials, validate) | 1d | P1 | Backend Engineer | F5-06 |
| F5-08 | E14 | Import n8n JSON → AgentFlow (full) | 2d | P0 | Backend Engineer | F1-14 |
| F5-09 | E14 | Export AgentFlow → n8n JSON | 1d | P1 | Backend Engineer | F5-08 |
| F5-10 | E14 | Real-time collaboration (presence, cursor, lock) | 2d | P2 | Frontend Engineer | F1-10 |
| F5-11 | E14 | Comments & review (threads, mentions, diff) | 1d | P2 | Frontend Engineer | F5-10 |
| F5-12 | E15 | Approval system (pause, notify, resume) | 2d | P1 | Backend Engineer | F2-11, F3-05 |
| F5-13 | E15 | Approval security (token, expiração, replay prevention) | 1d | P0 | Security Engineer | F0-17 |

### 8.7 Fase 6 — Operations & Observability (Wave 5)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F6-01 | E11 | Structured logging (JSON, secret redaction) | 1d | P0 | SRE | F1-01 |
| F6-02 | E11 | Prometheus metrics (/metrics endpoint) | 1d | P0 | SRE | F6-01 |
| F6-03 | E11 | OpenTelemetry tracing | 1d | P1 | SRE | F6-01 |
| F6-04 | E11 | Alertas (regras, canais, escalonamento) | 1d | P0 | SRE | F6-02 |
| F6-05 | E11 | SLOs (99.9%, p95, taxa sucesso) | 1d | P0 | SRE | F6-02 |
| F6-06 | E11 | Health checks (/health, /ready, /live) | 1d | P0 | SRE | F1-01 |
| F6-07 | E13 | CI/CD pipeline (lint → test → build → deploy) | 2d | P0 | DevOps | F6-01 |
| F6-08 | E13 | Docker manifests (multi-stage, healthcheck) | 1d | P0 | DevOps | F0-13 |
| F6-09 | E11 | Backup & DR (pg_dump, Redis, runbook) | 2d | P1 | SRE | F6-07 |
| F6-10 | E11 | Cost tracking (por serviço, org, budget) | 1d | P2 | SRE | F6-02 |
| F6-11 | E11 | Grafana dashboards | 1d | P0 | SRE | F6-02 |

### 8.8 Fase 7 — Testing & Deploy Final (Wave 6)

| ID | Epic | Tarefa | Est. | Prioridade | Owner | Dependência |
|----|------|--------|------|------------|-------|-------------|
| F7-01 | E12 | vitest.config.ts + playwright.config.ts | 1d | P0 | Test Engineer | F0-12 |
| F7-02 | E12 | Unit tests: shared (schemas, converter, expressions) | 2d | P0 | Test Engineer | F2-12, F2-07 |
| F7-03 | E12 | Unit tests: api (executor, nodes, crypto) | 2d | P0 | Test Engineer | F2-01, F2-06 |
| F7-04 | E12 | Integration tests: API CRUD + webhooks | 2d | P0 | Backend Engineer | F7-01 |
| F7-05 | E12 | E2E tests: editor flows (Playwright) | 2d | P1 | Frontend Engineer | F3-01 |
| F7-06 | E12 | Parity suite: n8n workflows + golden files | 2d | P0 | Test Engineer | F0-14, F5-08 |
| F7-07 | E12 | Load tests (100/1k/10k execuções paralelas) | 1d | P1 | Test Engineer | F2-11 |
| F7-08 | E12 | Chaos tests (kill worker, DB/Redis down) | 1d | P1 | SRE | F7-06 |
| F7-09 | E12 | Security tests (SSRF, injection, sandbox) | 1d | P0 | Security Engineer | F0-17 |
| F7-10 | E13 | CI pipeline com gates (coverage, parity) | 1d | P0 | DevOps | F6-07 |

---

## 9. Riscos do Roadmap e Mitigação

### 9.1 Riscos de Specs Pendentes

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Specs v2-*.md não produzidas | Atraso em toda implementação que depende delas | 🔴 Alta | Spec production é Phase 0 obrigatório; nenhum implementação começa sem spec aprovada (Gate G0) |
| Spec contraditório com docs existentes | Refatoração retroativa | 🟡 Média | Briefs exigem harmonização: "Se outro documento em n8n-migration/ já citar integrações, harmonize nomes" — validar antes de cada spec |
| Decisão de licença SUL não resolvida | Risco jurídico na reprodução de nodes/nomes | 🔴 Crítica | `v2-auditoria-repo.md` é P0; decisão fork vs clean-room vs inspiração no M0 |
| Spec de engine (v2-engine-spec.md) não alinhada com executor.ts existente | Reescrita do executor | 🟡 Média | design-runner.md + design-recriacao.md já documentam o executor; spec deve estender, não substituir |

### 9.2 Riscos Técnicos

| Risco | Descrição | Mitigação |
|-------|-----------|-----------|
| **Sandbox Code node fraco** | `isolate-vm` pode ter escape ou ser lento | v2-security-spec.md §6.3: multi-layer (isolate-vm + worker thread); security tests no F7-09 |
| **n8n expression engine incompatível** | `{{ $json }}` diferente entre n8n e AgentFlow | design-recriacao.md propõe expression parser leve; parity suite testa expressões |
| **n8n node compatibility** | 400+ nodes n8n vs ~30 nodes AgentFlow | catalogo-nodes.md lista priorização P0-P3; 20-30 nodes essenciais implementados primeiro; outros via plugin system |
| **OAuth2 token refresh falha** | Integrações param de funcionar após expiry | v2-security-spec.md §5.6: rotação dual-write; v2-ai-platform.md §19: proxy de chamadas |
| **DAG cycle detection falha** | Workflow infinito travando worker | design-runner.md: detecção de ciclo no topo sort + maxIterations=100; teste no F2 |
| **React Flow performance >50 nós** | Editor trava com workflows grandes | design-recriacao.md: virtualização, onlyRenderVisibleElements, memoização; limite de 200 nós testado |
| **Credencial vazada em logs/response** | Segredo exposto | design-seguranca.md: `maskedCredential`, `hasValue: true`, sanitizer global de logs |
| **Webhook público = superfície de ataque** | DDoS, SSRF via webhooks | v2-security-spec.md §7: rate limit, HMAC obrigatório, payload max 1MB, allowlist |

### 9.3 Riscos de Recursos

| Risco | Descrição | Mitigação |
|-------|-----------|-----------|
| **16 specs pendentes** | Muitos agentes necessários em paralelo | Lane Documentation (L-L) com 8 agentes paralelos (specs são independentes); briefs são detalhados com acceptance criteria |
| **3-4 panes simultâneas máximas** | Limite de concorrência do Overclock | plano-7h.md: max 4 panes; lanes mapeadas para evitar conflitos; paralelismo dentro do limite |
| **Dependência externa (Redis, Postgres) indisponível** | Não consegue rodar local | docker-compose.yml local; `wait-for-it.sh`; testcontainers para CI |
| **Tempo de spec production > 7 dias** | Atraso no MVP | Specs prioritizadas: engine, editor, node-platform, database, api primeiro; specs de AI/Operations podem vir depois |

### 9.4 Riscos de Decisões em Aberto (PENDING)

| Decisão | Status | Onde resolver |
|---------|--------|---------------|
| **Licença SUL**: fork vs clean-room vs inspiração | PENDING | `v2-auditoria-repo.md` (produzir primeiro) |
| **Expression engine**: reimplementar vs parser | PENDING | `v2-engine-spec.md` §19 (compatibilidade n8n) |
| **Sandbox Code node**: isolate-vm vs vm2 vs outro | PENDING | `v2-security-spec.md` §6.3 (já recomenda isolate-vm) + `v2-node-platform.md` §11 |
| **Stack editor**: React vs Vue vs outro | PENDING | `v2-editor-spec.md` §1 (brief recomenda basear em React Flow já instalado) |
| **Community nodes**: formato npm vs registry próprio | PENDING | `v2-node-platform.md` §11 |
| **Vector store**: pgvector vs Qdrant vs Pinecone | PENDING | `v2-ai-platform.md` §11 |
| **Deploy**: K8s vs Fly.io vs Render vs Railway | PENDING | `v2-arquitetura-cloud.md` §14 + `v2-deploy-cicd.md` |
| **RLS no PostgreSQL**: política multi-tenant | PENDING | `v2-database-schema.md` §9 |

---

## 10. Próximos Passos Imediatos

Assim que este documento (`v2-master-roadmap.md`) existir, **estes são os próximos passos**. Nenhum código deve ser implementado até que as specs do F0 sejam produzidas e aprovadas (Gate G0).

### 10.1 Imediato (0-2 dias)

1. **Produzir as 5 specs mais críticas para desbloquear F1** (em paralelo, Lane L-L):
   - `v2-database-schema.md` (base para todos os models)
   - `v2-engine-spec.md` (base para engine)
   - `v2-node-platform.md` (base para node SDK)
   - `v2-api-spec.md` (base para API)
   - `v2-editor-spec.md` (base para editor)

2. **Estender schema Prisma** com base em `design-recriacao.md` §a:
   - Adicionar `NodeType` model
   - Adicionar `WorkflowSchedule` model
   - Adicionar `WorkflowTrigger` model
   - Adicionar `CredentialKeyVersion` + `CredentialAuditLog` models (do v2-security-spec.md)

3. **Implementar security baseline** (E2) com base em `v2-security-spec.md`:
   - Argon2id password hashing (ADR-1)
   - MFA scaffolding (TOTP, email OTP, backup codes)
   - RBAC matrix (owner/admin/editor/viewer)

### 10.2 Curto-prazo (3-7 dias)

4. **Produzir as specs restantes** (11 specs):
   - `v2-auditoria-repo.md` (prioridade P0 para licença)
   - `v2-arquitetura-cloud.md`
   - `v2-communication-integrations.md`
   - `v2-business-integrations.md`
   - `v2-ai-platform.md`
   - `v2-operations.md`
   - `v2-test-strategy.md`
   - `v2-deploy-cicd.md`
   - `v2-executions-debug.md`
   - `v2-templates-collaboration.md`
   - `v2-approvals.md`

5. **Gate G0: Architecture Review** — todas as 17 specs aprovadas pelo Technical Lead

### 10.3 F1 Start (após G0 aprovado)

6. **Iniciar Fase 1 (MVP Core)** — 4 lanes em paralelo:
   - Lane L-D (Engine): `executor.ts` DAG + handlers
   - Lane L-C (API): CRUD workflows + webhook receiver
   - Lane L-E (Editor): React Flow canvas + palette
   - Lane L-A (Database): schema extension

### 10.4 Cronograma Resumido

| Semana | Wave | Foco | Critério de Saída |
|--------|------|------|-------------------|
| W0 | F0 | Specs (16 produzidas) + Security baseline | G0 aprovado |
| W1-W2 | F1 | MVP Core (engine + trigger + action + editor) | M1: webhook→HTTP executa |
| W3-W4 | F2 | Engine Robusto (flow control + retry + sandbox) | M2: workflows complexos funcionam |
| W5-W6 | F3 | Integrations (25+ nodes) | M3: 3 workflows n8n recriados |
| W7-W8 | F4 | AI Platform | M4: agente com RAG funciona |
| W9-W10 | F5-F6 | Templates, Collaboration, Operations | M5, M6: produto polido |
| W11-W12 | F7 | Testing & Deploy Final | M7: CI/CD green + parity 90% |

---

## 11. Referências

### 11.1 Documentos de Especificação (v2-*.md)

| Spec | Status | Base para | Brief |
|------|--------|-----------|-------|
| `v2-security-spec.md` | ✅ | Security model completo | — |
| `v2-database-schema.md` | **PENDING** | Schema PostgreSQL + RLS | `prompt-database-schema.md` |
| `v2-engine-spec.md` | **PENDING** | Engine de execução | `prompt-engine-spec.md` |
| `v2-node-platform.md` | **PENDING** | SDK de nodes | `prompt-node-platform.md` |
| `v2-editor-spec.md` | **PENDING** | Editor visual | `prompt-editor-spec.md` |
| `v2-api-spec.md` | **PENDING** | API REST | `prompt-api-spec.md` |
| `v2-arquitetura-cloud.md` | **PENDING** | Cloud always-on | `prompt-arquitetura-cloud.md` |
| `v2-communication-integrations.md` | **PENDING** | Email, WhatsApp, Slack | `prompt-comunicacao.md` |
| `v2-business-integrations.md` | **PENDING** | Stripe, Google, DBs, CRM | `prompt-business-integrations.md` |
| `v2-ai-platform.md` | **PENDING** | LLM, agentes, RAG | `prompt-ai-platform.md` |
| `v2-operations.md` | **PENDING** | Observability 24/7 | `prompt-operations.md` |
| `v2-test-strategy.md` | **PENDING** | Pirâmide, parity, chaos | `prompt-test-strategy.md` |
| `v2-deploy-cicd.md` | **PENDING** | Deploy e CI/CD | `prompt-deploy-cicd.md` |
| `v2-executions-debug.md` | **PENDING** | Histórico e depuração | `prompt-execucoes.md` |
| `v2-templates-collaboration.md` | **PENDING** | Templates, import/export | `prompt-templates-collaboration.md` |
| `v2-approvals.md` | **PENDING** | Aprovação humana | `prompt-aprovacoes.md` |
| `v2-auditoria-repo.md` | **PENDING** | Auditoria n8n + licença | `prompt-auditoria-repo.md` |

### 11.2 Documentos de Apoio Existentes

| Documento | Linhas | Fornece base para |
|-----------|--------|-------------------|
| `design-seguranca.md` | 1257 | v2-security-spec.md (concluído) |
| `design-recriacao.md` | 933 | v2-engine-spec, v2-editor-spec, v2-arquitetura-cloud |
| `catalogo-nodes.md` | 2000 | v2-node-platform.md, priorizacao.md |
| `design-testes.md` | 563 | v2-test-strategy.md |
| `design-runner.md` | 563 | v2-engine-spec.md |
| `deps-e-libs.md` | 410 | Decisões de stack |
| `priorizacao.md` | 44 | P0-P3 node priorities |
| `plano-7h.md` | 265 | Timeline de implementação |
| `inventario.md` | 92 | 3 workflows n8n alvo |
| `repo-map.md` | 53 | Estado atual do código |
| `glossario.md` | 92 | Vocabulário unificado |
| `padroes-conformidade.md` | 411 | Padrões de código |

### 11.3 Stack Tecnológica (conforme `deps-e-libs.md`, `repo-map.md`, `padroes-conformidade.md`)

| Camada | Tecnologia | Versão | Status |
|--------|-----------|--------|--------|
| Package Manager | pnpm | 9.15.0 | ✅ |
| Build System | Turbo | 2.10.9 | ✅ |
| TypeScript | typescript | 5.9.3 | ✅ |
| Frontend | Next.js + React | 15.5 + 19.2 | ✅ |
| Workflow Canvas | @xyflow/react | 12.11.2 | ✅ |
| UI Library | Tailwind + lucide | v4 + react | ✅ |
| Backend | Fastify | ESM | ✅ |
| Database | Prisma + PostgreSQL | 6.19 + 16 | ✅ |
| Fila/Worker | BullMQ + ioredis | 5.81 + 5.11 | ✅ |
| Validação | Zod | 3.25.76 | ✅ |
| OpenAPI | zod-to-openapi | 7.3.4 | ✅ |
| Crypto | node:crypto + @noble/hashes | Built-in + HKDF | ✅ |
| Sandbox | isolate-vm | PENDING | — (especificar em v2-security-spec) |
| Testing | Vitest + Playwright | 3.x + latest | ✅ parcial |
| Monitoring | Prometheus + OpenTelemetry | PENDING | — (especificar em v2-operations) |

### 11.4 Princípios Não-Negociáveis (Garantidos pelo Roadmap)

- ✅ **Execução 24/7 server-side**: Control plane + scheduler + workers + BullMQ/Redis
- ✅ **Compatibilidade n8n JSON**: Import/Export com mapeamento (n8n-node-type-map.ts)
- ✅ **Editor visual completo**: React Flow + custom nodes + forms dinâmicos
- ✅ **Credenciais seguras**: Envelope encryption (AES-256-GCM) + OAuth2 broker
- ✅ **Segurança multi-tenant**: RBAC + RLS + tenant isolation + auditoria
- ✅ **Camada de IA**: LLM abstraction + agents + RAG + guardrails
- ✅ **Integrações**: 40+ integrações (comunicação + negócios)
- ✅ **Observabilidade**: Logs JSON + metrics + tracing + alertas + SLOs
- ✅ **Testes de paridade**: n8n workflows comparados com golden files

---

## 12. Índice de Navegação

| Seção | Página |
|-------|--------|
| 1. Visão Geral | Esta seção |
| 2. Status dos Specs | §2 |
| 3. Grafo de Dependências | §3 |
| 4. Fases Detalhadas | §4 |
| 5. Lanes & Ownership | §5 |
| 6. Estratégia Incremental | §6 |
| 7. Marcos & Aceite | §7 |
| 8. Backlog Priorizado | §8 |
| 9. Riscos & Mitigação | §9 |
| 10. Próximos Passos | §10 |
| 11. Referências | §11 |

**Documento mestre**: `n8n-migration/v2-master-roadmap.md`
**Status**: ✅ PRODUZIDO — aguardando Gate G0 (Architecture Review) para aprovação e início da Phase 1.

---

*Este documento foi produzido com base em 24 documentos de entrada: 1 spec v2 concluído (`v2-security-spec.md`), 17 briefs (`prompt-*.md`), 9 design docs / referência existentes, e a spec Prisma atual. Todas as decisões pendentes são marcadas como PENDING e ligadas ao documento de spec correspondente.*
