# Revisão Transversal de Integração — v2-cross-document-review

> **Missão**: Recriar n8n no AgentFlow  
> **Work dir**: `n8n-migration/`  
> **Papel**: Revisão transversal (documentos ↔ código)  
> **Data**: 2026-08-20  
> **Escopo**: Verificar conflitos entre **engine, cloud, database, API, security, operations e deploy**  
> **Status**: RASCUNHO — revisão de consistência entre especificações, documentos antigos e implementação atual  

---

## 0. Metodologia

Esta revisão cruza os seguintes tipos de artefato:

1. **Specs v2** (`n8n-migration/v2-*.md`) — especificações de migração produzidas pelos panes
2. **Briefs** (`n8n-migration/briefs/prompt-*.md`) — briefings que definem o escopo de cada v2 spec
3. **Documentos antigos** (`n8n-migration/*.md`) — `design-seguranca.md`, `design-runner.md`, `api-n8n.md`, `catalogo-nodes.md`, `inventario.md`, `glossario.md`, etc.
4. **Código atual** — `apps/api/src/`, `packages/database/prisma/schema.prisma`, `packages/shared/src/index.ts`
5. **Briefs raiz** — `briefs/*.md` (deploy-vercel, GLM-*, RENDER-WEBSERVICE)

Cada inconsistência é classificada por:
- **Severidade**: 🔴 Crítica | 🟠 Alta | 🟡 Média | 🟢 Baixa
- **Tipo**: `DOC↔DOC` (entre documentos) | `DOC↔CODE` (documento vs implementação) | `MISSING` (documento ausente) | `CIRCULAR` (dependência circular)

---

## 1. Inventário de Artefatos

### 1.1 Specs v2-*.md existentes (2 de 17 planejados)

| Arquivo | Linhas | Pane responsável | Base declarada |
|---------|--------|-------------------|-----------------|
| `v2-security-spec.md` | ~650 | SECURITY | `design-seguranca.md` (§1–§4) + `prompt-security-spec.md` |
| `v2-compatibility-matrix.md` | ~314 | MATRIZ DE COMPATIBILIDADE | `v2-security-spec.md`, `referencia-n8n.md`, `api-n8n.md`, `catalogo-nodes.md`, `inventario.md` |

### 1.2 Specs v2-*.md planejadas mas AUSENTES (15)

> Fonte: `briefs/prompt-roadmap-mestre.md` §1 lista 16 docs v2; mais `prompt-roadmap-mestre.md` e `v2-compatibility-matrix.md` e `v2-auditoria-repo.md` mencionados implicitamente.

| # | Arquivo esperado | Brief gerador | Status |
|---|------------------|---------------|--------|
| 1 | `v2-auditoria-repo.md` | (implícito em roadmap) | ❌ Ausente |
| 2 | `v2-arquitetura-cloud.md` | `prompt-arquitetura-cloud.md` | ❌ Ausente |
| 3 | `v2-engine-spec.md` | `prompt-engine-spec.md` | ❌ Ausente |
| 4 | `v2-node-platform.md` | `prompt-node-platform.md` | ❌ Ausente |
| 5 | `v2-editor-spec.md` | `prompt-editor-spec.md` | ❌ Ausente |
| 6 | `v2-communication-integrations.md` | `prompt-comunicacao.md` | ❌ Ausente |
| 7 | `v2-business-integrations.md` | `prompt-integracoes-negocio.md` | ❌ Ausente |
| 8 | `v2-ai-platform.md` | `prompt-ai-platform.md` | ❌ Ausente |
| 9 | `v2-operations.md` | `prompt-operations.md` | ❌ Ausente |
| 10 | `v2-test-strategy.md` | `prompt-test-strategy.md` | ❌ Ausente |
| 11 | `v2-deploy-cicd.md` | `prompt-deploy-cicd.md` | ❌ Ausente |
| 12 | `v2-database-schema.md` | `prompt-database-schema.md` | ❌ Ausente |
| 13 | `v2-executions-debug.md` | (implícito em roadmap) | ❌ Ausente |
| 14 | `v2-approvals.md` | `prompt-approvals.md` | ❌ Ausente |
| 15 | `v2-master-roadmap.md` | `prompt-roadmap-mestre.md` | ❌ Ausente |

### 1.3 Briefs existentes (13 de 16 solicitados)

| Brief | Existe | v2-*.md correspondente |
|-------|--------|------------------------|
| `prompt-api-spec.md` | ✅ | `v2-api-spec.md` |
| `prompt-arquitetura-cloud.md` | ✅ | `v2-arquitetura-cloud.md` |
| `prompt-comunicacao.md` | ✅ | `v2-communication-integrations.md` |
| `prompt-database-schema.md` | ✅ | `v2-database-schema.md` |
| `prompt-deploy-cicd.md` | ✅ | `v2-deploy-cicd.md` |
| `prompt-editor-spec.md` | ✅ | `v2-editor-spec.md` |
| `prompt-engine-spec.md` | ✅ | `v2-engine-spec.md` |
| `prompt-node-platform.md` | ✅ | `v2-node-platform.md` |
| `prompt-operations.md` | ✅ | `v2-operations.md` |
| `prompt-test-strategy.md` | ✅ | `v2-test-strategy.md` |
| `prompt-ai-platform.md` | ✅ | `v2-ai-platform.md` |
| `prompt-templates-collaboration.md` | ✅ | (implícito) |
| `prompt-roadmap-mestre.md` | ✅ | `v2-master-roadmap.md` |
| `prompt-security-spec.md` | ❌ **AUSENTE** | `v2-security-spec.md` |
| `prompt-approvals.md` | ❌ **AUSENTE** | `v2-approvals.md` |
| `prompt-mvp-scope.md` | ❌ **AUSENTE** | (implícito) |

---

## 2. Inconsistências por Domínio

---

## 2.1 SECURITY × DATABASE × API (Auth, Credenciais, MFA)

### 2.1.1 Modelo de Credencial — três schemas incompatíveis

| Fonte | Schema / modelo | Campos-chave | Formato de envelope |
|-------|-----------------|--------------|---------------------|
| **Prisma (real)** `schema.prisma:207` | `model Credential` | `id, name, type, provider, data (String), createdAt, updatedAt, orgId` | `{iv, ct, tag}` (JSON) |
| **design-seguranca.md §3.1** | `model Credential` (propostado) | `encryptedData, iv, keyVersion, algorithm, metadata, createdById, updatedById, auditLogs[]` | `{iv, ct, tag, alg, kv}` |
| **v2-security-spec.md §5.2** | `EncryptedEnvelope` (TypeScript) | `alg, kv, nonce, ciphertext, tag` | `{alg, kv, nonce, ciphertext, tag}` |
| **prompt-database-schema.md brief** | `credentials` (DDL proposto) | `name, type, data (AES-GCM), credential_shared, expires_at, last_used_at, created_by` | Não especificado |

**Inconsistências (DOC↔DOC):**

