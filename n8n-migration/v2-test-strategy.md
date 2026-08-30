# Estratégia de Testes e Paridade n8n — AgentFlow

> **Missão**: Recriar n8n como plataforma própria (AgentFlow) e garantir paridade comportamental.  
> **Work dir**: `n8n-migration/`  
> **Data**: 2026-08-20  
> **Base**: `briefs/prompt-test-strategy.md`, `design-testes.md`, `design-runner.md`, `design-recriacao.md`, `design-seguranca.md`, `v2-security-spec.md`, `prompt-engine-spec.md`, `prompt-node-platform.md`, `prompt-execucoes.md`, `prompt-aprovacoes.md`, `prompt-api-spec.md`, `catalogo-nodes.md`, `api-n8n.md`, `guia-webhooks.md`, `integracoes-existentes.md`, `briefs/prompt-deploy-cicd.md`, `packages/shared/src/n8n-import.ts`, `apps/api/src/services/executor.ts`, `apps/api/src/routes/*.ts`, `apps/api/test/backend.test.ts`, `.github/workflows/ci.yml`.  
> **Status**: DESIGN — não implementar, não commitar código.

---

## 1. Visão geral e pirâmide

### 1.1 Objetivo

Esta estratégia define como o AgentFlow garante **paridade comportamental** com o n8n. A pirâmide de testes cobre todos os níveis — da unidade do conversor n8n→AgentFlow até E2E do editor web e server-side 24/7 — com critérios de aceite, oráculos, fixtures e um pipeline CI com gates de paridade.

A paridade é o requisito mais crítico: dado o mesmo workflow JSON exportado do n8n e o mesmo input, o AgentFlow deve produzir output **idêntico** (ou semanticamente equivalente) ao n8n original.

### 1.2 Pirâmide de Testes

```
                     ┌─────────────────────┐
                     │     E2E (Playwright)│  ← 10%  — Fluxos críticos usuário→API→DB
                     │  (web + api integr.)│
            ┌────────┴────────┬────────────┴────────┐
            │                 │                     │
     ┌──────┴──────┐   ┌─────┴─────┐         ┌─────┴─────┐
     │  Integration│   │  Integration│     │  Integration│  ← 20% — API CRUD, Webhooks, Runner node-a-node
     │   (API)     │   │  (Runner)  │     │  (DB/Prisma)│
     └──────┬──────┘   └─────┬─────┘         └─────┬─────┘
            │                 │                     │
            └────────┬────────┴─────────────────────┘
                     │
            ┌────────┴────────┐
            │    Unit (Vitest)│  ← 65%  — Conversor, schemas, nodes, executor, utils
            │  (shared + api) │
            └─────────────────┘

+ Contract tests (zod schema validation) — 5% do total, overlay em integration
+ Node fixtures (golden files) — compartilhado entre unit e integration
+ Engine tests — sub-conjunto de unit + integration focado no runner
+ API tests — integration sobre Fastify app.inject
+ Editor tests — unit (React Testing Library) + E2E (Playwright)
+ Paridade tests — integration + nightly parity against real n8n
+ 24/7 execution tests — integration contínuo com worker sem sessão
+ Chaos / carga / concorrência / offline — nightly + sob demanda
+ Regression — nightly full-suite + PR gate (smoke parity)
+ Security — integration + fuzzing + scanning
```

### 1.3 Pirâmide por pacote

| Pacote | Camada | Ferramenta | Coverage Alvo |
|--------|--------|------------|---------------|
| `packages/shared` | Unit | Vitest | ≥ 95% |
| `apps/api` | Unit + Integration + Contracts | Vitest + Testcontainers | ≥ 90% |
| `apps/api` (runner) | Engine | Vitest + Testcontainers | ≥ 90% |
| `apps/web` | Unit (component) | Vitest + @testing-library/react | ≥ 70% |
| `apps/web` | E2E | Playwright | 100% critical flows |
| `n8n-migration` | Paridade | Vitest + n8n docker (nightly) | 100% fixtures |
| Todos | Security | OWASP ZAP, eslint-plugin-security | 0 vulnerabilidades HIGH+ |
| Todos | Carga | k6 (nightly) | < 3s p95 latency |

---

## 2. Testes unitários

### 2.1 Ferramentas
- **Vitest 3.x** — já em `devDependencies` do `@agentflow/api`
- **TypeScript** com `tsc --noEmit` (strict)
- **v8 coverage provider** — `>= 80%` lines/functions/branches/statements
- **Pool**: `threads` para paralelismo (config em `apps/api/vitest.config.ts`)

### 2.2 Módulos sob teste unitário

| Módulo | Responsabilidade | Casos de teste chave |
|--------|-----------------|---------------------|
| `shared/src/n8n-import.ts` (`importN8nWorkflow`) | Converte n8n JSON → AgentFlow | ✅ Mapeia todos os 22 tipos do `N8N_TO_AGENTFLOW`<br>✅ `data` envelope `{ name, active, id, connections: {} }`<br>✅ Nó sem `id` → gera `n8n-<timestamp><rand>`<br>✅ Conexões → edges com `sourceHandle`/`label` corretos<br>✅ `active: true` → status `ACTIVE`<br>✅ Warnings para source/target não encontrados<br>✅ JSON inválido → lança erro com mensagem |
| `shared/src/index.ts` (Zod schemas) | Validação de workflows, auth, credenciais | ✅ `saveWorkflowCanvasSchema` rejeita nodes duplicados<br>✅ `edgeConfigSchema` exige source e target<br>✅ `generatedWorkflowSchema` valida graph acíclico<br>✅ `createCredentialSchema` valida provider/type<br>✅ `executeWorkflowSchema` default trigger `manual` |
| `api/src/services/executor.ts` (`runExecution`) | Orquestra execução de workflow | ✅ Topological sort determinístico<br>✅ Skip nós `disabled`<br>✅ Falha de nó → para execução (sem continueOnFail)<br>✅ continueOnFail → marca nó como FAILED, continua<br>✅ Timeout global (configurável)<br>✅ Persistência de NodeExecution (status, input, output, duration) |
| Node executors (engine) | Cada tipo de nó | ✅ `webhook`: extrai path, method<br>✅ `http`: method, url, headers, body, query, auth, response parsing, redirect, timeout<br>✅ `set_fields` (Set): keepOnlySet, values (string, expression, json)<br>✅ `condition` (If/Switch): avaliação boolean/string/number/regex/exists, branch selection<br>✅ `code` (Code/Function): sandbox, globals limitados, timeout, memory limit<br>✅ `delay`: duração, unidade<br>✅ `email`: formato, from, to, subject, body<br>✅ `discord`/`telegram`: webhook URL, payload<br>✅ `sheets`: range, operation, credentials<br>✅ `merge`: modo wait/append, waitAmount<br>✅ `respond_webhook`: responseCode, responseData<br>✅ `gmailTrigger`/`cron`: trigger scheduling, timezone<br>✅ `ai_agent`: prompt, model, temperature, maxTokens |
| `api/src/lib/crypto.ts` | Criptografia de credenciais | ✅ AES-256-GCM encrypt/decrypt round-trip<br>✅ Dados vazios → erro<br>✅ Envelope JSON válido (formato esperado) |
| `api/src/lib/prisma.ts` | Cliente Prisma singleton | ✅ Singleton em testes<br>✅ Conexão em production |
| `api/src/middleware/auth.ts` | JWT auth, RBAC | ✅ Token válido → userId extraído<br>✅ Token expirado → 401<br>✅ Missing token → 401<br>✅ orgId do token vs membership |
| `api/src/middleware/quota.ts` (se existir) | Rate limiting por plano | ✅ FREE → 100 exec/dia<br>✅ PRO → 10000 exec/dia<br>✅ Limit exceeded → 429 |
| `api/src/lib/plans.ts` | Limites por plano | ✅ FREE/STARTER/PRO/ENTERPRISE têm limits corretos |
| `web/src/lib/api.ts` | Cliente API | ✅ `api<T>()` retorna tipado<br>✅ Refresh token automático no 401<br>✅ `clearToken()` remove localStorage |
| `web/src/components/editor/*` | Componentes React | ✅ Drag node → evento disparado<br>✅ Connect nodes → edge criado<br>✅ Save → chamada API correta<br>✅ Delete node → remove edges conectadas<br>✅ Zoom/pan funciona |

### 2.3 Oráculos unitários
- **Golden snapshot**: converter output comparado contra golden JSON versionado
- **Schema validation**: entrada inválida deve falhar no Zod com mensagens específicas
- **Deterministic ID**: `generateId()` usa timestamp + random → testa formato e unicidade
- **Expression evaluation**: `{{ $json.field }}` → mesmo resultado que n8n (ver seção 5)

### 2.4 Configuração Vitest
```typescript
// apps/api/vitest.config.ts (conforme design-testes.md:100-128)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/test/**', '**/tests/**'],
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    pool: 'threads',
  },
});
```

### 2.5 Estrutura de pastas
```
apps/api/tests/
├── unit/
│   ├── n8n-import.test.ts
│   ├── schemas.test.ts
│   ├── executor.test.ts
│   ├── nodes/
│   │   ├── webhook.test.ts
│   │   ├── http.test.ts
│   │   ├── set.test.ts
│   │   ├── condition.test.ts
│   │   ├── code.test.ts
│   │   ├── merge.test.ts
│   │   ├── delay.test.ts
│   │   ├── email.test.ts
│   │   ├── discord.test.ts
│   │   ├── telegram.test.ts
│   │   ├── sheets.test.ts
│   │   ├── respond_webhook.test.ts
│   │   ├── gmailTrigger.test.ts
│   │   ├── cron.test.ts
│   │   ├── ai_agent.test.ts
│   │   └── approval.test.ts   # futuro (v2-approvals)
│   ├── crypto.test.ts
│   └── auth.test.ts
├── integration/
│   ├── api/
│   │   ├── workflows.test.ts
│   │   ├── executions.test.ts
│   │   ├── credentials.test.ts
│   │   ├── webhooks.test.ts
│   │   └── auth.test.ts
│   ├── runner/
│   │   ├── topological-sort.test.ts
│   │   ├── retry-timeout.test.ts
│   │   └── continue-on-fail.test.ts
│   ├── db/
│   │   ├── migrations.test.ts
│   │   └── isolation.test.ts
│   ├── parity/
│   │   └── n8n-parity.test.ts
│   └── 24h/
│       └── server-side-execution.test.ts
├── e2e/
│   ├── editor/
│   ├── execution/
│   └── webhook/
├── fixtures/
│   ├── n8n/
│   │   ├── webhook-set-respond.json
│   │   ├── cron-http.json
│   │   ├── if-switch-branch.json
│   │   ├── error-retry.json
│   │   └── [20+ workflows]
│   ├── parity/
│   │   ├── webhook-set-respond.json
│   │   ├── cron-http.json
│   │   └── ... (cada com workflow + input + expectedOutput + expectedNodeOrder)
│   └── expected/
│       ├── webhook-set-respond.output.json
│       └── ...
├── regression/
│   └── n8n-parity.test.ts
├── chaos/
│   ├── worker-kill.test.ts
│   ├── db-down.test.ts
│   └── redis-down.test.ts
├── load/
│   └── k6-scripts/
├── security/
│   ├── ssrf.test.ts
│   ├── expression-injection.test.ts
│   └── webhook-signature.test.ts
└── setup.ts
```

```
apps/web/tests/
├── unit/
│   └── components/
│       └── canvas.test.ts
└── e2e/
    ├── editor-create-workflow.spec.ts
    ├── editor-import-n8n.spec.ts
    ├── execution-run-manual.spec.ts
    ├── webhook-trigger.spec.ts
    ├── cron-schedule.spec.ts
    ├── branching-if-switch.spec.ts
    ├── error-handling.spec.ts
    └── persistence-share-version.spec.ts
```

---

## 3. Testes de integração

### 3.1 Ferramentas
- **Vitest** (mesma stack unit)
- **Testcontainers** (PostgreSQL 16 + Redis 7) para isolamento
- **Fastify `app.inject()`** — sem precisar subir servidor HTTP (conforme `test/backend.test.ts` existes)
- **MSW** (Mock Service Worker) — substitui chamadas HTTP externas no runner

### 3.2 Áreas de integração

#### 3.2.1 API CRUD Workflows
Testa os endpoints em `apps/api/src/routes/workflows.ts`:

| Endpoint | Caso de Teste |
|----------|---------------|
| `POST /api/workflows` | ✅ Body válido → 201 + workflow com `id`, `createdAt`<br>✅ Org limit atingido → 403 `WORKFLOW_LIMIT_REACHED`<br>✅ Sem org → 400 `NO_ORG` |
| `GET /api/workflows` | ✅ Retorna workflows da org autenticada<br>✅ Pagination funcionando<br>✅ Serializa nodes/edges (canvasKind mapping) |
| `GET /api/workflows/:id` | ✅ Workflow existente → inclui nodes/edges/versions<br>✅ Inexistente → 404 `NOT_FOUND`<br>✅ Cross-org → 404 |
| `PATCH /api/workflows/:id` | ✅ Update parcial (name, description, status)<br>✅ Update de canvas → cria nova versão (incremento)<br>✅ Update sem alterar canvas → não cria versão |
| `DELETE /api/workflows/:id` | ✅ Hard delete + cascade<br>✅ Cross-org → 404 |
| `POST /api/workflows/:id/run` | ✅ Trigger manual → 202 + executionId<br>✅ Quota check (quota middleware)<br>✅ Execution enqueued no BullMQ |
| `POST /api/workflows/import` | ✅ n8n JSON válido → 201 + workflow importado<br>✅ JSON inválido → 400 `IMPORT_FAILED`<br>✅ Warnings retornados |

#### 3.2.2 Runner node-a-node com fixtures
Carrega fixture JSON de `tests/fixtures/n8n/` → executa runner → compara output node-a-node:

- ✅ Cada tipo de nó isoladamente: input, output, error handling
- ✅ Encadeamento: `webhook → set → respond_webhook` → response correta
- ✅ Topological sort: ordem determinística respeita conexões
- ✅ Disabled nodes: pulados sem executar
- ✅ Timeout por nó e global
- ✅ Retry com backoff
- ✅ Continue on fail
- ✅ Error workflow disparado no erro global

#### 3.2.3 Webhooks
Testa `apps/api/src/routes/webhooks.ts` e `apps/api/src/routes/workflows.ts`:

| Caso | Descrição |
|------|-----------|
| Recepção | ✅ `POST /webhook/:path` → dispara workflow → executa → retorna resposta do `respond_webhook` node |
| Method filtering | ✅ GET/POST/PUT/DELETE/PATCH conforme configuração |
| Header/Query/Body parsing | ✅ Dados acessíveis via `{{ $json.headers }}`, `{{ $json.query }}`, `{{ $json.body }}` |
| Signature verification | ✅ HMAC-SHA256 do webhook secret (conforme v2-security-spec.md) |
| Rate limiting | ✅ Limite por path webhook |
| Webhook desativado | ✅ Retorna 404/410 |
| Multiple webhooks | ✅ Path único por org (unique constraint `[orgId, path]`) |

#### 3.2.4 Database / Prisma
| Caso | Descrição |
|------|-----------|
| Migrations | ✅ `prisma migrate deploy` limpa no CI |
| Multi-tenant isolation | ✅ Query sempre carrega `orgId`; cross-org retorna 404 |
| Unique constraints | ✅ `[userId, orgId]` em OrganizationMember<br>✅ `[orgId, path]` em Webhook |
| Cascade deletes | ✅ Workflow delete → nodes, edges, versions, executions deletados |
| Soft delete | ✅ `deletedAt` (se implementado) filtrado automaticamente |

#### 3.2.5 OAuth + Credenciais
| Caso | Descrição |
|------|-----------|
| OAuth flow | ✅ State/nonce validation (CSRF)<br>✅ Token exchange via backend (nunca no browser)<br>✅ Apple id_token verification (JWT manual com JWKS) |
| Credentials CRUD | ✅ Encrypt/decrypt AES-256-GCM<br>✅ Never expose raw data (apenas `hasValue: true`)<br>✅ Reveal requer OWNER/ADMIN |

### 3.3 Oráculos de integração
- **Status codes**: 200/201/400/401/403/404/429/503 exatos
- **Response shape**: JSON validado contra schema Zod (contract test)
- **DB state**: após operação, query direta no Prisma verifica estado
- **Queue state**: BullMQ job created/completed/failed verificado via `Queue.getJob()`
- **Execution trace**: `NodeExecution[]` com ordem, status, output corretos

---

## 4. Testes de contrato

### 4.1 Schema Zod (shared)
Valida que **schemas Zod** em `packages/shared/src/index.ts` definem o contrato entre web, API e nóveis internos:

| Schema | Validação |
|--------|-----------|
| `signupSchema` | email válido, password ≥ 8 chars, name obrigatório |
| `loginSchema` | email válido, password obrigatório |
| `createOrgSchema` | name 1-100, slug regex `[a-z0-9-]+` |
| `nodeConfigSchema` | type ∈ enum, data.type validado via superRefine |
| `edgeConfigSchema` | source ou sourceNodeId obrigatório, target ou targetNodeId obrigatório |
| `generatedWorkflowSchema` | ≥ 1 node, node IDs únicos, edges referenciam nodes existentes |
| `executeWorkflowSchema` | trigger ∈ {manual, webhook, cron, api} |
| `createCredentialSchema` | type ∈ {api_key, oauth2, basic, token} |
| `createWebhookSchema` | path regex `^[a-z0-9][a-z0-9-/]*$`, method default POST |

### 4.2 API OpenAPI
- Spec OpenAPI 3.1 em `n8n-migration/briefs/prompt-api-spec.md` define todos os endpoints
- **Contract test**: cada endpoint retorna resposta compatível com schema OpenAPI
- **Response validation**: middleware que valida response contra OpenAPI antes de retornar

### 4.3 Compatibilidade de expressões
- `{{ $json.field }}` → avaliado igual ao n8n
- `{{ $node["Name"].json }}` → referência a outro nó
- `{{ $json.body.message }}` → nested path access
- Testes unitários validam parser de expressões em isolation

### 4.4 Paridade de dados binários
- n8n: dados binários referenciados por ID em storage
- AgentFlow: mesmo modelo (referências, não inline)
- Contract test: binary reference format compatível

---

## 5. Node fixtures

### 5.1 Repositório de fixtures
Localização: `apps/api/tests/fixtures/`

#### 5.1.1 Fixtures n8n reais (`fixtures/n8n/`)
Cada fixture é um JSON exportado do n8n real, coberto pela matriz de nodes:

| Fixture | Nodes | Conexões | Input | Expected Output |
|---------|-------|----------|-------|-----------------|
| `webhook-set-respond.json` | webhook, set, respondToWebhook | webhook→set→respond | `{ body: { message: "Hello World" } }` | `"Received: Hello World"` (200) |
| `cron-http.json` | cron, httpRequest | cron→http | N/A (cron trigger) | API called with config |
| `if-switch-branch.json` | webhook, if, set, switch, set | 4 branch paths | `{ type: "premium", category: "sales" }` | `"premium" + "sales"` |
| `error-retry.json` | webhook, httpRequest, set, set, respond | webhook→http (fail branch) | `{ body: { data: "test" } }` | `"failed_after_retry"` após 3 tries |
| `code-function.json` | webhook, function, set, respond | webhook→function→set→respond | `{ body: { items: [1,2,3] } }` | `[{"doubled":2},{"doubled":4},{"doubled":6}]` |
| `merge-inline.json` | webhook, httpRequest, merge, respond | parallel→merge→respond | 2 parallel paths | merged items |
| `delay-timeout.json` | webhook, delay, respond | webhook→delay→respond | N/A | delayed response after 5s |
| `gmail-trigger.json` | gmailTrigger, httpRequest | gmail→http | email data | API called with email |
| `sheets-append.json` | webhook, googleSheets, respond | webhook→sheets→respond | `{ body: { row: [...] } }` | row appended |
| `discord-notify.json` | webhook, discord, respond | webhook→discord→respond | `{ body: { msg: "alert" } }` | discord message sent |
| `telegram-bot.json` | webhook, telegram, respond | webhook→telegram→respond | `{ body: { chat: "id" } }` | telegram message sent |
| `email-send.json` | webhook, emailSend, respond | webhook→email→respond | `{ body: { to, subject, text } }` | email sent |
| `http-headers-auth.json` | webhook, httpRequest, respond | webhook→http(auth)→respond | `{ body: { token: "x" } }` | API called with auth header |
| `set-transform.json` | webhook, set, set, respond | webhook→set→set→respond | `{ body: { x: 1, y: 2 } }` | `{ sum: 3 }` |
| `nested-workflow.json` | webhook, executeWorkflow, respond | webhook→subworkflow→respond | N/A | sub-workflow executed |
| `conditional-data.json` | webhook, if, set, set, respond | webhook→if(2 branches)→set→respond | `{ body: { score: 85 } }` | `"approved"` (score>80) |
| `loop-split.json` | webhook, splitInBatches, httpRequest, respond | webhook→split→http→respond | `{ body: { items: [1..100] } }` | 100 items processed |
| `webhook-query.json` | webhook, set, respond | webhook→set→respond | query params | query data in output |
| `error-workflow.json` | webhook, httpRequest, respond | webhook→http(fail)→error workflow | N/A | error workflow triggered |
| `pagination-http.json` | webhook, httpRequest, set, respond | webhook→http→set→respond | `{ body: { page: "1" } }` | paginated data merged |
| `binary-data.json` | webhook, httpRequest, respond | webhook→http(binary)→respond | N/A | binary ref handled |
| `timezone-cron.json` | cron, httpRequest | cron(TZ)→http | N/A | executed at 6AM São Paulo |

#### 5.1.2 Golden files (`fixtures/expected/`)
Cada fixture n8n tem um **golden file** com output esperado:
```json
// fixtures/expected/webhook-set-respond.output.json
{
  "input": { "body": { "message": "Hello World" }, "query": {}, "headers": {} },
  "nodeOutputs": {
    "Webhook": [{ "json": { "body": { "message": "Hello World" } } }],
    "Set Response": [{ "json": { "echo": "Received: Hello World" } }],
    "Respond": [{ "json": "Received: Hello World" }]
  },
  "finalOutput": "Received: Hello World",
  "status": "success"
}
```

#### 5.1.3 Parity fixtures (`fixtures/parity/`)
Cada fixture contém workflow n8n + input + expected output + expected node order:
```json
{
  "name": "HTTP Request com auth + retry",
  "n8nVersion": "1.42.0",
  "workflow": { ... n8n workflow JSON ... },
  "input": { "body": { "data": "test" } },
  "expectedOutput": { "json": { "status": "ok" } },
  "expectedNodeOrder": ["Webhook", "HTTP Request", "Set", "Respond"],
  "expectedStatus": "success",
  "notes": "Testa retry 3x com backoff exponencial"
}
```

### 5.2 Matriz node → teste → status

| n8n Node Type | AgentFlow Type | Status | Fixture | Cobertura |
|---------------|---------------|--------|---------|-----------|
| `n8n-nodes-base.webhook` | `webhook` | ✅ | `webhook-set-respond.json` | 100% |
| `n8n-nodes-base.cron` | `cron` | ✅ | `cron-http.json`, `timezone-cron.json` | 100% |
| `n8n-nodes-base.httpRequest` | `http` | ✅ | `cron-http.json`, `http-headers-auth.json` | 100% |
| `n8n-nodes-base.if` | `condition` | ✅ | `if-switch-branch.json` | 100% |
| `n8n-nodes-base.set` | `set_fields` | ✅ | `set-transform.json`, `webhook-set-respond.json` | 100% |
| `n8n-nodes-base.code` | `code` | ✅ | `code-function.json` | 100% |
| `n8n-nodes-base.function` | `code` | ✅ | `code-function.json` | 100% |
| `n8n-nodes-base.functionItem` | `code` | ✅ | `code-function.json` | 100% |
| `n8n-nodes-base.merge` | `merge` | ✅ | `merge-inline.json` | 100% |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | ⚠️ | `loop-split.json` | 80% (retry/backoff) |
| `n8n-nodes-base.delay` | `delay` | ✅ | `delay-timeout.json` | 100% |
| `n8n-nodes-base.wait` | `delay` | ✅ | `delay-timeout.json` | 100% |
| `n8n-nodes-base.gmailTrigger` | `gmailTrigger` | ✅ | `gmail-trigger.json` | 100% |
| `n8n-nodes-base.googleDrive` | `googleDrive` | ⚠️ | — | 60% (API mock) |
| `n8n-nodes-base.evaluationTrigger` | `evaluationTrigger` | ⚠️ | — | 40% (esboço) |
| `n8n-nodes-base.emailReadImap` | `emailReadImap` | ⚠️ | — | 50% |
| `n8n-nodes-base.gmail` | `gmail` | ⚠️ | — | 60% (API mock) |
| `n8n-nodes-base.googleSheets` | `sheets` | ✅ | `sheets-append.json` | 100% |
| `n8n-nodes-base.formTrigger` | `webhook` | ✅ | `webhook-set-respond.json` | 100% |
| `n8n-nodes-base.errorTrigger` | `cron` | ⚠️ | `error-workflow.json` | 70% |
| `n8n-nodes-base.emailSend` | `email` | ✅ | `email-send.json` | 100% |
| `n8n-nodes-base.switch` | `condition` | ✅ | `if-switch-branch.json` | 100% |
| `n8n-nodes-base.respondToWebhook` | `respond_webhook` | ✅ | `webhook-set-respond.json` | 100% |
| `n8n-nodes-base.discord` | `discord` | ✅ | `discord-notify.json` | 100% |
| `n8n-nodes-base.telegram` | `telegram` | ✅ | `telegram-bot.json` | 100% |
| `n8n-nodes-base.start` (n8n 1.x) | `manual`/`trigger` | ✅ | Todos os fixtures | 100% |
| `n8n-nodes-base.error` (n8n 1.x) | `advanced` | ⚠️ | `error-workflow.json` | 70% |

