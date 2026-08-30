# Plano de Execução 7 Horas — Recriar n8n no AgentFlow

> **Missão**: Reconstruir os workflows do n8n dentro do AgentFlow em janela única (7h contínuas, usuário ausente).
> **Diretório de trabalho**: `n8n-migration/` (já declarado como `workDir` da missão).
> **Entregável final**: Todos os workflows do `inventario.md` recriados e funcionando (execução ponta-a-ponta verificada).

---

## 0. Premissas e Contexto (Baseados nos Artefatos Existentes)

| Artefato | Status | Observação |
|----------|--------|------------|
| `inventario.md` | **A CONFIRMAR** | Lista de workflows n8n a migrar — se ausente, assumir 5–8 workflows típicos (webhook → HTTP → IF → transform → resposta) |
| `repo-map.md` | **A CONFIRMAR** | Mapeamento n8n nodes → AgentFlow nodes — usar catálogo do `glossario.md` como base |
| `design-recriacao.md` | **A CONFIRMAR** | Decisões de arquitetura (runner, DB, UI) — assumir: Prisma + Fastify + React Flow + executor existente |
| `deps-e-libs.md` | **A CONFIRMAR** | Bibliotecas permitidas — assumir: `@xyflow/react`, `zod`, `axios`, `node-cron`, `bullmq` (fila) |
| `padroes-conformidade.md` | **A CONFIRMAR** | Regras de código (ESLint, Prettier, testes 80%) — seguir `CLAUDE.md` e rules do repo |
| `design-seguranca.md` | **A CONFIRMAR** | Credenciais criptografadas, webhooks HMAC, rate-limit — já implementado no AgentFlow (`crypto.ts`, `webhooks.ts`) |
| `catalogo-nodes.md` | **A CONFIRMAR** | Nós suportados — base: `glossario.md` (trigger, action, logic, advanced) |
| `design-runner.md` | **A CONFIRMAR** | Orquestração de execução — `executor.ts` já existe; estender para nós n8n |

> **Se qualquer artefato faltar**: prosseguir com premissas acima, marcar como `🟡 A CONFIRMAR` no plano, e validar no bloco H0.

---

## 1. Timeline H0 → H7 (Blocos de 30–45 min)

| Bloco | Horário | Foco Principal | Entregável-Chave |
|-------|---------|----------------|------------------|
| **H0** | 0:00–0:30 | **Setup & Validação** | Ambiente rodando, inventário confirmado, DB migrações aplicadas |
| **H1** | 0:30–1:15 | **Fundações DB (Prisma)** | Models `Workflow`, `WorkflowNode`, `WorkflowEdge`, `ExecutionLog`, `Credential` estendidos + migração |
| **H2** | 1:15–2:00 | **API CRUD Workflows** | Rotas `POST/GET/PUT/DELETE /workflows`, validação Zod, canvas JSON ↔ DB |
| **H3** | 2:00–2:45 | **Runner / Execução Core** | `executor.ts` estendido: DAG topo, execução nó-a-nó, pinData, retry, timeout, logs |
| **H4** | 2:45–3:30 | **Webhooks Públicos** | `POST /webhook/:id` sem auth, HMAC verify, enqueue em fila, resposta síncrona/assíncrona |
| **H5** | 3:30–4:15 | **UI Editor (React Flow)** | Canvas arrastar-soltar, palette nós, painel config, save/load, test-run inline |
| **H6** | 4:15–5:15 | **Credenciais & Secrets** | CRUD credenciais criptografadas, resolução em tempo de execução, UI modal |
| **H7** | 5:15–6:30 | **Testes & Deploy** | E2E (Playwright) + unit (Vitest) ≥ 80%, build produção, smoke test workflows do inventário |
| **H7+** | 6:30–7:00 | **Buffer / Contingência** | Fixes de última hora, documentação rápida, handoff |

> **Total efetivo**: ~6h30 + 30min buffer. Paralelismo (pane H3+H4, H5+H6) absorve variações.

---

## 2. Detalhamento por Bloco

### H0 — Setup & Validação (0:00–0:30)

| Item | Detalhe |
|------|---------|
| **Entregável** | `n8n-migration/INVENTARIO_CONFIRMADO.md` + `docker-compose up -d` saudável + `pnpm db:migrate` |
| **Arquivos/rotas** | `packages/database/prisma/schema.prisma`, `apps/api/.env`, `apps/web/.env.local` |
| **Dependências** | Docker (PostgreSQL), Node 20+, pnpm |
| **Critério de feito** | `curl localhost:3000/health` → 200; `pnpm -C apps/api db:push` sem erro; inventário lido e contado |
| **Paraleliza** | — (bloco sequencial, fundação) |
| **Risco** | DB não sobe / migração falha | **Mitigação**: `docker-compose logs -f db` + `pnpm db:reset` script pronto |

