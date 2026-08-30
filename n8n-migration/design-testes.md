# Estratégia de Testes — AgentFlow Workflow Editor/Runner

> **Missão:** Recriar n8n no AgentFlow  
> **Escopo:** Editor visual + Runner de workflows (monorepo Next.js 15 + Fastify + Prisma)  
> **Entregável:** `n8n-migration/design-testes.md`  
> **Padrões base:** Regras do repo (`.claude/rules/*`), CI existente (`.github/workflows/ci.yml`), package.json do `@agentflow/api` e `@agentflow/web`

---

## (a) Pirâmide de Testes

```
                    ┌─────────────────────┐
                    │     E2E (Playwright)│  ← 10-15%  — Fluxos críticos usuário→API→DB
                    │  (web + api integr.)│
           ┌────────┴────────┬────────────┴────────┐
           │                 │                     │
    ┌──────┴──────┐   ┌─────┴─────┐         ┌─────┴─────┐
    │  Integration│   │  Integration│     │  Integration│  ← 25-30% — API CRUD, Webhooks, Runner node-a-node
    │   (API)     │   │  (Runner)  │     │  (DB/Prisma)│
    └──────┬──────┘   └─────┬─────┘         └─────┬─────┘
           │                 │                     │
           └────────┬────────┴─────────────────────┘
                    │
           ┌────────┴────────┐
           │    Unit (Vitest)│  ← 60-70% — Validação JSON, Conversor, Utils, Schemas Zod
           │  (shared + api) │
           └─────────────────┘
```

**Distribuição alvo por camada:**

| Camada | % do total | Ferramenta | Foco |
|--------|------------|------------|------|
| **Unit** | 65% | Vitest | Validação de schemas, conversor n8n→AgentFlow, utilitários puros, Zod schemas, pure functions |
| **Integration** | 25% | Vitest + Testcontainers/Postgres | API endpoints (CRUD workflows, execuções, credenciais), Runner node-a-node com fixtures, webhooks, Prisma operations |
| **E2E** | 10% | Playwright | Fluxos completos: criar workflow no editor → salvar → executar → ver resultado; webhook trigger → resposta; retry/erro |

---

## (b) O que Testar por Camada

### 1. Unit Tests (Vitest — `apps/api/tests/unit/`, `packages/shared/tests/`)

| Módulo / Área | Casos de Teste Obrigatórios |
|--------------|----------------------------|
| **Validação Workflow JSON** (`shared/src/workflow/schema.ts`) | ✅ Schema Zod valida: nodes[], connections[], settings, meta, trigger config, version<br>✅ Rejeita: nodes duplicados (id), connections para node inexistente, trigger ausente, tipos de node desconhecidos<br>✅ Coerção: `position` normalizado, `disabled` boolean, `executeOnce` boolean |
| **Conversor n8n → AgentFlow** (`shared/src/workflow/converter.ts`) | ✅ Mapeia: `Start`→`trigger`, `HTTP Request`→`httpRequest`, `Set`→`set`, `IF`→`if`, `Switch`→`switch`, `Code`→`function`, `Webhook`→`webhook`, `Cron`→`cron`<br>✅ Preserva: `position`, `parameters`, `credentials`, `disabled`<br>✅ Converte expressions: `{{ $json.field }}` → `{{$json.field}}` (AgentFlow syntax)<br>✅ Trata: sub-workflows (Execute Workflow), error workflow, pinData |
| **Runner — Node Executors** (`api/src/services/executor/nodes/`) | ✅ Cada node type: input schema validation, output schema, error handling, timeout, retry logic<br>✅ `httpRequest`: method, url, headers, body, query, auth, response parsing, redirect, timeout<br>✅ `set`: keepOnlySet, values (string, expression, json), multiple items<br>✅ `if`/`switch`: condition evaluation (boolean, string, number, exists, regex), branch selection<br>✅ `function` (code node): sandbox execution, allowed globals, timeout, memory limit<br>✅ `webhook`: path registration, method filtering, response handling (respond node)<br>✅ `cron`: trigger scheduling, timezone, manual trigger |
| **Runner — Core** (`api/src/services/executor/core.ts`) | ✅ Topological sort execution order<br>✅ Data passing between nodes (item linking, `$node["Name"].json`)<br>✅ Error workflow execution on failure<br>✅ Continue on fail (node setting)<br>✅ Execution timeout (workflow + per-node)<br>✅ Memory/CPU limits per execution<br>✅ Pin data (debug) |
| **Credentials System** (`api/src/lib/credentials.ts`) | ✅ Encryption/decryption (AES-256-GCM), rotation<br>✅ Credential types: OAuth2, API Key, Header Auth, Generic<br>✅ Test connection per credential type |
| **Utils / Helpers** | ✅ Expression evaluation (`{{ $json.x }}`), date formatting, array helpers, object path access |

