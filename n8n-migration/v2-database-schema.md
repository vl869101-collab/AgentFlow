# Schema PostgreSQL — AgentFlow

> **Missão**: Recriar n8n no AgentFlow — schema PostgreSQL completo multi-tenant
> **Work dir**: `n8n-migration/`
> **Referências**: `prompt-database-schema.md`, `design-seguranca.md`, `v2-security-spec.md`, `reference-n8n.md`, `design-recriacao.md`, `design-runner.md`, `repo-map.md`, `prompt-execucoes.md`
> **Status**: DESIGN — não implementar, não aplicar migração

Este documento define o modelo de dados PostgreSQL completo da plataforma AgentFlow.
É a fonte de verdade para a fase de planejamento: todas as tabelas, enums, colunas,
índices, constraints, políticas RLS multi-tenant, estratégia de migrações e
considerações de backup/restore. O DDL é compatível com PostgreSQL 15+ (usa
`funcs` de `pgcrypto`, `pg_trgm`, `pg_partman`-style range partitioning nativo,
advisory locks e `pgvector`).

---

## Sumário

1. [Convenções e extensões](#1-convenções-e-extensões)
2. [Diagrama ER (ASCII)](#2-diagrama-er-ascii)
3. [Identidade e RBAC (DDL)](#3-identidade-e-rbac-ddl)
4. [Workflows e versionamento (DDL)](#4-workflow-e-versionamento-ddl)
5. [Execuções (DDL)](#5-execuções-ddl)
6. [Credenciais (DDL)](#6-credenciais-ddl)
7. [IA / AI (DDL)](#7-ia-ai-ddl)
8. [Templates, notificações, aprovações, webhooks, scheduler (DDL)](#8-templates-notificações-aprovações-webhooks-scheduler-ddl)
9. [Row Level Security (políticas SQL)](#9-row-level-security-políticas-sql)
10. [Índices](#10-índices)
11. [Migrações](#11-migrações)
12. [Decisões de design (ADR)](#12-decisões-de-design-adr)
13. [Backup e restore](#13-backup-e-restore)
14. [Perguntas de design respondidas](#14-perguntas-de-design-respondidas)
15. [Glossário](#15-glossário)

---

## 1. Convenções e extensões

### 1.1 Convenções de nomenclatura

| Regra | Aplicação | Exemplo |
|-------|-----------|---------|
| **snake_case** | Tabelas, colunas, constraints, sequences | `workflow_executions`, `created_at` |
| **Plural** | Nomes de tabelas | `users`, `organizations`, `workflow_versions` |
| **Singular** | Nomes de sequences, triggers, functions | `gen_user_id`, `trg_updated_at` |
| **UUID v7** | Chave primária de tabelas de dados | `gen_random_uuid()` |
| **Timestamps UTC** | `created_at`, `updated_at` | sempre `TIMESTAMPTZ` |
| **Soft delete** | `deleted_at TIMESTAMPTZ NULL` | `WHERE deleted_at IS NULL` |
| **Tenant** | `org_id UUID NOT NULL` | presente em toda tabela scoped |
| **Audit trail** | `created_by`, `updated_by` | FK para `users` |
| **Enums nomeados** | `user_status`, `workflow_status` | tipos PostgreSQL reusáveis |

### 1.2 Estratégia de chave primária — UUID v7

Escolhemos **UUID v7** (via `gen_random_uuid()` do `pgcrypto`) para todas as tabelas
de dados, em vez de `SERIAL`/`IDENTITY`:

- **Não contencionáveis**: não há sequence global que vira gargalo em alta escrita
  multi-tenant (um bottleneck clássico em sistemas `SERIAL`).
- **Proteção contra enumeração**: IDs previsíveis vazam contagem de registros.
- **Seguros para sharding futuro**: UUIDs são portáteis entre shards/regiões.
- **Geráveis no app layer**: não requer round-trip ao DB para obter o ID.

`gen_random_uuid()` do `pgcrypto` implementa **UUID v4** (aleatório). Para ordenação
natural por tempo (UUID v7), recomendamos uma função de aplicação ou
`uuid_generate_v7()` se a extensão `uuid-ossp` estiver disponível. Para este schema,
usamos `gen_random_uuid()` e mantemos um **índice de tempo** (`created_at`) para
ordenação. Em PostgreSQL 15 não há `gen_random_uuid_v7` nativo, então:

```sql
-- uuid-ossp fornece uuid_generate_v7() (UUID v7 ordenado por tempo)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Convencção: PK usa uuid_generate_v7() quando disponível, senão gen_random_uuid()
-- Em produção, recomendável migrar para uuid v7 para clustering temporal.
CREATE OR REPLACE FUNCTION public.new_id() RETURNS uuid
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT gen_random_uuid() $$;
```

### 1.3 Extensões obrigatórias

```sql
-- UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid, gen_random_bytes, crypt
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v7 (UUID v7 ordenado)

-- Busca textual e trigram (para LIKE/ilike rápido em nomes de workflows, credenciais)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Vetores densos para RAG (memória de IA, documentos)
CREATE EXTENSION IF NOT EXISTS "vector";

-- Índices de texto estruturado para conteúdo de logs
CREATE EXTENSION IF NOT EXISTS "pg_catalog"; -- built-in (sempre disponível)
```

### 1.4 Convención de timestamps e soft-delete

Todo modelo de dados carrega:

```sql
created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at    TIMESTAMPTZ NULL                       -- soft delete
created_by    UUID      NOT NULL REFERENCES users(id)
updated_by    UUID      NOT NULL REFERENCES users(id)
org_id        UUID      NOT NULL REFERENCES organizations(id)
```

**Soft delete padrão**: registros "deletados" mantêm `deleted_at IS NOT NULL` e
aparecem em **todos** os índices parciais (`WHERE deleted_at IS NULL`). Constraints
UNIQUE aplicam `IS NOT NULL` via **índice parcial** para permitir reuso do mesmo slug
após exclusão.

Trigger genérica de `updated_at`:

```sql
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicada a cada tabela com updated_at:
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
```

---

## 2. Diagrama ER (ASCII)

```
┌─────────────────┐      ┌─────────────────────┐
│      users      │ 1  ┌─┤ organizations        │
│ id PK           │───n│ org_id FK            │
│ email           │    │ id PK                │
│ name, avatar... │    │ name, slug, plan...  │
│ status, mfa...  │    │ limits (jsonb)       │
└─────────────────┘    │ quota_used_json      │
                       └─────────┬────────────┘
                                 │ 1
                    ┌────────────┴────────────┐
                    │ organization_members    │
                    │ id PK                   │
                    │ user_id FK, org_id FK   │
                    │ role, status, joined_at │
                    └────────────┬────────────┘
                                 │ n
          ┌─────────────────────┼─────────────────────────┐
          │                     │                         │
┌─────────┴─────────┐  ┌────────┴────────┐     ┌─────────┴────────┐
│ users_sessions     │  │ api_keys        │     │ roles            │
│ id PK              │  │ id PK           │     │ id PK            │
│ user_id FK         │  │ org_id, user_id │     │ org_id, name     │
│ token_hash, exp    │  │ name, prefix    │     │ is_system        │
│ device, ip, ua     │  │ scopes, revoked │     │ └────────┬────────┘
└──────────────────┘  └────────┬───────┘     └──────────┘
                                │                       │ n
                         ┌──────┴───────┐     ┌─────────┴────────┐
                         │ audit_logs   │     │ role_permissions │
                         │ id PK        │     │ role_id FK       │
                         │ org_id, act..│     │ permission_id FK │
                         │ resource, ...│     └──────────────────┘
                         └──────┬───────┘
                                │ n
                         ┌──────┴───────┐     ┌──────────────────┐
                         │ usage_records│     │ subscriptions    │
                         │ org_id, kind │     │ org_id, stripe   │
                         │ ts, metadata │     │ status, limits   │
                         └──────────────┘     └──────────────────┘

┌─────────────────────┐ 1            n ┌──────────────────────────┐
│   workflows         │────            │ workflow_versions        │
│ id PK               │               │ id PK                    │
│ org_id, name, slug  │               | workflow_id FK          |
│ status, active      |               | version, data (jsonb)    |
│ settings, pin_data  |               | changelog, created_by    |
│ folder_id, created  |               | created_at               |
└─────────┬───────────┘               └──────────────────────────┘
          | n
          |                          ┌──────────────────────────┐
          | 1                    n  │ workflow_nodes           │
          |                         │ id PK                    │
          |                         | workflow_id / version    |
          |                         | key, type, type_version  |
          |                         | config (jsonb)           |
          |                         | position, width/height   |
          |                         └────────────┬─────────────┘
          |                                      │ n
          |                         ┌────────────┴─────────────┐
          |                         │ workflow_edges           │
          |                         │ id PK                    │
          |                         | source_node_key          |
          |                         | target_node_key          |
          |                         | source/target_handle     |
          |                         | condition (jsonb)        |
          |                         | data (n8n conn jsonb)     |
          |                         └──────────────────────────┘
          |
          | n
┌─────────┴──────────┐ 1           n ┌────────────────────────┐
│ workflow_executions│───────────────│ execution_nodes        │
│ id PK              │               │ id PK                  │
│ workflow_id FK     │               | execution_id FK       |
│ status, trigger    |               | node_key, status      |
│ started/stopped    |               | input/output(jsonb)   |
│ duration, error    |               | started/finished      |
│ mode, retry_of     |               └────────┬──────────────┘
│ org_id             |                        │ n
└─────────┬──────────┘              ┌────────┴───────────────┐
          │ n                      │ execution_node_logs   │
          │                        │ id PK                 │
          │                        | node_execution_id FK  |
          │                        │ level, message, ts    │
          │                        │ data (jsonb)          │
          │                        └───────────────────────┘
          │ n
          │
┌─────────┴──────────┐      ┌──────────────────────┐
│ credentials        │      │ credential_types     │
│ id PK              │      │ key, schema (jsonb)  │
│ org_id, name, type |      └────────▲────────────┘
│ provider, data(en) |               │ n (catalog)
│ key_version, alg   |      ┌────────┴────────────┐
│ expires_at, revok  |      │ credential_shares   │
└─────────┬──────────┘      │ credential_id, uid  │
          │ n                 │ role, org_id        │
          │                   └─────────────────────┘
          │ n
┌─────────┴──────────┐ n     ┌──────────────────────┐
│ credential_audit   │───────│ credential_key_ver   │
│ credential_id FK   │       │ version, active      │
│ action, user/org   │       │ deprecated_at        │
│ success, ip, ua    │       └──────────────────────┘
│ metadata, ts       │
└───────────────────┘

┌──────────────────────┐ n     ┌────────────────────────┐
│ workflow_shared      │───────│ workflows              │
│ workflow_id FK       │       | id PK                  |
│ team_id / user_id    │       └────────────────────────┘
│ role, expires_at     │
└──────────────────────┘

┌──────────────────────┐      ┌────────────────────────┐
│ scheduled_triggers   │      │ webhooks               │
│ id PK               │      │ id PK                  │
│ workflow_id FK      │      │ org_id, workflow_id FK │
│ cron, timezone      │      │ path, method, secret   │
│ next_run_at, enabled│      │ hmac_secret (en)       │
└──────────────────────┘      │ active, signature      │
                              └────────┬───────────────┘
                                       │ n
                              ┌────────┴──────────┐
                              │ webhook_events    │
                              │ id PK            │
                              │ webhook_id FK    │
                              │ payload, hash    │
                              │ received_at      │
                              └──────────────────┘

┌────────────────────────┐      ┌──────────────────────┐
│ workflow_templates     │      │ template_categories  │
│ id PK                  │      │ key, name, icon      │
│ org_id/global, slug    │      └────────▲────────────┘
│ data (jsonb), author   │               │ n
│ category_id FK         │      ┌────────┴────────────┐
│ published, stats       │      │ template_category_x │
└────────────────────────┘      │ template_id, cat_id |
                                └─────────────────────┘

┌─────────────────────┐      ┌──────────────────────┐
│ approvals           │      │ notifications        │
│ id PK               │      │ id PK                │
│ execution_id FK      │      │ user_id FK          │
│ node_key, status     │      │ type, payload(jsonb)|
│ approvers, data     │      │ read_at, created_at |
│ expires_at           │      └──────────────────────┘
└─────────────────────┘

┌─────────────────────┐      ┌──────────────────────┐
│ ai_providers_config │      │ vector_documents     │
│ org_id, provider    │      │ id PK, org_id        │
│ api_key (en), model │      │ workflow_id FK       │
│ limits (jsonb)      │      │ embedding vector     │
└─────────────────────┘      │ metadata, source     │
                             │ created_at           │
┌─────────────────────┐      └──────────────────────┘
│ ai_memory           │
│ session_id, org     │
│ messages (jsonb)    │
│ expires_at          │
└─────────────────────┘

┌─────────────────────┐      ┌──────────────────────┐
│ ai_cost_tracking    │      │ execution_metrics    │
│ execution_id FK      │      │ execution_id FK      │
│ provider, model     │      │ tokens, cost, items  │
│ tokens_in/out, cost │      └──────────────────────┘
└─────────────────────┘

┌─────────────────────┐
│ locks               │  (advisory locks via pg_advisory_lock,
│ lock_key (bigint)   │   não é tabela física — gerenciada em RL)
│ owner, expires_at   │   Veja §12.4)
└─────────────────────┘

┌─────────────────────┐
│ migration_history   │  (version, name, checksum, applied_at)
│ id PK              │
│ version, name       │
│ checksum, applied   │
└─────────────────────┘
```

> **Legendas**: `PK` chave primária · `FK` chave estrangeira · `en` = campo encriptado ·
> As tabelas `credentials` e `workflow_versions` guardam dados sensíveis/volúmeos;
> a encriptação AES-256-GCM ocorre no **service layer** (env vars / cloud KMS) antes de
> tocar o DB (ver `v2-security-spec.md` §5).

---

## 3. Identidade e RBAC (DDL completo)

### 3.1 Enums de identidade

```sql
-- Status de usuário no sistema (não status de membro na org)
CREATE TYPE user_status AS ENUM ('active', 'invited', 'suspended', 'deactivated');

-- Status do convite de membresia
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'removed');

-- Status da assinatura
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due',
                                         'canceled', 'unpaid', 'incomplete');

-- Escopo de API key
CREATE TYPE api_key_status AS ENUM ('active', 'revoked', 'expired');
```

### 3.2 Tabela `users`

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    email         CITEXT NOT NULL UNIQUE,
    email_md5     CHAR(32) NOT NULL,                       -- hash md5 (Gravatar)
    name          TEXT NOT NULL,
    avatar_url    TEXT,
    password_hash TEXT,                                    -- NULL = SSO-only
    status        user_status NOT NULL DEFAULT 'invited',
    locale        TEXT NOT NULL DEFAULT 'pt-BR',
    timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    mfa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_encrypted TEXT,                             -- NULL até enrolar
    mfa_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT chk_email_lower CHECK (email = LOWER(email)),
    CONSTRAINT chk_mfa_secret_when_enabled
        CHECK (mfa_enabled = FALSE OR mfa_secret_encrypted IS NOT NULL),
    CONSTRAINT chk_active_requires_password
        CHECK (status = 'active' AND password_hash IS NULL
               => FALSE)  -- active local users must have password hash
);

-- Índice para soft-delete (não retorna users "deletados")
CREATE INDEX idx_users_active_by_email
    ON users (email)
    WHERE deleted_at IS NULL;

-- Tabela pivot para emails de convidado (usuário pode ser convidado sem conta ativa)
CREATE UNIQUE INDEX idx_users_pended_email_lower
    ON users (LOWER(email)) WHERE status = 'invited';
```

> `CITEXT` (case-insensitive) exige a extensão `citext`. Adicione ao bloco de
> extensões: `CREATE EXTENSION IF NOT EXISTS "citext";`

### 3.3 Tabela `organizations`

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    name            TEXT NOT NULL,
    slug            CITEXT NOT NULL UNIQUE,
    description     TEXT,
    logo_url        TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',
    status          TEXT NOT NULL DEFAULT 'active',     -- active|trialing|canceled|past_due|unpaid
    billing_email   CITEXT,
    timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

    -- Limites de tenant por plano (configuráveis)
    limits          JSONB NOT NULL DEFAULT '{}'::jsonb,
    usage           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- contadores em tempo real

    -- Políticas de segurança por org (herdadas por projetos)
    security_policy JSONB NOT NULL DEFAULT '{"requireMfa":false,"passwordMinLength":10}'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id)
);

-- Único slug ativo (permite reuso após soft-delete)
CREATE UNIQUE INDEX idx_orgs_slug_active
    ON organizations (LOWER(slug)) WHERE deleted_at IS NULL;

CREATE INDEX idx_orgs_plan ON organizations (plan) WHERE deleted_at IS NULL;
```

### 3.4 Tabela `memberships` (organization_members)

```sql
CREATE TABLE memberships (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'member',     -- owner|admin|editor|viewer
    status        membership_status NOT NULL DEFAULT 'active',
    joined_at     TIMESTAMPTZ,
    invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    invited_by    UUID REFERENCES users(id),
    invite_token  TEXT,                               -- hash do token de convite
    invite_expires_at TIMESTAMPTZ,
    mfa_required  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_by    UUID NOT NULL REFERENCES users(id),
    deleted_at    TIMESTAMPTZ
);

-- Invariante: um usuário tem um membro por org
CREATE UNIQUE INDEX idx_memberships_user_org_active
    ON memberships (user_id, org_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_memberships_org_role_active
    ON memberships (org_id, role) WHERE deleted_at IS NULL;
```

### 3.5 RBAC estruturado: `roles`, `permissions`, `role_permissions`

Modelo **deny-by-default**. `roles` são específicos da org (own/editor/viewer padrão)
e `permissions` são atômicas (resource + action + scope).

```sql
CREATE TABLE roles (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    key           TEXT NOT NULL,                 -- "owner", "admin", "editor", "viewer", ...
    is_system     BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked     BOOLEAN NOT NULL DEFAULT FALSE, -- true = cannot be deleted
    priority      INT NOT NULL DEFAULT 0,        -- ordem de precedência
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_by    UUID NOT NULL REFERENCES users(id),
    updated_by    UUID NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_roles_org_key ON roles (org_id, key);
CREATE INDEX idx_roles_org_priority ON roles (org_id, priority DESC);

CREATE TABLE permissions (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    resource      TEXT NOT NULL,                  -- workflow, credential, execution, ...
    action        TEXT NOT NULL,                  -- create, read, update, delete, execute, publish, decrypt, ...
    scope         TEXT NOT NULL DEFAULT 'org',    -- org | project | self
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (resource, action, scope)
);
CREATE INDEX idx_permissions_resource ON permissions (resource, action);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by    UUID NOT NULL REFERENCES users(id),
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_perms_role ON role_permissions (role_id);
CREATE INDEX idx_role_perms_perm ON role_permissions (permission_id);
```

> **Herança de role**: por simplicidade o schema usa herança implícita
> (`editor ⊃ viewer`). Se herança explícita for necessária, adicione uma
> `role_inheritance` (role_id → parent_role_id). O motor de autorização (ver
> `v2-security-spec.md` §4.3) aplica a herança em memória.

### 3.6 Tabela `sessions` (famílias de refresh token)

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sid             TEXT NOT NULL,                  -- session id compartilhado pela família
    refresh_token_hash TEXT NOT NULL,               -- SHA-256 do token opaco
    access_jti      TEXT,                           -- jti do access token atual
    ip              INET,
    user_agent      TEXT,
    user_agent_hash TEXT,                           -- hash do UA (índice rápido)
    device          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,
    revoked_by      UUID REFERENCES users(id)
);
-- Um tenant pode revisar sessões por usuário sem scan
CREATE INDEX idx_sessions_user_org ON sessions (org_id, user_id, last_used_at DESC);
CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (refresh_token_hash);
CREATE INDEX idx_sessions_sid ON sessions (sid) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires ON sessions (expires_at) WHERE revoked_at IS NULL;
```

### 3.7 Tabela `api_keys`

```sql
CREATE TABLE api_keys (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id       UUID,                              -- opcional: chave de equipe
    name          TEXT NOT NULL,
    prefix        CHAR(8) NOT NULL,                  -- prefixo visível (identificação)
    key_hash      TEXT NOT NULL,                     -- SHA-256 do key completo
    scopes        TEXT[] NOT NULL DEFAULT '{}',      -- ["workflow:read", ...]
    status        api_key_status NOT NULL DEFAULT 'active',
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    revoked_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,

    updated_by    UUID NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_api_keys_prefix_org_active
    ON api_keys (org_id, prefix) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_api_keys_hash ON api_keys (key_hash) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_user ON api_keys (user_id) WHERE deleted_at IS NULL;
```

> **Segurança da chave**: o valor completo da API key **nunca** é persistido —
> apenas `prefix` (8 chars) + `key_hash` (SHA-256). O valor é retornado ao usuário
> **uma só vez** no momento da criação (ver ADR-5).

### 3.8 Tabela `audit_logs`

```sql
CREATE TABLE audit_logs (
    id            BIGSERIAL PRIMARY KEY,            -- sequencial, append-only
    org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_type    TEXT NOT NULL DEFAULT 'user',     -- user|system|integration|worker
    action        TEXT NOT NULL,                    -- "workflow.create", "credential.read_full"
    resource      TEXT NOT NULL,                    -- workflow, credential, execution
    resource_id   TEXT,                             -- id do recurso (string, genérico)
    before        JSONB,                            -- snapshot BEFORE (não sensível)
    after         JSONB,                            -- snapshot AFTER (mascarado)
    ip            INET,
    user_agent    TEXT,
    request_id    UUID,
    success       BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    metadata      JSONB,                            -- contexto: {version, from, to, count}
    session_id    TEXT,
    -- Cadeia de confiança imutável (hash chain)
    prev_hash     TEXT,                             -- SHA-256 do registro anterior
    record_hash   TEXT,                             -- SHA-256 deste registro
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para queries quentes de auditoria
CREATE INDEX idx_audit_org_action_ts  ON audit_logs (org_id, action, created_at DESC);
CREATE INDEX idx_audit_org_ts         ON audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_actor          ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_resource       ON audit_logs (resource, resource_id);
CREATE INDEX idx_audit_request_id     ON audit_logs (request_id);

-- Retenção: auditoria mínima 1 ano (LGPD/Compliance — ver ADR-7)
```

> A cadeia de hash (`prev_hash`/`record_hash`) garante **imutabilidade**: qualquer
> alteração rompe a cadeia. Implementada via trigger `BEFORE INSERT` que calcula
> `record_hash = sha256(prev_hash || action || resource_id || ...)`.

### 3.9 Tabelas de uso e billing (`subscriptions`, `usage_records`, `billing_events`)

A cobrança do AgentFlow é baseada em **planos** com limites por recursos. O
schema registra subscriptions (Stripe), usage records (contadores de consumo) e
uma trilha imutável de eventos de billing.

```sql
-- Catálogo de planos (referenciado por organizations.plan)
CREATE TABLE plans (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    key           TEXT NOT NULL UNIQUE,               -- free|starter|basic|growth|pro|enterprise
    name          TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'month',       -- month|year
    price_cents   INT NOT NULL DEFAULT 0,
    currency      CHAR(3) NOT NULL DEFAULT 'BRL',
    limits_json   JSONB NOT NULL,                     -- {max_workflows, max_executions, max_seats, ai_credits, ...}
    features_json JSONB,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_key ON plans (key) WHERE active = TRUE;

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id              UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id     TEXT,
    plan_key            TEXT NOT NULL,
    status              subscription_status NOT NULL DEFAULT 'trialing',
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at          TIMESTAMPTZ,
    trial_ends_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID NOT NULL REFERENCES users(id),
    updated_by          UUID NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_subscriptions_org ON subscriptions (org_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions (current_period_end);
CREATE INDEX idx_subscriptions_stripe ON subscriptions (stripe_subscription_id);

-- Contadores de consumo faturáveis (por janela temporal).
-- Escrita idempotente: ON CONFLICT para janelas abertas.
CREATE TABLE usage_records (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    type          TEXT NOT NULL,                 -- execution|ai_call|ai_tokens_input|ai_tokens_output|storage_gb|seat_hour
    quantity      NUMERIC(14,4) NOT NULL DEFAULT 1,
    unit          TEXT NOT NULL DEFAULT 'count',
    cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
    window_start  TIMESTAMPTZ NOT NULL,         -- início da janela faturada (ex: 00:00 UTC)
    window_end    TIMESTAMPTZ NOT NULL,         -- fim da janela faturada
    execution_id  UUID,                         -- ligação opcional a execution (auditoria)
    workflow_id   UUID REFERENCES workflows(id) ON DELETE SET NULL,
    metadata      JSONB,                        -- {model, provider, trigger, ...}
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now() -- snapshot quando registrado (imutável)
);
CREATE INDEX idx_usage_org_type_window ON usage_records (org_id, type, window_start DESC);
CREATE INDEX idx_usage_org_ts ON usage_records (org_id, created_at DESC);
CREATE INDEX idx_usage_exec ON usage_records (execution_id) WHERE execution_id IS NOT NULL;

-- Trilha imutável de eventos de billing vindos do provedor (webhooks Stripe).
CREATE TABLE billing_events (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,              -- created|renewed|canceled|past_due|invoice.created
    amount_cents    INT,
    currency        CHAR(3),
    stripe_event_id TEXT,
    payload         JSONB,                       -- raw payload do webhook (mascarado de pii)
    status          TEXT NOT NULL DEFAULT 'pending',
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX idx_billing_events_org_ts ON billing_events (org_id, created_at DESC);
CREATE INDEX idx_billing_events_type ON billing_events (event_type);
CREATE INDEX idx_billing_events_stripe ON billing_events (stripe_event_id);
```

> **Billing safety**: `usage_records` usa chave `(org_id, type, window_start)` para
> idempotência — o writer faz `INSERT ... ON CONFLICT (...) DO UPDATE quantity=quantity+N`.
> `billing_events` é append-only (nunca atualizado após `processed_at`).

### 3.10 Trigger de auditoria de billing

```sql
-- Todo UPDATE na subscription gera billing_event para auditoria
CREATE OR REPLACE FUNCTION trg_billing_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO billing_events (org_id, subscription_id, event_type, status, payload)
  VALUES (NEW.org_id, NEW.id,
          CASE TG_OP
            WHEN 'UPDATE' THEN 'canceled'     -- simplificado; refinar no service
            ELSE TG_OP::TEXT
          END,
          'processed',
          jsonb_build_object('status_old', OLD.status, 'status_new', NEW.status));
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_billing_audit
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION trg_billing_audit();
```

---

## 4. Workflows e versionamento (DDL)

### 4.1 Enums de workflow

```sql
CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE workflow_trigger_mode AS ENUM ('manual', 'webhook', 'cron', 'api');
```

### 4.2 Tabela `folders`

```sql
CREATE TABLE folders (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    parent_id     UUID REFERENCES folders(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    created_by    UUID NOT NULL REFERENCES users(id),
    updated_by    UUID NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_folders_org_parent ON folders (org_id, parent_id) WHERE deleted_at IS NULL;
```

### 4.3 Tabela `tags` e `workflow_tags`

```sql
CREATE TABLE tags (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    color         CHAR(7),               -- hex "#RRGGBB"
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_tags_org_name ON tags (org_id, name) WHERE deleted_at IS NULL;

CREATE TABLE workflow_tags (
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workflow_id, tag_id)
);
```

### 4.4 Tabela `workflows` (definição viva)

```sql
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    folder_id       UUID REFERENCES folders(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    status          workflow_status NOT NULL DEFAULT 'draft',
    active          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Definição do workflow (campos indexáveis para queries rápidas)
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,        -- {executionOrder, timezone, ...}
    static_data     JSONB,                                      -- dados estáticos entre execuções
    pin_data        JSONB,                                      -- dados fixados (tests)
    version_counter INT NOT NULL DEFAULT 1,                     -- incrementado a cada save

    -- Metadados visuais / compat
    tags            TEXT[] NOT NULL DEFAULT '{}',
    node_count      INT NOT NULL DEFAULT 0,
    updated_nodes   INT NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id),

    CONSTRAINT chk_workflow_active_status
        CHECK (active = TRUE => status IN ('active','paused'))
);
-- Slug único ativo por org (permite reuso após soft-delete)
CREATE UNIQUE INDEX idx_workflows_org_slug_active
    ON workflows (org_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_org_status_active
    ON workflows (org_id, status, active) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_org_updated
    ON workflows (org_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_folder
    ON workflows (org_id, folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_tags_gin ON workflows USING GIN (tags);
CREATE INDEX idx_workflows_settings_gin ON workflows USING GIN (settings);
```

### 4.5 Tabela `workflow_nodes` (definição estruturada do workflow vivo)

Armazenamos a definição **estruturada** (queryável) do workflow ativo + o snapshot
JSON completo em `workflow_versions` para round-trip n8n e rollback.

```sql
CREATE TABLE workflow_nodes (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_id      UUID REFERENCES workflow_versions(id) ON DELETE SET NULL, -- snapshot de origem

    key             TEXT NOT NULL,             -- nome único no workflow (compat n8n)
    type            TEXT NOT NULL,             -- "n8n-nodes-base.httpRequest", "webhook", ...
    type_version    INT NOT NULL DEFAULT 1,
    category        TEXT,                      -- trigger|action|logic|transform|ai|communication
    label           TEXT,

    -- Parâmetros + config do nó (n8n node.parameters + node-level flags)
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    credentials_ref JSONB,                     -- { "openAiApi": "cred-uuid", ... } → resolvido no runner

    -- Posicionamento visual
    position_x      NUMERIC,
    position_y      NUMERIC,
    width           NUMERIC,
    height          NUMERIC,

    -- Flags de execução por nó
    retry_config    JSONB,                     -- {maxTries, delay, backoff}
    timeout_ms      INT,
    continue_on_fail BOOLEAN NOT NULL DEFAULT FALSE,
    disabled        BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_workflow_nodes_wfid_key
    ON workflow_nodes (workflow_id, key) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflow_nodes_wfid ON workflow_nodes (workflow_id);
CREATE INDEX idx_workflow_nodes_type ON workflow_nodes (org_id, type);
```

> **Nota de design**: a tabela de nodes não carrega `deleted_at` porque nodes são
> sempre recreacionados ao salvar o workflow (imutabilidade por versão). A exclusão
> de node = atualização do workflow → novo `workflow_version`.

### 4.6 Tabela `workflow_edges`

```sql
CREATE TABLE workflow_edges (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_id      UUID REFERENCES workflow_versions(id) ON DELETE SET NULL,

    source_node_key TEXT NOT NULL,
    target_node_key TEXT NOT NULL,
    source_handle   TEXT,                      -- porta de saída ("main", "true", "false", ...)
    target_handle   TEXT,                      -- porta de entrada
    label           TEXT,                      -- rótulo da conexão (condicional)
    condition       JSONB,                     -- expressão/condição da edge

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_workflow_edges_wfid ON workflow_edges (workflow_id);
CREATE INDEX idx_workflow_edges_src ON workflow_edges (source_node_key);
CREATE INDEX idx_workflow_edges_tgt ON workflow_edges (target_node_key);
CREATE INDEX idx_workflow_edges_cond ON workflow_edges (source_node_key)
    WHERE condition IS NOT NULL;  -- edges condicionais
```

### 4.7 Tabela `workflow_versions` (snapshots imutáveis)

O **snapshot completo** no formato n8n é armazenado como JSONB para:
- Rollback a qualquer versão
- Import/Export n8n (compatibilidade 1:1)
- Replay com definição exata do momento

```sql
CREATE TABLE workflow_versions (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version         INT NOT NULL,
    -- Snapshot completo n8n-compatível (nodes, connections, settings, meta, pinData...)
    data            JSONB NOT NULL,
    changelog       TEXT,                       -- descrição da mudança
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    -- Hash de integridade do snapshot (imutabilidade)
    data_hash       TEXT NOT NULL,              -- SHA-256 do JSONB canonizado
    is_deployment   BOOLEAN NOT NULL DEFAULT FALSE  -- true = versão publicada (active)
);
CREATE UNIQUE INDEX idx_workflow_versions_wf_ver
    ON workflow_versions (workflow_id, version);
CREATE INDEX idx_workflow_versions_wf_created
    ON workflow_versions (workflow_id, created_at DESC);
CREATE INDEX idx_workflow_versions_deployment
    ON workflow_versions (workflow_id, is_deployment DESC)
    WHERE is_deployment = TRUE;
CREATE INDEX idx_workflow_versions_data_gin ON workflow_versions USING GIN (data);
```

> **Integridade**: trigger `BEFORE INSERT` valida `data_hash = sha256(canonical_json(data))`
> e rejeita snapshots corrompidos. A coluna `version` é um contador sequencial
> (`version_counter` da tabela `workflows` + 1).

### 4.8 Tabela `workflow_shared` (compartilhamento entre usuários/teams)

```sql
CREATE TABLE workflow_shared (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id       UUID,                        -- se NULL, compartilhado com user_id
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'viewer',   -- viewer|editor|executor
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID NOT NULL REFERENCES users(id),
    CHECK (team_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE UNIQUE INDEX idx_workflow_shared_wf_user
    ON workflow_shared (workflow_id, user_id, team_id)
    WHERE user_id IS NOT NULL OR team_id IS NOT NULL;
CREATE INDEX idx_workflow_shared_wf ON workflow_shared (workflow_id);
```

**Herança de permissões folder→workflow**: o motor de autorização resolve a role
efetiva combinando (`folder_role`, `workflow_role`) — a interseção nunca amplia
permissões (ver ADR-3). Na tabela, a folder é opcional e a permissão do folder
influencia apenas a **visibilidade de listagem**; a execução exige permissão
explícita no workflow ou na org.

### 4.10 Tabela `node_types` (catálogo de tipos de nó)

Catálogo estático de **tipos de nó** (built-in + custom). O motor de execução
usa isso para validar `node_config` e direcionar para o handler adequado.
Built-in são globais (`org_id IS NULL`) e read-only; custom são scoped por org.

```sql
CREATE TYPE node_category AS ENUM
    ('trigger','action','logic','transform','ai','communication','integration');

CREATE TYPE node_runtime AS ENUM ('main','main_isolated','worker');

CREATE TABLE node_types (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = built-in global
    key             TEXT NOT NULL,                           -- "httpRequest","webhook","cron","if","openAi"...
    display_name    TEXT NOT NULL,
    category        node_category NOT NULL,
    runtime         node_runtime NOT NULL DEFAULT 'main',    -- main|main_isolated(worker thread)|worker(VM)
    icon            TEXT,
    color           CHAR(7),                                 -- "#RRGGBB"
    version         INT NOT NULL DEFAULT 1,                 -- versão do type
    description     TEXT,
    parameters_schema JSONB NOT NULL DEFAULT '{}'::jsonb,   -- JSON Schema para UI dinâmica
    outputs_schema    JSONB NOT NULL DEFAULT '{}'::jsonb,
    defaults         JSONB NOT NULL DEFAULT '{}'::jsonb,     -- defaults por nó
    is_trigger       BOOLEAN NOT NULL DEFAULT FALSE,
    supports_async   BOOLEAN NOT NULL DEFAULT FALSE,
    is_built_in      BOOLEAN NOT NULL DEFAULT TRUE,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID REFERENCES users(id),
    updated_by       UUID REFERENCES users(id),
    CONSTRAINT uq_node_types_key_builtin UNIQUE (key) WHERE is_built_in = TRUE,
    CONSTRAINT uq_node_types_org_key UNIQUE (org_id, key) WHERE is_built_in = FALSE
);
CREATE INDEX idx_node_types_category ON node_types (category, enabled);
CREATE INDEX idx_node_types_trigger ON node_types (is_trigger, enabled);
CREATE INDEX idx_node_types_params_gin ON node_types USING GIN (parameters_schema);
CREATE INDEX idx_node_types_org ON node_types (org_id) WHERE org_id IS NOT NULL;
```

> **`runtime`**: `code` nodes usam `worker` (sandbox isolate-vm). `webhook`/`cron`
> usam `main`. Decisão codificada no schema → motor impõe política de sandbox
> (`v2-security-spec.md` §2.5 S9).

### 4.11 Trigger de manutenção de contadores do workflow

```sql
-- Mantém node_count / updated_nodes sincronizados após INSERT/DELETE de nodes/edges
CREATE OR REPLACE FUNCTION trg_workflow_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE workflows
       SET node_count = node_count + 1, updated_at = now()
     WHERE id = NEW.workflow_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE workflows
       SET node_count = GREATEST(0, node_count - 1), updated_at = now()
     WHERE id = OLD.workflow_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER set_workflow_node_count
    AFTER INSERT OR DELETE ON workflow_nodes
    FOR EACH ROW EXECUTE FUNCTION trg_workflow_counts();
```

---

## 5. Execuções (DDL)

### 5.1 Enums de execução

```sql
CREATE TYPE execution_status AS
    ENUM ('pending','running','success','failed','cancelled','waiting_approval','timeout','crashed');
CREATE TYPE execution_mode AS
    ENUM ('manual','webhook','cron','api','retry');
CREATE TYPE execution_trigger AS
    ENUM ('webhook','manual','cron','api','internal');
```

### 5.2 Tabela `executions`

```sql
CREATE TABLE executions (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE SET NULL,
    workflow_version_id UUID REFERENCES workflow_versions(id),

    status          execution_status NOT NULL DEFAULT 'pending',
    trigger         execution_trigger NOT NULL DEFAULT 'manual',
    mode            execution_mode NOT NULL DEFAULT 'manual',

    -- Dados de entrada/saída (amostrados/truncados em execuções grandes)
    input           JSONB,
    output          JSONB,
    error           TEXT,                                     -- mensagem de erro (sem stack)
    error_data      JSONB,                                    -- código, nodeId, stack, contexto

    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at      TIMESTAMPTZ,
    duration_ms     INT,                                      -- duração total
    finished        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Retries / replay
    retry_of        UUID REFERENCES executions(id),           -- se esta é um retry
    retry_success_of UUID,                                    -- execution original queeste retry corrigiu
    is_replay       BOOLEAN NOT NULL DEFAULT FALSE,
    replay_parent_id UUID REFERENCES executions(id),

    -- Isolamento / concorrência
    queue_job_id    TEXT,                                     -- bullmq job id
    worker_id       TEXT,                                     -- worker que processou
    lock_expiry_at  TIMESTAMPTZ,                              -- para lock de concorrência
    concurrency_key TEXT,                                    -- sharding key (workflow_id ou org_id)

    -- Controle de tenant / usuário
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by      UUID NOT NULL REFERENCES users(id),

    -- Retenção / arquivamento
    archived_at     TIMESTAMPTZ,                              -- quando foi arquivado (frio)
    archive_bucket  TEXT,                                     -- referência storage frio (S3)
    data_retention  TEXT NOT NULL DEFAULT 'standard',         -- standard|archived|deleted

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_executions_org_status_started
    ON executions (org_id, status, started_at DESC);
CREATE INDEX idx_executions_workflow_org
    ON executions (workflow_id, org_id, started_at DESC);
CREATE INDEX idx_executions_user_org
    ON executions (user_id, org_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_executions_queue_job
    ON executions (queue_job_id) WHERE queue_job_id IS NOT NULL;
CREATE INDEX idx_executions_lock
    ON executions (lock_expiry_at) WHERE lock_expiry_at IS NOT NULL AND status = 'running';
CREATE INDEX idx_executions_retry_of
    ON executions (retry_of) WHERE retry_of IS NOT NULL;
CREATE INDEX idx_executions_replay
    ON executions (replay_parent_id) WHERE replay_parent_id IS NOT NULL;
CREATE INDEX idx_executions_archived
    ON executions (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX idx_executions_created_gin ON executions USING GIN (input);
```

> **Particionamento**: `executions` é particionada por **range em `created_at`**
> (mensal) para retenção e limpeza. Veja ADR-7. O `org_id` é coluna de partição
> adicional via **índice local**. Exemplo de particionamento:
>
> ```sql
> CREATE TABLE executions ( ... ) PARTITION BY RANGE (created_at);
> CREATE TABLE executions_2026_08 PARTITION OF executions
>     FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
> ```

### 5.3 Tabela `execution_data` (arquivo grande / partitionada)

Armazena o **payload volumoso** (resultados por node, dados binários referenciados)
separadamente de `executions` para manter o índice `executions` enxuto.

```sql
CREATE TABLE execution_data (
    execution_id    UUID PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    -- Resultados agregados por node: { "nodeKey": { "output": {...}, "input": {...} } }
    data            JSONB,
    -- Metadados de workflow resolvidos no momento da execução (snapshot)
    workflow_data   JSONB,
    -- Referências a storage de binários (object storage), NÃO blob no DB
    binary_refs     JSONB,                                   -- { "nodeKey": [{ref, mime, filename}] }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Tamanho estimado em bytes (para políticas de retenção por tamanho)
    size_bytes      BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_execution_data_org ON execution_data (org_id);

-- Particionamento mensal recomendado:
CREATE TABLE execution_data PARTITION BY RANGE (created_at);
```

> **Arquivamento**: a cada `archive_after_days` (ver `organizations.limits`),
> registros movidos para storage frio (S3) e marcados `data_retention = 'archived'`
> + `archive_bucket = 's3://...'`. Query de leitura faz union DB + S3 sob demanda.

### 5.4 Tabela `execution_nodes` (execução por nó)

```sql
CREATE TABLE execution_nodes (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    execution_id    UUID NOT NULL,
    node_key        TEXT NOT NULL,                           -- chave do node no workflow
    node_type       TEXT NOT NULL,
    node_config     JSONB,                                   -- snapshot do config usado
    status           execution_status NOT NULL DEFAULT 'pending',

    -- I/O por nó (amostrados se grande)
    input           JSONB,
    output          JSONB,
    error           TEXT,
    error_data      JSONB,

    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INT,

    retry_count     INT NOT NULL DEFAULT 0,
    attempt_index   INT NOT NULL DEFAULT 0,                  -- tentativa atual
    idempotency_key TEXT,                                    -- deduplicação retry
    run_index       INT NOT NULL DEFAULT 0,                  -- ordem na DAG

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_en_exec FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
    CONSTRAINT uq_en_exec_node UNIQUE (execution_id, node_key, run_index)
);
CREATE INDEX idx_execution_nodes_execut ON execution_nodes (execution_id);
CREATE INDEX idx_execution_nodes_exec_run ON execution_nodes (execution_id, run_index);
CREATE INDEX idx_execution_nodes_org ON execution_nodes (org_id);
CREATE INDEX idx_execution_nodes_idempotency
    ON execution_nodes (idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### 5.5 Tabela `execution_node_logs`

Logs estruturados por nó (stdout/stderr/sistema).

```sql
CREATE TABLE execution_node_logs (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID NOT NULL,
    execution_id    UUID NOT NULL,
    node_execution_id UUID NOT NULL,
    node_key        TEXT NOT NULL,
    level           TEXT NOT NULL,                           -- info|warn|error|debug
    message         TEXT NOT NULL,
    data            JSONB,                                   -- metadados (não sensível)
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_enl_exec FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);
CREATE INDEX idx_enl_exec_node ON execution_node_logs (execution_id, node_key, logged_at);
CREATE INDEX idx_enl_node_exec ON execution_node_logs (node_execution_id, logged_at);

-- Particionamento recomendado por created_at (range) para retenção.
```

### 5.6 Tabela `execution_metrics`

```sql
CREATE TABLE execution_metrics (
    execution_id      UUID PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
    org_id            UUID NOT NULL,
    tokens_input      BIGINT NOT NULL DEFAULT 0,
    tokens_output     BIGINT NOT NULL DEFAULT 0,
    tokens_total      BIGINT NOT NULL DEFAULT 0,
    ai_cost_usd       NUMERIC(12,6) NOT NULL DEFAULT 0,
    execution_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    items_processed   INT NOT NULL DEFAULT 0,
    nodes_executed    INT NOT NULL DEFAULT 0,
    retries_consumed  INT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exec_metrics_org ON execution_metrics (org_id, execution_id);
```

### 5.7 Tabela `queues` (filas BullMQ monitoradas)

```sql
CREATE TABLE queues (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                           -- "executions", "cron", "notifications"
    concurrency     INT NOT NULL DEFAULT 10,
    paused          BOOLEAN NOT NULL DEFAULT FALSE,
    last_job_id     TEXT,
    waiting_count   INT NOT NULL DEFAULT 0,
    active_count    INT NOT NULL DEFAULT 0,
    delayed_count   INT NOT NULL DEFAULT 0,
    completed_count INT NOT NULL DEFAULT 0,
    failed_count    INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_queues_org_name UNIQUE (org_id, name)
);
CREATE INDEX idx_queues_org ON queues (org_id);
```

> **Nota**: a fila propriamente dita vive no **Redis** (BullMQ). Esta tabela é um
> **mirror de observabilidade** (contadores) populado pelo worker. Veja
> `design-recriacao.md` §e e `design-arquitetura-cloud.md`.

### 5.8 Tabela `scheduled_triggers` (agendamentos cron)

```sql
CREATE TABLE scheduled_triggers (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    workflow_version_id UUID REFERENCES workflow_versions(id),

    cron            TEXT NOT NULL,                           -- expressão cron (5-6 campos)
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    jitter_seconds  INT NOT NULL DEFAULT 0,                   -- jitter aleatório (anti-thundering)
    payload         JSONB,                                   -- input fixo para a execução
    options         JSONB,                                   -- {retryOnFail, maxRuns, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_sched_org_enabled_next
    ON scheduled_triggers (org_id, enabled, next_run_at)
    WHERE enabled = TRUE AND next_run_at IS NOT NULL;
CREATE UNIQUE INDEX idx_sched_unique_workflow
    ON scheduled_triggers (workflow_id) WHERE enabled = TRUE;
```

> **Agendamento distribuído**: o scheduler (single-leader via Redis `SETNX` lock)
> faz `SELECT ... WHERE next_run_at <= now()` a cada minuto, cria a execution e
> atualiza `next_run_at` usando `croner`-equivalente. O cálculo usado **UTC**.

### 5.9 Tabela `webhooks` e `webhook_events`

```sql
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
    workflow_node_key TEXT,                                 -- node que origina o webhook

    path            TEXT NOT NULL,                          -- segmento da URL
    method          TEXT NOT NULL DEFAULT 'POST',
    content_type    TEXT NOT NULL DEFAULT 'application/json',
    response_mode   TEXT NOT NULL DEFAULT 'on_received',    -- on_received|last_node|response_node
    response_code   INT NOT NULL DEFAULT 200,
    response_data   TEXT,                                   -- template de resposta
    active          BOOLEAN NOT NULL DEFAULT TRUE,

    hmac_secret_encrypted TEXT,                             -- AES-GCM (HMAC signing)
    signature_header TEXT NOT NULL DEFAULT 'x-agentflow-signature',
    ip_allowlist    TEXT[],                                 -- CIDR permitidos (opcional)
    max_payload_bytes BIGINT NOT NULL DEFAULT 1048576,      -- 1MB limit
    description     TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id),

    CONSTRAINT uq_webhooks_org_path UNIQUE (org_id, path, method)
);
CREATE INDEX idx_webhooks_org_active ON webhooks (org_id, active) WHERE active = TRUE;
CREATE INDEX idx_webhooks_workflow ON webhooks (workflow_id) WHERE workflow_id IS NOT NULL;

-- Replay/deduplicação de webhooks recebidos
CREATE TABLE webhook_events (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    body_hash       TEXT NOT NULL,                          -- SHA-256 do body (deduplicação)
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    processed       BOOLEAN NOT NULL DEFAULT FALSE,
    error           TEXT,
    CONSTRAINT uq_webhook_body_hash UNIQUE (webhook_id, body_hash, date_trunc('hour', received_at))
);
CREATE INDEX idx_webhook_events_hash ON webhook_events (body_hash);
CREATE INDEX idx_webhook_events_received ON webhook_events (webhook_id, received_at DESC);
```

> **Segurança de webhook** (`v2-security-spec.md` §12): HMAC-SHA256 na header
> `x-agentflow-signature` + `x-agentflow-timestamp` + anti-replay (nonce window
> 5 min). O `hmac_secret` é encriptado AES-GCM no DB.

---

## 6. Credenciais (DDL)

### 6.1 Enums de credencial

```sql
CREATE TYPE credential_type AS ENUM ('api_key','oauth2','basic','token','service_account');
CREATE TYPE credential_auth_kind AS ENUM ('bearer','basic','query','header','oauth');
```

### 6.2 Tabela `credential_types` (catálogo de tipos)

Catálogo estático de **tipos de credencial** com schema de propriedades
(Zod/JSON Schema) para UI dinâmica.

```sql
CREATE TABLE credential_types (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    key             TEXT NOT NULL UNIQUE,                    -- "openai", "googleSheetsOauth2Api", ...
    display_name    TEXT NOT NULL,
    description     TEXT,
    category        TEXT,                                   -- api|database|communication|cloud
    provider        TEXT,                                   -- "openai", "google", ...
    auth_kind       credential_auth_kind,
    properties_schema JSONB NOT NULL,                        -- JSON Schema dos campos
    test_endpoint   TEXT,                                   -- URL de teste de conexão
    icon            TEXT,                                   -- lucide icon
    is_system       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credential_types_cat ON credential_types (category);
```

### 6.3 Tabela `credentials`

```sql
CREATE TABLE credentials (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    type            TEXT NOT NULL,                          -- credType key
    provider        TEXT NOT NULL,                          -- "openai", "generic", ...

    -- Dados sensíveis encriptados (envelope AES-256-GCM). Env: v | alg | iv | ct | tag | kv
    data_encrypted  TEXT NOT NULL,
    search_prefix   CHAR(8),                                -- prefixo visível (não sensível)
    key_version     TEXT NOT NULL DEFAULT 'v1',
    algorithm       TEXT NOT NULL DEFAULT 'AES-256-GCM',

    -- Metadados não-sensíveis
    description     TEXT,
    scopes          TEXT[],
    metadata        JSONB,

    expires_at      TIMESTAMPTZ,                            -- expiração da credencial (ex: OAuth refresh)
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id)
);
-- Nome único ativo por org+type
CREATE UNIQUE INDEX idx_credentials_org_name_active
    ON credentials (org_id, name) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_credentials_org_type
    ON credentials (org_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_credentials_search_prefix
    ON credentials (org_id, search_prefix) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_credentials_key_version
    ON credentials (org_id, key_version) WHERE revoked_at IS NULL;
CREATE INDEX idx_credentials_last_used
    ON credentials (last_used_at DESC) WHERE last_used_at IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX idx_credentials_expires
    ON credentials (expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;
```

> **Envelope encryption** (`v2-security-spec.md` §5): `data_encrypted` é um JSON
> `{v, alg, iv, ct, tag, kv}`. A chave mestra sai do env var (self-hosted) ou KMS
> (cloud); o DEK pode ser por tenant. A coluna `search_prefix` permite lookup sem
> descriptografar. `key_version` habilita rotação programada (veja ADR-5).

### 6.4 Tabela `credential_key_versions` (controle de rotação)

```sql
CREATE TABLE credential_key_versions (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version         TEXT NOT NULL,                          -- "v1", "v2"
    algorithm       TEXT NOT NULL DEFAULT 'AES-256-GCM',
    salt            TEXT,                                   -- base64 do salt HKDF
    active          BOOLEAN NOT NULL DEFAULT FALSE,
    deprecated_at   TIMESTAMPTZ,
    rotated_at      TIMESTAMPTZ,
    rotated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_credkv_org_ver UNIQUE (org_id, version)
);
CREATE INDEX idx_credkv_active ON credential_key_versions (active);
```

### 6.5 Tabela `credential_shares` (compartilhamento)

```sql
CREATE TABLE credential_shares (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    credential_id   UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    team_id         UUID,                                  -- share com equipe
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'viewer',          -- viewer|editor|use(decrypt only exec)
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    CHECK (team_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE UNIQUE INDEX idx_credshares_cred_user_team
    ON credential_shares (credential_id, user_id, team_id);
CREATE INDEX idx_credshares_cred ON credential_shares (credential_id);
```

### 6.6 Tabela `credential_audit_logs`

A auditoria de credenciais é **separada** e **append-only** (`audit_logs` é
genérico; esta é específica e mais volúme):

```sql
CREATE TABLE credential_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    credential_id   UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    action          TEXT NOT NULL,                         -- CREATE|READ|READ_FULL|UPDATE|DELETE|DECRYPT|ROTATE_KEY|TEST|EXPORT
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    ip              INET,
    user_agent      TEXT,
    request_id      UUID,
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    error_message   TEXT,
    key_version     TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credaudit_cred_ts  ON credential_audit_logs (credential_id, created_at DESC);
CREATE INDEX idx_credaudit_org_ts   ON credential_audit_logs (org_id, created_at DESC);
CREATE INDEX idx_credaudit_user_ts  ON credential_audit_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_credaudit_action   ON credential_audit_logs (action);

-- Retenção mínima 1 ano (LGPD / compliance). Tabela append-only com permissões
-- restritas (não RLS deleta — imutável por design).
```

---

## 7. IA / AI (DDL)

### 7.1 Tabela `ai_providers_config`

```sql
CREATE TABLE ai_providers_config (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,                         -- "openai", "anthropic", "google", "azure", ...
    alias           TEXT NOT NULL,                         -- nome amigável (ex: "OpenAI Pro")
    base_url        TEXT,                                  -- endpoint custom (ex: OpenRouter)
    api_key_encrypted TEXT NOT NULL,                       -- AES-GCM
    model_default   TEXT NOT NULL,
    models_allowed  TEXT[] NOT NULL DEFAULT '{}',          -- lista de modelos permitidos
    rate_limit      JSONB NOT NULL DEFAULT '{"rpm":60,"rpd":1000}'::jsonb,
    cost_per_1k     JSONB,                                 -- {input: 0.003, output: 0.006}
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,        -- true = provider global (ex: OpenAI built-in)
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_tested_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id),
    CONSTRAINT uq_ai_provider_org UNIQUE (org_id, provider, alias)
);
CREATE INDEX idx_ai_providers_org ON ai_providers_config (org_id) WHERE active = TRUE;
CREATE INDEX idx_ai_providers_default ON ai_providers_config (org_id, is_default) WHERE is_default = TRUE;
```

> A chave da API do provedor é encriptada AES-GCM (envelope). Teste de conexão
> roda no worker sem vazar segredo (`v2-security-spec.md` §5.5).

### 7.2 Tabela `ai_memory` (sessões de conversa)

```sql
CREATE TABLE ai_memory (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    session_id      UUID NOT NULL,
    workflow_id     UUID REFERENCES workflows(id) ON DELETE CASCADE,
    node_key        TEXT,                                  -- nó AI que originou a interação
    messages        JSONB NOT NULL,                        -- [{role, content, ts}, ...]
    metadata        JSONB,                                 -- contexto (user_id, vars, ...)
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_memory_session ON ai_memory (session_id);
CREATE INDEX idx_ai_memory_org_session ON ai_memory (org_id, session_id);
CREATE INDEX idx_ai_memory_expires ON ai_memory (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_ai_memory_msgs_gin ON ai_memory USING GIN (messages);
```

### 7.3 Tabela `vector_documents` (RAG / pgvector)

```sql
CREATE TABLE vector_documents (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
    collection      TEXT NOT NULL DEFAULT 'default',       -- namespace RAG
    source          TEXT NOT NULL,                         -- URL, arquivo, credencial
    source_type     TEXT NOT NULL,                         -- url|file|text|api
    content         TEXT NOT NULL,                         -- texto bruto (chunk)
    embedding       VECTOR(1536),                          -- pgvector (dimensão configurável)
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {page, chunk_index, mime, ...}
    token_count     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vector_org_collection ON vector_documents (org_id, collection);
CREATE INDEX idx_vector_embedding_hnsw
    ON vector_documents USING hnsw (embedding vector_l2_ops)
    WITH (m = 16, ef_construction = 200);
CREATE INDEX idx_vector_source ON vector_documents (source);
```

> **Indexação vetorial HNSW**: apenas queries `INNER PRODUCT`/`L2` fazem sentido
> após `WHERE org_id = ?` (RLS garante isolamento de tenant antes do scan vetorial).

### 7.4 Tabela `ai_cost_tracking`

```sql
CREATE TABLE ai_cost_tracking (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    execution_id    UUID REFERENCES executions(id) ON DELETE SET NULL,
    workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    tokens_input    BIGINT NOT NULL DEFAULT 0,
    tokens_output   BIGINT NOT NULL DEFAULT 0,
    tokens_cached   BIGINT NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(12,6) NOT NULL DEFAULT 0,
    latency_ms      INT,
    request_count   INT NOT NULL DEFAULT 1,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_cost_org_ts ON ai_cost_tracking (org_id, created_at DESC);
CREATE INDEX idx_ai_cost_exec ON ai_cost_tracking (execution_id) WHERE execution_id IS NOT NULL;
CREATE INDEX idx_ai_cost_provider ON ai_cost_tracking (provider, model, created_at DESC);
```

---

## 8. Templates, notificações, aprovações, webhooks, scheduler (DDL)

### 8.1 Tabela `template_categories` e `workflow_templates`

```sql
CREATE TABLE template_categories (
    id            UUID PRIMARY KEY DEFAULT public.new_id(),
    key           TEXT NOT NULL UNIQUE,                    -- "trigger", "communication", ...
    name          TEXT NOT NULL,
    icon          TEXT,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_templates (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global/system
    category_id     UUID REFERENCES template_categories(id),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    data            JSONB NOT NULL,                        -- workflow JSON n8n-compatível
    data_hash       TEXT NOT NULL,                         -- SHA-256 (imutabilidade)
    author          TEXT,                                -- nome do author
    is_global       BOOLEAN NOT NULL DEFAULT FALSE,
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    downloads       INT NOT NULL DEFAULT 0,
    rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INT NOT NULL DEFAULT 0,
    metadata        JSONB,                                 -- {tags, estimatedTime, nodesSummary}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id),
    CONSTRAINT uq_template_org_slug UNIQUE (org_id, slug)
);
CREATE INDEX idx_templates_category ON workflow_templates (category_id);
CREATE INDEX idx_templates_global_published ON workflow_templates (is_global, published) WHERE is_global = TRUE AND published = TRUE;
CREATE INDEX idx_templates_downloads ON workflow_templates (downloads DESC);
CREATE INDEX idx_templates_org ON workflow_templates (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_templates_data_gin ON workflow_templates USING GIN (data);
```

> Templates globais (`is_global = TRUE`) são read-only do sistema; templates de org
> são customizáveis. O campo `org_id IS NULL` indica template global (RLS trata como
> visível a todos os tenants).

### 8.2 Tabela `notifications`

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,                         -- execution:failed, approval:required, ...
    title           TEXT NOT NULL,
    message         TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {executionId, workflowId, ...}
    url             TEXT,                                  -- link de deep-dive
    read_at         TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ,
    priority        INT NOT NULL DEFAULT 0,                -- ordering
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_read
    ON notifications (user_id, read_at) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX idx_notifications_org_ts
    ON notifications (org_id, created_at DESC);
```

### 8.3 Tabela `approvals`

```sql
CREATE TABLE approvals (
    id              UUID PRIMARY KEY DEFAULT public.new_id(),
    org_id          UUID NOT NULL,
    execution_id    UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    node_key        TEXT NOT NULL,                         -- nó de aprovação no workflow
    status          TEXT NOT NULL DEFAULT 'pending',       -- pending|approved|rejected|expired|cancelled
    requester_user_id UUID NOT NULL REFERENCES users(id),
    approver_ids    UUID[],                                -- usuários que podem aprovar
    decided_by      UUID REFERENCES users(id),
    decided_at      TIMESTAMPTZ,
    decision        TEXT,                                  -- approver comment
    expires_at      TIMESTAMPTZ,
    data            JSONB,                                 -- payload de contexto (máscara)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_approvals_execution_node
    ON approvals (execution_id, node_key) WHERE status = 'pending';
CREATE INDEX idx_approvals_approver ON approvals (approver_ids) WHERE status = 'pending';
CREATE INDEX idx_approvals_org_status
    ON approvals (org_id, status, created_at DESC);
CREATE INDEX idx_approvals_expires
    ON approvals (expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;
```

> **Concenrência de aprovação**: update com `WHERE status = 'pending'` garante
> atomicidade (não duas aprovações simultâneas).

---

## 9. Row Level Security — políticas SQL

O isolamento de tenant é a **pedra fundamental** da segurança multi-tenant. Seguimos
duas camadas de defesa (defense in depth, `v2-security-spec.md` §0.2):

1. **Service layer**: toda query Prisma inclui `org_id` explicitamente.
2. **RLS**: política de banco que **força** `org_id = current_setting('app.org_id')`.

### 9.1 Funções helper + session setting

```sql
-- O middleware de auth executa no início de cada request autenticado:
--   await prisma.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true);`
-- O `true` (is_local) garante a config dura apenas pela duração da transação/request.

-- Usuário efetivo (para auditoria + RLS de bypass)
--   set_config('app.user_id', ${userId}, true);
--   set_config('app.is_super_admin', ${isSuperAdmin ? 'on' : 'off'}, true);

-- Helper: retorna org_id atual da sessão (NULL quando não autenticado)
CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.org_id', true)::uuid;
$$;

-- Helper: bypass de superuser (platform admins)
CREATE OR REPLACE FUNCTION app.is_super_admin() RETURNS BOOLEAN
  LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.is_super_admin', true) = 'on';
$$;
```

### 9.2 Habilitando RLS em tabelas tenant-scoped

```sql
-- Lista de tabelas que carregam org_id
-- users_sessions (não tem org_id direto, mas filtrado por user_id → sessions.org_id)
-- organizations, memberships, roles, role_permissions — gerenciados por superuser
```

### 9.3 Políticas padrão por categoria

**Categorias de política**:
- **owner_all**: owner pode tudo; demais negado (tabelas sensíveis: `credential_key_versions`,
  `ai_providers_config.api_key_encrypted`).
- **member_org**: membros da org veem seus próprios registros + compartilhados.
- **cross_org_deny**: nada de outro org, exceto superuser.

```sql
-- Helper: usuário é membro da org atual?
CREATE OR REPLACE FUNCTION app.org_member_check(p_user UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = p_user AND m.org_id = app.current_org_id()
    AND m.status = 'active' AND m.deleted_at IS NULL
  );
$$;

---------------------------------------------------------------
-- USERS (cross-org: superuser ve, mas ninguém vê outro org)
---------------------------------------------------------------
-- users não é scoped por org_id (é global). Visibilidade:
-- - superuser: tudo
-- - ninguém lê email de outro org via RLS em tabelas de relacionamento
-- Política de row em users é permissiva (user pode ver seu próprio perfil),
-- mas queries cross-tenant são bloqueadas no service layer.

---------------------------------------------------------------
-- ORGANIZATIONS (superuser CRUD; membros veem apenas a deles)
---------------------------------------------------------------
CREATE POLICY org_is_super_admin ON organizations
  FOR ALL TO PUBLIC
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY org_member_own ON organizations
  FOR SELECT
  TO PUBLIC
  USING (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = organizations.id
      AND m.user_id = current_setting('app.user_id', true)::uuid
      AND m.status = 'active'
    )
  );

---------------------------------------------------------------
-- WORKFLOWS
---------------------------------------------------------------
CREATE POLICY wf_select ON workflows
  FOR SELECT TO PUBLIC
  USING (
    deleted_at IS NULL
    AND (app.is_super_admin() OR org_id = app.current_org_id())
  );

CREATE POLICY wf_insert ON workflows
  FOR INSERT TO PUBLIC
  WITH CHECK (
    app.is_super_admin()
    OR (org_id = app.current_org_id()
        AND app.org_member_check(current_setting('app.user_id', true)::uuid))
  );

-- UPDATE/DELETE: apenas owners/admins da org; org_id fixo (imutável após create)
CREATE POLICY wf_modify ON workflows
  FOR UPDATE, DELETE TO PUBLIC
  USING (
    deleted_at IS NULL
    AND (app.is_super_admin() OR org_id = app.current_org_id())
  )
  WITH CHECK (
    app.is_super_admin()
    OR (org_id = app.current_org_id() AND deleted_at IS NULL)
  );

---------------------------------------------------------------
-- WORKFLOW_NODES / EDGES (sempre via workflows; mas têm org_id denormalizado)
---------------------------------------------------------------
CREATE POLICY wn_scope ON workflow_nodes
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY we_scope ON workflow_edges
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

---------------------------------------------------------------
-- EXECUÇÕES (executions, execution_data, execution_nodes, execution_node_logs,
-- execution_metrics, ai_cost_tracking, notifications)
---------------------------------------------------------------
CREATE POLICY exec_scope ON executions
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

-- Tabelas filhas herdam org_id; política usando EXISTS → execução do org
CREATE POLICY en_scope ON execution_nodes
  FOR ALL TO PUBLIC
  USING (
    EXISTS (SELECT 1 FROM executions e WHERE e.id = execution_nodes.execution_id AND e.org_id = app.current_org_id())
    OR app.is_super_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM executions e WHERE e.id = execution_nodes.execution_id AND e.org_id = app.current_org_id())
    OR app.is_super_admin()
  );

CREATE POLICY enl_scope ON execution_node_logs
  FOR ALL TO PUBLIC
  USING (
    EXISTS (SELECT 1 FROM executions e WHERE e.id = execution_node_logs.execution_id AND e.org_id = app.current_org_id())
    OR app.is_super_admin()
  );

CREATE POLICY ed_scope ON execution_data
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY em_scope ON execution_metrics
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY aic_scope ON ai_cost_tracking
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY notif_scope ON notifications
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin());

---------------------------------------------------------------
-- CREDENCIAIS (owner_all: owner/admin decrypt; member ve hasValue)
---------------------------------------------------------------
CREATE POLICY cred_scope ON credentials
  FOR ALL TO PUBLIC
  USING (
    deleted_at IS NULL
    AND (app.is_super_admin() OR org_id = app.current_org_id())
  )
  WITH CHECK (
    app.is_super_admin() OR org_id = app.current_org_id()
  );

-- credential_shares: visível ao compartilhado
CREATE POLICY credshare_scope ON credential_shares
  FOR ALL TO PUBLIC
  USING (
    EXISTS (SELECT 1 FROM credentials c WHERE c.id = credential_id AND c.org_id = app.current_org_id())
    OR app.is_super_admin()
  );

-- credential_audit_logs: só owner/admin da org
CREATE POLICY credaudit_scope ON credential_audit_logs
  FOR SELECT ON credentials_audit_logs TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin());

---------------------------------------------------------------
-- SCHEDULER / WEBHOOKS / TEMPLATES / AI / APROVALS
---------------------------------------------------------------
CREATE POLICY sched_scope ON scheduled_triggers
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY wh_scope ON webhooks
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY tmpl_scope ON workflow_templates
  FOR ALL TO PUBLIC
  USING (is_global = TRUE OR org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (app.is_super_admin() OR org_id = app.current_org_id());

CREATE POLICY ai_scope ON ai_providers_config
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY aim_scope ON ai_memory
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY vd_scope ON vector_documents
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY appr_scope ON approvals
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY apikey_scope ON api_keys
  FOR ALL TO PUBLIC
  USING (
    deleted_at IS NULL
    AND (app.is_super_admin() OR org_id = app.current_org_id())
  )
  WITH CHECK (
     app.is_super_admin() OR org_id = app.current_org_id()
   );
```

> **Tabelas de usage/billing e node_types**:
> - `usage_records`, `subscriptions`, `billing_events`, `plans`: scoped por `org_id`;
>   política idêntica a `api_keys` (org admin). `plans` é global (super-admin only).
> - `node_types`: built-in (`org_id IS NULL`) visível a todos; custom scoped por org.

```sql
-- usage / billing
CREATE POLICY usage_scope ON usage_records
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY sub_scope ON subscriptions
  FOR ALL TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

CREATE POLICY be_scope ON billing_events
  FOR SELECT, INSERT ON billing_events TO PUBLIC
  USING (org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (org_id = app.current_org_id() OR app.is_super_admin());

-- plans é global (super-admin CRUD)
CREATE POLICY plans_scope ON plans
  FOR SELECT TO PUBLIC USING (TRUE);                      -- listagem pública de planos
CREATE POLICY plans_admin ON plans
  FOR INSERT, UPDATE, DELETE TO PUBLIC
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

-- node_types: built-in global visible; custom scoped
CREATE POLICY nt_scope ON node_types
  FOR ALL TO PUBLIC
  USING (is_built_in = TRUE OR org_id = app.current_org_id() OR app.is_super_admin())
  WITH CHECK (is_built_in = TRUE
              OR (org_id = app.current_org_id() AND app.org_member_check(current_setting('app.user_id', true)::uuid)));
```

> **Forçando a config de tenant em conexões**: o middleware Fastify executa
> `SELECT set_config('app.org_id', org::text, true)` para **todas** as requests
> autenticadas antes de qualquer handler. Requests não autenticadas não têm
> `app.org_id` definido → queries RLS retornam 0 linhas (fail-closed). Ver ADR-2.

> **Aprovação cross-org bloqueada**: tabelas de `approvals` carregam `org_id`
> redundante (mesmo do `execution`) para RLS sem sub-query.

---

## 10. Índices

### 10.1 Índices obrigatórios por tabela

| Tabela | Índice | Query atendida |
|--------|--------|----------------|
| workflows | `idx_workflows_org_status_active` | Listagem por org + filtro status/active |
| workflows | `idx_workflows_org_updated` (covering) | Feed de atividade da org |
| workflows | `idx_workflows_org_slug_active` | Lookup por slug (webhook/cron trigger) |
| workflow_versions | `idx_workflows_org_created` | Histórico de versões |
| workflow_nodes | `idx_workflow_nodes_type` | Catálogo por tipo de nó |
| workflow_edges | `idx_workflow_edges_cond` | Edges condicionais (IF/Switch) |
| executions | `idx_executions_org_status_started` | Listagem principal de execuções |
| executions | `idx_executions_workflow_org` | Execuções de um workflow |
| executions | `idx_executions_lock` | Workers reivindicam execuções lockadas |
| executions | `idx_executions_archived` | Job de arquivamento |
| executions | `idx_executions_created_gin` | Busca textual em `input` |
| execution_nodes | `idx_execution_nodes_exec_run` | Timeline da execução por ordem |
| execution_node_logs | `idx_enl_exec_node` | Logs de um node específico |
| credentials | `idx_credentials_org_name_active` | Lookup por nome |
| credentials | `idx_credentials_search_prefix` | Lookup por prefixo (sem decrypt) |
| credentials | `idx_credentials_key_version` | Rotação em lote |
| credentials | `idx_credentials_expires` | Credenciais expiradas |
| credential_audit_logs | `idx_credaudit_org_ts` | Auditoria por org |
| credential_audit_logs | `idx_credaudit_cred_ts` | Auditoria de uma credencial |
| audit_logs | `idx_audit_org_action_ts` | Query de auditoria quente |
| audit_logs | `idx_audit_resource` | Lookup por recurso |
| api_keys | `idx_api_keys_prefix_org_active` | Lookup de key por prefix |
| api_keys | `idx_api_keys_hash` | Validação de key (exact match) |
| sessions | `idx_sessions_user_org` | Revogação por usuário/org |
| scheduled_triggers | `idx_sched_org_enabled_next` | Scheduler: próximos disparos |
| webhooks | `idx_webhooks_org_active` | Webhook receiver lookup |
| webhooks | `uq_webhooks_org_path` | Roteamento público único |
| webhook_events | `idx_webhook_events_hash` | Deduplicação (replay) |
| vector_documents | `idx_vector_embedding_hnsw` | Busca vetorial (HNSW) |
| vector_documents | `idx_vector_org_collection` | Scoping de tenant + collection |
| workflow_templates | `idx_templates_global_published` | Galeria pública |
| workflow_templates | `idx_templates_org` | Templates customizados da org |
| approvals | `idx_approvals_execution_node` | Aprovação pendente única por node |
| approvals | `idx_approvals_approver` | Aprovações do usuário logado |
| node_types | `idx_node_types_category` | Catálogo por categoria (palette) |
| node_types | `idx_node_types_params_gin` | Validação dinâmica de parâmetros |
| usage_records | `idx_usage_org_type_window` | Fatura por org + tipo + janela |
| subscriptions | `idx_subscriptions_period_end` | Scheduler de renovação |
| billing_events | `idx_billing_events_stripe` | Idempotência de webhook Stripe |
| execution_metrics | `idx_exec_metrics_org` | Métricas de custo da org |
| scheduled_triggers | `idx_sched_org_enabled_next` | Scheduler: próximos disparos |
| queues | `idx_queues_org` | Contadores de fila por org |

### 10.2 Índices parciais (query-specific)

```sql
-- Soft-delete: queries de listing sempre filtram deleted_at IS NULL
CREATE INDEX idx_credentials_all_active
    ON credentials (org_id, type, name) WHERE deleted_at IS NULL;

-- Apenas execuções ativas (não arquivadas) para listagens UI
CREATE INDEX idx_executions_active
    ON executions (org_id, status, started_at DESC) WHERE archived_at IS NULL;

-- Apenas credenciais não-revogadas para rotação
CREATE INDEX idx_credentials_revoked_for_rotation
    ON credentials (key_version, updated_at) WHERE revoked_at IS NULL;
```

### 10.3 Índices compostos / covering

```sql
-- Covering index: listagem de workflows sem tocar a tabela
CREATE INDEX idx_workflows_list_covering
    ON workflows (org_id, status, active, updated_at DESC)
    INCLUDE (name, slug, description)
    WHERE deleted_at IS NULL;

-- Covering para execuções na timeline (status + duração)
CREATE INDEX idx_executions_timeline_covering
    ON executions (org_id, started_at DESC, status, duration_ms)
    INCLUDE (workflow_id, error)
    WHERE archived_at IS NULL;
```

### 10.4 Índices para performance de texto

```sql
-- Busca fuzzy em nomes (pg_trgm)
CREATE INDEX idx_workflows_name_trgm ON workflows USING GIN (name gin_trgm_ops);
CREATE INDEX idx_credentials_name_trgm ON credentials USING GIN (name gin_trgm_ops);

-- Busca textual estruturada em payload JSONB
CREATE INDEX idx_executions_input_ts
    ON executions USING GIN (to_tsvector('portuguese', input::text));

-- JSONB path queries em settings/tags
CREATE INDEX idx_workflows_tags_gin ON workflows USING GIN (tags);
CREATE INDEX idx_workflows_settings_gin ON workflows USING GIN (settings);
CREATE INDEX idx_exec_nodes_config_gin ON execution_nodes USING GIN (node_config);
```

### 10.5 Análise de queries quentes

| Query | Pattern | Índice esperado |
|-------|---------|-----------------|
| `GET /workflows` | `org_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20` | `idx_workflows_org_updated` |
| `GET /workflows/:slug` | `org_id=? AND slug=?` | `idx_workflows_org_slug_active` |
| `GET /executions` | `org_id=? AND started_at>? ORDER BY started_at DESC` | `idx_executions_org_status_started` |
| `GET /executions/:id` | `id=?` (+ org scoping via RLS) | `executions.pkey` (UUID) |
| Webhook trigger | `org_id=? AND path=?` | `uq_webhooks_org_path` |
| Scheduler tick | `enabled AND next_run_at <= now() ORDER BY next_run_at` | `idx_sched_org_enabled_next` |
| Credential decrypt (exec) | `id=? AND org_id=?` | `credentials.pkey` (UUID) |
| Busca de logs | `execution_id=? ORDER BY logged_at` | `idx_enl_exec_node` |
| Vector search | `org_id=? AND collection=?` → `embedding <=> query` | `idx_vector_embedding_hnsw` + `idx_vector_org_collection` |
| Reeváliar retry | `status='running' AND lock_expiry_at < now()` | `idx_executions_lock` |

---

## 11. Migrações

### 11.1 Estratégia expand/contract

Seguimos o padrão **expand/contract** de migração para zero downtime:

1. **Expand**: migrations **aditivas** (novas colunas/tabelas/defaults que não
   quebram leitores antigos). Deploy da aplicação que **escreve** em colunas novas
   mas ainda **lê** das antigas.
2. **Migrate data**: job em background (batches) para copiar dados da coluna antiga
   para a nova (idempotente, pausable).
3. **Contract**: migração que **remove** colunas/tabelas antigas — deploy da
   aplicação que só lê da nova coluna.

```sql
-- migration: add org_id to legacy table (expand phase)
ALTER TABLE legacy_nodes ADD COLUMN org_id UUID;
UPDATE legacy_nodes SET org_id = (SELECT org_id FROM workflows w WHERE w.id = legacy_nodes.workflow_id);
ALTER TABLE legacy_nodes ALTER COLUMN org_id SET NOT NULL;
-- índice depois de populado
CREATE INDEX CONCURRENTLY idx_legacy_nodes_org ON legacy_nodes (org_id);

-- migration: backfill via job (contract phase roda depois de job concluir)
ALTER TABLE legacy_nodes DROP COLUMN IF EXISTS workflow_id; -- apenas após job concluir
```

### 11.2 Versionamento de migrations

Convenção de diretório:

```
packages/database/prisma/migrations/
├── 20260820120000_init_schema/migration.sql      -- baseline
├── 20260820123000_rls_policies/migration.sql
├── 20260820130000_indexes/migration.sql
├── 20260820140000_vector/migration.sql           -- pgvector
└── migration_lock.toml                            -- provider = "postgresql"
```

Cada `migration.sql` é **idempotente parcialmente** (uses `IF NOT EXISTS`) e
aplicado via `pgTap` ou `prisma migrate` (qualquer runner standard).

### 11.3 Lock de migração

```sql
-- Garantir single-runner (prisma migrate já faz, mas reforçamos):
-- SELECT pid FROM pg_stat_activity WHERE state='active' AND query LIKE '%migration%' 
-- Se mais de 1 row → abortar.
```

Prisma `migrate deploy` já implementa lock via tabela `_Migration` + advisory
lock. Em ambientes CI sem Prisma, usamos:

```sql
-- _MigrationLock tabela custom (alternativa):
CREATE TABLE IF NOT EXISTS migration_lock (
    locking BOOLEAN PRIMARY KEY DEFAULT FALSE,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    version TEXT
);
INSERT INTO migration_lock (locking, locked_by, locked_at, version)
  VALUES (FALSE, NULL, NULL, NULL) ON CONFLICT (locking) DO NOTHING;

-- SELECT pg_advisory_lock(hashtext('agentflow_migrations'));
```

### 11.4 Migração de dados grandes em lotes

```sql
-- Exemplo: migração credentials → nova estrutura encriptada.
-- Roda em job BullMQ `credential:migrate`, batch 100, pausable.
DO $$
DECLARE
  batch_size CONSTANT INT := 100;
  migrated   INT := 0;
BEGIN
  LOOP
    UPDATE credentials
    SET data_encrypted = encrypt_legacy_to_envelope(data::jsonb)
    WHERE id IN (
      SELECT id FROM credentials
      WHERE data_encrypted IS NULL
        AND deleted_at IS NULL
      ORDER BY id LIMIT batch_size
    );
    GET DIAGNOSTICS migrated = ROW_COUNT;
    EXIT WHEN migrated = 0;
    PERFORM pg_sleep(0.1); -- yield
  END LOOP;
END $$;
```

### 11.5 Rollback

- **Additive**: simples `DROP INDEX IF EXISTS`, `DROP TABLE IF EXISTS`.
- **Destructiva**: migrations destrutivas **não** removem dados — marcam
  `deleted_at` ou movem para tabela `archived.<name>`. Rollback de dados grandes
  exige `pg_dump` point-in-time (`pg_waldump` + `pg_rewind`).

```sql
-- Rollback de um enum: não drop direto (bloqueia se houver referências).
-- Estratégia: migração "contract" converte enum colunas para TEXT,
-- só então o enum pode ser dropado.
```

---

## 12. Decisões de design (ADR)

### ADR-1: PK UUID v7 vs SERIAL/IDENTITY

| Critério | UUID v7 | SERIAL/IDENTITY |
|----------|---------|-----------------|
| Contenda em alta escrita | Baixa (não contenciona) | Alta (sequence global) |
| Enumeração previsível | Não (oculta contagem) | Sim |
| Ordenação natural | Sim (prefixo temporal no v7) | Sim (mas global) |
| Portabilidade multi-region | Sim | Não (sequence regional) |
| Debug (human-friendly) | Não | Sim (1, 2, 3...) |

**Decisão**: UUID via `gen_random_uuid()` para todas as tabelas de dados. Para
tabelas **append-only high-volume** (`audit_logs`, `credential_audit_logs`,
`execution_node_logs`), usamos `BIGSERIAL` (inserção sequencial sempre na
partição mais recente — não há hot-spot porque a escrita é por tenant distinto
via partição). `BIGSERIAL` também é mais barato de indexar (8 bytes vs 16).

### ADR-2: RLS como defesa primária (fail-closed)

**Problema**: um bug no service layer que esquece `org_id` vaza dados cross-tenant.

**Decisão**: RLS **obrigatório** em todas as tabelas `org_id`. O tenant é definido
via `set_config('app.org_id', ..., true)` no middleware de auth. Se `app.org_id`
não estiver definido → policy retorna `FALSE` (fail-closed). Super admins usam
`app.is_super_admin = on` para bypass.

**Trade-off**: overhead de ~2-4% em queries (política avaliada por linha).
Mitigado por **índices parciais** que já filtram `org_id` antes do scan.

### ADR-3: Workflow data — nodes/edges estruturados + JSON snapshot

**Problema**: n8n usa JSON monolítico; precisamos queryabilidade *e* compatibilidade.

| Abordagem | Prós | Contras |
|-----------|------|---------|
| JSON monolítico (`data JSONB`) | 1:1 compat n8n; simples | Impossível queryar nodes por tipo; update de node = rewrite todo JSON |
| Tabelas normalizadas (`workflow_nodes`, `workflow_edges`) | Queryável, indexável | Perde format n8n; reconstrução custa |
| **Híbrido (escolhido)** | Snapshot JSON imutável em versões; estrutura viva queryável no workflow ativo | Duplicidade de escrita (gerenciada em transação) |

**Decisão**: 
- `workflows` carrega a definição **viva** (queryável) em tabelas normalizadas.
- Cada `save`/`publish` cria um `workflow_versions` com `data JSONB` (snapshot n8n
  completo) e `data_hash`. Rollback = apontar workflow para a versão + recriar
  nodes/edges a partir do snapshot (migração idempotente).

### ADR-4: Soft delete vs hard delete

**Problema**: usuários deletam workflows/credenciais; precisamos de recovery +
integridade referencial.

**Decisão**: **soft delete** padrão (`deleted_at`). Constraints UNIQUE usam
**índices parciais** (`WHERE deleted_at IS NULL`) para permitir reutilização de
slug/nome após exclusão. Foreign keys apontam para tabelas soft-deletadas
(não cascata física). Limpeza física é feita por job `vacuum` pós-retenção (ADR-7).

**Exceção**: `audit_logs` e `credential_audit_logs` são **append-only imutáveis**
(nunca deletados).

### ADR-5: Credenciais — envelope encryption + rotação programada

**Base**: `v2-security-spec.md` §5 (envelope encryption, DEK por tenant).

**Decisão no schema**:
- `credentials.data_encrypted` = envelope JSON `{v, alg, iv, ct, tag, kv}`.
- `credential_key_versions` controla rotação (dual-write: versão antiga válida até
  migração completa).
- API **nunca** devolve `data_encrypted`; só `{hasValue: true}` (mascarado).
- Descriptografia só no runner (`decryptForExecution`) com auditoria
  `CREDENTIAL_AUDIT` + rate limit.

### ADR-6: Particionamento de execuções

**Problema**: `executions` cresce linearmente com uso; queries focam no período
recente; policies de retenção por faixa temporal.

**Decisão**: particionamento **range em `created_at` (mensal)** +
índices locais. Partições = `executions_YYYY_MM`. Queries antigas (arquivo frio)
podem usar `archive_bucket` (S3) com view particionada. `execution_data` e
`execution_node_logs` particionados igualmente.

```sql
-- Exemplo de criação de partição
CREATE TABLE executions_2026_08 PARTITION OF executions
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE INDEX idx_executions_2026_08_org_status
    ON executions_2026_08 (org_id, status, started_at DESC);
```

### ADR-7: Retenção e arquivamento

| Recurso | Política | Ação |
|---------|----------|------|
| Execuções (FREE) | 7 dias ativos, 90 dias arquivo | job `execution:archive` move para S3 + marca `archived_at` |
| Execuções (PRO) | 90 dias ativos, 365 dias arquivo | idem |
| Credenciais audit | 1 ano (imutável) | `vacuum` físico após 13º mês |
| API keys | revogados expiram → `deleted_at` após 30d | job `cleanup:keys` |
| Webhooks | não entregue em 3 tentativas → DLQ | job `webhook:dlq-cleanup` |

Job de arquivamento (BullMQ `maintenance`):
```sql
SELECT id, data FROM executions
WHERE archived_at IS NULL AND created_at < now() - interval '90 days'
AND org plan != 'ENTERPRISE';
-- → copy JSON para S3: s3://agentflow-archive/executions/:id.json
-- → UPDATE executions SET archived_at=now(), archive_bucket='s3://...',
--     data_retention='archived' WHERE id=...;
```

### ADR-8: Locks distribuídos (concorrência)

**Dois mecanismos**:

1. **Advisory locks (PostgreSQL)** para concorrência intra-DB:
   - `pg_advisory_lock(org_id::bigint)` serializa escritas críticas por org
     (ex: atualização de `usage`/contadores).
   - `pg_try_advisory_lock(execution_id::bigint)` garante **exclusividade** de
     worker por execução (evita double-processing).

```sql
-- Worker reivindica execução
SELECT pg_try_advisory_lock(:exec_id::bigint) AS got_lock;
-- se FALSE → outro worker já processa → pula
```

2. **Redis locks (BullMQ)`** para concorrência cross-process/instance:
   - Leader election do scheduler via `SET resource=value NX PX 30000`.
   - Lock por worker_id em `scheduled_triggers` (evita double-disparo entre replicas).

**Tabela `locks`** (observabilidade — não é o mecanismo de lock):
```sql
CREATE TABLE locks (
    lock_key     BIGINT PRIMARY KEY,       -- advisory lock key
    resource     TEXT NOT NULL,            -- "execution:abc", "org:xyz:quota"
    owner        TEXT NOT NULL,            -- worker id / process id
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    meta         JSONB
);
CREATE INDEX idx_locks_expires ON locks (expires_at);
```

### ADR-9: Webhook deduplication & replay

**Problema**: reenvio acidental de webhook → dupla execução.

**Decisão**:
- `webhook_events` guarda `body_hash` (SHA-256) + `received_at`.
- Unique parcial por hora: `(webhook_id, body_hash, date_trunc('hour', received_at))`
  garante deduplicação por janela de replay.
- HMAC verificado antes do insert; falha = 401 (não cria evento).

### ADR-10: Vector search isolation

**Problema**: pgvector HNSW faz scan de toda a tabela se não houver filtro de tenant.

**Decisão**: **sempre** `WHERE org_id = ? AND collection = ?` antes do
`<=>`/`inner product`. O índice HNSW é secundário; o índice `idx_vector_org_collection`
faz o **bitmap index scan** de tenant primeiro, HNSW varre apenas o subconjunto.

---

## 13. Backup e restore

### 13.1 Estratégia WAL + base backup

```bash
# Base backup sem downtime (pg_basebackup) + WAL archiving contínuo
archive_command = 'cp %p /var/lib/postgresql/wal-archive/%f'   # no postgresql.conf
archive_timeout = 60                                          # forçar segmento/H

# Backup semanal full
pg_basebackup -h db -D /backup/base/$(date +%F) -Fp -Xs -P -R

# WAL continuado → PITR em qualquer timestamp
restore_command = 'cp /var/lib/postgresql/wal-archive/%f %p'
recovery_target_time = '2026-08-20 14:30:00'
```

### 13.2 pg_dump por tenant (parcial restore)

```bash
# Dump de um tenant isolado (RLS fail-closed garante escopo)
pg_dump -h db -U postgres -t workflows -t executions \
  --where="org_id='a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'" \
  --file=tenant_a_dump.sql agentflow

# Dump FULL para DR
pg_dump -Fc -h db -U postgres agentflow > /backup/full_$(date +%F).dump
```

### 13.3 Replicação

- **Streaming replica** (sync, 1 lag, 2 async) para leitura de analytics/RLS.
- **Logical replication** (`pgoutput` plugin) → replica `workflows`, `executions`
  para DW (isolado de credenciais).
- Credenciais (`credentials.data_encrypted`) **nunca** replicadas para leitura
  não-autorizada — apenas metadados. Envia chave KEK via KMS cross-region.

### 13.4 Restore pontual (PITR)

```bash
# 1. Restore base
tar -xzf base_backup.tar.gz -C $PGDATA
# 2. recovery.conf (PostgreSQL 12+: postgresql.auto.conf)
restore_command = 'cp /wal-archive/%f %p'
recovery_target_time = '2026-08-20 14:30:00'
recovery_target_timeline = 'latest'
# 3. pg_waldump para validar integridade
pg_waldump --starttime='2026-08-20 14:25:00' --endtime='2026-08-20 14:35:00' $WAL_FILE
```

> **Teste de restore**: job mensal automatizado `db:restore-dr-test` valida
> integridade + RLS pós-restore.

### 13.5 Considerações de segurança no backup

- Backups em **repositório criptografado** (AWS KMS SSE-C ou HashiCorp Vault).
- `pg_dump` inclui RLS policies — restore mantém isolamento de tenant.
- **Credenciais nunca em plaintext** em backups (envelope encryption no DB →
  backup só vê ciphertext).

---

## 14. Perguntas de design respondidas

### Q1: Workflows deletados — soft delete?
**R**: Sim. `deleted_at TIMESTAMPTZ` + índices parciais `WHERE deleted_at IS NULL`.
Slug reutilizável após exclusão. Hard delete físico apenas via job
`vacuum:tenant` após retenção (30 dias pós `deleted_at`).

### Q2: Quanto tempo retêm execuções?
**R**: 
- FREE: 7 dias (ativo) → 90 dias (arquivo S3) → exclusão.
- PRO: 90 dias (ativo) → 365 dias (arquivo).
- ENTERPRISE: política customizável via `organizations.limits`.
Arquivamento: job `execution:archive` noturno (migra para S3, marca
`data_retention='archived'`, mantém row enxuto com `archive_bucket`).

### Q3: Credenciais compartilhadas entre users/teams?
**R**: Sim — tabela `credential_shares` (credential_id, team_id/user_id, role,
expires_at). Compartilhamento exige permissão `credential:share` (owner/admin)
+ auditoria. UI não mostra valor; apenas `hasValue`.

### Q4: Herança de permissões folder→workflow?
**R**: A herança é **apenas de visibilidade** (folder role determina se o
workflow aparece em listagem). Execução/CRUD exige permissão explícita no
workflow ou na org — **nunca ampliação**. O motor (`v2-security-spec.md` §4.4)
faz interseção de permissões.

### Q5: Nodes/edges como tabelas ou JSON?
**R**: **Híbrido** (ADR-3). Definição viva = tabelas estruturadas
(`workflow_nodes`, `workflow_edges`) para queryabilidade. Snapshot imutável =
JSON `data` em `workflow_versions` para n8n-compat, rollback, replay exato.

### Q6: Particionamento de quais tabelas?
**R**: `executions`, `execution_data`, `execution_node_logs` por **range em
`created_at`** (mensal). Tabelas de baixo volume (`workflows`, `credentials`)
não particionadas (overhead não compensa). `audit_logs` por range anual.

### Q7: Como forçar tenant isolation?
**R**: Três camadas (defense in depth):
1. Service layer: Prisma sempre filtra `org_id`.
2. **RLS** (`org_id = current_setting('app.org_id')`) — fail-closed.
3. Índices parciais `WHERE deleted_at IS NULL` — performance garantida.

### Q8: Concurrency control em execuções?
**R**: Advisory lock por `execution_id` (`pg_try_advisory_lock`) garante
single-worker. Worker que falha deixa `lock_expiry_at` expirar; outro worker
reivindica após expiry. Tabela `queues` mantém contadores de observability.

### Q9: Migração de dados grandes?
**R**: Job BullMQ `data:migrate` em batches (100 linhas), pausable/via
`pg_advisory_lock` por lote. Rollback = idempotent (usa `idempotency_key` +
`ON CONFLICT DO NOTHING`).

### Q10: API key — como armazenar sem leaked value?
**R**: `api_keys.key_hash` = SHA-256 + `prefix` (8 chars visíveis). O valor
completo é retornado **uma só vez** na criação. Lookup = `SELECT ... WHERE
key_hash = sha256(input)` (constant-time compare).

---

## 15. Glossário

| Termo | Significado |
|-------|-------------|
| **Tenant / Org** | Unidade de isolamento multi-tenant (`organizations`). |
| **RLS** | Row Level Security — política de linha no PostgreSQL. |
| **Envelope encryption** | DEK encripta dados; KEK (env/KMS) encripta DEK. |
| **Soft delete** | `deleted_at` em vez de `DELETE`; leitura filtra. |
| **WAL** | Write-Ahead Log — base de PITR no PostgreSQL. |
| **PITR** | Point-in-Time Recovery — restore a um timestamp. |
| **HNSW** | Hierarchical Navigable Small World — índice de vector search. |
| **Advisory lock** | Lock arbitrário por chave no PostgreSQL (`pg_advisory_lock`). |
| **Expand/Contract** | Estratégia de migração sem downtime. |
| **Idempotency key** | Chave para deduplicação (evita execução dupla). |
| **Tenant isolation** | Garantia de que dados de um org são invisíveis a outro. |

---

## 16. Handoff / Resumo de entrega

**Status**: DESIGN concluído. Nenhum código de app ou migração foi aplicada.

**Modelo de dados principal (entidades centrais)**:

```
organizations (1) ──< memberships >── (n) users
              ├──< workflows ──< workflow_versions (snapshot JSONB)
              │     ├── workflow_nodes (estruturado, queryável)
              │     └── workflow_edges
              ├──< executions (particionada por data)
              │     ├── execution_nodes (timeline por nó)
              │     ├── execution_node_logs
              │     └── execution_metrics / ai_cost_tracking
              ├──< credentials (AES-256-GCM envelope, org-scoped)
              │     ├── credential_shares (compartilhamento)
              │     └── credential_audit_logs (append-only, hash chain)
               ├──< scheduled_triggers (cron distribuído, leader-election)
               ├──< webhooks + webhook_events (HMAC, dedup)
               ├──< workflow_templates + template_categories
               ├──< approvals (human-in-the-loop) + notifications
               ├──< queues (mirror BullMQ, contadores de observability)
               ├──< api_keys (prefix + SHA-256, revogável)
               ├──< subscriptions + usage_records + billing_events + plans
               ├──< node_types (catalogo built-in + custom por org)
               └──< ai_providers_config + ai_memory + vector_documents (pgvector)
```

**Garantias de segurança codificadas no schema**:
- RLS em **todas** tabelas `org_id` (fail-closed via `app.org_id` session setting).
- Credenciais: `data_encrypted` (nunca plaintext), audit imutável.
- Audit logs: `BIGSERIAL` append-only + hash chain (`prev_hash`/`record_hash`).
- Sessions: refresh token opaco (SHA-256), revogação imediata.
- API keys: prefixo visível + hash (nunca valor completo).
- Advisory locks por execução (evita double-processing).
- Particionamento mensal de execuções (retenção por tenant).
- Webhook events: `body_hash` dedup + HMAC; node_types codifica política de
  sandbox (`runtime=worker` → isolate-vm) para nós `code`.