---

### H1 — Fundações DB Prisma (0:30–1:15)

| Item | Detalhe |
|------|---------|
| **Entregável** | Schema estendido + migração aplicada + seed mínimo (1 org, 1 user, 2 credenciais teste) |
| **Models novos/estendidos** | `Workflow` (já existe), `WorkflowVersion`, `WorkflowNode` (tipo, config JSON, position), `WorkflowEdge` (source, target, handle, condition), `ExecutionLog` (nodeId, input, output, status, duration, error), `Credential` (já existe — adicionar `provider`, `scopes`) |
| **Arquivos** | `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/...`, `packages/database/src/seed.ts` |
| **Dependências** | H0 concluído |
| **Critério de feito** | `pnpm -C packages/database db:migrate deploy` OK; `npx prisma studio` mostra tabelas; seed roda sem erro |
| **Paraleliza** | **Pane A**: Schema + migração | **Pane B**: Seed + types `@agentflow/shared` (Zod schemas) |
| **Risco** | Conflito de naming com models existentes | **Mitigação**: prefixar novos models com `N8n` se necessário (`N8nWorkflowNode`) |

---

### H2 — API CRUD Workflows (1:15–2:00)

| Item | Detalhe |
|------|---------|
| **Entregável** | Rotas REST completas + validação Zod compartilhada (`@agentflow/shared`) + OpenAPI docs |
| **Rotas** | `POST /workflows`, `GET /workflows`, `GET /workflows/:id`, `PUT /workflows/:id`, `DELETE /workflows/:id`, `POST /workflows/:id/duplicate`, `POST /workflows/:id/activate`, `POST /workflows/:id/deactivate` |
| **Payload canvas** | `{ nodes: WorkflowNode[], edges: WorkflowEdge[], viewport: { x, y, zoom } }` |
| **Arquivos** | `apps/api/src/routes/workflows.ts` (estender), `apps/api/src/lib/validation/workflow.ts`, `packages/shared/src/schemas/workflow.ts` |
| **Dependências** | H1 (models prontos) |
| **Critério de feito** | `POST /workflows` cria + retorna `id`; `GET /workflows/:id` retorna canvas completo; `PUT` atualiza nodes/edges; `activate` seta `status=ACTIVE` |
| **Paraleliza** | **Pane A**: Rotas + validação | **Pane B**: Testes unitários (Vitest) para cada rota + contract test OpenAPI |
| **Risco** | Canvas JSON grande (>1MB) | **Mitigação**: Compressão gzip no Fastify + limite `bodyLimit: '5mb'` |

---

### H3 — Runner / Execução Core (2:00–2:45)

| Item | Detalhe |
|------|---------|
| **Entregável** | `executor.ts` robusto: DAG topological sort, execução sequencial/paralela por branches, pinData, retry/backoff, timeout por nó, logs estruturados |
| **Nós mínimos viáveis** | `webhook` (trigger), `http` (action), `if` (logic), `set` / `code` (transform), `respond` (output) |
| **Arquivos** | `apps/api/src/services/executor.ts` (reescrever/estender), `apps/api/src/services/node-registry.ts` (novo — fábrica de nós), `apps/api/src/types/execution.ts` |
| **Dependências** | H2 (API persiste workflow), H1 (ExecutionLog model) |
| **Critério de feito** | `POST /workflows/:id/execute` (manual) → retorna `executionId`; `GET /executions/:id` mostra log por nó com input/output/status; workflow de 5 nós roda < 2s |
| **Paraleliza** | **Pane A**: Core DAG + node registry | **Pane B**: Implementação de cada nó tipo (http, if, set, code, respond) como plugins independentes |
| **Risco** | Loops infinitos / DAG cíclico | **Mitigação**: Detecção de ciclo no topo sort + `maxIterations=100` por execução + timeout global 5min |

---

### H4 — Webhooks Públicos (2:45–3:30)

| Item | Detalhe |
|------|---------|
| **Entregável** | Endpoint `POST /webhook/:workflowId` (sem auth), verificação HMAC SHA256, enqueue em fila BullMQ, resposta imediata `202 Accepted` + `executionId` |
| **Arquivos** | `apps/api/src/routes/webhooks.ts` (estender), `apps/api/src/services/queue.ts` (BullMQ + Redis), `apps/api/src/middleware/webhook-auth.ts` |
| **Dependências** | H3 (executor roda), Redis disponível |
| **Critério de feito** | `curl -X POST localhost:3000/webhook/wf_abc -d '{"test":1}' -H "x-signature: sha256=..."` → 202 + executionId; execução aparece em `GET /executions` |
| **Paraleliza** | **Rodar em paralelo com H3** (Pane C): fila + webhook handler enquanto Pane A/B finalizam executor |
| **Risco** | Webhook público = superfície de ataque | **Mitigação**: Rate-limit por IP (middleware `quota.ts`), HMAC obrigatório, payload max 1MB, allowlist de workflows ativos |