- `data` vs `encryptedData` vs `ciphertext`+`nonce` — três nomes diferentes para o mesmo campo
- `keyVersion` (design-seguranca) / `kv` (v2-security-spec) vs **ausente** no Prisma real
- `algorithm` (ambos) vs **ausente** no Prisma real
- `iv` presente em design-seguranca e Prisma real, mas v2-security-spec usa `nonce` (não `iv`)
- `CredentialAuditLog` modelo proposto em design-seguranca §3.2 — **não existe** no Prisma real
- `CredentialKeyVersion` modelo proposto em design-seguranca §3.3 — **não existe** no Prisma real

**Inconsistência (DOC↔CODE):**

- O código real (`crypto.ts`) implementa AES-256-GCM com `CREDENTIAL_ENCRYPTION_KEY` direto (sem HKDF, sem DEK/KEK, sem key versioning)
- `design-seguranca.md §4.2` propõe `packages/shared/src/credentials.ts` e `apps/api/src/lib/credential-crypto.ts` — **ninguem implementou** estes arquivos
- `v2-security-spec.md §5.2` propõe `ICredentialStorage` e `ICryptoEngine` interfaces — **não implementadas**
- `credentials.ts` route usa `encryptCredential` / `decryptCredential` do `crypto.ts` (simples), não o `CredentialService` com `CredentialCrypto` proposto em design-seguranca.md §4.3

> **Impacto**: O schema Prisma real não suporta key rotation (não tem `keyVersion`/`kv`), nem auditoria de credenciais (não tem `CredentialAuditLog`), nem controle de versões de chave (`CredentialKeyVersion`). A v2-security-spec §5.6 descreve rotação de DEK/KEK e revogação (`revoke` marca `revokedAt`), mas o Prisma real não tem `revokedAt` nem `deprecatedAt`.

### 2.1.2 CREDENTIAL_ENCRYPTION_KEY — env var não validada

| Fonte | Declaração |
|-------|-----------|
| **`crypto.ts:6`** | `const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;` — **requerido**, lança se ausente |
| **`design-seguranca.md §5`** | `CREDENTIAL_ENCRYPTION_KEY` = obrigatório, 32 bytes hex |
| **`RENDER-WEBSERVICE.md:31`** | `CREDENTIAL_ENCRYPTION_KEY=5c37ad2c...` — definido no deploy |
| **`env.ts`** | ❌ **NÃO declarado** no schema zod! |

**Inconsistência (DOC↔CODE):** O `crypto.ts` exige `CREDENTIAL_ENCRYPTION_KEY` no startup, mas `env.ts` não valida sua presença. Se o env var for omitido, o API crasha com um erro não padronizado (não passa pelo `getEnv()` validation). A `RENDER-WEBSERVICE.md` define a var, mas `env.ts` nunca a valida.

> **Impacto**: Deploy em ambiente onde `CREDENTIAL_ENCRYPTION_KEY` não está definido causa crash no import do módulo `crypto.ts`, antes mesmo do `getEnv()` rodar.

### 2.1.3 JWT — HS256 confirmado mas session management diverge

| Propriedade | v2-security-spec §3.3 | prompt-api-spec §2 | Código real |
|-------------|----------------------|---------------------|-------------|
| Algoritmo | HS256 ✅ (confere com código) | Não especifica | `server.ts:85: app.register(jwt, { secret: env.JWT_SECRET })` → HS256 ✅ |
| Access token TTL | 15 min ✅ | Não especifica | `env.ts:32: JWT_EXPIRES_IN = "15m"` ✅, `auth.ts:60: { expiresIn: "15m" }` ✅ |
| Refresh token TTL | **30 dias** | Não especifica | `env.ts:33: REFRESH_EXPIRES_IN = "7d"` ❌ |
| Refresh token storage | httpOnly + Secure + SameSite=Lax cookie | "cookies vs header" (aberto) | **Bearer header + response body** (não cookies) ❌ |
| Refresh token format | Opaco (32 bytes, SHA-256 no DB) | Não especifica | **JWT** (refresh-tokens.ts:25 usa `app.jwt.sign`) ❌ |
| Rotate on use | Family rotation (reuse = revoga tudo) | Não especifica | ✅ Implementado (refresh-tokens.ts:70-84) |
| `sid` claim | Sim (session id para revogação) | Não especifica | ❌ Não implementado — não há `sid` no token |

**Inconsistências:**

- **TTL mismatch**: 30 dias (spec) vs 7 dias (código)
- **Cookie vs Header**: spec manda cookies httpOnly; código devolve token no body e usa Bearer header
- **Formato do refresh token**: spec diz "opaco (32 bytes)"; código gera JWT refresh token com `{ sub, type: "refresh", jti }`

### 2.1.4 MFA — requerido na spec, não implementado

| Fonte | Requisito | Implementado? |
|-------|-----------|---------------|
| **v2-security-spec.md §3.5** | TOTP (RFC 6238), Email OTP (6 dígitos, TTL 10min), Backup codes (10) | ❌ |
| **prompt-api-spec.md §2** | `POST /auth/mfa/verify` | ❌ |
| **Prisma schema** | `User` sem campo `mfa`, `mfaVerified`, `totpSecret` | ❌ |
| **auth.ts** | Sem verificação MFA | ❌ |
| **env.ts** | Sem vars MFA | ❌ |
| **packages/shared/src/index.ts** | Sem schemas MFA | ❌ |

**Inconsistência (DOC↔CODE):** A spec descreve MFA detalhadamente (TOTP via `speakeasy`, QR code, etc.) mas:
- Não há endpoint `/auth/mfa/verify` nas rotas
- `User` model não tem campos para MFA
- `auth.ts` não implementa verificação MFA
- `env.ts` não tem var de configuração MFA

### 2.1.5 RBAC — role "editor" vs "member"