Legenda: ✅ = paridade garantida | ⚠️ = em progresso / parcial | ❌ = não suportado

### 5.3 Dados sintéticos para fixtures

| Tipo | Formato | Fonte | Uso |
|------|---------|-------|-----|
| Workflow JSON | n8n export format | `fixtures/n8n/*.json` | Converter + runner tests |
| Input data | JSON arbitrário | Gerado via `json-schema-faker` | Execution input |
| Binary data | Base64 ou ref | Mock MinIO/Testcontainers | Binary reference tests |
| Edge cases | Empty array, null, 4MB JSON, malformed | Hand-crafted | Fuzzing + stress |
| Credentials mock | `{ value: "mock-key-123" }` | Hardcoded | Node credential tests |
| HTTP mock | nock/MSW intercept | Test fixtures | External API simulation |
| Timezone | Various TZ strings | IANA tz database | Cron scheduling tests |
| Expressions | `{{ $json.*, $node.*, $workflow.* }}` | Hand-crafted | Expression evaluation tests |

---

## 6. Testes de paridade n8n (CRÍTICO)

### 6.1 Princípio

Dado o mesmo workflow JSON exportado do n8n e o mesmo input, o AgentFlow deve produzir output **idêntico** (ou semanticamente equivalente) ao n8n original. A paridade é validada contra:

1. **Golden files** — outputs pré-gravados do n8n real
2. **Execução de referência n8n** — container n8n rodando no nightly (CI não-bloqueante)
3. **Matriz node → teste → status** — cobertura de todos os 22 tipos de nó mapeados

### 6.2 Arquitetura do teste de paridade

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ n8n fixture JSON│     │ AgentFlow Runner │     │ n8n real (Docker)│
│  (input +        │────▶│ (convert + exec) │═══▶│ (nightly, opcional)│
│   expected)       │     │ output           │     │ output de referência│
└─────────────────┘     └────────┬─────────┘     └──────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ normalizeForComparison  │
                    │ (remove IDs, timestamps)│
                    └──────────┬──────────────┘
                               │
                               ▼
                    ┌──────────┴──────────────┐
                    │ parity-report.json      │
                    │ { total, passed, failed,│
                    │   differences[] }        │
                    └─────────────────────────┘
```

### 6.3 Suite de paridade automatizada

Arquivo: `apps/api/tests/regression/n8n-parity.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { importN8nWorkflow } from '@agentflow/shared';
import { executeWorkflow } from '@/services/executor';
import * as path from 'path';
import * as fs from 'fs';

const PARITY_DIR = path.resolve(__dirname, '../fixtures/parity');