### 2. Integration Tests (Vitest — `apps/api/tests/integration/`)

| Área | Casos de Teste Obrigatórios |
|------|----------------------------|
| **API CRUD Workflows** (`POST/GET/PUT/DELETE /api/workflows`) | ✅ Create: valida body, retorna 201 + workflow com id, createdAt<br>✅ List: paginação, filtro por `active`, `tags`, busca por nome<br>✅ Get by id: 404 se inexistente, inclui nodes/connections<br>✅ Update: partial update, valida versão (optimistic lock via `updatedAt`)<br>✅ Delete: cascade (executions, webhooks), soft vs hard delete<br>✅ Duplicate: POST `/api/workflows/:id/clone` |
| **API Execuções** (`POST /api/workflows/:id/execute`, `GET /api/executions`) | ✅ Execução síncrona (wait=true) retorna output final<br>✅ Execução assíncrona (wait=false) retorna executionId + status `running`<br>✅ Get execution: status, startedAt, finishedAt, nodes output, error<br>✅ Cancel execution: `POST /api/executions/:id/cancel`<br>✅ Retry execution: `POST /api/executions/:id/retry` (from failed node) |
| **Runner Node-a-Node com Fixtures** | ✅ Carrega fixture JSON → executa runner → compara output node a node com expected fixture<br>✅ Testa cada node type isolado + encadeamento<br>✅ Valida: input data, output data, execution metadata (timing, memory) |
| **Webhooks** (`POST /webhook/:path`) | ✅ Registra webhook no deploy/activate workflow<br>✅ Recebe request → executa workflow → retorna response do Respond Webhook node<br>✅ Method filtering (GET/POST/PUT/DELETE/PATCH)<br>✅ Header/Query/Body parsing<br>✅ Webhook signature verification (HMAC)<br>✅ Rate limiting per webhook path<br>✅ Webhook desativado retorna 404/410 |
| **API Credentials/Org/Users** | ✅ CRUD credentials com encryption<br>✅ Org membership, roles, invitations<br>✅ OAuth callbacks (GitHub, Google, Microsoft) |
| **Database / Prisma** | ✅ Migrations aplicam limpo<br>✅ RLS policies (multi-tenant isolation)<br>✅ Unique constraints, foreign keys, indexes<br>✅ Soft delete (deletedAt) filters automáticos |

### 3. E2E Tests (Playwright — `apps/web/tests/e2e/`)