| Fonte | Role names |
|-------|-----------|
| **v2-security-spec.md §4.1** | `owner`, `admin`, `editor`, `viewer` |
| **prompt-api-spec.md §2** | `owner`, `admin`, `editor`, `viewer` |
| **Prisma schema** (enum `MemberRole`) | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` ❌ |
| **packages/shared/src/index.ts** | `MemberRoleEnum = ["OWNER", "ADMIN", "MEMBER", "VIEWER"]` ❌ |
| **auth.ts** | Usa `member.role` com valores do Prisma (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) |

**Inconsistência (DOC↔CODE):** As specs usam "editor" mas a implementação usa "member". O `prompt-database-schema.md` (brief) propõe `roles/permissions (RBAC: role, permission, role_permissions)` — um modelo de permission granular que **não existe** no Prisma real (que só tem `MemberRole` enum sem permissions table).

---

## 2.2 DATABASE × SECURITY (Schema Prisma vs Specs)

### 2.2.1 User model — campos ausentes

| Campo | prompt-database-schema.md (brief) | Prisma real |
|-------|------------------------------------|-------------|
| `password_hash` | ✅ | ✅ (`passwordHash`) |
| `mfa` | ✅ | ❌ Ausente |
| `timezone` | ✅ | ❌ |
| `locale` | ✅ | ❌ |
| `status` | ✅ | ❌ |
| `last_login_at` | ✅ | ❌ |
| `ssoOnly` | (v2-security-spec §3.5) | ❌ |

### 2.2.2 Credential model — campos ausentes no Prisma real

| Campo | design-seguranca.md §3.1 | v2-security-spec.md §5 | Prisma real |
|-------|--------------------------|------------------------|-------------|
| `encryptedData` | ✅ | (envelope TypeScript) | Chamado `data` |
| `iv` | ✅ | Renomeado para `nonce` | ✅ (no envelope JSON) |
| `keyVersion` | ✅ | `kv` | ❌ |
| `algorithm` | ✅ | `alg` | ❌ |
| `metadata` | ✅ | (em `CredentialMeta`) | ❌ |
| `createdById` / `updatedById` | ✅ | ❌ | ❌ |
| `auditLogs` | ✅ (`CredentialAuditLog`) | ✅ (audit trail) | ❌ (usa `AuditLog` genérico) |
| `revokedAt` | (v2-sec §5.6 "revogação") | ✅ (CredentialMeta não tem) | ❌ |
| `lastTestedAt` | ❌ | ✅ (`CredentialMeta.lastTestedAt`) | ❌ |
| `expiresAt` | ✅ (brief DB) | ❌ | ❌ |

### 2.2.3 Row Level Security (RLS)

| Fonte | Requisito | Implementado? |
|-------|-----------|---------------|
| **prompt-database-schema.md** | "RLS multi-tenant (CRÍTICO): política por tabela — org_id column + policy (USING org_id = current_setting('app.org_id'))" | ❌ Prisma não suporta RLS nativamente |
| **v2-security-spec.md §4.3** | `scopeQuery(user, model)` — filtra queries no Prisma no app level | ✅ (auth.ts faz scoping manual) |

> **Inconsistência (DOC↔CODE):** O brief exige RLS a nível de PostgreSQL, mas o Prisma schema não define políticas RLS. O v2-security-spec contorna com scoping de aplicação, mas o deploy real (RENDER) não documenta `app.org_id` GUC settings para RLS.

### 2.2.4 RefreshToken model — partially matches spec

| Campo | Prisma real | v2-security-spec §3.3 |
|-------|-------------|----------------------|
| `jti` | ✅ | ✅ |
| `tokenHash` | ✅ (SHA-256) | ✅ (SHA-256) |
| `expiresAt` | ✅ | ✅ (TTL) |
| `revokedAt` | ✅ | ✅ |
| `replacedByJti` | ✅ | ✅ (family rotation) |
| `sid` (session id) | ❌ | ✅ (spec exige) |

---

## 2.3 API × SECURITY (Endpoints, Rate Limiting, CORS)

### 2.3.1 Rate limiting — spec vs implementação

| Endpoint / Recurso | v2-security-spec.md | prompt-api-spec.md | Código real |
|---------------------|---------------------|---------------------|-------------|
| Login | Lockout progressivo (5/10/20 falhas) | Rate limit por usuário/org/IP | `auth.ts:46: { max: 10, timeWindow: "15 min" }` — sem lockout |
| Refresh | Rate limit dedicado | ✅ | `auth.ts:74: { max: 30, timeWindow: "15 min" }` |
| Credential decrypt | 100/min (design-seguranca) | ✅ | ❌ Sem rate limit no `credentials.ts` |
| Webhook trigger | 100 req/min | ✅ | `webhooks.ts:100: { max: 60, timeWindow: "1 minute" }` |
| AI generate | Não especificado | ✅ | `ai.ts:55: { max: 20, timeWindow: "1 minute" }` |
| OAuth exchange | Não especificado | ✅ | `oauth.ts:247: { max: 10, timeWindow: "1 minute" }` |

**Inconsistência:** O spec descreve lockout progressivo (5 → 10 → 20 falhas com bloqueio por email e IP), mas o código tem apenas rate limit simples (10/15min) sem lockout, sem contagem de falhas, sem IP-based blocking.

### 2.3.2 CORS

| Fonte | Configuração |
|-------|-------------|
| **v2-security-spec.md §7** | `CORS_ORIGIN` allowlist, origin-based allowlist |
| **prompt-api-spec.md §2** | "CORS, CSRF (se cookies)" |
| **env.ts:38** | `CORS_ORIGIN: z.string().default("http://localhost:3000")` — aceita string única, não allowlist múltipla |
| **RENDER-WEBSERVICE.md:32** | `CORS_ORIGIN=https://agentflow-rctecbauru12.vercel.app` — único origin |

**Inconsistência (DOC↔DOC):** O spec §7.1 diz "CORS_ORIGIN allowlist com múltiplos origins (comma-separated)", mas env.ts trata `CORS_ORIGIN` como string única, não como array. Há um `hostAllowlistEnv` preprocess defenido em env.ts:24-22 que *poderia* parsear comma-separated, mas **não é aplicado** ao CORS — é apenas usado (ou não) para `EGRESS_ALLOWED_HOSTS`.

### 2.3.3 Endpoints de credencial

| Endpoint | prompt-api-spec.md | v2-security-spec.md | Código real |
|----------|---------------------|---------------------|-------------|
| `GET /credentials/types` | ✅ | ✅ | ❌ Ausente |
| `POST /credentials/test` | ✅ | ✅ (§5.5) | ❌ Ausente |
| `GET /credentials/:id/redact` | ✅ | ✅ | `credentials.ts:69: GET /:id/reveal` (diferente!) |
| `POST /credentials/:id/rotate-secret` | ✅ (§5.6) | ✅ | ❌ Ausente |
| `POST /credentials/:id/shared` | ✅ | ✅ | ❌ Ausente |

**Inconsistência:** A spec propõe `GET /credentials/:id/redact` (retorna sem segredo) e `POST /credentials/:id/rotate-secret`, mas o código real tem `GET /credentials/:id/reveal` (diferente nome) e **nenhuma** das outras rotas.

---

## 2.4 SECURITY × ENGINE × CÓDIGO (Sandbox, Expressões, SSRF)

### 2.4.1 Code node sandbox

| Fonte | Tecnologia | Status |
|-------|-----------|--------|
| **v2-security-spec.md §S9 / §0.1** | `isolate-vm` com limites de memória/CPU/tempo e zero rede | Não implementado |
| **v2-compatibility-matrix.md §4** | `isolate-vm` (catalogo §6 sugere `vm2` deprecated) | ❌ Não implementado |
| **executor.ts:413-418** | `CodeExecutionDisabledError` — **desativado por padrão** via `EXEC_CODE_DISABLED` | ✅ Implementado como "disabled" |
| **env.ts:39** | `EXEC_CODE_DISABLED: booleanEnv` | ✅ |