describe('n8n → AgentFlow Behavioral Parity', () => {
  const files = fs.readdirSync(PARITY_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const fixture = JSON.parse(fs.readFileSync(path.join(PARITY_DIR, file), 'utf-8'));

    it(`matches n8n output for: ${fixture.name}`, async () => {
      const result = await executeWorkflow(
        fixture.workflow,
        fixture.input,
        { mode: 'test', wait: true }
      );

      expect(normalize(result.output)).toEqual(
        normalize(fixture.expectedOutput)
      );
      expect(result.nodeExecutionOrder).toEqual(fixture.expectedNodeOrder);
      expect(result.status).toBe(fixture.expectedStatus);
    });
  }
});
```

### 6.4 Geração de fixtures via n8n real (nightly)

Script: `n8n-migration/tests/regression/generate-parity-fixtures.ts`

1. Inicia container `docker run -d -p 5678:5678 n8nio/n8n:1.42.0`
2. Para cada fixture em `fixtures/n8n/`:
   a. Importa workflow via n8n API (`POST /api/v1/workflows/import`)
   b. Ativa workflow
   c. Executa via API (`POST /api/v1/executions`) com input definido
   d. Captura output + nodeExecutionOrder + status
   e. Salva como `expectedOutput` em `fixtures/parity/`
3. Compara contra AgentFlow em `parity` test job (CI não-bloqueante)
4. Gera `parity-report.json` com diff detalhado

### 6.5 Critérios de aceitação de paridade

| Critério | Tolerância | Oracle |
|----------|------------|--------|
| **Output JSON final** | Igualdade exata após normalização (remover IDs, timestamps, memory) | Deep equal do normalized JSON |
| **Ordem de execução dos nodes** | Idêntica (topological sort determinístico) | `result.nodeExecutionOrder === fixture.expectedNodeOrder` |
| **Error messages** | Semanticamente equivalentes (mesmo tipo de erro) | Error code/category match |
| **Retry behavior** | Mesmo número de tentativas + backoff | `retryCount === fixture.expectedRetries` |
| **Expression evaluation** | `{{ $json.x }}` → mesmo resultado | Expression unit test com n8n como oracle |
| **Webhook response** | Status code + body idênticos | `response.status`, `response.body` match |
| **Cron scheduling** | Same trigger times (timezone aware) | `nextExecution === fixture.expectedNextRun` |
| **Continue on fail** | Nodes subsequentes executam mesmo com falha | `nodeExecutions[].status === FAILED`, workflow continues |
| **Node disabled** | Pulado sem executar | `nodeExecutions[].skipped === true` |
| **Error workflow** | Disparado no erro global | `errorWorkflowExecutionId` presente |

### 6.6 Exemplo concreto de paridade

**Fixture: `webhook-set-respond.json`**

Workflow n8n:
```json
{
  "name": "Webhook Echo",
  "nodes": [
    { "id": "1", "type": "n8n-nodes-base.webhook", "position": [250,300],
      "parameters": { "path": "echo", "method": "POST" }, "name": "Webhook" },
    { "id": "2", "type": "n8n-nodes-base.set", "position": [500,300],
      "parameters": { "keepOnlySet": true,
        "values": { "string": [{ "name": "echo", "value": "Received: {{$json.body.message}}" }] } },
      "name": "Set Response" },
    { "id": "3", "type": "n8n-nodes-base.respondToWebhook", "position": [750,300],
      "parameters": { "options": { "responseCode": 200 },
        "responseData": "{{$json.echo}}" },
      "name": "Respond" }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Set Response", "type": "main", "index": 0 }]] },
    "Set Response": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" }
}
```

Input:
```json
{ "body": { "message": "Hello World" }, "query": {}, "headers": {} }
```

Golden file esperado (`fixtures/parity/webhook-set-respond.json`):
```json
{
  "name": "Webhook Echo",
  "n8nVersion": "1.42.0",
  "workflow": { "name": "Webhook Echo", "nodes": [...], "connections": {...}, "active": false, "settings": { "executionOrder": "v1" } },
  "input": { "body": { "message": "Hello World" } },
  "expectedOutput": { "json": "Received: Hello World" },
  "expectedNodeOrder": ["Webhook", "Set Response", "Respond"],
  "expectedStatus": "success",
  "notes": "Expressão {{$json.body.message}} avaliada antes do respond"
}
```

Assertion no teste:
```typescript
expect(normalize(result.output)).toEqual(normalize({ json: "Received: Hello World" }));
expect(result.nodeExecutionOrder).toEqual(["Webhook", "Set Response", "Respond"]);
```

### 6.7 Relatório de paridade

Gerado em `n8n-migration/parity-report.json` no CI:

```json
{
  "timestamp": "2026-08-20T10:00:00Z",
  "n8nVersion": "1.42.0",
  "total": 22,
  "passed": 20,
  "failed": 2,
  "severityThreshold": "HIGH",
  "differences": [
    {
      "fixture": "splitInBatches.json",
      "node": "Loop",
      "agentflow": { "tries": 1, "items": 99 },
      "n8n": { "tries": 1, "items": 100 },
      "severity": "LOW",
      "note": "Off-by-one no último item — investigation required"
    }
  ],
  "newFailures": [],
  "regressions": []
}
```

### 6.8 Gates de paridade

| Job | Blocking | Critério |
|-----|----------|----------|
| `parity-pr` | ✅ Sim | ≥ 90% fixtures passam |
| `parity-nightly` | ❌ Não (alerta) | 100% fixtures passam; diff report enviado ao Slack |
| `parity-n8n-real` | ❌ Não | Diff contra n8n real container — apenas relatório |

---

## 7. Testes de engine

### 7.1 Ferramentas
- **Vitest** para unit (executor core, topological sort, retry logic)
- **Testcontainers** para integration (executor + Redis + PostgreSQL)
- **MSW** para mock de HTTP calls dentro do runner

### 7.2 Áreas

| Área | Testes |
|------|--------|
| **Topological Sort** | ✅ DAG válido → ordem correta<br>✅ Ciclo detectado → erro<br>✅ Nodes isolados (sem conexões) → executados primeiro<br>✅ Deterministic: mesmo DAG → mesma ordem toda vez |
| **Retry / Timeout** | ✅ `retryOnFail: true` → tenta N vezes com backoff exponencial<br>✅ `maxTries: 3` → exatamente 3 tentativas<br>✅ `timeout` por nó → falha com mensagem de timeout<br>✅ Timeout global de workflow → cancela tudo |
| **Continue on Fail** | ✅ `continueOnFail: true` → nó FAILED, próximos nós recebem dados do nó anterior (não do nó falho)<br>✅ `continueOnFail: false` → workflow para, status FAILED |
| **Data Passing** | ✅ Output de nó N → input de nó N+1<br>✅ `{{ $node["Name"].json }}` resolve referência correta<br>✅ Multiple items (array) → iterado por downstream nodes |
| **Error Workflow** | ✅ Erro não tratado → dispara error workflow configurado<br>✅ Error workflow recebe contexto: nodeId, error, input |
| **Execution State** | ✅ Status transita: PENDING → RUNNING → SUCCESS/FAILED/CANCELLED<br>✅ NodeExecution persistido com input/output/logs/duration<br>✅ Idempotency key previne re-execção duplicada |
| **Pin Data** | ✅ Dados de node fixados → usados em vez de input dinâmico<br>✅ Pin em webhook trigger → output fixado |
| **Sandbox Code** | ✅ `isolate-vm` ou equivalente → zero acesso a rede/globals<br>✅ Timeout de execução (ex: 10s)<br>✅ Memory limit (ex: 128MB)<br>✅ Forbidden globals: `require`, `process`, `eval`, `fetch` |

### 7.3 Oráculos
- **Execution trace**: `NodeExecution[]` com ordem, status, input, output, duration, logs
- **Status codes**: PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/WAITING_APPROVAL
- **Idempotency**: re-executar com mesma idempotencyKey → mesmo resultado, sem side effects
- **Memory**: ≤ 128MB por execution (configurável)
- **Time**: ≤ 10s por Code node, ≤ 60s por workflow (configurável)

---

## 8. Testes de API

### 8.1 Ferramentas
- **Fastify `app.inject()`** — testes sem subir servidor HTTP (conforme `test/backend.test.ts`)
- **Vitest + Testcontainers** (PostgreSQL + Redis)
- **MSW** para mock de integrações externas (Stripe, Google, etc.)

### 8.2 Endpoints cobertos

| Recurso | Método | Path | Testes |
|---------|--------|------|--------|
| Auth | POST | `/api/auth/register` | ✅ Email válido, password ≥ 8, name obrigatório |
| Auth | POST | `/api/auth/login` | ✅ Credentials corretas → 200 + token<br>✅ Credentials erradas → 401 |
| Auth | POST | `/api/auth/refresh` | ✅ Refresh token válido → novo access token<br>✅ Refresh token inválido → 401 |
| Auth | POST | `/api/auth/logout` | ✅ Revoga refresh token |
| Auth | POST | `/api/auth/oauth/exchange` | ✅ Code válido → token<br>✅ Code expirado → 401 |
| Orgs | GET | `/api/orgs` | ✅ Lista orgs do usuário |
| Orgs | POST | `/api/orgs` | ✅ Cria org com slug único |
| Workflows | GET | `/api/workflows` | ✅ Lista da org autenticada |
| Workflows | POST | `/api/workflows` | ✅ 201 + id, createdAt<br>✅ 403 no limit |
| Workflows | GET | `/api/workflows/:id` | ✅ 404 cross-org |
| Workflows | PATCH | `/api/workflows/:id` | ✅ Canvas update → nova versão |
| Workflows | DELETE | `/api/workflows/:id` | ✅ Cascade delete |
| Workflows | POST | `/api/workflows/:id/run` | ✅ 202 + executionId |
| Workflows | POST | `/api/workflows/import` | ✅ n8n JSON → 201 + converted workflow |
| Executions | GET | `/api/executions` | ✅ Filtra por status, workflow, data, usuário |
| Executions | GET | `/api/executions/:id` | ✅ Inclui nodes, output, error |
| Executions | POST | `/api/executions/:id/retry` | ✅ Re-executa do node falho |
| Executions | POST | `/api/executions/:id/cancel` | ✅ Cancela execution running |
| Credentials | GET | `/api/credentials` | ✅ Lista com hasValue, não expõe raw |
| Credentials | POST | `/api/credentials` | ✅ Encrypt + store, 201 |
| Credentials | DELETE | `/api/credentials/:id` | ✅ 404 cross-org |
| Credentials | GET | `/api/credentials/:id/reveal` | ✅ 403 não-owner/admin |
| Webhooks | POST | `/api/webhooks` | ✅ Cria webhook com HMAC secret |
| Webhooks | GET | `/webhook/:path` | ✅ Trigger workflow |
| Approvals | GET | `/api/approvals` | ✅ Lista pendências do usuário |
| Approvals | POST | `/api/approvals/:id/approve` | ✅ Aprova + retoma workflow |
| Billing | POST | `/api/billing/checkout` | ✅ 503 se Stripe não configurado |

### 8.3 Testes de contrato de API
- Cada response validado contra Zod schema compartilhado
- Response envelope: `{ data, meta?, error? }`
- Error format: `{ error: { code, message, details?, requestId } }`
- Headers: `Content-Type: application/json`, `X-RateLimit-*`

### 8.4 Testes de auth/RBAC
| Role | Pode criar workflow | Pode deletar | Pode reveal credencial | Pode aprovar |
|------|---------------------|-------------|----------------------|--------------|
| OWNER | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ |
| EDITOR | ✅ | ✅ | ❌ | ✅ |
| VIEWER | ❌ | ❌ | ❌ | ✅ (se for aprovador designado) |
| Anônimo | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) |

### 8.5 Critérios de pass/fail
- ✅ Todos os endpoints retornam status code correto
- ✅ Response shape validado contra schema
- ✅ RBAC: cross-org → 404, permissão insuficiente → 403
- ✅ Error code consistente (`NOT_FOUND`, `FORBIDDEN`, `STRIPE_NOT_CONFIGURED`, etc.)
- ✅ Rate limit headers presentes em rotas sensíveis

---

## 9. Testes de editor (web)

### 9.1 Ferramentas
- **Vitest + @testing-library/react** para component tests (unit)
- **Playwright** para E2E (conforme `design-testes.md:86-159`)
- **Next.js 15 + React 19 + @xyflow/react v12**

### 9.2 Component tests (unit)

| Component | Testes |
|-----------|--------|
| `Canvas` (`@xyflow/react`) | ✅ Drag node do painel → node aparece no canvas<br>✅ Connect two nodes → edge criado com source/target corretos<br>✅ Delete node → edges conectadas removidas<br>✅ Update node config → re-renderiza<br>✅ Zoom/pan com scroll/drag |
| `NodePanel` | ✅ Filtra nodes por categoria<br>✅ Search por nome<br>✅ Cada node type renderiza com ícone correto |
| `NodeConfig` (modal) | ✅ Salva config → update no node<br>✅ Valida campos obrigatórios<br>✅ Expression editor com autocomplete |
| `ExecutionPanel` | ✅ Mostra timeline node-a-node<br>✅ Highlight node atual<br>✅ View input/output JSON<br>✅ Retry from node |
| `Auth forms` | ✅ Login/Register validação client-side<br>✅ OAuth redirect para provider |
| `OrgSelector` | ✅ Switch org → requisição com novo orgId<br>✅ Criar org nova |

### 9.3 E2E tests (Playwright)

| Fluxo | Cenário |
|-------|---------|
| **Editor — Criar & Salvar** | ✅ Drag 3 nodes → connect → configure → save → workflow aparece na lista |
| **Editor — Importar n8n** | ✅ Upload `.json` n8n → preview diff → import → workflow editável<br>✅ Import inválido → error message |
| **Execução — Run Manual** | ✅ Click Execute → progresso node-a-node → output final<br>✅ Execução com erro → retry from failed node |
| **Webhook — Trigger Externo** | ✅ Deploy workflow com Webhook node → curl external → exec appears na lista → response correta<br>✅ HMAC signature verification |
| **Cron — Agendamento** | ✅ Ativa workflow com Cron → verifica nextRunAt → exec automatica |
| **Branching — IF/Switch** | ✅ Input premium → Premium Path; standard → Standard Path<br>✅ Switch: múltiplas cases + fallback |
| **Error Handling** | ✅ Node falha → error workflow disparado<br>✅ Continue on fail → downstream executa |
| **Persistência & Compartilhamento** | ✅ Share link (read-only) → abre sem editar<br>✅ Version history → restore anterior |
| **Approval — Human-in-the-loop** | ✅ Workflow pausa → approval no painel → retoma com decisão<br>✅ Timeout → ação default |

### 9.4 Oráculos editor
- **UI state**: node count, edge count, canvas zoom level
- **API calls**: interceptados via MSW, verificam request/response
- **URL state**: share link gera URL válida
- **Local storage**: token persistido, org selecionada

---

## 10. Testes E2E

### 10.1 Ferramentas
- **Playwright 1.49+** (conforme `design-testes.md:86`)
- **Projects**: Chromium, Firefox, WebKit
- **webServer**: auto-start Next.js dev server
- **Reporters**: HTML, JSON

### 10.2 Configuração

```typescript
// apps/web/playwright.config.ts (conforme design-testes.md:133-159)
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['json', { outputFile: 'test-results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 10.3 Fluxos críticos (100% cobertos)

| # | Fluxo | Steps | Critério de Aceite |
|---|-------|-------|-------------------|
| 1 | Criar workflow do zero | 1. Login → 2. New workflow → 3. Drag webhook + set + respond → 4. Connect → 5. Save → 6. Run → 7. Verify output | Output = "Hello World" |
| 2 | Importar n8n JSON | 1. Upload file → 2. Preview → 3. Confirm → 4. Workflow aparece | Same nodes/conexões |
| 3 | Webhook trigger externo | 1. Ativa workflow → 2. curl POST → 3. Execution appears | 200 + correct response |
| 4 | Retry failed execution | 1. Trigger → 2. Failure → 3. Retry → 4. Success | Status → SUCCESS |
| 5 | Branching logic | 1. Input premium → 2. IF true → 3. Premium path | Correct branch executed |
| 6 | Error workflow | 1. Node falha → 2. Error workflow → 3. Notification | Error workflow triggered |
| 7 | Approval node | 1. Workflow pausa → 2. Approval → 3. Resume | Workflow retomado |

### 10.4 Oráculos E2E
- **UI elements**: `data-testid` attributes verificam estados
- **API responses**: intercepted via MSW, verificam payloads
- **Console errors**: nenhum `console.error` ou `console.warn`
- **Network**: todas as chamadas esperadas completaram
- **Timing**: execution completa em < 5s (smoke)

---

## 11. Testes de carga

### 11.1 Ferramentas
- **k6** (nightly) — script em `apps/api/tests/load/k6-scripts/`
- **Grafana + Prometheus** (monitoramento)
- **Docker Compose** para ambiente escalável

### 11.2 Cenários

| Cenário | Descrição | Métrica | Target |
|---------|-----------|---------|--------|
| **100 execuções paralelas** | 100 workflows simultâneos via API | throughput, p95 latency | ≥ 50 exec/s, p95 < 3s |
| **1000 execuções paralelas** | 1000 workflows via cron/webhook triggers | queue depth, worker utilization | p95 < 5s, sem job loss |
| **10k execuções paralelas** | Stress test — 10k workflows | memory, CPU, errors | ≤ 5% errors, sem crash |
| **Webhook flood** | 1000 webhook POSTs/sec | webhook latency, 429 rate | p95 < 1s, 429 quando rate limit |
| **Large workflow** | 100-node workflow | memory usage | ≤ 256MB, ≤ 60s execution |
| **Expression benchmark** | 10k expression evaluations | latency per expression | ≤ 5ms per expression |
| **Concurrent orgs** | 10 orgs × 10 exec each | tenant isolation | Zero data leakage |

### 11.3 Script k6 (exemplo)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const workflows = new SharedArray('workflows', () => JSON.parse(open('./workflows.json')));

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // ramp up to 100 VUs
    { duration: '2m', target: 100 },   // hold
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<3000'],
    'http_req_failed': ['rate<0.01'],
    'iterations': ['count>500'],
  },
};

export default function () {
  const workflow = workflows[Math.floor(Math.random() * workflows.length)];
  const res = http.post(`${__ENV.API_URL}/api/executions/trigger`,
    JSON.stringify({ workflowId: workflow.id, input: workflow.input }),
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${__ENV.API_TOKEN}` } }
  );
  check(res, { 'status is 202': (r) => r.status === 202 });
  sleep(0.1);
}
```

### 11.4 Oráculos de carga
- **Throughput**: requisições/segundo
- **Latency**: p50, p95, p99 (ms)
- **Error rate**: % de falhas
- **Memory**: MB por worker
- **CPU**: % utilização
- **Queue depth**: jobs waiting
- **Job loss**: zero jobs perdidos (até 10k)

### 11.5 Geração de dados sintéticos para carga

| Dado | Gerador | Estratégia |
|------|---------|------------|
| Workflow JSON | `json-schema-faker` | Schema aleatório com 10-100 nodes |
| Input data | `faker` | JSON com fields aleatórios (string, number, array, object) |
| Binary data | `random-bytes` | 1KB a 10MB blobs |
| Webhook payloads | `faker` | HTTP POSTs com variedade de content-types |
| Credentials | Hardcoded mock | `{"value": "mock-key-123"}` |

---

## 12. Testes de concorrência

### 12.1 Ferramentas
- **Vitest** com `Promise.all` / worker threads
- **Testcontainers** para DB + Redis reais
- **BullMQ** para testar fila de execução

### 12.2 Cenários

| Cenário | Descrição | Oracle |
|---------|-----------|--------|
| **Simultaneous execution start** | 50 workflows iniciados num mesmo segundo | Todos recebem executionId único, sem race condition |
| **Concurrent webhook** | 50 webhook POSTs simultâneos (mesmo path) | Queue processes all, zero 500 errors |
| **Concurrent credential access** | 50 workers acessam mesma credential simultaneamente | Credential decrypted correctly, sem corruption |
| **Concurrent DB writes** | 50 executions escrevem NodeExecution simultaneamente | Nenhuma perda de dados, atomic transactions |
| **Concurrent approval** | 10 users tentam aprovar mesma pendência simultaneamente | Only 1 succeeds, resto rejeitado (race condition safe) |
| **Concurrent org access** | 10 orgs executam workflows simultaneamente | Zero cross-tenant data leakage |
| **Queue contention** | 500 jobs na fila, 5 workers | Jobs processed in order, zero duplication |
| **Redis concurrent ops** | Lock acquisition via Redis (BullMQ) | Distributed lock works, sem deadlock |

### 12.3 Oráculos de concorrência
- **Execution IDs**: all unique, sequential (CUID)
- **NodeExecution count**: matches expected node count × execution count
- **Race condition**: no two executions modify same data corruptly
- **Lock acquisition**: no deadlock, timeout within bounds
- **Idempotency**: same execution retried → same output, no duplicate side effects

---

## 13. Testes de caos

### 13.1 Ferramentas
- **Chaos Mesh** (Kubernetes) ou scripts customizados
- **Node.js process kill** (`process.kill()`)
- **Toxiproxy** para network latency/packet loss
- **Docker stop/kill** para containers de DB/Redis

### 13.2 Cenários

| Cenário | Ação | Oracle |
|---------|------|--------|
| **Kill worker mid-execution** | `kill -9` worker durante node execution | Execution resumes on worker restart, status RUNNING → SUCCESS/FAILED |
| **DB down during execution** | Stop PostgreSQL mid-execution | Execution paused (RETRY), resumes when DB back, no data loss |
| **Redis down during queue** | Stop Redis durante enqueue | Job re-enqueued on Redis recovery, zero job loss |
| **Network latency** | 500ms-2s latency to external HTTP | Node retries with backoff, eventually succeeds or fails gracefully |
| **Network partition** | Block worker→Redis connection | Worker reconnects, jobs rebalanced |
| **Duplicate events** | Webhook called twice (same payload) | Deduplication via idempotencyKey, execution not duplicated |
| **Restart during execution** | Deploy new worker version during execution | In-flight execution completes on old worker or checkpoint resume |

### 13.3 Oráculos de caos
- **Execution recovery**: execution resumes from last checkpoint after worker kill
- **Job durability**: zero jobs lost after Redis/DB restart
- **Idempotency**: duplicate webhook → same execution, no side effects
- **Data integrity**: DB transactions rolled back on failure
- **Queue rebalancing**: jobs redistributed among workers on failure

### 13.4 Critérios de pass/fail
- ✅ ≥ 95% executions recover automatically após worker/Redis failure
- ✅ ≥ 99% de jobs não perdidos após DB restart
- ✅ Zero duplicate de efeitos colaterais (idempotency)
- ✅ Recovery time < 30s após Redis/DB restores

---

## 14. Testes de segurança

### 14.1 Ferramentas
- **OWASP ZAP** — automated scanning
- **eslint-plugin-security** — static analysis (já configurado)
- **Vitest** — fuzzing de expressões, SSRF, injeção
- **nuclei** — template scanning (nightly)

### 14.2 Cenários (baseado em v2-security-spec.md)

| Ameaça | Teste | Oracle |
|--------|-------|--------|
| **SSRF** | HTTP node com URL `http://169.254.169.254/` (metadata) | Request bloqueado (EC2 metadata) |
| **SSRF** | URL `http://localhost:6379` | Request bloqueado (Redis port) |
| **SSRF** | URL `http://10.0.0.1` | Request bloqueado (private IP) |
| **DNS Rebinding** | URL resolve to private IP after initial public | Request bloqueado (guard DNS rebind) |
| **Expression Injection** | `{{ process.env.JWT_SECRET }}` | Avaliado como string literal, não acessa process.env |
| **Expression Injection** | `{{ ; require('fs') }}` | Sandboxed, require() não disponível |
| **Code node sandbox** | `fetch('https://evil.com')` | Bloqueado (zero network) |
| **Code node sandbox** | `while(1);` (infinite loop) | Timeout após 10s |
| **Code node sandbox** | `new Array(1e9).fill(0)` | Memory limit 128MB, kill process |
| **Credential exfiltration** | Node tenta enviar credential via HTTP | Credential data não acessível no node |
| **Path traversal** | `{{ $json.path }}` = `../../../etc/passwd` | Nenhum acesso a filesystem |
| **Auth bypass** | Request sem token | 401 Unauthorized |
| **Auth bypass** | JWT com alg no `none` | 401 (algoritmo none rejeitado) |
| **RBAC bypass** | User tenta acessar workflow de outra org | 404 (não 403, evita enumeration) |
| **Webhook signature** | HMAC inválido | 401 Signature Invalid |
| **Webhook replay** | Mesmo payload reenviado | 401 (nonce já usado) |
| **Webhook flood** | 1000 POSTs em 1s | 429 Rate Limited |
| **JWT** | Token expirado | 401 + refresh flow |
| **MFA** | OTP inválido | 401, tentativa falha registrada |
| **Rate limiting** | 100 login attempts em 1min | 429 |
| **Fuzzing webhook** | Payload aleatório (1KB-1MB) | 200 se workflow processa, 429 se rate limit |

### 14.3 Configuração ZAP no CI
```yaml
zap-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: zaproxy/action-full-scan@v0.11.0
      with:
        target: 'http://localhost:3001'
        cmd: 'docker-compose up -d'
        rules_file: '.zap/rules.tsv'
        thresholds_file: '.zap/thresholds.tsv'
```

### 14.4 Critérios de pass/fail
- ✅ Zero vulnerabilidades HIGH ou CRITICAL
- ✅ Máximo 5 MEDIUM (com ticket de remediation)
- ✅ Zero FALSE POSITIVES em SSRF/RCE
- ✅ WAF rules configuradas no edge proxy
- ✅ Rate limiting presente em todas as rotas sensíveis

---

## 15. Testes de migração (n8n → AgentFlow)

### 15.1 Ferramentas
- **Vitest** — unit + integration do converter
- **Fixtures** — workflows n8n reais (community examples)
- **n8n docker** (nightly) — geração de golden outputs

### 15.2 Áreas de teste

| Área | Testes |
|------|--------|
| **Conversor n8n→AgentFlow** (`importN8nWorkflow`) | ✅ Mapeia todos os 22 node types do `N8N_TO_AGENTFLOW`<br>✅ Converte expressions `{{ $json.field }}` → AgentFlow syntax<br>✅ Preserva position, parameters, credentials, disabled<br>✅ Connections → edges com sourceHandle/label corretos<br>✅ `active: true` → status ACTIVE, `false` → DRAFT<br>✅ Sub-workflows (Execute Workflow) → nested workflow ref<br>✅ Error workflow → configurado<br>✅ Pin data → preserved<br>✅ Warnings para nodes/connections não mapeados |
| **Import via API** | ✅ Upload n8n JSON → 201 + converted workflow<br>✅ JSON inválido → 400 IMPORT_FAILED<br>✅ Warnings retornados no response<br>✅ Workflow importado aparece na lista<br>✅ Canvas do workflow importado executável |
| **Dados de workflow** | ✅ name preservado<br>✅ nodes array com id/type/label/config/position<br>✅ edges com sourceNodeId/targetNodeId<br>✅ settings (executionOrder, timezone, executionTimeout)<br>✅ active status mapeia corretamente |
| **Credenciais n8n** | ✅ Credential refs preservados no node config<br>✅ Tipo de credential mapeado (apiKey, oauth2, etc.)<br>✅ Encryption aplicada no import |
| **Webhooks n8n** | ✅ Path preservado<br>✅ Method mapping<br>✅ HMAC secret migration |
| **Cron/Schedules** | ✅ Cron expression preservida<br>✅ Timezone preservado<br>✅ Trigger times mapping |

### 15.3 Oráculos de migração
- **Node type mapping**: tabela `N8N_TO_AGENTFLOW` coberta 100%
- **Expression syntax**: `{{ $json.field }}` → mesmo output
- **Workflow structure**: nodes count + edges count preservados
- **Warnings list**: não vazia quando há nodes não mapeados
- **Import success**: HTTP 201 + workflow na lista

### 15.4 Fixtures de migração
- `n8n-community-workflow-1.json` — exemplo real community n8n
- `n8n-subscription-manager.json` — workflow complexo com múltiplas integrações
- `n8n-ai-agent-assistant.json` — AI agent workflow
- `n8n-cms-sync.json` — Google Sheets + HTTP integration
- `n8n-it-automation.json` — IT automation com webhook + cron

### 15.5 Critérios de pass/fail
- ✅ ≥ 95% de nodes mapeados sem warning
- ✅ ≥ 90% de workflows importados executam com sucesso
- ✅ Zero data loss no conversor (todos nodes/edges preservados)
- ✅ Expressões mantêm semantic equivalence

---

## 16. Testes de webhook

### 16.1 Ferramentas
- **Vitest + Fastify inject** para webhook reception
- **MSW** para simular webhook disparado de workflow
- **Testcontainers** (Redis + PostgreSQL) para webhook processing

### 16.2 Cenários

| Cenário | Teste | Oracle |
|---------|-------|--------|
| **Webhook registration** | Cria webhook via API → verifica DB | `Webhook` record com path, secret, method, active=true |
| **Webhook trigger** | `POST /webhook/:path` → workflow executed | Execution created, status RUNNING → SUCCESS |
| **Webhook response** | Respond Webhook node retorna data | HTTP response code + body match configured |
| **HMAC signature** | Header `X-AgentFlow-Signature` verificado | Signature válido → 200; inválido → 401 |
| **HMAC nonce** | Replay attack (same payload twice) | Segundo request → 401 (nonce já usado) |
| **Webhook timestamp** | Request with old timestamp (>5min) | 401 (timestamp expired) |
| **Webhook payload limit** | 11MB payload | 413 Payload Too Large |
| **Webhook method filter** | GET on POST-only webhook | 405 Method Not Allowed |
| **Webhook path uniqueness** | Same path, same org | 409 Conflict |
| **Webhook IP allowlist** | Request de IP não na allowlist | 403 Forbidden |
| **Webhook disable** | Webhook `active=false` | 404/410 Gone |
| **Concurrent webhooks** | 50 simultaneous POSTs same path | All queued, all processed, zero 500 |
| **Webhook → approval** | Workflow pausa no approval node | 202 accepted, execution WAITING_APPROVAL |
| **Webhook → error workflow** | Node falha → error workflow | Error workflow triggered, notification sent |

### 16.3 Oráculos de webhook
- **HTTP status**: 200, 202, 401, 403, 404, 405, 410, 413, 429
- **Response body**: JSON `{ data, meta, error }` com campos corretos
- **Execution trace**: `WorkflowExecution` created with trigger=webhook
- **NodeExecution**: todos os nodes executados na ordem correta
- **Security headers**: `X-Signature`, `X-Nonce`, `X-Timestamp` validados

### 16.4 Critérios de pass/fail
- ✅ Todos webhooks com HMAC signature verification
- ✅ ≤ 100ms de webhook reception latency (até worker pickup)
- ✅ ≤ 1s de webhook end-to-end (para workflows simples)
- ✅ 100% de requests maliciosos bloqueados (replay, invalid signature, IP não autorizado)
- ✅ Zero webhook duplication

---

## 17. Testes de execução server-side 24/7

### 17.1 Objetivo

Garantir que workflows com triggers de **cron** e **webhook** executam 24/7 em nuvem, sem sessão de usuário, sem browser, sem interação humana. O worker (BullMQ) deve:

1. Manter cron schedules ativos
2. Processar webhooks de forma assíncrona
3. Retomar executions pausadas (approval, wait)
4. Se recuperar de falhas (worker restart, DB/Redis down)
5. Respeitar timezone e schedule

### 17.2 Ferramentas
- **Testcontainers** (PostgreSQL + Redis + MinIO)
- **BullMQ** worker em modo `test`
- **Cron parser** (`cron-parser` ou nativo)
- **MSW** para mock de HTTP calls externos

### 17.3 Cenários

| Cenário | Teste | Oracle |
|---------|-------|--------|
| **Cron execution** | Workflow com Cron node ativado → dispara no schedule | Execution created with trigger=cron no horário certo |
| **Cron timezone** | Cron `0 6 * * *` TZ `America/Sao_Paulo` | Executado às 6AM SP, não UTC |
| **Webhook always-on** | Webhook registrado → external POST a qualquer hora | Execution created, processed by worker |
| **Worker restart** | Kill worker durante execution → restart | Execution resume from checkpoint, status RUNNING |
| **No user session** | Execution com userId=null (cron/webhook) | Workflow executes sem auth context |
| **Concurrent cron** | 10 cron workflows disparam no mesmo minuto | All queued, processed sequentially or parallel |
| **Cron pause/resume** | Workflow PAUSED → cron não dispara | Zero executions for paused workflow |
| **Cron deactivate** | Workflow desativado → cron removed | Nenhum schedule no Redis/Zeus |
| **Approval wait** | Workflow pausa no approval → 24h depois | Workflow still WAITING_APPROVAL |
| **Auto-resume** | Approval resolved via API → workflow retoma | Execution status → RUNNING → SUCCESS |

### 17.4 Testes de execução sem navegador/computador

**Arquivo**: `apps/api/tests/integration/24h/server-side-execution.test.ts`

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { startWorker } from '@/services/worker';
import { prisma } from '@/lib/prisma';
import { Queue, QueueEvents } from 'bullmq';

describe('Server-side 24/7 execution', () => {
  let worker: Worker;

  beforeAll(async () => {
    await resetDb();
    worker = await startWorker({ concurrency: 5 });
  });

  afterAll(async () => {
    await worker.close();
    await prisma.$disconnect();
  });

  it('cron workflow executes without user session', async () => {
    // 1. Create + activate workflow with Cron trigger
    const workflow = await createCronWorkflow({
      cron: '*/1 * * * *', // every minute
      timezone: 'America/Sao_Paulo',
    });

    // 2. Wait for cron to fire (sem browser, sem UI)
    await waitForExecution(workflow.id, 'cron', { timeout: 120000 });

    // 3. Verify execution created with trigger=cron, userId=null
    const execution = await prisma.workflowExecution.findFirst({
      where: { workflowId: workflow.id },
    });
    expect(execution.trigger).toBe('cron');
    expect(execution.userId).toBeNull();
    expect(execution.status).toBe('SUCCESS');
  });
});
```

### 17.5 Oráculos de execução 24/7
- **Execution record**: `trigger` = cron/webhook, `userId` = null
- **Worker process**: ativo, connected to Redis queue
- **Cron schedule**: registered in Redis, fires on time
- **Recovery**: after worker restart, execution resumes
- **Timezone**: cron fires at correct local time
- **No UI dependency**: zero browser, zero session

### 17.6 Critérios de pass/fail
- ✅ Cron fires within ±1s do schedule esperado
- ✅ Webhook processing dentro de 500ms do POST
- ✅ Worker restart → execution resume ≤ 30s
- ✅ Zero execution loss após worker restart
- ✅ Cron timezone correto (testado em múltiplos TZs)
- ✅ Workflows pausados não executam

---

## 18. Testes de offline / always-on

### 18.1 Ferramentas
- **Toxiproxy** — network partition, latency injection
- **Docker stop/kill** — service outage simulation
- **BullMQ retries** — job retry on failure

### 18.2 Cenários

| Cenário | Ação | Oracle |
|---------|------|--------|
| **API offline** | Stop API server | Webhook POSTs retornam 503; jobs re-enqueued |
| **Redis offline** | Stop Redis | Workers retry connection; jobs queued no memory (BullMQ) |
| **DB offline** | Stop PostgreSQL | Workers retry; executions paused; resumes on restore |
| **Worker offline surge** | 10 workers killed | Jobs redistributed to surviving workers |
| **Network partition** | Block worker→API | Worker uses cached credentials; HTTP nodes retry |
| **Webhook buffering** | API down for 5min | Webhook POSTs re-tried by client (retry-after), ou buffered |
| **Cron catchup** | Worker down for 3h | Missed crons re-executed (catchup mode) ou skipped |
| **Credential access offline** | Worker can't reach credential service | Uses cached/last-known credential (encrypted) |
| **Partial failure** | 1 node type fails | Other nodes continue (continueOnFail), error workflow triggered |
| **Graceful degradation** | External API down | HTTP nodes retry com backoff, then fail gracefully |

### 18.3 Oráculos de offline/always-on
- **Job durability**: zero jobs lost após Redis restart
- **Execution state**: persisted at every node checkpoint
- **Retry count**: incremented correctly
- **Queue persistence**: BullMQ saves jobs in Redis
- **Catchup**: missed crons processed or intentionally skipped (config)
- **Client retry**: webhook POSTs retried by client (429 Retry-After)

### 18.4 Critérios de pass/fail
- ✅ ≤ 1% job loss após Redis restart
- ✅ Recovery time ≤ 30s após service restore
- ✅ Cron catchup config per workflow (skip/catchup)
- ✅ Webhook retry with exponential backoff (max 3 retries)
- ✅ Credential cache works for ≤ 60min offline

---

## 19. Testes de regressão

### 19.1 Estratégia

A suíte de regressão roda:
1. **No PR** (blocking) — smoke + paridade (10 fixtures mais críticos)
2. **Nightly** (não-blocking) — full parity (22+ fixtures) + carga + caos
3. **Release** (blocking) — tudo + security scan + manual smoke

### 19.2 Suíte de regressão por tipo

| Tipo | Frequência | Blocking | Fixtures | Critério |
|------|------------|-----------|----------|----------|
| **Smoke unit** | Sempre (CI) | ✅ | 5 schemas + converter | ≥ 95% pass |
| **Smoke integration** | Sempre (CI) | ✅ | 3 workflows APIs | ≥ 95% pass |
| **Parity (smoke)** | PR | ✅ | 10 fixtures (core nodes) | ≥ 90% pass |
| **Parity (full)** | Nightly | ❌ | 22+ fixtures (all nodes) | ≥ 95% pass |
| **Paridade n8n real** | Nightly | ❌ | n8n docker container | Diff report |
| **Carga** | Nightly | ❌ | 100/1k/10k exec | p95 < 3s |
| **Caos** | Nightly | ❌ | worker kill, DB/Redis down | ≥ 95% recovery |
| **Segurança** | Always + Nightly | ✅ (high+), ❌ (medium) | OWASP ZAP, fuzz | Zero HIGH/CRITICAL |
| **E2E** | Always | ✅ | 7 critical flows | 100% pass |
| **Editor** | Always | ✅ | All editor flows | ≥ 95% |
| **API contract** | Always | ✅ | All endpoints | 100% schema match |
| **24/7 execution** | Nightly | ❌ | Cron + webhook + worker restart | Recovery ≤ 30s |
| **Offline/always-on** | Nightly | ❌ | Service outages | ≤ 1% job loss |
| **Migration** | Always | ✅ | 5 n8n workflows | ≥ 95% import success |
| **Webhook** | Always | ✅ | 13 webhook scenarios | 100% pass |

### 19.3 Regression matrix (node → status → regression)

| n8n Node | Mapped AF Type | Unit | Integration | E2E | Parity | Regression PR | Regression Nightly |
|----------|----------------|------|-------------|-----|--------|---------------|-------------------|
| webhook | webhook | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cron | cron | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| httpRequest | http | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| if | condition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| set | set_fields | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| code/function | code | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| merge | merge | ✅ | ✅ | | ✅ | ✅ | ✅ |
| delay/wait | delay | ✅ | ✅ | | ✅ | ✅ | ✅ |
| if/switch | condition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gmailTrigger | gmailTrigger | ✅ | | ✅ | ✅ | ✅ | ✅ |
| googleSheets | sheets | ✅ | | ✅ | ✅ | ✅ | ✅ |
| googleDrive | googleDrive | ✅ | | | ⚠️ | | ✅ |
| emailSend | email | ✅ | | ✅ | ✅ | ✅ | ✅ |
| discord | discord | ✅ | | ✅ | ✅ | ✅ | ✅ |
| telegram | telegram | ✅ | | ✅ | ✅ | ✅ | ✅ |
| respondToWebhook | respond_webhook | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| executeWorkflow | set_fields | ✅ | | | ⚠️ | | ✅ |
| errorTrigger | cron | ✅ | | | ⚠️ | | ✅ |
| formTrigger | webhook | ✅ | ✅ | | ✅ | ✅ | ✅ |
| emailReadImap | emailReadImap | ✅ | | | ⚠️ | | ✅ |
| evaluationTrigger | evaluationTrigger | ✅ | | | ⚠️ | | ✅ |

Legenda: ✅ = coberto | ⚠️ = parcial | (vazio) = não aplicável

---

## 20. Definição de ambientes

### 20.1 Ambientes

| Ambiente | Stack | PostgreSQL | Redis | MinIO | n8n | Uso |
|----------|-------|------------|-------|-------|-----|-----|
| **Unit** | Local | In-memory (sqlite mem) | In-memory | Mock | Nenhum | Testes de schema, converter, pure functions |
| **Integration** | Local/Testcontainers | Testcontainers (PG 16) | Testcontainers (Redis 7) | Testcontainers | Mock n8n | API CRUD, runner, webhooks |
| **E2E** | Local | Testcontainers | Testcontainers | Testcontainers | Nenhum | Playwright browser tests |
| **CI** | GitHub Actions | Service (postgres:16) | Nenhum (unit uses mem) | Nenhum | Nenhum | Lint, typecheck, unit, integration |
| **CI E2E** | GitHub Actions | Service (postgres:16) | Service (redis:7) | Nenhum | Nenhum | E2E tests (Playwright) |
| **Nightly** | Runner self-hosted | Testcontainers | Testcontainers | Testcontainers | `n8nio/n8n:1.42.0` | Full parity + carga + caos |
| **Staging** | Docker Compose | PostgreSQL | Redis | MinIO | Paridade (side-by-side) | Pre-production, manual testing |
| **Production** | Kubernetes/Docker | PostgreSQL (cluster) | Redis (cluster) | MinIO (cluster) | Nenhum | Live system |

### 20.2 Docker Compose (CI E2E + Nightly)

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: agentflow
      POSTGRES_PASSWORD: agentflow_dev
      POSTGRES_DB: agentflow_test
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD", "pg_isready"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio
    command: server /data
    environment:
      MINIO_ROOT_USER: agentflow
      MINIO_ROOT_PASSWORD: agentflow_dev
    ports: ["9000:9000"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  n8n-ref:
    image: n8nio/n8n:1.42.0
    ports: ["5678:5678"]
    environment:
      N8N_BASIC_AUTH_ACTIVE: false
      N8N_HOST: localhost
    profiles: ["parity"]  # só em nightly

  api:
    build: ./apps/api
    environment:
      DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test
      REDIS_URL: redis://localhost:6379
      MINIO_ENDPOINT: http://localhost:9000
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
```

### 20.3 Variáveis de ambiente de teste

```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret-key-32-chars-minimum-ok
REFRESH_EXPIRES_IN=7d
CREDENTIAL_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
STRIPE_SECRET_KEY=sk_test_mock
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
MINIO_ROOT_USER=agentflow
MINIO_ROOT_PASSWORD=agentflow_dev
MINIO_ENDPOINT=http://localhost:9000
N8N_ORIGEM_URL=http://localhost:5678
N8N_ORIGEM_API_KEY=  # optional
TEST_FIXTURES_PATH=./tests/fixtures
PARITY_N8N_URL=http://localhost:5678  # nightly only
```

### 20.4 Isolamento de testes
- Cada teste usa org + workflow uniques (UUID prefix)
- DB reset entre suites (`resetStore()` ou `prisma.$executeRaw DELETE`)
- Redis flush entre suites (`FLUSHALL` via `beforeEach`)
- Fixtures são estáticas e versionadas no git

---

## 21. Dados sintéticos

### 21.1 Fontes

| Tipo | Fonte | Estratégia |
|------|-------|------------|
| Workflow JSON | n8n community examples + hand-crafted | 22 fixtures (1 per node type) + edge cases |
| Input data | `json-schema-faker`, `faker` | Gerado via schema, distribuição controlada |
| Binary data | `random-bytes`, `sharp` (imagens) | Tamanhos: 1KB, 100KB, 1MB, 10MB |
| Credentials | Hardcoded mock | Sempre `{"value": "mock-key-123"}` |
| Webhook payloads | `faker`, hand-crafted | Content types: JSON, form-urlencoded, raw |
| Expression strings | Hand-crafted + `json-schema-faker` | `{{ $json.*, $node.*, $workflow.* }}` |
| Auth tokens | JWT gerado via test secret | Access (15m) + Refresh (7d) |
| Cron expressions | `cron-parser` library | Testa: `* * * * *`, `*/5 * * * *`, `0 6 * * *` |
| Timezone strings | IANA tz database | `America/Sao_Paulo`, `UTC`, `Asia/Tokyo` |

### 21.2 Gerador de workflows sintéticos

```typescript
// apps/api/tests/utils/workflow-factory.ts
function generateWorkflow(options: {
  nodeCount: number;
  nodeTypes: string[];
  includeEdges: boolean;
  active: boolean;
}): N8nWorkflowExport {
  const nodes = Array.from({ length: options.nodeCount }, (_, i) => ({
    id: String(i + 1),
    name: `Node ${i + 1}`,
    type: options.nodeTypes[i % options.nodeTypes.length],
    typeVersion: 1,
    position: [250 * (i + 1), 300],
    parameters: { path: `node-${i}`, method: "POST" },
  }));

  const connections = {};
  if (options.includeEdges) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const src = nodes[i].name;
      const tgt = nodes[i + 1].name;
      connections[src] = { main: [[{ node: tgt, type: "main", index: 0 }]] };
    }
  }

  return {
    data: {
      name: `Synthetic Workflow ${Date.now()}`,
      nodes,
      connections,
      active: options.active,
      settings: { executionOrder: "v1" },
    },
  };
}
```

### 21.3 Edge cases

| Categoria | Dados |
|-----------|-------|
| Empty | `nodes: []`, `connections: {}` |
| Single node | Apenas webhook, sem edges |
| Cycle | Nodes formam ciclo (detectado no topological sort) |
| Disconnected | Nodes sem edges (executados em paralelo?) |
| Malformed JSON | Missing `data`, missing `name`, `null` nodes |
| Large payload | 10MB JSON input |
| Special chars | Unicode, emoji, SQL injection strings no parameters |
| Null/undefined | Campos null no parameters |
| Array items | 10k items no input |
| Binary | 10MB base64 encoded |

---

## 22. Critérios de pass/fail

### 22.1 Matriz de critérios

| Tipo de Teste | Blocking | Critério de Pass | Critério de Fail | Gate no CI |
|---------------|----------|------------------|------------------|------------|
| **Unit** | ✅ | ≥ 80% coverage (95% shared) | < 80% coverage | `test` job |
| **Integration** | ✅ | ≥ 95% tests pass | < 95% | `test:integration` job |
| **Contract** | ✅ | All schema validations pass | Schema validation fails | `test:contract` job |
| **Paridade (smoke)** | ✅ | ≥ 90% fixtures pass | < 90% | `parity-pr` job |
| **Paridade (full)** | ❌ | ≥ 95% fixtures pass | < 95% | `parity-nightly` (alerta) |
| **E2E** | ✅ | 100% critical flows pass | Any critical flow fails | `e2e` job |
| **Editor** | ✅ | ≥ 95% tests pass | < 95% | `editor` job |
| **API** | ✅ | 100% endpoint coverage, all status codes corretos | Any endpoint returns wrong status | `api` job |
| **Engine** | ✅ | Topological sort, retry, timeout, continue-on-fail | Logic error in execution | `engine` job |
| **Carga** | ❌ | p95 < 3s, error rate < 1% | > 5% errors | `load-nightly` (alerta) |
| **Concorrência** | ❌ | Zero race conditions, zero job loss | Data corruption | `concurrency-nightly` |
| **Caos** | ❌ | ≥ 95% recovery | > 5% job loss | `chaos-nightly` (alerta) |
| **Segurança** | ✅ (high+) | Zero HIGH/CRITICAL | Any HIGH/CRITICAL | `security` job |
| **Migração** | ✅ | ≥ 95% workflows importam + executam | < 95% | `migration` job |
| **Webhook** | ✅ | 100% webhook scenarios pass | Any webhook fails | `webhook` job |
| **24/7 execution** | ❌ | Recovery ≤ 30s, zero job loss | Recovery > 60s | `execution-24h-nightly` |
| **Offline/always-on** | ❌ | ≤ 1% job loss | > 1% loss | `offline-nightly` |
| **Regression** | ✅ (smoke), ❌ (full) | Smoke: ≥ 95%, Full: ≥ 90% | Below threshold | `regression-pr` / `regression-nightly` |

### 22.2 Definições

- **Flaky test**: teste que falha + passa sem código change → investigado em ≤ 24h
- **Non-deterministic**: timestamps, UUIDs, random → normalizados antes de comparação
- **Critical flow**: qualquer fluxo que impacta paridade n8n ou execução de workflow
- **P95 latency**: 95th percentile da distribuição de respostas
- **Recovery time**: tempo entre service restore e execution resumida

---

## 23. Pipeline CI

### 23.1 Stages e jobs

```yaml
# .github/workflows/ci.yml — extensões (conforme design-testes.md:304-374)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @agentflow/database generate
        env:
          DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
      - run: pnpm run typecheck

  test:
    name: Unit + Integration + Parity (smoke)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: agentflow
          POSTGRES_PASSWORD: agentflow_dev
          POSTGRES_DB: agentflow_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-key-32-chars-minimum-ok
      CREDENTIAL_ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Generate Prisma client
        run: pnpm --filter @agentflow/database generate
      - name: Apply database migrations
        run: pnpm --filter @agentflow/database exec prisma migrate deploy
      - name: Run Unit Tests
        run: pnpm --filter @agentflow/shared test && pnpm --filter @agentflow/api test:unit
      - name: Run Integration Tests
        run: pnpm --filter @agentflow/api test:integration
        env:
          TEST_FIXTURES_PATH: ./tests/fixtures/workflows
      - name: Run Parity (smoke)
        run: pnpm --filter @agentflow/api test:parity-smoke
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          flags: unittests

  e2e:
    name: E2E + Editor
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: test
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: agentflow, POSTGRES_PASSWORD: agentflow_dev, POSTGRES_DB: agentflow_test }
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-key-32-chars-minimum-ok
      CREDENTIAL_ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      NODE_ENV: test
      NEXT_PUBLIC_API_URL: http://localhost:3001
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Generate Prisma client
        run: pnpm --filter @agentflow/database generate
      - name: Apply database migrations
        run: pnpm --filter @agentflow/database exec prisma migrate deploy
      - name: Run API server
        run: pnpm --filter @agentflow/api start &
        env:
          PORT: 3001
      - name: Run E2E Tests
        run: pnpm --filter @agentflow/web test:e2e
      - name: Run Editor Component Tests
        run: pnpm --filter @agentflow/web test:unit
      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/web/test-results/
          retention-days: 7

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: ESLint Security
        run: npx eslint --ext .ts,.tsx --config eslint.config.mjs apps/ packages/ --rulesdir
      - name: OWASP ZAP Scan
        uses: zaproxy/action-full-scan@v0.11.0
        with:
          target: 'http://localhost:3001'
          cmd: 'docker-compose -f docker-compose.ci.yml up -d'
          rules_file: '.zap/rules.tsv'
          thresholds_file: '.zap/thresholds.tsv'
      - name: Dependency Check
        run: npx audit-ci --config ./auditci.json

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, e2e, security]
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Generate Prisma client
        run: pnpm --filter @agentflow/database generate
        env:
          DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
      - name: Build shared package
        run: pnpm --filter @agentflow/shared build
      - name: Build web
        run: pnpm --filter @agentflow/web build
        env:
          NEXT_PUBLIC_API_URL: http://localhost:3001
      - name: Build api
        run: pnpm --filter @agentflow/api build

# --- Nightly jobs (schedule) ---
  nightly:
    name: Nightly — Full Suite
    runs-on: [self-hosted, test-runner]
    if: github.event_name == 'schedule'
    services:
      postgres: { ... }
      redis: { ... }
      minio: { ... }
      n8n-ref:
        image: n8nio/n8n:1.42.0
        ports: ["5678:5678"]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - name: Full Parity (all fixtures)
        run: pnpm --filter @agentflow/api test:parity-full
      - name: Full Regression
        run: pnpm --filter @agentflow/api test:regression-full
      - name: Load Test
        run: |
          docker-compose -f docker-compose.e2e.yml up -d
          k6 run apps/api/tests/load/scenarios/parallel-executions.js
          k6 run apps/api/tests/load/scenarios/webhook-flood.js
          k6 run apps/api/tests/load/scenarios/large-workflow.js
      - name: Chaos Test
        run: pnpm --filter @agentflow/api test:chaos
      - name: 24/7 Execution Test
        run: pnpm --filter @agentflow/api test:execution-24h
      - name: Offline/Always-On Test
        run: pnpm --filter @agentflow/api test:offline
      - name: Concurrency Test
        run: pnpm --filter @agentflow/api test:concurrency
      - name: Security Fuzz
        run: pnpm --filter @agentflow/api test:security-fuzz
      - name: Upload parity report
        uses: actions/upload-artifact@v4
        with:
          name: parity-report
          path: n8n-migration/parity-report.json
```

### 23.2 Pipeline diagram

```
                    ┌─────────────────────┐
                    │   push / pull_request │
                    └────────┬────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌────────┐          ┌────────┐          ┌────────┐
    │  lint   │        │typecheck│        (parallel)
    └────┬────┘          └────┬────┘
         │                    │
         ▼                    ▼
    ┌─────────────────────────────────────────┐
    │              test (Unit + Int + Parity)  │
    │  - shared unit tests (>= 95%)           │
    │  - api unit tests (>= 80%)              │
    │  - integration tests (>= 95%)            │
    │  - parity smoke (>= 90%)                │
    │  - coverage gate                          │
    └────────────────┬────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌─────────┐
    │  e2e   │  │ security│  │  webhook│
    │(Playwright)│(ZAP+fuzz)│(inject)│
    └────┬───┘  └────┬───┘  └────┬────┘
         │           │           │
         ▼           ▼           ▼
    ┌──────────────────────────────────┐
    │          build (all packages)      │
    └──────────────────────────────────┘
                     │
                     ▼
             ┌────────────────┐
             │  nightly (full) │
             │  - full parity  │
             │  - load         │
             │  - chaos        │
             │  - 24/7         │
             │  - offline      │
             │  - concurrency  │
             └────────────────┘
```

### 23.3 Tempo alvo por job (CI)

| Job | Timeout | Critério |
|-----|---------|----------|
| lint | 10 min | ESLint + Prettier |
| typecheck | 10 min | tsc --noEmit |
| test (unit+int+parity) | 20 min | Vitest run |
| e2e | 20 min | Playwright (3 browsers) |
| security | 15 min | ZAP + eslint + audit |
| build | 15 min | tsc + next build |
| **CI total** | **≤ 60 min** | Push/PR |

Nightly:
| Job | Timeout |
|-----|---------|
| full parity | 30 min |
| regression | 30 min |
| load | 20 min |
| chaos | 20 min |
| 24/7 execution | 120 min |
| offline | 30 min |
| concurrency | 20 min |
| security fuzz | 30 min |
| **Nightly total** | **≤ 360 min (6h)** |

### 23.4 Cache e otimização

| Artifact | Cache Strategy |
|----------|---------------|
| `node_modules` | pnpm store caching via `actions/cache` |
| `.next/cache` | Next.js build cache |
| `@prisma/client` | Generated client cached via `actions/cache` |
| Docker images | BuildKit cache for `n8nio/n8n:1.42.0` |
| Test results | `test-results/` artifact upload |
| Coverage | `coverage/lcov.info` → Codecov |
| Playwright | `playwright-report/` artifact retention 7 days |

### 23.5 Scripts no package.json

**`apps/api/package.json`:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:parity-smoke": "vitest run tests/regression/n8n-parity.smoke.test.ts",
    "test:parity-full": "vitest run tests/regression/n8n-parity.test.ts",
    "test:coverage": "vitest run --coverage",
    "test:chaos": "vitest run tests/chaos",
    "test:security-fuzz": "vitest run tests/security",
    "test:execution-24h": "vitest run tests/integration/24h",
    "test:offline": "vitest run tests/offline",
    "test:concurrency": "vitest run tests/concurrency",
    "test:contract": "vitest run tests/contract",
    "test:watch": "vitest"
  }
}
```

**`apps/web/package.json`:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Root `package.json`:**
```json
{
  "scripts": {
    "test": "turbo test",
    "test:unit": "turbo test:unit",
    "test:integration": "turbo test:integration",
    "test:e2e": "pnpm --filter @agentflow/web test:e2e",
    "test:parity": "pnpm --filter @agentflow/api test:parity-full",
    "test:coverage": "turbo test:coverage"
  }
}
```

---

## 24. Métricas de qualidade

### 24.1 Métricas coletadas

| Métrica | Coletor | Target | Alerta |
|---------|---------|--------|--------|
| **Coverage** (lines) | Vitest v8 | ≥ 80% (shared ≥ 95%) | Codecov ↓5% em 3 runs |
| **Coverage** (branches) | Vitest v8 | ≥ 75% | Codecov ↓5% em 3 runs |
| **Test pass rate** | Vitest/Playwright | ≥ 95% | Slack alert < 90% |
| **Flakiness** | GitHub Actions retry | ≤ 2% | Slack alert > 5% |
| **Suite duration** | CI timing | ≤ 20 min (CI), ≤ 6h (nightly) | Slack alert > 2x |
| **P95 latency** | k6 | < 3s | Slack alert > 5s |
| **Error rate** | k6 | < 1% | Slack alert > 5% |
| **Parity pass rate** | Parity test | PR: ≥ 90%, Nightly: ≥ 95% | Slack alert < 80% |
| **Security findings** | OWASP ZAP | Zero HIGH/CRITICAL | Immediate alert |
| **MTTR (broken test)** | Issue tracking | ≤ 24h | PagerDuty |
| **Worker restart recovery** | Chaos test | ≤ 30s | Slack alert > 60s |
| **Job loss rate** | Chaos test | 0% | PagerDuty |
| **Webhook latency** | Load test | p95 < 1s | Slack alert > 2s |

### 24.2 Dashboard

- **Grafana** dashboard com:
  - Coverage trend (daily)
  - Test pass/fail rate (daily)
  - Flakiness rate (daily)
  - Parity pass rate by node type (daily)
  - k6 metrics (latency, throughput, error rate) (nightly)
  - Security findings (weekly)

### 24.3 Relatórios

| Relatório | Formato | Local | Frequência |
|-----------|---------|-------|------------|
| **Coverage** | `coverage/lcov.info` | `apps/api/coverage/` | Every CI |
| **Vitest** | JSON + HTML | `apps/api/test-results/` | Every CI |
| **Playwright** | HTML + JSON | `apps/web/test-results/` + `playwright-report/` | Every CI |
| **Parity** | JSON | `n8n-migration/parity-report.json` | Nightly |
| **Load** | k6 summary JSON | `apps/api/tests/load/results/` | Nightly |
| **Security** | HTML + SARIF | `.zap/results/` | Every CI + nightly |
| **Chaos** | JSON | `apps/api/tests/chaos/results/` | Nightly |
| **Execution 24/7** | JSON | `apps/api/tests/integration/24h/results/` | Nightly |

---

## 25. Glossário

| Termo | Definição |
|-------|-----------|
| **AgentFlow** | Plataforma de automação de workflows, recriação do n8n — stack TypeScript (Next.js + Fastify + Prisma + BullMQ) |
| **n8n** | Plataforma de automação visual de referência (open-source), workflows exportados como JSON |
| **Paridade** | Propriedade de dois sistemas produzirem output equivalente para mesma entrada |
| **Fixture** | Arquivo de dados de teste (workflow JSON, expected output, input) |
| **Golden file** | Arquivo com output esperado, usado como oracle |
| **Node fixture** | Fixture específica para um tipo de nó n8n (ex: webhook, httpRequest, if) |
| **Expression** | Sintaxe n8n para acesso a dados: `{{ $json.field }}`, `{{ $node["Name"].json }}` |
| **Topological sort** | Ordenação de nodes em DAG, garantindo execução na ordem correta |
| **Idempotency** | Propriedade de operação produzir mesmo resultado se executada múltiplas vezes |
| **Continue on fail** | Configuração de nó: se falhar, próximos nós continuam executando |
| **Error workflow** | Workflow dedicado que recebe dados do erro de outro workflow |
| **Webhook** | Endpoint HTTP público que dispara um workflow |
| **Cron** | Trigger agendado (schedule) — dispara workflow periodicamente |
| **RBAC** | Role-Based Access Control — owner/admin/editor/viewer |
| **Tenant isolation** | Isolamento de dados entre organizações (orgId em todas queries) |
| **SSRF** | Server-Side Request Forgery — ataque via HTTP node |
| **Replay attack** | Reenvio de webhook com payload já processado |
| **Nonce** | Valor único por requisição, previne replay |
| **TOTP** | Time-based One-Time Password — segunda fator |
| **HMAC-SHA256** | Algoritmo de assinatura de webhook |
| **BullMQ** | Biblioteca de fila/workers (Redis-based) |
| **Testcontainers** | Biblioteca para rodar containers Docker em testes |
| **k6** | Ferramenta de load testing (JavaScript/Go) |
| **Chaos Mesh** | Ferramenta de chaos engineering (Kubernetes) |
| **OWAP ZAP** | Scanner de segurança web automatizado |
| **Flaky test** | Teste que passa/fala aleatoriamente — indica race condition |
| **MTTR** | Mean Time to Recovery — tempo médio para resolver teste quebrado |
| **P95** | 95th percentile — 95% das respostas são mais rápidas que este valor |
| **Coverage** | Porcentagem de código coberta por testes |
| **Mutation testing** | Técnica: modificar código e ver se testes falham |
| **Handoff** | Conclusão de brief — entrega do documento |

---

## 26. Referências cruzadas

| Documento | Uso neste documento |
|-----------|-------------------|
| `briefs/prompt-test-strategy.md` | Brief original — estrutura de 15 seções, min 700 linhas |
| `design-testes.md` | Pirâmide (65/25/10), vitest config, playwright config, fixtures, CI YAML |
| `design-runner.md` | Execution flow, NodeExecutor interface, retry/timeout |
| `design-recriacao.md` | Architecture overview, Prisma models, existing infra |
| `design-seguranca.md` | Criptografia de credenciais (AES-256-GCM) |
| `v2-security-spec.md` | SSRF, RBAC, webhook security, OWASP Top 10 |
| `prompt-engine-spec.md` | Engine execution model, expression eval, sandbox |
| `prompt-node-platform.md` | Node executor interface, node type registry |
| `prompt-execucoes.md` | Execution model, retry, continue-on-fail, error workflow |
| `prompt-aprovacoes.md` | Approval node, wait/resume, human-in-loop |
| `prompt-api-spec.md` | REST API endpoints, auth, pagination, errors |
| `prompt-database-schema.md` | Prisma schema, enums, models |
| `prompt-deploy-cicd.md` | CI/CD pipeline, Docker, deployment |
| `catalogo-nodes.md` | Node type catalog, mapping table |
| `api-n8n.md` | n8n API reference |
| `guia-webhooks.md` | Webhook configuration guide |
| `integracoes-existentes.md` | Existing integrations (Gmail, Telegram, Discord, etc.) |
| `packages/shared/src/n8n-import.ts` | n8n→AgentFlow converter, N8N_TO_AGENTFLOW mapping |
| `apps/api/src/services/executor.ts` | Execution orchestrator (runExecution, enqueueExecution) |
| `apps/api/src/services/queue.ts` | BullMQ queue (enqueueExecution) |
| `apps/api/src/routes/workflows.ts` | Workflow CRUD, import, run |
| `apps/api/src/routes/credentials.ts` | Credential CRUD, encryption |
| `apps/api/src/routes/oauth.ts` | OAuth flow (Google, Microsoft, Apple) |
| `apps/api/src/middleware/auth.ts` | JWT auth, RBAC, orgId extraction |
| `apps/api/src/lib/env.ts` | Environment validation (Zod) |
| `apps/api/test/backend.test.ts` | Existing test pattern (Fastify inject, in-memory adapter) |
| `.github/workflows/ci.yml` | Existing CI pipeline (lint, typecheck, test, build) |
| `packages/shared/src/index.ts` | Zod schemas, node types, NODE_TYPES catalog |
| `packages/database/prisma/schema.prisma` | Prisma models (Workflow, NodeExecution, Credential, Webhook, etc.) |

---

## 27. Roadmap de implementação de testes

| Sprint | Prioridade | Testes | Responsável |
|--------|------------|--------|-------------|
| Sprint 1 | 🔴 Crítica | Unit: schemas, converter, n8n-import.ts | Backend Dev |
| Sprint 1 | 🔴 Crítica | Unit: executor core (topological sort, retry) | Backend Dev |
| Sprint 1 | 🔴 Crítica | Unit: 5 node executors (webhook, http, set, code, condition) | Backend Dev |
| Sprint 2 | 🔴 Crítica | Integration: API CRUD workflows | Backend Dev |
| Sprint 2 | 🔴 Crítica | Integration: API auth + RBAC | Backend Dev |
| Sprint 2 | 🟡 Alta | Integration: webhook trigger | Backend Dev |
| Sprint 2 | 🟡 Alta | Integration: runner with fixtures (3 workflows) | Backend Dev |
| Sprint 3 | 🔴 Crítica | E2E: create workflow, run, verify | Frontend + Backend |
| Sprint 3 | 🔴 Crítica | E2E: import n8n JSON | Frontend |
| Sprint 3 | 🟡 Alta | E2E: webhook trigger external | Backend |
| Sprint 3 | 🟡 Alta | Parity: 10 core fixtures (smoke) | Test Engineer |
| Sprint 4 | 🟡 Alta | Node fixtures: 22 nodes | Backend Dev |
| Sprint 4 | 🟡 Alta | Security: SSRF, expression injection | Security Engineer |
| Sprint 4 | 🟢 Média | Load: 100 parallel executions | DevOps |
| Sprint 5 | 🔴 Crítica | 24/7 execution: cron + webhook + worker restart | Backend Dev |
| Sprint 5 | 🟡 Alta | Chaos: worker kill, DB/Redis down | DevOps |
| Sprint 5 | 🟡 Alta | Offline/always-on: service outages | DevOps |
| Sprint 6 | 🟢 Média | Concurrency: 50 concurrent | Backend Dev |
| Sprint 6 | 🟢 Média | Migration: 5 n8n workflows | Test Engineer |
| Sprint 6 | 🟢 Média | Regression: full suite nightly | Test Engineer |
| Sprint 7 | 🟡 Alta | Full parity: 22 fixtures nightly | Test Engineer |
| Sprint 8 | 🔴 Crítica | Security: full OWASP ZAP + fuzz | Security Engineer |

### 27.1 Critérios de done por sprint

- Sprint 1: 70% unit coverage de `shared/src/` + `executor.ts`
- Sprint 2: 90% integration tests (API CRUD + RBAC + webhooks)
- Sprint 3: 3 E2E flows passando + 10 parity fixtures
- Sprint 4: 22 node fixtures + 5 security tests
- Sprint 5: 24/7 execution + chaos recovery + offline resilience
- Sprint 6: Full concurrency + migration + regression suite
- Sprint 7: Full parity nightly + load tests
- Sprint 8: Full security scan + release gate

---

## 28. Riscos e mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| n8n expression engine diferente | Alta — paridade quebrada | Test suite de expressões com golden files do n8n real |
| Cron timezone handling | Média — execuções fora do horário | Testes de timezone em múltiplos TZ + n8n reference |
| Binary data handling | Média — dados grandes | Fixtures com 1KB a 10MB + MinIO mock |
| Credential encryption | Alta — segurança | Unit tests de AES-256-GCM + security fuzz |
| Webhook replay attack | Alta — segurança | HMAC + nonce + timestamp tests |
| DAG cycle detection | Alta — infinite loop | Unit test com cycle detection |
| Worker crash recovery | Alta — 24/7 reliability | Chaos test: kill worker mid-execution |
| Flaky tests (timing) | Média — CI unreliable | Retry 2x in CI, mock clocks para timing |
| Cross-tenant data leak | Crítica — segurança | RBAC integration tests + fuzzing |
| Expression injection (RCE) | Crítica — segurança | Sandbox Code node + fuzzing + OWASP scan |

---

## 29. Sumário

A estratégia de testes do AgentFlow cobre **16 dimensões de teste** com uma pirâmide equilibrada (65% unit, 25% integration, 10% E2E). A **paridade n8n** é o requisito crítico: 22 node fixtures + golden files + nightly comparison against real n8n (1.42.0) garantem que workflows exportados rodam com comportamento equivalente.

**Pontos críticos:**
1. **Paridade** — blocking gate no PR (≥ 90% fixtures) + nightly full (≥ 95%)
2. **24/7 execution** — workflows cron/webhook sem usuário via worker BullMQ, recovery test
3. **Segurança** — SSRF, expression injection, credential exfiltration, webhook HMAC
4. **CI/CD** — pipeline com stages: lint → typecheck → unit → integration → parity → e2e → security → build
5. **Nightly** — full parity, load (100/1k/10k), chaos (worker kill, DB/Redis down), 24/7, offline, concurrency

**Ferramentas consolidadas:**
- Unit/Integration: Vitest 3.x + Testcontainers
- E2E: Playwright (chromium/firefox/webkit)
- Load: k6
- Security: OWASP ZAP + eslint-plugin-security
- Coverage: Vitest v8 provider (≥ 80% geral, ≥ 95% shared)
- Orquestração: Turbo + GitHub Actions

**Critérios de aceite final:**
- [x] Todas as 16 dimensões de teste cobertas
- [x] Mínimo 700 linhas (este documento: ~1000 linhas)
- [x] Matriz node → teste → status (22 nodes)
- [x] Pipeline CI com stages, time targets e gates
- [x] Testes de execução server-side 24/7 (sem browser, sem sessão)
- [x] Fixtures, oráculos, dados sintéticos, ambientes e critérios de pass/fail definidos
```

Now let me update the todos and finalize.</think>Documento completo produzido com base em todos os achados. Deixo o todo atualizado.<tool_call>todo_write<arg_key>todos</arg_key><arg_value>[{"activeForm": "Compilar achados do contexto v2", "content": "Compilar achados de todo o contexto v2 (docs, arquitetura, código existente)", "status": "completed"}, {"activeForm": "Estruturar a estratégia de testes de paridade n8n", "content": "Estruturar a estratégia de testes de paridade n8n com todas as dimensões", "status": "completed"}, {"activeForm": "Definir fixtures, oráculos, cobertura, ambientes e pipeline CI", "content": "Definir fixtures, oráculos, cobertura, ambientes, dados sintéticos, critérios pass/fail e pipeline CI", "status": "completed"}, {"activeForm": "Produzir o arquivo v2-test-strategy.md", "content": "Produzir n8n-migration/v2-test-strategy.md", "status": "completed"}]