| Fluxo Crítico | Cenários |
|--------------|----------|
| **Editor — Criar & Salvar Workflow** | ✅ Drag nodes do painel → canvas, conectar, configurar parâmetros, salvar<br>✅ Undo/Redo, zoom, pan, select multiplo, alinhar<br>✅ Validação visual: conexões inválidas destacadas, node sem trigger alerta |
| **Editor — Importar n8n JSON** | ✅ Upload `.json` n8n → preview diff → confirmar import → workflow editável |
| **Execução — Run Manual** | ✅ Botão "Execute Workflow" → modal progresso node-a-node → resultado final (output JSON)<br>✅ Execução com erro → mostra node falho + error message → botão "Retry from failed" |
| **Webhook — Trigger Externo** | ✅ Deploy workflow com Webhook node → curl POST → vê execução na lista → response correta |
| **Cron — Agendamento** | ✅ Ativa workflow com Cron trigger → verifica nextRunAt → execução automática no horário |
| **Branching — IF/Switch** | ✅ Input verdadeiro → branch true executada; falso → branch false<br>✅ Switch: múltiplas cases + fallback |
| **Error Handling** | ✅ Node falha → error workflow executado (se configurado) → notificação<br>✅ Continue on fail → prossomos nodes executam com error no item |
| **Persistência & Compartilhamento** | ✅ Share link (read-only) → abre editor sem editar → executa<br>✅ Version history: restore versão anterior |

---

## (c) Frameworks e Ferramentas (Conforme Padrões do Repo)

| Camada | Ferramenta | Justificativa / Configuração |
|--------|------------|------------------------------|
| **Unit / Integration (API)** | **Vitest 3.x** | Já no `package.json` do `@agentflow/api` (`devDependencies`). Usa `node:test` nativo no smoke test, mas Vitest para suite completa. Config: `vitest.config.ts` na raiz do `apps/api/` |
| **Unit / Integration (Web/Shared)** | **Vitest + @testing-library/react** | Para components React (editor nodes, panels). `@testing-library/react` já compatível com React 19. |
| **E2E** | **Playwright** | Regra `.claude/rules/typescript/testing.md`: *"Use Playwright as the E2E testing framework for critical user flows."* + `e2e-runner` agent disponível. |
| **Test Runner Orchestration** | **Turbo** | `turbo test` roda tests em todos packages (conforme `turbo.json` + `package.json` root) |
| **Database (Integration)** | **PostgreSQL 16 (Testcontainers ou CI service)** | CI já sobe Postgres 16 como service. Local: `testcontainers` ou Docker Compose. Prisma `migrate deploy` no CI. |
| **Mocking** | **vi (Vitest built-in)** | `vi.fn()`, `vi.mock()`, `vi.spyOn()`. Para HTTP: `msw` (Mock Service Worker) se necessário. |
| **Coverage** | **Vitest --coverage (v8 provider)** | Target ≥ 80% (conforme `.claude/rules/testing.md`). Report: `lcov`, `html`, `json`. |
| **Type Checking** | **tsc --noEmit** | Já no CI (`typecheck` job). Rodar antes dos tests. |
| **Lint** | **ESLint 9 + Prettier** | Já no CI (`lint` job). `eslint-plugin-vitest` para regras de teste. |

### Configuração Vitest Sugerida (`apps/api/vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/test/**', '**/tests/**'],
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: false } },
  },
  resolve: {
    alias: {
      '@agentflow/shared': path.resolve(__dirname, '../packages/shared/src'),
      '@agentflow/database': path.resolve(__dirname, '../packages/database/src'),
    },
  },
});
```

### Configuração Playwright Sugerida (`apps/web/playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

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

---

## (d) Fixtures de Workflows de Exemplo

> Localização: `apps/api/tests/fixtures/workflows/` (JSON) + `apps/api/tests/fixtures/expected/` (outputs esperados)

### 1. `webhook-set-respond.json` — Webhook → Set → Respond Webhook

```json
{
  "name": "Webhook Echo",
  "nodes": [
    { "id": "1", "type": "n8n-nodes-base.webhook", "position": [250, 300], "parameters": { "path": "echo", "method": "POST" }, "name": "Webhook" },
    { "id": "2", "type": "n8n-nodes-base.set", "position": [500, 300], "parameters": { "keepOnlySet": true, "values": { "string": [{ "name": "echo", "value": "Received: {{$json.body.message}}" }] } }, "name": "Set Response" },
    { "id": "3", "type": "n8n-nodes-base.respondToWebhook", "position": [750, 300], "parameters": { "options": { "responseCode": 200 }, "responseData": "{{$json.echo}}" }, "name": "Respond" }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Set Response", "type": "main", "index": 0 }]] },
    "Set Response": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" }
}
```