**Inconsistência (DOC↔CODE):** A spec propõe `isolate-vm`, mas o código **desativa** a execução de código por completo. O catalogo-nodes.md §6 menciona `vm2` (deprecated), mas nem `isolate-vm` nem `vm2` estão no `package.json` do API.

### 2.4.2 SSRF protection (HTTP Request node)

| Fonte | Proteção | Código real |
|-------|----------|-------------|
| **v2-security-spec.md §S8** | Proxy egress, IP allowlist, anti-DNS-rebinding | ✅ Implementado em executor.ts:158-227 (`isBlockedHostname`, `assertSafeUrl`, `assertSafeResolved`) |
| **v2-compatibility-matrix.md §2** | `$helpers.request()` bloqueado no Code node | ✅ `executor.ts:415` lança `CodeExecutionDisabledError` |
| **prompt-arquitetura-cloud.md §1** | Proxy egress no control plane | Parcial — implementado no executor mas não há proxy de saída dedicado |

**Conforme.** A implementação do SSRF protection no executor.ts está alinhada com a spec. Mas o spec §S8 menciona "proxy egress" como componente arquiteturais — não há proxy egress dedicado no código ou no deploy (RENDER-WEBSERVICE não menciona).

### 2.4.3 Expression engine — `new Function()` sem sandbox

| Fonte | Status |
|-------|--------|
| **catalogo-nodes.md §§9-13** | Handlers usam `new Function()` para `{{= expressão JS }}` | Implementado no código real? |
| **v2-security-spec.md §S9** | Recomenda `isolate-vm` apenas para Code node; **não menciona sandbox para expressions** |
| **v2-compatibility-matrix.md §2** | "Risco: handlers usam `new Function()` em expressions sem sandbox — risco de injeção" | Gap crítico identificado |

**Inconsistência (DOC↔DOC):** A spec de segurança protege o Code node com sandbox, mas **não aborda** o risco de injeção em expressions inline (`{{= expressão JS }}`) que usam `new Function()`. O compatibility matrix identifica este risco como crítico.

---

## 2.5 CLOUD × SECURITY × CODE × DEPLOY

### 2.5.1 Vault / Secrets — terminologia conflita

| Documento | Uso de "Vault" |
|-----------|-----------------|
| **v2-security-spec.md §5** | "Vault" é o **nome conceitual** do armazenamento de credenciais (envelope encryption). KEK vem de "env (self-hosted)" ou "KMS (cloud)". **Nenhuma dependência de HashiCorp Vault.** |
| **prompt-arquitetura-cloud.md §6** | Lista "vault (segredos)" como camada de persistência — sugere Vault como componente infraestrutural |
| **prompt-deploy-cicd.md §6** | "secrets: env vars, docker secrets, k8s secrets, vault externo — HashiCorp/Doppler" |
| **prompt-operations.md §10** | "Backups: PostgreSQL (pg_dump, PITR, WAL), Redis (RDB/AOF), object storage, vault" |
| **design-seguranca.md §1.1** | Princípio: "Chave mestra APENAS em env var — nunca em código, config, ou vault do app" |
| **Código real** | ✅ Usa `CREDENTIAL_ENCRYPTION_KEY` env var, sem Vault |

**Inconsistência (DOC↔DOC):** O v2-security-spec usa "Vault" como metáfora para o cofre de credenciais, enquanto os briefs de cloud/operations/deploy tratam Vault como componente infraestrutural (HashiCorp Vault). Esta ambiguidade pode levar a implementações conflitantes — um time pode provisionar HashiCorp Vault esperando que o security spec o use, mas o spec diz usar env/KMS.

> Além disso, `design-seguranca.md §1.1` afirma "Chave mestra APENAS em env var — nunca em... vault do app", contradizendo briefs que sugerem HashiCorp Vault.

### 2.5.2 Próximos passos / dependências circulares entre briefs

| Brief | Referencia para leitura prévia |
|-------|-------------------------------|
| `prompt-database-schema.md` | "Leia `n8n-migration/design-seguranca.md` e `repo-map.md`" ✅ |
| `prompt-engine-spec.md` | "Leia `design-runner.md`, `design-recriacao.md`, `catalogo-nodes.md`, `repo-map.md`" ✅ |
| `prompt-deploy-cicd.md` | "Leia `v2-arquitetura-cloud.md` (ausente), `v2-operations.md` (ausente), `v2-test-strategy.md` (ausente), `v2-database-schema.md` (ausente)" ❌ |
| `prompt-editor-spec.md` | "Leia `design-recriacao.md` e `repo-map.md`" ✅ |
| `prompt-test-strategy.md` | "Leia `design-testes.md` e `v2-engine-spec.md` (ausente)" ⚠️ Parcial |
| `prompt-node-platform.md` | "Leia `catalogo-nodes.md` e `deps-e-libs.md`" ✅ |
| `prompt-operations.md` | "Leia `design-runner.md` e `setup-dev.md`" ✅ |
| `prompt-arquitetura-cloud.md` | "Leia `repo-map.md`, `design-runner.md` e `design-recriacao.md`" ✅ |
| `prompt-roadmap-mestre.md` | "Leia todos os `v2-*.md`" — 15 de 17 não existem ❌ |

**Dependência circular (CIRCULAR):**

- `prompt-deploy-cicd.md` depende de `v2-arquitetura-cloud.md`, `v2-operations.md`, `v2-test-strategy.md` — todos ausentes
- `prompt-roadmap-mestre.md` depende de todos os `v2-*.md` existirem — mas é o brief que *cria* o roadmap que os ordena
- `v2-security-spec.md` afirma ser gerado a partir de `prompt-security-spec.md` — que **não existe**
- `v2-compatibility-matrix.md` é baseado em `v2-security-spec.md` — existe ✅, mas referencia "§S8" e "§S9" que são entradas do threat model table, não seções numeradas do documento

---

## 2.6 ENGINE × DATABASE (Execução, Fila, Status)

### 2.6.1 Status de execução

| Fonte | Enum |
|-------|------|
| **Prisma schema** | `ExecutionStatus: PENDING, RUNNING, SUCCESS, FAILED, CANCELLED, WAITING_APPROVAL` |
| **v2-security-spec.md §0.1** | Menciona "BullMQ + Redis (fila/execução)" mas não enum de status |
| **v2-compatibility-matrix.md §6** | "Execution status enum não documentado" — GAP identificado |
| **prompt-engine-spec.md** | States: `waiting, running, success, error, cancelled, paused` |
| **api-n8n.md** | `canceled, crashed, error, new, running, success, unknown, waiting` |

**Inconsistência (DOC↔DOC):** O Prisma tem `WAITING_APPROVAL` que não aparece em nenhuma spec. O engine brief propõe `paused` mas Prisma não tem. O n8n API reference usa `canceled` (inglês americano) mas Prisma usa `CANCELLED` (inglês britânico).

### 2.6.2 Execution mode