---

### H5 — UI Editor (React Flow) (3:30–4:15)

| Item | Detalhe |
|------|---------|
| **Entregável** | Editor funcional: palette lateral (trigger/action/logic/advanced), canvas drag-drop, conectar nós, painel config lateral, toolbar (save, test, deploy), toast feedback |
| **Componentes-chave** | `WorkflowCanvas` (xyflow), `NodePalette`, `NodeConfigPanel`, `Toolbar`, `AIGeneratorModal` (opcional) |
| **Arquivos** | `apps/web/src/app/workflows/[id]/editor/page.tsx` (estender), `apps/web/src/components/workflow/*`, `apps/web/src/lib/workflow/nodes.ts` (tipos + factories) |
| **Dependências** | H2 (API CRUD), `@xyflow/react` instalado |
| **Critério de feito** | Criar workflow do zero no UI → save → aparece na lista → abrir editor → nodes/edges persistem → "Test Run" executa e mostra log por nó |
| **Paraleliza** | **Rodar em paralelo com H6** (Pane D): UI editor | **Pane E**: Credenciais UI |
| **Risco** | React Flow performance c/ >50 nós | **Mitigação**: Virtualização (`onlyRenderVisibleElements`), memoização nodes/edges, `useCallback` handlers |

---

### H6 — Credenciais & Secrets (4:15–5:15)

| Item | Detalhe |
|------|---------|
| **Entregável** | CRUD credenciais criptografadas (AES-256-GCM), resolução automática no executor, UI modal "Add Credential" com tipos (OAuth2, API Key, Header, Basic) |
| **Arquivos** | `apps/api/src/routes/credentials.ts` (estender), `apps/api/src/lib/crypto.ts` (já existe), `apps/web/src/app/credentials/page.tsx`, `apps/web/src/components/credentials/CredentialModal.tsx` |
| **Dependências** | H1 (Credential model), H3 (executor usa `decryptCredential`) |
| **Critério de feito** | Criar credencial "OpenAI API Key" no UI → usar em nó HTTP → execução real chama API com header `Authorization: Bearer <decrypted>`; credencial **nunca** aparece em logs/response |
| **Paraleliza** | **Rodar em paralelo com H5** (Pane E) |
| **Risco** | Chave de criptografia exposta | **Mitigação**: `ENCRYPTION_KEY` só em env (KMS em prod), rotação via script, auditoria de logs |

---

### H7 — Testes & Deploy (5:15–6:30)

| Item | Detalhe |
|------|---------|
| **Entregável** | Suite de testes passando (unit + integration + E2E), build produção OK, smoke test de **todos** workflows do inventário |
| **Testes** | - Unit: `executor.ts` (DAG, retry, timeout), `node-registry` (cada nó) <br> - Integration: API CRUD + webhook + execução <br> - E2E (Playwright): criar workflow no UI → save → test run → webhook trigger → ver execução |
| **Arquivos** | `apps/api/tests/**`, `apps/web/tests/**`, `playwright.config.ts`, `vitest.config.ts` |
| **Dependências** | H3–H6 concluídos |
| **Critério de feito** | `pnpm test` → 100% pass; coverage ≥ 80%; `pnpm build` OK; `docker build -t agentflow .` OK; **cada workflow do `inventario.md` recriado no UI e executado com sucesso** |
| **Paraleliza** | **Pane F**: Testes API | **Pane G**: Testes Web + Playwright | **Pane H**: Build Docker + deploy script |
| **Risco** | Testes flaky (timing, Redis) | **Mitigação**: Mock Redis em unit, `waitFor` em Playwright, retry automático 2x |

---

### H7+ — Buffer / Contingência (6:30–7:00)

| Item | Detalhe |
|------|---------|
| **Foco** | Fixes de última hora, gaps do inventário, documentação mínima (`README-MIGRATION.md`), handoff ao usuário |
| **Critério de aceite final** | **Checklist de aceite** (ver seção 5) — tudo ✅ |

---

## 3. Paralelismo entre Panes (Resumo Visual)

```
H0  ████████████████████████████████  (sequencial)

H1  ████████████  Pane A: Schema+Migration
    ████████████  Pane B: Seed+SharedTypes

H2  ██████████████████  Pane A: Rotas+Validação
    ██████████████████  Pane B: Testes Unit+Contract

H3  ████████████████████████  Pane A: Core DAG+Registry
    ████████████████████████  Pane B: Nós (http,if,set,code,respond)

H4  ██████████████████  Pane C: Queue+Webhook (paralelo c/ H3 final)

H5  ████████████████████████████████  Pane D: UI Editor
H6  ████████████████████████████████  Pane E: Credenciais UI (paralelo c/ H5)

H7  ████████████████████████████████████████  Pane F: Testes API
    ████████████████████████████████████████  Pane G: Testes Web+E2E
    ████████████████████████████████████████  Pane H: Build+Deploy
```

