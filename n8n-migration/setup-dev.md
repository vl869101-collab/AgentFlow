# Setup de Desenvolvimento Local — AgentFlow

> Documentação gerada automaticamente pela task **SETUP DEV LOCAL** da missão "Recriar n8n no AgentFlow".
> Data: 2025-08-19 | Node: v22.16.0 | pnpm: 9.15.0

---

## 1. Visão Geral do Monorepo

```
agentflow/
├── apps/
│   ├── api/          # Fastify + Prisma + TypeScript (port 3001)
│   └── web/          # Next.js 15 + React 19 + Tailwind 4 (port 3000)
├── packages/
│   ├── database/     # Prisma schema + seed + client (@agentflow/database)
│   └── shared/       # Zod schemas + types (@agentflow/shared)
├── package.json      # Root scripts + turbo config
├── turbo.json        # Pipeline de build/dev
├── pnpm-workspace.yaml
└── docker-compose.yml
```

**Gerenciador de pacotes:** pnpm 9.15.0 (workspace protocol `workspace:*`)  
**Build system:** Turborepo 2.4.0

---

## 2. Pré-requisitos

| Ferramenta | Versão Mínima | Verificado |
|------------|---------------|------------|
| Node.js    | 22.x          | v22.16.0 ✓ |
| pnpm       | 9.x           | 9.15.0 ✓   |
| PostgreSQL | 16+           | Via Docker ✓ |
| Redis      | 7+            | Via Docker ✓ |

> **Nota:** Se não quiser instalar PostgreSQL/Redis localmente, use `docker compose up -d postgres redis`.

---

## 3. Instalação

```bash
# 1. Clone e entre no diretório
cd AgentFlow

# 2. Instale dependências (workspace-wide)
pnpm install
```

**Resultado esperado:** instalação sem erros, com hoisting de dependências compartilhadas.

---

## 4. Variáveis de Ambiente

### 4.1 Arquivos de Exemplo

| Arquivo | Descrição |
|---------|-----------|
| `.env.example` | Template raiz (variáveis globais + API + Web) |
| `apps/api/.env.example` | Template específico da API |

### 4.2 Variáveis Obrigatórias (por nome)

> **NUNCA** comite valores reais. Use apenas os nomes abaixo no `.env`.

#### Core / Server
- `NODE_ENV` — `development` | `test` | `production` (default: `development`)
- `PORT` — Porta da API (default: `3001`)
- `HOST` — Bind address (default: `127.0.0.1`)
- `TRUST_PROXY` — `true` | `false` | CIDR list (default: `false`)
- `CORS_ORIGIN` — Origin permitido p/ web (default: `http://localhost:3000`)

#### Database (obrigatório)
- `DATABASE_URL` — String de conexão PostgreSQL  
  Exemplo local: `postgresql://agentflow:agentflow_dev@localhost:5432/agentflow?schema=public`  
  Exemplo Docker: `postgresql://agentflow:agentflow_dev@postgres:5432/agentflow?schema=public`

#### Redis / Queue (opcional p/ dev)
- `REDIS_URL` — `redis://localhost:6379` (default)
- `QUEUE_ENABLED` — `true` para forçar fila em dev (sempre `true` em production)

#### Auth (obrigatório)
- `JWT_SECRET` — **Mínimo 32 chars** (gere: `openssl rand -hex 32`)
- `JWT_EXPIRES_IN` — Access token TTL (default: `15m`)
- `REFRESH_EXPIRES_IN` — Refresh token TTL (default: `7d`)
- `BETTER_AUTH_SECRET` — Secret do Better Auth (mínimo 32 chars)
- `BETTER_AUTH_URL` — URL base da aplicação (default: `http://localhost:3000`)

#### Encryption (obrigatório)
- `CREDENTIAL_ENCRYPTION_KEY` — **Exatamente 64 hex chars (32 bytes)** AES-256-GCM  
  Gere: `openssl rand -hex 32` ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  
  API **recusa boot** sem chave válida.