| Fonte | Values |
|-------|--------|
| **Prisma schema** | `trigger String` (comentário: `webhook, manual, cron, api`) |
| **api-n8n.md §5** | `cli, error, integrated, internal, manual, retry, trigger, webhook, evaluation, chat` |
| **v2-compatibility-matrix.md §6** | "GAP: modes `evaluation`, `chat` não mapeados" |

**Inconsistência:** O Prisma tem apenas 4 values (webhook, manual, cron, api) enquanto o n8n tem 10. Os workflows do inventário usam `evaluationTrigger` (modo `evaluation`) mas não há mapeamento.

---

## 2.7 DEPLOY × SECURITY × DATABASE (Infraestrutura)

### 2.7.1 Next.js version

| Documento | Versão |
|-----------|--------|
| **v2-security-spec.md §0.1** | "Next.js 15" |
| **glossario.md** | "Next.js 16" |
| **GLM-DEPLOY-VERCEL.md** | "Next.js 16 + Turbopack" |
| **GLM-HEAVY-BRIEF.md** | "Next.js 16" |
| **apps/web/tsconfig.tsbuildinfo** | (não verificado diretamente) |

**Inconsistência (DOC↔DOC):** v2-security-spec.md diz Next.js 15, todos os outros dizem Next.js 16.

### 2.7.2 PostgreSQL version

| Documento | Versão |
|-----------|--------|
| **GLM-HEAVY-BRIEF.md CI** | `postgres:16` |
| **prompt-database-schema.md** | Não especifica; menciona extensões `uuid-ossp`, `pgcrypto`, `pgvector` |
| **RENDER-WEBSERVICE.md** | PostgreSQL gerenciado no Render (versão não especificada) |

**Inconsistência (DOC↔DOC):** O CI/CD brief especifica Postgres 16, mas o database brief não confirma compatibilidade com as extensões (`pgvector` requer Postgres 12+, `pgcrypto` requer compilado com OpenSSL).

### 2.7.3 Secrets no deploy real vs spec

| Env var | env.ts | RENDER-WEBSERVICE.md | GLM-HEAVY-BRIEF.md CI | v2-security-spec |
|---------|--------|----------------------|----------------------|-------------------|
| `DATABASE_URL` | ✅ | ✅ | ✅ | ✅ |
| `JWT_SECRET` | ✅ (min 32) | ✅ | ✅ | ✅ |
| `JWT_EXPIRES_IN` | ✅ (default "15m") | ❌ | ❌ | ✅ (15 min) |
| `REFRESH_EXPIRES_IN` | ✅ (default "7d") | ❌ | ❌ | ✅ (30 dias ❌) |
| `REDIS_URL` | ✅ | ❌ | ❌ | ✅ |
| `CORS_ORIGIN` | ✅ | ✅ | ✅ | ✅ |
| `CREDENTIAL_ENCRYPTION_KEY` | ❌ **NÃO VALIDADA** | ✅ | ✅ | ✅ (implícito) |
| `EXEC_CODE_DISABLED` | ✅ | ❌ | ❌ | ✅ (§S9) |
| `EGRESS_ALLOWED_HOSTS` | ✅ | ❌ | ❌ | ✅ (§S8) |
| `NVIDIA_NIM_API_KEY` | ✅ | ❌ | ❌ | ✅ (IA) |
| `NVIDIA_NIM_BASE_URL` | ✅ | ❌ | ❌ | ✅ (IA) |
| `STRIPE_SECRET_KEY` | ✅ | ❌ | ❌ | ❌ (não mencionado na spec) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | ❌ | ❌ | ❌ |
| `MFA_SECRET` / TOTP | ❌ | ❌ | ❌ | ✅ (§3.5) |
| `VAULT_TOKEN` / `CREDENTIAL_VAULT_URL` | ❌ | ❌ | ❌ | ❌ (não requerido) |

**Inconsistência (DOC↔CODE):** `CREDENTIAL_ENCRYPTION_KEY` é requerido pelo código (`crypto.ts:8` lança erro se ausente) mas **não está declarado no schema zod de env.ts**. A RENDER-WEBSERVICE e GLM-HEAVY-BRIEF definem a var, mas env.ts não valida. Se omitida em deploy, o crash ocorre no import do módulo `crypto.ts`, não na validação de env.

### 2.7.4 Cloudflare Tunnel

- **v2-security-spec.md §13** (não existe como seção — a spec só tem §0-§5)
- **Glossário** não menciona
- **RENDER-WEBSERVICE.md** não menciona
- **GLM-DEPLOY-VERCEL.md** não menciona

(Seção §13 citada na intro do spec, mas **não existe** no documento. A spec tem apenas 5 seções: §0 a §5.)

---

## 2.8 NODE PLATFORM × CATALOGO × INVENTÁRIO (Tipos de Node)

### 2.8.1 Tipo de node: `code` vs `function`

| Fonte | Tipo | typeVersion |
|-------|------|-------------|
| **inventario.md** | `n8n-nodes-base.code` | v2 |
| **catalogo-nodes.md §6** | `n8n-nodes-base.function` / `functionItem` | v1/2 |
| **shared/index.ts** | `code` (na lista de tipos) | ✅ |
| **v2-compatibility-matrix.md §4 G4** | Gap identificado: `code` (inventário) vs `function` (catalogo) | ✅ Documentado como GAP |

**Conforme (documentado como gap).** O compatibility matrix já identificou este conflito. O código (`executor.ts:413`) usa `case "code"` (não `function`).

### 2.8.2 Nodes do inventário não no catálogo

| Node n8n (inventário) | No catalogo? | Handler no executor? |
|-----------------------|--------------|----------------------|
| `gmailTrigger` (v1.4) | ❌ | ✅ (`executor.ts:457`) |
| `googleDrive` (v3) | ❌ | ✅ (`executor.ts:467`) |
| `code` (v2) | Parcial (`function`) | ✅ (`executor.ts:413`) |
| `emailReadImap` (v2.2) | ❌ | ✅ (`executor.ts:483`) |
| `evaluationTrigger` (v4.7) | ❌ | ✅ (`executor.ts:475`) |
| `gmail` (v2.2) | ✅ (v1.2) | ✅ (`executor.ts:492`) |

**Inconsistência (DOC↔DOC):** O `catalogo-nodes.md` não documenta `gmailTrigger`, `googleDrive`, `emailReadImap`, `evaluationTrigger` — nós usados no inventário. O compatibility matrix G1-G3 identifica estes gaps. Mas o executor.ts **implementa handlers pass-through** para todos estes tipos (builder-relatorio.md §2).

### 2.8.3 typeVersion mismatch: Gmail

- **catalogo-nodes.md §12**: `n8n-nodes-base.gmail` v1.2
- **inventario.md**: `n8n-nodes-base.gmail` v2.2
- **builder-relatorio.md**: Preserva typeVersion v2.2 no import

### 2.8.4 Credential types — 4 enums diferentes