> **Total panes simultâneas máximas**: 4 (H3+H4, H5+H6, H7 triplo). Dentro do limite de concorrência do Overclock.

---

## 4. Riscos e Mitigação (Matriz)

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Inventário incompleto / workflows desconhecidos | 🔴 Alta | 🔴 Alto | H0 valida; se faltar, assumir 5 workflows padrão + flag `🟡 A CONFIRMAR` |
| Executor não cobre nó n8n específico (ex: `Merge`, `SplitInBatches`) | 🟡 Média | 🟡 Médio | Node registry extensível; implementar só nós do inventário; outros = `TODO` no código |
| React Flow performance / bugs de conexão | 🟡 Média | 🟡 Médio | Usar versão estável `@xyflow/react@12`; testar c/ 20 nós no H5 |
| Webhook HMAC falha / assinatura inválida | 🟢 Baixa | 🔴 Alto | Testes unitários exhaustivos em H2/H4; logging detalhado |
| Credenciais vazam em logs / response | 🟢 Baixa | 🔴 Crítico | `maskedCredential` já existe; auditoria em H6 + `security-reviewer` agent |
| Migração Prisma falha em produção | 🟢 Baixa | 🔴 Alto | `db:migrate deploy` testado em H1; backup script pronto |
| Tempo estourar (>7h) | 🟡 Média | 🟡 Médio | Buffer 30min + escopo mínimo viável (5 nós core); cortar AI Generator, nós advanced |
| Dependências externas (Redis, Postgres) indisponíveis | 🟢 Baixa | 🔴 Alto | Docker Compose local; healthchecks; `wait-for-it.sh` nos scripts |

---

## 5. Critério de Aceite Final (Definition of Done)

> **Comparação direta com `inventario.md`** (ou lista assumida se arquivo ausente).

| # | Critério | Verificação |
|---|----------|-------------|
| 1 | **Todos workflows do inventário recriados no AgentFlow** | `GET /workflows` lista N itens = contagem do inventário |
| 2 | **Cada workflow executa com sucesso (manual trigger)** | `POST /workflows/:id/execute` → status `SUCCESS` + logs por nó |
| 3 | **Webhooks públicos disparam execução** | `curl /webhook/:id` → 202 + execution aparece em lista |
| 4 | **Credenciais funcionam em tempo de execução** | Nó HTTP com credencial → header descriptografado correto |
| 5 | **UI Editor: criar, editar, salvar, testar** | Fluxo completo no browser (Playwright E2E passa) |
| 6 | **Testes ≥ 80% coverage + zero falhas** | `pnpm test` output |
| 7 | **Build produção passa** | `pnpm build` + `docker build` sem erro |
| 8 | **Nenhum segredo em logs / response / bundle** | Grep por `ENCRYPTION_KEY`, `password`, `apiKey` → zero hits |
| 9 | **Documentação mínima** | `n8n-migration/README-MIGRATION.md` com: como rodar, como adicionar nó, troubleshooting |
| 10 | **Handoff ao usuário** | `handoff_submit` com summary + artifacts |

---

## 6. Comandos de Referência Rápida

```bash
# Setup (H0)
cd apps/api && cp .env.example .env && pnpm install
cd ../web && cp .env.example .env.local && pnpm install
docker-compose -f docker-compose.yml up -d db redis
pnpm -C packages/database db:migrate deploy
pnpm -C packages/database db:seed

# Dev (paralelo)
pnpm -C apps/api dev      # :3000
pnpm -C apps/web dev      # :3001

# Testes (H7)
pnpm test                 # all workspaces
pnpm -C apps/api test     # vitest
pnpm -C apps/web test     # vitest + playwright

# Build/Deploy
pnpm build                # all
docker build -t agentflow:latest .
docker-compose -f docker-compose.prod.yml up -d
```

---

## 7. Artefatos Gerados (para `handoff_submit`)

| Path | Descrição |
|------|-----------|
| `n8n-migration/plano-7h.md` | Este plano (entregável principal) |
| `n8n-migration/INVENTARIO_CONFIRMADO.md` | Cópia validada do inventário (H0) |
| `n8n-migration/README-MIGRATION.md` | Doc rápida pós-migração (H7+) |
| `n8n-migration/CHECKLIST-ACEITE.md` | Checklist marcável ✅/❌ por critério (seção 5) |

---

**Pronto para execução.** O plano é realista para 7h com 3–4 panes paralelas, usa código existente (executor, crypto, webhooks, UI), e tem critérios objetivos de aceite baseados no inventário.