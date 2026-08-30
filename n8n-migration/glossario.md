# Glossário n8n → AgentFlow

> Referência de vocabulário unificada para a missão "Recriar n8n no AgentFlow".  
> Mantido pelo pane **GLOSSÁRIO** — atualize aqui quando surgir termo novo.

---

## (a) Conceitos do n8n

| Termo | Definição |
|-------|-----------|
| **workflow** | Fluxo de automação composto por nós conectados; define a lógica de execução do início ao fim. |
| **node** | Unidade de processamento individual (ex.: HTTP Request, IF, Code); cada nó executa uma ação ou transformação. |
| **connection** | Ligação direcionada entre dois nós que passa dados (output de A → input de B). |
| **trigger** | Nó especial que inicia o workflow (webhook, cron, manual, app event). |
| **webhook** | Endpoint HTTP público que dispara execução ao receber requisição (POST/GET). |
| **credential** | Armazenamento seguro de segredos (API keys, OAuth tokens, senhas) referenciado pelos nós. |
| **execution** | Uma única corrida do workflow; gera logs, dados de entrada/saída e status (sucesso/erro). |
| **active / inactive** | Estado do workflow: *active* = escuta triggers e roda agendamentos; *inactive* = pausado, só roda manual. |
| **pinData** | Dados fixados ("pinados") em nós para testes: permite reexecutar downstream sem rodar upstream. |
| **expression** | Sintaxe `{{ $json.field }}` ou `{{ $node["Nome"].json }}` para acessar dados de execução anterior. |
| **code node** | Nó que executa JavaScript/TypeScript arbitrário para lógica customizada. |
| **IF / Switch / Merge** | Nós de controle de fluxo: IF (branching binário), Switch (múltiplos casos), Merge (junta branches). |
| **retry** | Política de retentativa automática em falha (configurável: tentativas, intervalo, backoff). |
| **timeout** | Tempo máximo de execução de um nó/workflow antes de abortar (previne travamentos). |
| **instance** | Instalação self-hosted do n8n (próprio servidor, banco, fila, workers). |

---

## (b) Conceitos do AgentFlow

| Termo | Definição |
|-------|-----------|
| **monorepo** | Repositório único contendo múltiplos pacotes/apps interdependentes (apps/*, packages/*), gerenciado por pnpm + Turbo. |
| **apps/web** | Frontend Next.js 16 (App Router, React Server Components, Tailwind 4) — porta de entrada do usuário. |
| **apps/api** | Backend Fastify/Express (TypeScript) — API REST, autenticação, webhooks, execução de workflows. |
| **packages/*** | Pacotes internos compartilhados: `database` (Prisma client), `shared` (tipos, utils, validação), `ui` (componentes). |
| **Prisma** | ORM type-safe para PostgreSQL; schema em `packages/database/prisma/schema.prisma`, migrações versionadas. |
| **API route** | Endpoint em `apps/api/src/routes/*.ts` (ex.: `/workflows`, `/executions`, `/credentials`). |
| **server component** | Componente React que roda só no servidor (Next.js RSC) — busca dados, renderiza HTML, sem bundle no client. |
| **client component** | Componente React com `'use client'` — interativo, roda no browser, usa hooks/state. |
| **pnpm** | Gerenciador de pacotes performático, usa hard links + store global; `pnpm-workspace.yaml` define o monorepo. |
| **turbo** | Build system (Turborepo) — cacheia builds, roda tasks em paralelo, orquestra `dev`, `build`, `lint`, `test`. |

---

## (c) Mapeamento n8n → AgentFlow

| n8n | AgentFlow (equivalente) | Notas |
|-----|-------------------------|-------|
| workflow | **Workflow** (entidade Prisma + definição JSON) | Mesma semântica: grafo de nós serializado. |
| node | **Node** (registro em `packages/shared/nodes/`) | Cada tipo de nó = classe TypeScript com `execute()`. |
| connection | **Edge** (campo `connections` no JSON do workflow) | Mesma estrutura: `{ source, target, sourceOutput, targetInput }`. |
| trigger | **TriggerNode** (extends BaseNode) | WebhookTrigger, CronTrigger, ManualTrigger, etc. |
| webhook | **Webhook endpoint** em `apps/api/src/routes/webhooks.ts` | Rota pública `/webhook/:workflowId` valida assinatura e dispara execução. |
| credential | **Credential** (tabela Prisma + Vault) | Criptografado at-rest; injetado no runtime via `credentialResolver`. |
| execution | **Execution** (tabela Prisma + fila BullMQ) | Status: `queued`, `running`, `completed`, `failed`, `canceled`. |
| active/inactive | **Workflow.status** (`ACTIVE` \| `INACTIVE`) | Scheduler só enfileira workflows `ACTIVE`. |
| pinData | **Test fixtures** (`.test/fixtures/`) + `pinData` no ExecutionInput | Para testes locais e reprodutibilidade em CI. |
| expression | **Template engine** (`packages/shared/expressions/`) | Sintaxe compatível: `{{ $json.x }}`, `{{ $node["N"].json.y }}`. |
| code node | **CodeNode** (sandbox vm2 / isolated-vm) | Executa JS/TS com timeout, sem acesso a `require`/`fs` perigoso. |
| IF / Switch / Merge | **ControlFlowNodes** (IfNode, SwitchNode, MergeNode) | Lógica pura TypeScript, testável unitariamente. |
| retry | **Retry policy** no Job (BullMQ `attempts`, `backoff`) | Configurável por nó ou global no workflow. |
| timeout | **Job timeout** (BullMQ `jobTimeout`) + node-level `executionTimeout` | Dois níveis: fila (hard) e nó (soft, lançável). |
| instance | **AgentFlow deployment** (Vercel web + Render API + Postgres) | "Instância" = ambiente provisionado (prod/staging/preview). |

---

## (d) Termos de Infraestrutura

| Termo | Definição |
|-------|-----------|
| **Vercel** | Plataforma serverless para o frontend (`apps/web`): deploy automático, preview deployments, edge functions, domínio customizado. |
| **Render** | PaaS para o backend (`apps/api`) + workers: serviço web persistente, background workers, cron jobs, Postgres gerenciado. |
| **Postgres** | Banco de dados relacional principal (supabase/Render/Neon); armazena workflows, execuções, credenciais, usuários, orgs. |
| **fila** | **BullMQ** sobre Redis (Render Redis ou Upstash) — processa execuções assíncronas, retries, agendamentos, rate limiting. |
| **cron** | Agendador nativo do n8n → no AgentFlow: **CronTriggerNode** + **BullMQ repeatable jobs** (cron syntax padrão). |
| **ngrok / túnel** | Ferramenta de túnel HTTPS para expor `localhost` na web (dev local de webhooks); em prod substituído por domínios Vercel/Render. |

---

## Convenções de Nomenclatura (para o time)

- **PascalCase**: Tipos, classes, componentes React (`Workflow`, `CodeNode`, `ServerComponent`).
- **camelCase**: Variáveis, funções, propriedades JSON (`workflowId`, `executeNode`, `pinData`).
- **UPPER_SNAKE_CASE**: Constantes de ambiente, enums de status (`EXECUTION_STATUS`, `NODE_TYPE`).
- **kebab-case**: Arquivos, rotas, pacotes npm (`webhook-handler.ts`, `@agentflow/shared`).
- **Prefixo `$`**: Apenas em expressões n8n-compatíveis (`$json`, `$node`, `$parameter`).

---

_Total de termos: **42** (15 n8n + 10 AgentFlow + 15 mapeamento + 6 infra)_