# Mapa do Repositório AgentFlow

Monorepo pnpm + Turborepo. Prisma + PostgreSQL. Next.js (web) + Fastify (api). TypeScript.

## Estrutura

```
AgentFlow/
├── apps/
│   ├── web/        Next.js App Router (UI)
│   └── api/        Fastify (REST API + worker)
├── packages/
│   ├── database/   Prisma schema + seed
│   └── shared/     Tipos/utilitários compartilhados
├── package.json    pnpm@9.15.0, turbo ^2.4, eslint 9, tsx, typescript ^5.7
├── turbo.json
├── pnpm-workspace.yaml
└── .vercelignore   (node_modules,.git,.vercel,.next,build,*.md,.env*, .DS_Store,apps/api,packages/database,packages/database/prisma/migrations)
```

## Comandos (raiz)

- `pnpm dev` / `dev:api` / `dev:web` — dev servers (api 3001, web 3000)
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (via turbo)
- `pnpm db:migrate` / `db:push` / `db:seed` / `db:studio`

## apps/api (Fastify)

- `src/server.ts` — bootstrap
- `src/worker.ts` — background worker
- `src/services/queue.ts` — fila (BullMQ)
- `src/services/executor.ts` — **motor de execução de workflows (já existe!)**
- `src/routes/` — auth, workflows, webhooks, executions, credentials, approvals, apikeys, ai, billing, orgs, oauth, settings, health
- `src/middleware/` — auth (JWT), quota
- `src/lib/` — prisma (singleton), crypto (AES-256-GCM p/ credenciais), env, plans, pagination, store, refresh-tokens
- `src/docs/openapi.ts`

## apps/web (Next.js)

- Páginas: `/` (landing), `/dashboard`, `/workflows`, `/workflows/[id]/editor`, `/executions`, `/executions/[id]`, `/credentials`, `/approvals`, `/settings`, `/billing`, `/login`, `/register`, `/forgot-password`, `/auth/callback`
- `src/components/workflow/` — **WorkflowCanvas** (canvas), NodePalette, NodeConfigPanel, AIGeneratorModal, nodes/ (TriggerNode, LogicNode, ActionNode, AdvancedNode, BaseNode)
- `src/components/ui/` — Button, Card, Badge, Input, Select, Modal, Tabs, Progress, LoadingSpinner, EmptyState
- `src/lib/` — workflow.ts, api.ts, utils.ts, mock-data.ts

## packages/database — schema Prisma (406 linhas, completo)

Modelos: User, Organization, OrganizationMember, **Workflow, WorkflowVersion (snapshot JSON), WorkflowNode (type: webhook|cron|http|email|discord|telegram|sheets|condition|transform|delay|ai_agent|approval; config JSON; position), WorkflowEdge (com condition p/ edges condicionais)**, **WorkflowExecution (status, trigger, input/output, erro), NodeExecution (retryCount, idempotencyKey)**, **Credential (type: api_key|oauth2|basic|token; data = JSON encriptado)**, Integration, **Webhook (path, secret, method, active, unique [orgId,path])**, Approval, UsageRecord, Subscription (Stripe), AuditLog, ApiKey, RefreshToken.

Enums: Plan (FREE..PRO), MemberRole (OWNER..VIEWER), WorkflowStatus (DRAFT/ACTIVE/PAUSED/ARCHIVED), ExecutionStatus (PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/WAITING_APPROVAL), ApprovalStatus.

## Conclusão p/ migração

O AgentFlow **já possui a infraestrutura núcleo de um n8n**: schema de workflows/nodes/edges/executions/webhooks/credenciais, motor de execução (executor.ts + queue + worker), editor visual (WorkflowCanvas + React Flow), rotas REST completas, encriptação de credenciais (crypto.ts AES-256-GCM), webhooks com secret/HMAC. A migração dos 3 workflows do n8n é majoritariamente **adaptação + extensão do existente** (mapear JSON n8n → modelos, implementar handlers de node faltantes como Gmail/Sheets/Telegram, garantir parity de execução), não greenfield.