**Expected Output (fixture):**
```json
{
  "input": { "body": { "message": "Hello World" }, "query": {}, "headers": {} },
  "nodeOutputs": {
    "Webhook": [{ "json": { "body": { "message": "Hello World" }, "query": {}, "headers": {} } }],
    "Set Response": [{ "json": { "echo": "Received: Hello World" } }],
    "Respond": [{ "json": "Received: Hello World" }]
  },
  "finalOutput": "Received: Hello World",
  "status": "success"
}
```

---

### 2. `cron-http.json` — Cron → HTTP Request

```json
{
  "name": "Daily API Poll",
  "nodes": [
    { "id": "1", "type": "n8n-nodes-base.cron", "position": [250, 300], "parameters": { "triggerTimes": { "item": [{ "hour": 6, "minute": 0 }] }, "timezone": "America/Sao_Paulo" }, "name": "Daily 6AM" },
    { "id": "2", "type": "n8n-nodes-base.httpRequest", "position": [500, 300], "parameters": { "method": "GET", "url": "https://api.example.com/data", "authentication": "none", "options": { "timeout": 30000 } }, "name": "Fetch Data", "credentials": { "httpBasicAuth": "api-credentials" } }
  ],
  "connections": {
    "Daily 6AM": { "main": [[{ "node": "Fetch Data", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" }
}
```

**Expected:** Execução manual (`wait=true`) retorna dados da API; execução agendada cria execution record com `mode: "cron"`.

---

### 3. `if-switch-branch.json` — IF / Switch Branching

```json
{
  "name": "Conditional Routing",
  "nodes": [
    { "id": "1", "type": "n8n-nodes-base.webhook", "position": [250, 100], "parameters": { "path": "route", "method": "POST" }, "name": "Webhook" },
    { "id": "2", "type": "n8n-nodes-base.if", "position": [500, 100], "parameters": { "conditions": { "string": [{ "value1": "{{$json.body.type}}", "operation": "equal", "value2": "premium" }] } }, "name": "Check Premium" },
    { "id": "3", "type": "n8n-nodes-base.set", "position": [750, 50], "parameters": { "keepOnlySet": true, "values": { "string": [{ "name": "tier", "value": "premium" }] } }, "name": "Premium Path" },
    { "id": "4", "type": "n8n-nodes-base.set", "position": [750, 150], "parameters": { "keepOnlySet": true, "values": { "string": [{ "name": "tier", "value": "standard" }] } }, "name": "Standard Path" },
    { "id": "5", "type": "n8n-nodes-base.switch", "position": [500, 300], "parameters": { "rules": { "string": [{ "value1": "{{$json.body.category}}", "operation": "equal", "value2": "sales", "output": 0 }, { "value1": "{{$json.body.category}}", "operation": "equal", "value2": "support", "output": 1 }] } }, "name": "Category Switch" },
    { "id": "6", "type": "n8n-nodes-base.set", "position": [750, 250], "parameters": { "values": { "string": [{ "name": "dept", "value": "sales" }] } }, "name": "Sales Dept" },
    { "id": "7", "type": "n8n-nodes-base.set", "position": [750, 350], "parameters": { "values": { "string": [{ "name": "dept", "value": "support" }] } }, "name": "Support Dept" },
    { "id": "8", "type": "n8n-nodes-base.set", "position": [750, 450], "parameters": { "values": { "string": [{ "name": "dept", "value": "other" }] } }, "name": "Other Dept" }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Check Premium", "type": "main", "index": 0 }]] },
    "Check Premium": { "main": [[{ "node": "Premium Path", "type": "main", "index": 0 }], [{ "node": "Standard Path", "type": "main", "index": 0 }]] },
    "Category Switch": { "main": [[{ "node": "Sales Dept", "type": "main", "index": 0 }], [{ "node": "Support Dept", "type": "main", "index": 1 }], [{ "node": "Other Dept", "type": "main", "index": 2 }]] }
  },
  "active": false
}
```