| Fonto | Types |
|-------|-------|
| **Prisma `Credential.type`** | `api_key, oauth2, basic, token` (4) |
| **shared/index.ts** | `api_key, oauth2, basic, token` (4) |
| **design-seguranca.md §4.1** | `openai, http, database, aws, ...` (diferente!) |
| **converter/README.md** | `basic, apiKey, oauth2, database` (diferente naming) |
| **v2-compatibility-matrix.md §3** | `httpBasicAuth, googleOAuth2Api, gmailOAuth2Api, openAiApi, telegramApi` |

**Inconsistência (DOC↔DOC↔CODE):** Cinco definições diferentes de tipos de credencial. O Prisma/shared usam `api_key/oauth2/basic/token`, design-seguranca propõe `openai/http/database/aws`, converter usa `basic/apiKey/oauth2/database` (com camelCase), e o compatibility matrix lista tipos específicos do n8n (`httpBasicAuth`, `googleOAuth2Api`).

---

## 2.9 OBSERVABILIDADE × OPERATIONS (Logs, Métricas, Tracing)

### 2.9.1 Prometheus / OpenTelemetry

| Fonte | Status |
|-------|--------|
| **prompt-operations.md §2-4** | Exige: logs JSON estruturados, métricas Prometheus, tracing OpenTelemetry, exportação `/metrics` |
| **v2-security-spec.md** | Não menciona observabilidade |
| **Código real** | `app.log.warn(...)` (Fastify logger) — sem formato JSON estruturado, sem `/metrics`, sem tracing |

**Inconsistência (DOC↔CODE):** O operations brief exige Prometheus + OpenTelemetry, mas o código não tem nenhum setup de métricas ou tracing. `package.json` (api) não tem dependências de `@opentelemetry/*` ou `prom-client`.

### 2.9.2 Health checks

| Fonte | Endpoints |
|-------|----------|
| **prompt-operations.md §7** | `/health`, `/ready`, `/live` por serviço |
| **RENDER-WEBSERVICE.md** | `Health Check Path: /api/health` |
| **Código real** (server.ts) | Não verificado — mas `RENDER-WEBSERVICE` aponta `/api/health` |

### 2.9.3 SLOs

| Fonte | Definição |
|-------|-----------|
| **prompt-operations.md §6** | 99.9% disponibilidade, p95 de latência de agendamento, taxa de sucesso |
| **v2-security-spec.md** | Não menciona SLOs |

---

## 2.10 TESTS × SECURITY (Test Strategy)

### 2.10.1 Testes de segurança

| Teste | prompt-test-strategy.md §10 | Código real |
|-------|------------------------|-------------|
| SSRF | ✅ | ✅ (executor.ts: `assertSafeUrl`, `assertSafeResolved`) |
| Injeção de expressão | ✅ | ❌ (expressions não implementadas) |
| Sandbox Code node | ✅ | ✅ (code execution disabled) |
| Exfiltração de credenciais | ✅ | Parcial (executor.ts:285-349 tem `credentialHeaders` mas sem auditoria) |
| Auth/RBAC | ✅ | Parcial (auth.ts: `requireAuth`, `requireOrgMember`) |
| Rate limiting | ✅ | Parcial (apenas em alguns endpoints) |
| Fuzzing de webhook | ✅ | ❌ |

### 2.10.2 Cobertura de testes

| Fonte | Expectativa |
|-------|-------------|
| **prompt-test-strategy.md §1** | Pirâmide: unit 70%, integração 20%, E2E 10%; cobertura alvo não especificada mas implícita ≥80% |
| **design-testes.md** | "Testes ≥ 80% cobertura" (README checklist) |
| **builder-relatorio.md** | 39 testes unitários (30 import + 9 executor) — todos pass |
| **GLM-HEAVY-BRIEF.md CI** | `pnpm run test` como gate |
| **package.json (root)** | `test: turbo test` |

**Inconsistência (DOC↔CODE):** O checklist do README exige ≥80% cobertura, mas não há threshold de cobertura configurado no CI. O GLM-HEAVY-BRIEF CI não inclui cobertura como gate.

---

## 2.11 GLOSSÁRIO × IMPLEMENTAÇÃO (Termos)

### 2.11.1 Workflow status mapping

| Glossário | Prisma | Código real |
|-----------|--------|-------------|
| `ACTIVE \| INACTIVE` | `DRAFT, ACTIVE, PAUSED, ARCHIVED` | builder-relatorio: `status: "DRAFT"` para inativo |

**Inconsistência (DOC↔DOC):** O glossário mapeia `active/inactive → ACTIVE/INACTIVE`, mas o Prisma não tem `INACTIVE`. O builder-relatório usa `DRAFT` para inativo. O glossário está **desatualizado**.

### 2.11.2 "instance" definition

| Glossário | Definição |
|-----------|-----------|
| **glossario.md** | "instance = ambiente provisionado (prod/staging/preview)" — não um conceito Prisma |
| **Prisma schema** | Nenhum model `Instance` |
| **v2-security-spec.md §0.1** | "Fastify (API, Node/ESM) · Next.js 15 (web)" — não menciona instancing |

---

## 3. Resumo de Inconsistências por Severidade

### 🔴 Críticas

| # | Inconsistência | Documentos envolvidos |
|---|----------------|----------------------|
| C1 | `CREDENTIAL_ENCRYPTION_KEY` requerido pelo código mas **não validado** em env.ts | crypto.ts ↔ env.ts ↔ RENDER-WEBSERVICE |
| C2 | 15 de 17 v2-*.md planejados **não existem** — roadmap não pode ser construído | prompt-roadmap-mestre ↔ v2-*.md |
| C3 | Three Credential schemas incompatíveis (Prisma `data` vs design-seguranca `encryptedData` vs v2-security `ciphertext`+`nonce`) | schema.prisma ↔ design-seguranca §3.1 ↔ v2-security-spec §5.2 |
| C4 | `prompt-security-spec.md` não existe mas v2-security-spec.md afirma ter sido gerado a partir dele | v2-security-spec.md ↔ (ausente) prompt-security-spec |
| C5 | MFA requerido nas specs mas **não implementado** em código, Prisma, env.ts, ou auth.ts | v2-security-spec §3.5 ↔ prompt-api-spec §2 ↔ auth.ts ↔ schema.prisma ↔ env.ts |
| C6 | RBAC: spec diz "editor", código diz "member" | v2-security-spec §4.1 ↔ prompt-api-spec §2 ↔ schema.prisma ↔ shared/index.ts |
| C7 | Refresh token TTL: 30 dias (spec) vs 7 dias (código/env.ts) | v2-security-spec §3.3 ↔ env.ts ↔ refresh-tokens.ts |
| C8 | `code` node: spec propõe isolate-vm, código **desativa** execução | v2-security-spec §S9 ↔ executor.ts:413 |
| C9 | 4 de 6 nodes do inventário não estão no catálogo (gmailTrigger, googleDrive, emailReadImap, evaluationTrigger) | catalogo-nodes ↔ inventario ↔ executor.ts |
| C10 | Expression `new Function()` sem sandbox — risco de injeção não enderado | catalogo-nodes §§9-13 ↔ v2-security-spec (apenas Code node) |