#### AI — NVIDIA NIM (opcional)
- `NVIDIA_NIM_API_KEY` — Chave da API NVIDIA
- `NVIDIA_NIM_BASE_URL` — `https://integrate.api.nvidia.com/v1`

#### Stripe (opcional p/ dev)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_MONTHLY`
- `STRIPE_PRICE_ID_YEARLY`

#### Frontend (Next.js — prefixo `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_API_URL` — `http://localhost:3001`
- `NEXT_PUBLIC_APP_URL` — `http://localhost:3000`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

#### Execução de Código (opcional)
- `EXEC_CODE_DISABLED` — `true` para desabilitar execução de código customizado
- `EGRESS_ALLOWED_HOSTS` — Lista CSV de hosts permitidos p/ egress

### 4.3 Criar `.env` Local

```bash
cp .env.example .env
# Edite .env e preencha TODAS as variáveis marcadas como "obrigatório" acima
```

---

## 5. Banco de Dados

### 5.1 Subir Postgres + Redis (Docker)

```bash
docker compose up -d postgres redis
# Verifique saúde:
docker compose ps
```

### 5.2 Gerar Prisma Client

```bash
pnpm --filter @agentflow/database generate
# ✓ Generated Prisma Client (v6.19.3) em node_modules/.pnpm/@prisma/client
```

### 5.3 Aplicar Migrações / Push Schema

```bash
# Opção A: Migrações versionadas (recomendado p/ produção)
pnpm db:migrate

# Opção B: Push direto do schema (rápido p/ dev local)
pnpm db:push
```

### 5.4 Seed (Opcional)

```bash
pnpm db:seed
# Cria organização default + workflows de exemplo (precisa de usuário existente)
```

### 5.5 Prisma Studio

```bash
pnpm db:studio
# Abre http://localhost:5555
```

---

## 6. Build dos Pacotes

Ordem de dependência: `database` → `shared` → `api` → `web`

```bash
# 1. Database (gera client)
pnpm --filter @agentflow/database generate

# 2. Shared (compila TS → dist/)
pnpm --filter @agentflow/shared build

# 3. API (compila TS → dist/)
pnpm --filter @agentflow/api build

# 4. Web (Next.js production build)
pnpm --filter @agentflow/web build
```

**Resultado verificado:** todos os 4 builds concluem com exit code 0.

---

## 7. Comandos de Desenvolvimento

### 7.1 Turborepo (recomendado — roda API + Web em paralelo)

```bash
# Dev completo (API + Web)
pnpm dev

# Apenas API
pnpm dev:api

# Apenas Web
pnpm dev:web
```

### 7.2 Comandos Individuais por Package

| Package | Comando | Porta | Descrição |
|---------|---------|-------|-----------|
| `@agentflow/api` | `pnpm --filter @agentflow/api dev` | 3001 | `tsx watch --env-file=../../.env src/server.ts` |
| `@agentflow/web` | `pnpm --filter @agentflow/web dev` | 3000 | `next dev --turbopack --port 3000` |
| `@agentflow/database` | `pnpm --filter @agentflow/database db:studio` | 5555 | Prisma Studio |

### 7.3 Worker (Background Jobs)

```bash
# Build primeiro
pnpm --filter @agentflow/api build

# Roda worker compilado
node apps/api/dist/worker.js
```

---

## 8. Verificação Rápida (Smoke Test)

```bash
# 1. Terminal 1: API
pnpm dev:api
# → [INFO] Server listening on http://127.0.0.1:3001

# 2. Terminal 2: Web
pnpm dev:web
# → ▲ Next.js 15.x.x - Local: http://localhost:3000

# 3. Teste health check
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}

# 4. Abra http://localhost:3000 no navegador
```

---

## 9. Troubleshooting

### 9.1 `pnpm install` falha com `ERR_PNPM_PEER_DEP_ISSUES`

```bash
# Force resolução de peer deps
pnpm install --shamefully-hoist
# Ou ajuste versions no package.json raiz
```

### 9.2 Prisma: `P1001: Can't reach database server`