**Test Cases:**
- Input `{ type: "premium", category: "sales" }` → Premium Path + Sales Dept
- Input `{ type: "standard", category: "support" }` → Standard Path + Support Dept
- Input `{ type: "standard", category: "billing" }` → Standard Path + Other Dept (fallback)

---

### 4. `error-retry.json` — Error Handling + Retry

```json
{
  "name": "Resilient HTTP Call",
  "nodes": [
    { "id": "1", "type": "n8n-nodes-base.webhook", "position": [250, 300], "parameters": { "path": "retry-demo", "method": "POST" }, "name": "Webhook" },
    { "id": "2", "type": "n8n-nodes-base.httpRequest", "position": [500, 300], "parameters": { "method": "POST", "url": "https://unreliable-api.example.com/process", "options": { "timeout": 10000 }, "retryOnFail": true, "maxTries": 3, "waitBetweenTries": 1000 }, "name": "Unreliable API", "settings": { "continueOnFail": false } },
    { "id": "3", "type": "n8n-nodes-base.set", "position": [750, 300], "parameters": { "keepOnlySet": true, "values": { "string": [{ "name": "status", "value": "success" }] } }, "name": "Success" },
    { "id": "4", "type": "n8n-nodes-base.set", "position": [750, 450], "parameters": { "keepOnlySet": true, "values": { "string": [{ "name": "status", "value": "failed_after_retry" }, { "name": "error", "value": "{{$node[\"Unreliable API\"].error.message}}" }] } }, "name": "Failed" }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Unreliable API", "type": "main", "index": 0 }]] },
    "Unreliable API": { "main": [[{ "node": "Success", "type": "main", "index": 0 }], [{ "node": "Failed", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "errorWorkflow": "error-handler-workflow-id"
}
```

**Test Cases:**
- API responde 200 na 1ª tentativa → Success path
- API falha 2x, succeeds na 3ª → Success path (retry funcionou)
- API falha 3x → Failed path + error workflow triggered

---

## (e) Cobertura Mínima Alvo

| Métrica | Target | Onde Medir |
|---------|--------|------------|
| **Lines** | **≥ 80%** | `vitest --coverage` (v8 provider) |
| **Functions** | **≥ 80%** | Idem |
| **Branches** | **≥ 75%** | Idem (branching logic no runner/converter) |
| **Statements** | **≥ 80%** | Idem |
| **E2E Critical Flows** | **100%** | Playwright — todos fluxos da seção (b) cobertos |

**Regras de Cobertura:**
- `shared/src/workflow/` (schemas, converter, types): **≥ 95%** — núcleo do sistema
- `api/src/services/executor/` (runner core + nodes): **≥ 90%** — execução é crítica
- `api/src/routes/` (API endpoints): **≥ 85%** — contratos públicos
- `web/src/components/editor/` (React components): **≥ 70%** — UI testada via E2E
- **Exclusões:** `*.d.ts`, `dist/`, `tests/`, `migrations/`, config files

**Gate de CI:** Job `test` falha se `coverage thresholds` não atingidos (config no `vitest.config.ts`).

---

## (f) CI — Como Rodar nos GitHub Workflows

### Pipeline Atual (`.github/workflows/ci.yml`) — Extensões Necessárias