### 🟠 Altas

| # | Inconsistência | Documentos envolvidos |
|---|----------------|----------------------|
| H1 | Next.js version: 15 (security spec) vs 16 (glossário, GLM-DEPLOY, GLM-HEAVY) | v2-security-spec §0.1 ↔ glossario ↔ GLM-DEPLOY-VERCEL ↔ GLM-HEAVY-BRIEF |
| H2 | Credential type enums: 4 definições diferentes (Prisma, shared, design-seguranca, converter) | schema.prisma ↔ shared/index.ts ↔ design-seguranca §4.1 ↔ converter/README.md |
| H3 | Deploy brief referencia v2-*.md inexistentes como leitura prévia obrigatória | prompt-deploy-cicd §Processo ↔ (ausentes) v2-arquitetura-cloud, v2-operations, v2-test-strategy, v2-database-schema |
| H4 | Rate limiting: spec descreve lockout progressivo + rate limit dedicado, código só tem rate limit simples | v2-security-spec §3.6 ↔ prompt-api-spec §2 ↔ auth.ts |
| H5 | 2 de 3 credenciais do inventário não têm handlers documentados (googleDrive, IMAP) | v2-compatibility-matrix §3 G17 ↔ catalogo-nodes |
| H6 | Cookie vs Header para refresh token — spec diz cookies, código usa header + response body | v2-security-spec §3.3 ↔ prompt-api-spec §2 ↔ auth.ts ↔ oauth.ts |

### 🟡 Médias

| # | Inconsistência | Documentos envolvidos |
|---|----------------|----------------------|
| M1 | CORS_ORIGIN: spec diz allowlist múltipla, env.ts trata como string única | v2-security-spec §7 ↔ env.ts:38-40 |
| M2 | RLS: brief exige PostgreSQL RLS, v2-security-spec usa scoping de aplicação, Prisma não define policies | prompt-database-schema §3 ↔ v2-security-spec §4.3 ↔ schema.prisma |
| M3 | User model: brief propõe `mfa`, `timezone`, `locale`, `status`, `last_login_at` — todos ausentes no Prisma | prompt-database-schema §3.1 ↔ prompt-mvp-scope (implícito) ↔ schema.prisma:User |
| M4 | `CredentialKeyVersion`, `CredentialAuditLog`, `revokedAt`, `expiresAt` — ausentes no Prisma | design-seguranca §3.2-3.3 ↔ v2-security-spec §5.5-5.6 ↔ schema.prisma |
| M5 | Endpoints de credential: spec propõe `/credentials/types`, `/credentials/test`, `/credentials/:id/rotate-secret` — todos ausentes | prompt-api-spec §7 ↔ v2-security-spec §5.5-5.6 ↔ credentials.ts |
| M6 | `v2-compatibility-matrix.md` referencia "§S8"/"§S9" do security spec, que são entries do threat model table (§2), não seções numeradas | v2-compatibility-matrix ↔ v2-security-spec §2 |
| M7 | Glossário mapeia `INACTIVE` para workflow status, mas Prisma usa `DRAFT`/`PAUSED`/`ARCHIVED` | glossario.md ↔ schema.prisma |
| M8 | `v2-security-spec.md` menciona seção §13 (Deployment) e §14 (Validation) e §15 (Attachments) na intro, mas **não existem** — spec só tem §0-§5 | v2-security-spec intro ↔ conteúdo real |

---

## 4. Lacunas Críticas (Gaps)

### 4.1 Docs v2 não criados (15 de 17)

| v2 doc | Brief responsável | Brief foi lido? |
|--------|-------------------|-----------------|
| `v2-auditoria-repo.md` | (implícito) | — |
| `v2-arquitetura-cloud.md` | prompt-arquitetura-cloud.md | ✅ Brief existe |
| `v2-engine-spec.md` | prompt-engine-spec.md | ✅ Brief existe |
| `v2-node-platform.md` | prompt-node-platform.md | ✅ Brief existe |
| `v2-editor-spec.md` | prompt-editor-spec.md | ✅ Brief existe |
| `v2-communication-integrations.md` | prompt-comunicacao.md | ✅ Brief existe |
| `v2-business-integrations.md` | prompt-integracoes-negocio.md | ❌ Brief AUSENTE |
| `v2-ai-platform.md` | prompt-ai-platform.md | ✅ Brief existe |
| `v2-operations.md` | prompt-operations.md | ✅ Brief existe |
| `v2-test-strategy.md` | prompt-test-strategy.md | ✅ Brief existe |
| `v2-deploy-cicd.md` | prompt-deploy-cicd.md | ✅ Brief existe |
| `v2-database-schema.md` | prompt-database-schema.md | ✅ Brief existe |
| `v2-executions-debug.md` | (implícito) | — |
| `v2-approvals.md` | prompt-approvals.md | ❌ Brief AUSENTE |
| `v2-master-roadmap.md` | prompt-roadmap-mestre.md | ✅ Brief existe |

### 4.2 Briefs ausentes (5 de 16)

| Brief ausente | v2 doc correspondente |
|---------------|----------------------|
| `prompt-security-spec.md` | `v2-security-spec.md` (já criado sem o brief!) |
| `prompt-approvals.md` | `v2-approvals.md` |
| `prompt-mvp-scope.md` | (não mapeado) |
| `prompt-integracoes-negocio.md` | `v2-business-integrations.md` |

### 4.3 Código vs Specs

| Feature | Spec requer | Implementado? |
|---------|-------------|---------------|
| MFA (TOTP) | v2-security-spec §3.5, prompt-api-spec §2 | ❌ |
| Argon2id password hashing | v2-security-spec §3.1 (S3) | ❌ (usa bcryptjs 12 rounds) |
| PKCE em OAuth | v2-security-spec §3.5 (S5) | ❌ (oauth.ts usa state, não PKCE) |
| RLS no PostgreSQL | prompt-database-schema §3 | ❌ |
| Prometheus metrics | prompt-operations §2-3 | ❌ |
| OpenTelemetry tracing | prompt-operations §4 | ❌ |
| `/metrics` endpoint | prompt-operations §2 | ❌ |
| `/health`, `/ready`, `/live` | prompt-operations §7 | Parcial (`/api/health` no RENDER) |
| Rate limiting em login | v2-security-spec §3.6 | Sim (10/15min, mas sem lockout progressivo) |
| Lockout progressivo | v2-security-spec §3.6 | ❌ |
| Cookie-based refresh token | v2-security-spec §3.3 | ❌ (usa response body) |
| `sid` no JWT | v2-security-spec §3.3 | ❌ |
| Key rotation (DEK/KEK) | design-seguranca §3.3, v2-security-spec §5.6 | ❌ |
| `CredentialAuditLog` | design-seguranca §3.2 | ❌ |
| `isolated-vm` sandbox | v2-security-spec §S9 | ❌ (code execution disabled) |