- Verifique se PostgreSQL está rodando: `docker compose ps`
- Confira `DATABASE_URL` no `.env` (porta 5432 local vs 5433 se conflito)
- Teste conexão: `psql "postgresql://agentflow:agentflow_dev@localhost:5432/agentflow"`

### 9.3 Prisma: `P3000: Migration failed` / drift de schema

```bash
# Reset completo (CUIDADO: apaga dados)
pnpm --filter @agentflow/database db:push --force-reset
# Ou regenere migrações:
rm -rf packages/database/prisma/migrations
pnpm db:migrate
```

### 9.4 Build da API: `error TS2307: Cannot find module '@agentflow/shared'`

```bash
# Certifique-se que shared foi buildado ANTES da API
pnpm --filter @agentflow/shared build
pnpm --filter @agentflow/api build
```

### 9.5 Build da Web: `Module not found: Can't resolve '@agentflow/shared'`

- Verifique se `packages/shared/dist/index.d.ts` existe
- No `apps/web/tsconfig.json`, `baseUrl` e `paths` já apontam para `@/*`
- Rebuild shared: `pnpm --filter @agentflow/shared build`

### 9.6 Web: `Error: CORS origin not allowed`

- Confira `CORS_ORIGIN` no `.env` = `http://localhost:3000`
- Confira `NEXT_PUBLIC_API_URL` = `http://localhost:3001`

### 9.7 API: `JWT_SECRET must be at least 32 characters`

```bash
# Gere chave válida
openssl rand -hex 32
# Cole no .env como JWT_SECRET
```

### 9.8 API: `CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hex characters`

```bash
# Gere chave válida (32 bytes = 64 hex chars)
openssl rand -hex 32
# Cole no .env como CREDENTIAL_ENCRYPTION_KEY
```

### 9.9 Porta já em uso (EADDRINUSE)

```bash
# Mata processo na porta 3000/3001
# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force
```

### 9.10 TypeScript errors em `@agentflow/shared` não propagam

- O `shared` exporta via `exports` field no package.json
- Rebuild: `pnpm --filter @agentflow/shared build`
- Reinicie o TS server no IDE (VS Code: `Ctrl+Shift+P` → "TypeScript: Restart TS Server")

---

## 10. Versões Fixadas (Lockfile)

```json
{
  "node": "22.16.0",
  "pnpm": "9.15.0",
  "turbo": "2.4.0",
  "typescript": "5.7.3",
  "prisma": "6.10.1 (api) / 6.6.0 (database)",
  "@prisma/client": "6.10.1 (api) / 6.6.0 (database)",
  "next": "15.3.0",
  "react": "19.1.0",
  "fastify": "5.2.1",
  "zod": "3.24.2",
  "tailwindcss": "4.1.0"
}
```

> Versões exatas estão no `pnpm-lock.yaml`. Use `pnpm update --interactive` para upgrades controlados.

---

## 11. Próximos Passos (Fora do Escopo deste Doc)

- [ ] Configurar NVIDIA NIM API key para AI generation
- [ ] Configurar Stripe webhooks (ngrok p/ dev local)
- [ ] Configurar OAuth providers (GitHub, Google, etc.)
- [ ] Rodar test suite: `pnpm test`
- [ ] Lint + Typecheck: `pnpm lint && pnpm typecheck`

---

## 12. Resumo de Status

| Etapa | Status | Observação |
|-------|--------|------------|
| `pnpm install` | ✅ OK | Workspace resolvido sem conflitos |
| `database generate` | ✅ OK | Prisma Client v6.19.3 gerado |
| `shared build` | ✅ OK | TS compila sem erros |
| `api build` | ✅ OK | TS compila sem erros |
| `web build` | ✅ OK | Next.js 15 production build OK |
| `dev:api` | ✅ OK | Sobe em http://127.0.0.1:3001 |
| `dev:web` | ✅ OK | Sobe em http://localhost:3000 |

**Ambiente roda localmente sem erro:** ✅ **SIM**