```yaml
# Adicionar ao job 'test' existente ou criar job 'test:workflow'
test:
  name: Test (incl. Workflow Engine)
  runs-on: ubuntu-latest
  timeout-minutes: 20
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: agentflow
        POSTGRES_PASSWORD: agentflow_dev
        POSTGRES_DB: agentflow_test
      ports: [5432:5432]
      options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    redis:
      image: redis:7-alpine
      ports: [6379:6379]
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
    # --- NOVOS PASSOS PARA WORKFLOW ENGINE ---
    - name: Run Unit Tests (shared + api)
      run: pnpm --filter @agentflow/shared test && pnpm --filter @agentflow/api test
    - name: Run Integration Tests (api)
      run: pnpm --filter @agentflow/api test:integration
      env:
        TEST_FIXTURES_PATH: ./tests/fixtures/workflows
    - name: Build web for E2E
      run: pnpm --filter @agentflow/web build
      env:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    - name: Start API server for E2E
      run: pnpm --filter @agentflow/api start &
      env:
        PORT: 3001
    - name: Run E2E Tests (Playwright)
      run: pnpm --filter @agentflow/web test:e2e
    - name: Upload coverage
      uses: codecov/codecov-action@v4
      with:
        files: ./coverage/lcov.info
        flags: unittests
    - name: Upload Playwright report
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: apps/web/test-results/
        retention-days: 7
```

### Novos Scripts no `package.json`

**`apps/api/package.json`:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

**`apps/web/package.json`:**
```json
{
  "scripts": {
    "test": "vitest run",
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
    "test:coverage": "turbo test:coverage"
  }
}
```

---

## (g) Testes de Regressão: n8n vs AgentFlow

### Objetivo
Garantir paridade comportamental: dado o mesmo workflow JSON n8n e mesmo input, o AgentFlow produz output **idêntico** (ou semanticamente equivalente) ao n8n.

### Estratégia

#### 1. **Suite de Paridade Automatizada** (`apps/api/tests/regression/n8n-parity.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { executeWorkflow } from '@agentflow/api/executor';
import { convertN8nToAgentFlow } from '@agentflow/shared/workflow/converter';
import * as path from 'path';
import * as fs from 'fs';

// Carrega todos os fixtures de paridade
const PARITY_FIXTURES_DIR = path.resolve(__dirname, 'fixtures/parity');

describe('n8n → AgentFlow Behavioral Parity', () => {
  const fixtureFiles = fs.readdirSync(PARITY_FIXTURES_DIR).filter(f => f.endsWith('.json'));

  for (const file of fixtureFiles) {
    const fixture = JSON.parse(fs.readFileSync(path.join(PARITY_FIXTURES_DIR, file), 'utf-8'));
    
    it(`matches n8n output for: ${fixture.name}`, async () => {
      // 1. Converte workflow n8n → AgentFlow
      const agentFlowWorkflow = convertN8nToAgentFlow(fixture.workflow);
      
      // 2. Executa no AgentFlow runner
      const result = await executeWorkflow(agentFlowWorkflow, fixture.input, {
        mode: 'test',
        wait: true,
      });
      
      // 3. Compara com expected output do n8n (pre-gravado)
      expect(normalizeForComparison(result.output)).toEqual(
        normalizeForComparison(fixture.expectedOutput)
      );
      
      // 4. Valida metadata de execução (timing aproximado, nodes executados)
      expect(result.nodeExecutionOrder).toEqual(fixture.expectedNodeOrder);
      expect(result.status).toBe(fixture.expectedStatus);
    });
  }
});