---

## 5. Dependências Circulares

### 5.1 Roadmap ↔ Specs

```
prompt-roadmap-mestre.md → requer leitura de "todos os v2-*.md" → mas é o brief que GERA v2-master-roadmap.md
     ↑                                                    ↓
     └──────────── 15 specs v2 não existem ←──────────────┘
```

O brief do roadmap mestre exige ler todos os v2-*.md para produzir o roadmap, mas o próprio v2-master-roadmap.md é **um dos 15 documentos que não existem**. O brief não pode ser executado sem a própria saída.

### 5.2 Deploy brief ↔ v2 specs

```
prompt-deploy-cicd.md → requer leitura de v2-arquitetura-cloud, v2-operations, 
                          v2-test-strategy, v2-database-schema
     ↓
   Todos ausentes → brief não pode ser executado
```

O deploy brief lista como "leitura prévia obrigatória" quatro v2-*.md que não existem. Ele não pode ser implementado consistentemente sem essas specs.

### 5.3 Security spec ↔ security brief

```
v2-security-spec.md → afirma ser "gerado a partir de prompt-security-spec.md"
     ↓
prompt-security-spec.md → AUSENTE
```

O security spec foi "gerado" a partir de um brief que **não existe**. A claim na linha 8 do spec ("Base: design-seguranca.md (criptografia de credenciais, complementado e estendido aqui)") é a única base real, mas o spec também afirma derivar de `prompt-security-spec.md` que não existe.

---

## 6. Correções Propostas

### 6.1 Imediatas (críticas)

| # | Correção | Prioridade |
|---|----------|------------|
| P1 | **Adicionar `CREDENTIAL_ENCRYPTION_KEY` ao schema zod de env.ts** | 🔴 |
| P2 | **Corrigir TTL do refresh token**: unificar em 7d (código) ou 30d (spec) — recomenda 7d (menor risco de vazamento) | 🟠 |
| P3 | **Unificar RBAC roles**: escolher `member` (código) ou `editor` (specs) | 🟠 |
| P4 | **Adicionar MFA fields ao Prisma User model**: `mfaEnabled`, `totpSecret`, `ssoOnly` | 🔴 |
| P5 | **Especificar formato de token refresh**: JWT ou opaco — o spec diz opaco mas código gera JWT | 🔴 |
| P6 | **Documentar cookie vs header decisão para auth** — spec diz cookies, código usa header | 🟠 |
| P7 | **Criar `prompt-security-spec.md`** brief (ausente mas referenciado) | 🟡 |
| P8 | **Corrigir glossário**: `INACTIVE` → `PAUSED` (ou `DRAFT`) | 🟡 |

### 6.2 Credential schema unificado

Recomenda unificar em **um** schema Prisma para Credential, escolhendo entre:

**Opção A (mínima, alinhada com código atual):** Manter `data: String` (JSON envelope `{iv, ct, tag}`), adicionar `keyVersion: String @default("v1")` para futura rotação.

**Opção B (alinhado com design-seguranca):** Expandir para `encryptedData`, `iv`, `keyVersion`, `algorithm`, `metadata`, `createdById`, `updatedById`, e criar `CredentialAuditLog` + `CredentialKeyVersion` models.

**Recomendação:** Opção B (design-seguranca) — o spec de segurança v2 e o design antigo concordam com envelope encryption + key versioning, mas o código atual usa um formato mais simples. Unificar evita drift.

### 6.3 Next.js version

| # | Correção |
|---|----------|
| P9 | **Unificar Next.js version**: v2-security-spec §0.1 diz "15", todos os outros dizem "16" — corrigir o spec para 16 |

### 6.4 Briefs ausentes

| # | Correção |
|---|----------|
| P10 | Criar `prompt-security-spec.md` (brief gerador do v2-security-spec) |
| P11 | Criar `prompt-approvals.md` (brief gerador do v2-approvals) |
| P12 | Criar `prompt-integracoes-negocio.md` (brief gerador do v2-business-integrations) |

### 6.5 Expressão engine sandbox

| # | Correção |
|---|----------|
| P13 | A spec de segurança deve endereçar sandboxing de expressions inline (`{{= JS }}`), não apenas Code node |
| P14 | O catalogo-nodes §§9-13 documenta `new Function()` — mover para `isolated-vm` ou documento risco aceito |

### 6.6 Pipeline CI/CD

| # | Correção |
|---|----------|
| P15 | **Adicionar `CREDENTIAL_ENCRYPTION_KEY` ao `.env.example` e CI** (GLM-HEAVY-BRIEF o inclui, mas env.ts não valida) |
| P16 | **Adicionar coverage threshold** ao CI (README exige ≥80% mas não está no pipeline) |
| P17 | **Adicionar testes de paridade n8n** ao CI (prompt-test-strategy §5 exige, GLM-HEAVY-BRIEF não inclui) |

### 6.7 Vault terminology

| # | Correção |
|---|----------|
| P18 | **Documentar claramente**: "Vault" em v2-security-spec = envelope encryption local (não HashiCorp Vault). Briefs de cloud/deploy que mencionam "vault (segredos)" devem especificar se é para infra secrets (HashiCorp) ou credential encryption (local AES-GCM) |
| P19 | **Unificar**: Escolher entre HashiCorp Vault (briefs de cloud/deploy) ou local AES-GCM (código real) e documentar a decisão |

---

## 7. Conclusão

A revisão transversal revela **10 inconsistências críticas**, **6 altas**, **8 médias**, e **5 lacunas estruturais** entre os documentos e o código.

**Principais achados:**

1. **15 de 17 v2-*.md planejados não existem** — o roadmap mestre não pode ser construído
2. **`CREDENTIAL_ENCRYPTION_KEY`** é requerido pelo código mas não validado em `env.ts` — risco de crash em deploy
3. **Três models de Credential incompatíveis** entre Prisma real, design-seguranca, e v2-security-spec
4. **MFA, Argon2id, PKCE, cookie-based refresh** são requeridos nas specs mas não implementados
5. **RBAC role mismatch**: "editor" (specs) vs "member" (código)
6. **Next.js version mismatch**: 15 (security spec) vs 16 (restante)
7. **Expression engine usa `new Function()` sem sandbox** — risco de injeção não enderado pela spec de segurança
8. **Rate limiting e lockout** presentes no spec mas não no código
9. **RLS** exigido pelo database brief mas não implementado
10. **Observabilidade** (Prometheus, OpenTelemetry) exigida pelo operations brief mas não implementada

> **Nota**: Esta revisão é baseada em análise estática de documentos e código. Recomenda-se validação dinâmica com execução de testes de integração antes de implementar correções.

*Documento*: `n8n-migration/v2-cross-document-review.md`  
*Baseado em*: `v2-security-spec.md`, `v2-compatibility-matrix.md`, todos os briefs em `n8n-migration/briefs/`, documentos antigos em `n8n-migration/`, e código em `apps/api/src/` + `packages/`