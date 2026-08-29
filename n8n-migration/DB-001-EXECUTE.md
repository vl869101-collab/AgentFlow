# DB-001: Baseline Migration Execution & Disaster Recovery Guide

Este documento detalha a estratégia de baseline migration (`000000000000_baseline`) para o banco de dados PostgreSQL do **AgentFlow** (Render / Produção / Ambientes locais).

---

## ⚠️ AVISO CRÍTICO DE SEGURANÇA E AMBIENTE LOCAL
- **Nenhum comando de migração live (`prisma migrate dev`, `prisma migrate deploy` ou `prisma db push`) deve ser executado localmente sem `DATABASE_URL` real configurada.**
- Operações locais devem ser estritamente non-destructive e offline (`prisma migrate diff`, `prisma validate`, `prisma generate`).

---

## 1. Banco Render EXISTENTE (Já populado / Schema já aplicado)

Se o banco de dados do Render já possui as tabelas criadas (ex: via `db push` anterior ou sincronização direta) e precisa apenas registrar a migração baseline no histórico do Prisma (`_prisma_migrations`):

Execute no **Shell do Render** (ou em ambiente com a `DATABASE_URL` de produção configurada):

```bash
pnpm --filter @agentflow/database exec prisma migrate resolve --applied 000000000000_baseline
```

Isso registrará a migration `000000000000_baseline` como já executada/aplicada, evitando que o Prisma tente recriar tabelas existentes ou falhe em deploys futuros.

---

## 2. Banco NOVO / Disaster Recovery / Fresh Instance

Para provisionar um novo banco de dados a partir do zero ou em caso de disaster recovery:

Execute no ambiente de deploy / CI/CD (com `DATABASE_URL` configurada):

```bash
pnpm --filter @agentflow/database exec prisma migrate deploy
```

O Prisma executará a migration baseline `000000000000_baseline/migration.sql`, criando todos os Enums, Tabelas, Índices e Foreign Keys de forma idempotente e segura.

---

## 3. Estrutura da Migration Baseline

Arquivo: `packages/database/prisma/migrations/000000000000_baseline/migration.sql`

- **Enums Criados**: `Plan`, `MemberRole`, `WorkflowStatus`, `ExecutionStatus`, `ApprovalStatus`
- **Tabelas Principais**:
  - `User`, `Account`, `RefreshToken`, `ApiKey`
  - `Organization`, `OrganizationMember`
  - `Workflow`, `WorkflowVersion`, `WorkflowNode`, `WorkflowEdge`
  - `WorkflowExecution`, `NodeExecution`, `Approval`
  - `Credential`, `Integration`, `Webhook`
  - `UsageRecord`, `Subscription`, `AuditLog`
- **Características**: Schema 100% aditivo (sem `DROP TABLE` ou `DROP COLUMN` destrutivos).