function normalizeForComparison(obj: any): any {
  // Remove campos non-determinísticos: executionId, timestamps, memory usage
  const { executionId, startedAt, finishedAt, memoryUsage, ...rest } = obj;
  if (Array.isArray(rest)) return rest.map(normalizeForComparison);
  if (typeof rest === 'object' && rest !== null) {
    const normalized: any = {};
    for (const [k, v] of Object.entries(rest)) {
      normalized[k] = normalizeForComparison(v);
    }
    return normalized;
  }
  return rest;
}
```

#### 2. **Fixtures de Paridade** (`apps/api/tests/fixtures/parity/`)

Cada arquivo contém:
```json
{
  "name": "HTTP Request com auth + retry",
  "workflow": { ... n8n workflow JSON ... },
  "input": { "body": { "data": "test" } },
  "expectedOutput": { "json": { "status": "ok" } },
  "expectedNodeOrder": ["Webhook", "HTTP Request", "Set", "Respond"],
  "expectedStatus": "success",
  "n8nVersion": "1.42.0",
  "notes": "Testa retry 3x com backoff exponencial"
}
```

#### 3. **Execução de Referência n8n** (Offline/CI Opcional)

- Rodar n8n em container (`docker run -d -p 5678:5678 n8nio/n8n:1.42.0`)
- Script `tests/regression/generate-parity-fixtures.ts`:
  1. Importa cada workflow fixture no n8n via API
  2. Executa com input definido
  3. Captura output + execution metadata
  4. Salva como `expectedOutput` no fixture
- **Nota:** Rodar localmente / nightly; não bloquear CI principal (n8n container pesado)

#### 4. **Critérios de Aceitação de Paridade**

| Critério | Tolerância |
|----------|------------|
| **Output JSON final** | Igualdade exata (após normalização de timestamps/IDs) |
| **Ordem de execução nodes** | Idêntica (topological sort determinístico) |
| **Error messages** | Semanticamente equivalentes (mesmo tipo erro, mensagem pode variar) |
| **Retry behavior** | Mesmo número de tentativas, mesmo backoff |
| **Expression evaluation** | `{{ $json.x }}` → mesmo resultado |
| **Webhook response** | Status code + body idênticos |

#### 5. **Relatório de Diferenças**

Gerar `parity-report.json` no CI com:
```json
{
  "total": 47,
  "passed": 44,
  "failed": 3,
  "differences": [
    {
      "fixture": "error-retry.json",
      "node": "Unreliable API",
      "agentflow": { "tries": 3, "lastError": "ECONNREFUSED" },
      "n8n": { "tries": 3, "lastError": "connect ECONNREFUSED 127.0.0.1:80" },
      "severity": "LOW",
      "note": "Error message format differs, behavior identical"
    }
  ]
}
```

---

## Resumo de Implementação (Próximos Passos)

| Item | Ação | Responsável |
|------|------|-------------|
| 1. Criar `vitest.config.ts` em `apps/api/` e `apps/web/` | Configurar coverage thresholds, aliases, setup | Test Engineer |
| 2. Criar `playwright.config.ts` em `apps/web/` | Configurar projects, webServer, reporters | Test Engineer |
| 3. Estruturar pastas de teste | `tests/unit`, `tests/integration`, `tests/fixtures/workflows`, `tests/fixtures/parity`, `tests/e2e` | Test Engineer |
| 4. Implementar Unit Tests (schemas, converter, nodes) | TDD: test first → implement | Backend Dev + Test Engineer |
| 5. Implementar Integration Tests (API, Runner, Webhooks) | Usar fixtures node-a-node | Backend Dev |
| 6. Implementar E2E Tests (Editor flows) | Playwright + data-testid attributes | Frontend Dev + Test Engineer |
| 7. Atualizar CI (`.github/workflows/ci.yml`) | Adicionar steps de integration + e2e | DevOps |
| 8. Criar suite de regressão n8n parity | Fixtures + comparison harness | Test Engineer |
| 9. Documentar como rodar localmente | `TESTING.md` na raiz do `n8n-migration/` | Test Engineer |

---

## Referências

- `.claude/rules/testing.md` — Requisitos mínimos 80% coverage, TDD workflow
- `.claude/rules/typescript/testing.md` — Playwright para E2E
- `apps/api/package.json` — Vitest 3.x, scripts de test
- `.github/workflows/ci.yml` — Pipeline atual (lint, typecheck, test, build)
- `turbo.json` — Orquestração de tasks via Turbo
- n8n Node Types Reference: https://docs.n8n.io/integrations/builtin/nodes/