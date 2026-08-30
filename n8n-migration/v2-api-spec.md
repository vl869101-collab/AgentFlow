# API REST — AgentFlow v2

> **Missão**: Recriar n8n no AgentFlow — especificação da API REST da plataforma
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: SPEC — documento de planejamento, não implementa código

---

## 1. Princípios

A API REST do AgentFlow é a interface única entre o backend (Fastify), o frontend (Next.js 15), SDKs e integrações externas. Todos os clientes — dashboard web, CLI, SDKs, scripts — consomem os mesmos endpoints.

### 1.1 Convenções Gerais

| Regra | Detivo |
|-------|--------|
| **Base URL** | `https://api.agentflow.io` (produção) · `http://localhost:3001` (dev) |
| **Versão** | `/api/v1` no path (versionamento semântico). Breaking changes → minor version bump (`/api/v2`). |
| **Formato** | JSON para request e response. `Content-Type: application/json`. |
| **Transporte** | HTTPS obrigatório em produção. HTTP permitido apenas em dev local. |
| **Nomenclatura** | `kebab-case` em paths (`/workflow-versions`). `camelCase` em campos JSON (`workflowId`, `createdAt`). |
| **Timestamps** | ISO 8601 UTC, formato `YYYY-MM-DDTHH:mm:ss.fffZ`. Ex: `2026-08-20T14:30:00.000Z`. |
| **IDs** | `cuid()` (28+ chars, ex: `cm4x9y2za0001a2b3c4d5e6f`) para todos os recursos. Compatível com n8n na importação (mapeia IDs n8n → cuid internos). |
| **Limites** | Request body ≤ 10 MB (exceto upload de arquivos, via signed URL). |
| **Timeout** | Gateway: 60s. API: 30s para operações síncronas, async (202) para execuções longas. |

### 1.2 Envelope de Resposta

Todas as respostas seguem o envelope padrão:

```json
{
  "data": <object|array>,
  "meta": {
    "total": 150,
    "page": 1,
    "perPage": 20,
    "cursor": "eyJpZmYiOjB9",
    "nextCursor": "eyJpZmYiOjIwfQ==",
    "prevCursor": null,
    "hasNext": true,
    "hasPrev": false
  },
  "links": {
    "self": "/api/v1/workflows?page=1&perPage=20",
    "next": "/api/v1/workflows?cursor=eyJpZmYiOjIwfQ==",
    "prev": null
  }
}
```

- `meta` presente apenas em listagens (paginadas).
- `links` com HATEOAS mínimo (auto, next, prev).
- Para recursos únicos: `{ "data": { ... } }` sem `meta`/`links`.

### 1.3 Idempotência

Operações idempotentes por especificação HTTP:
- `GET`, `HEAD`, `OPTIONS` — sempre idempotentes.
- `PUT` — idempotente por natureza (substituição completa).
- `DELETE` — idempotente (segunda chamada retorna 404).
- `POST` — **não idempotente por padrão**, mas endpoints críticos suportam `Idempotency-Key` header (seção 1.4).

#### 1.4 Idempotency-Key

Cabeçalho `Idempotency-Key: <uuid>` em `POST` idempotentes. O servidor guarda a resposta por `orgId + key` por 24h. Replays retornam a mesma resposta com `X-Idempotent-Replay: true`.

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

**Endpoints que suportam idempotência:**
- `POST /auth/login` — permite retry sem risco de lockout duplicado
- `POST /workflows` — criação é idempotente com mesma key
- `POST /executions/:id/retry` — retry duplicado não cria execução duplicada
- `POST /credentials/:id/test` — teste idempotent

## 2. Autenticação e Autorização

### 2.1 Métodos de Autenticação

| Método | Header | Uso |
|--------|--------|-----|
| **JWT (Bearer)** | `Authorization: Bearer <access_jwt>` | Web app, SDKs, CLI interativo |
| **API Key** | `X-AgentFlow-API-Key: af_<key>` | Scripts, automação, CI/CD |
| **Cookie (browser)** | `Cookie: af_access=<jwt>; af_refresh=<opaque>` | Web app com sessão persistente |

#### 2.2 Fluxo JWT (Access + Refresh)

```
1. POST /auth/login              → { accessToken (JWT 15min), refreshToken (opaque, 30d) }
2. Usuário usa accessToken      → Authorization: Bearer <jwt>
3. accessToken expira (15min)   → 401 com { error: "Token expired", code: "TOKEN_EXPIRED" }
4. POST /auth/refresh            → { accessToken (novo), refreshToken (rotacionado) }
5. POST /auth/logout             → revoga refreshToken no DB
```

**Access Token (JWT):**
- Algoritmo: HS256
- Claims: `sub`, `orgId`, `role`, `sid`, `mfa` (bool), `auth_time`, `iat`, `nbf`, `exp`, `iss`, `aud`, `jti`
- TTL: 15 minutos
- Nunca lê role do JWT — role vem do DB em cada request mutável (anti-tampering)

**Refresh Token (opaque):**
- Formato: 32 bytes `crypto.randomBytes(32).toString("hex")`
- Armazenado no DB como SHA-256 hash (coluna `tokenHash`)
- TTL: 30 dias (sliding — renovado a cada uso)
- `jti` correlaciona ao refresh token no DB
- Revogação imediata via `revokedAt` no DB
- Family token: refresh gera novo token e invalida o anterior. Reuse detectado → revoga toda a família.

#### 2.3 API Keys

| Campo | Detalhe |
|-------|---------|
| Prefixo | `af_` (detectado automaticamente no middleware) |
| Hash | SHA-256 no DB (nunca armazena plaintext) |
| Escopos | `scope` em JWT-style space-delimited: `workflows:read workflows:write credentials:read` |
| Expiração | Opcional (`expiresAt`); key sem expiração = "never expires" |
| Usage tracking | `lastUsed` atualizado a cada request |
| Permissões | Herda as permissões do usuário que criou; não pode elevar role |

#### 2.4 MFA (Multi-Factor Authentication)

Suporte a três fatores, encadeados:

1. **Senha** → emite token com `mfa: false` e escopo reduzido (apenas `/auth/mfa/verify`)
2. **TOTP** (RFC 6238) — 6 dígitos, janela ±1, SHA-1, secret de 160 bits
3. **Email OTP** — fallback, 6 dígitos, TTL 10 min, 5 envios/15min
4. **Backup codes** — 10 códigos one-time, reutilizáveis a cada 90 dias

Fluxo de enrolamento: senha atual + email verificado obrigatórios. Evento de auditoria + alerta por email.

**Endpoints MFA:**
- `POST /auth/mfa/verify` — verifica código TOTP/OTP, retorna full access JWT
- `POST /auth/mfa/totp` — gera secret + QR (otpauth://)
- `POST /auth/mfa/backup-codes` — gera 10 backup codes (mostra uma vez)
- `POST /auth/mfa/email/send` — envia OTP por email (fallback)
- `POST /auth/mfa/email/verify` — verifica OTP de email
- `POST /auth/mfa/disable` — desativa MFA (revoga sessões, alerta)

#### 2.5 SSO (OIDC / SAML)

Futuro — arquitetura preparada. Provedores suportados: Google, Microsoft Entra, GitHub, Okta, genérico OIDC.

- `GET /auth/sso/{provider}` → redirect para IdP com PKCE + state nonce
- `GET /auth/sso/{provider}/callback` → troca code, valida id_token (JWKS), provisiona usuário (JIT)
- Usuário criado via SSO tem `ssoOnly: true` (senha desabilitada)
- `ssoOnly` pode ser revertido apenas por admin com re-autenticação

### 2.6 RBAC — Role-Based Access Control

**Roles de organização** (por usuário × org):

| Role | Workflows | Credentials | Executions | Users | Projects | Billing/Org |
|------|-----------|-------------|------------|-------|----------|-------------|
| **owner** | CRUD + execute + publish + manage members | crate/edit/decrypt/rotate | read/stop/retry/export | invite/promote/demote/remove | full | full |
| **admin** | CRUD + execute + publish | create/edit/decrypt | read/stop/retry/export | invite/remove (not promote) | create/edit | read billing |
| **editor** | CRUD + execute | create/edit (no decrypt of others) | read/stop/retry | read | read | — |
| **viewer** | read | read (hasValue only, never secret) | read | read | read | — |

**Project-scoped roles** (subordinadas à role da org — interseção, nunca ampliação):
- `project:editor` / `project:viewer`

**Princípios:**
- **Deny-by-default**: permissão não listada = 403 genérico
- Role é fonte de verdade no **DB** (cache TTL curto), nunca no JWT
- `owner` invariante: último owner ativo não pode ser rebaixado
- `orgId` nunca confiado ao client; resolvido do token + DB

**Permission matrix (resource actions):**

```typescript
type Resource = "workflow" | "credential" | "execution" | "template" | "project" | "org" | "webhook" | "schedule";
type Action = "create" | "read" | "update" | "delete" | "execute" | "publish" 
  | "decrypt" | "rotate" | "test" | "invite" | "promote" | "demote" | "remove" 
  | "retry" | "stop" | "export" | "manage" | "list";
```

| Role | workflow | credential | execution | template | project | org | webhook | schedule |
|------|----------|------------|-----------|----------|---------|-----|---------|----------|
| owner | CRUD+exec+pub+manage | CRUD+decrypt+rotate+test+export | read+stop+retry+export | CRUD | CRUD | CRUD+manage | CRUD | CRUD |
| admin | CRUD+exec+pub | CRUD+decrypt+test | read+stop+retry+export | read | CRUD | read | CRUD | CRUD |
| editor | CRUD+exec | CRUD+test | read+stop+retry | read | read | — | CRUD | CRUD |
| viewer | read | read (hasValue only) | read | read | read | — | read | read |

### 2.7 Tenant Isolation

```
Tenant isolation = 3 camadas defensivas (defense in depth):

1. MIDDLEWARE (orgId do token)
   → Toda request carrega orgId resolvido do JWT ou API key
   → Header X-Org-Id é IGNORED se não bate com token (anti-CSRF)

2. SERVICE LAYER (scoping)
   → Toda query Prisma inclui `where: { orgId }`
   → Nenhum endpoint filtra client-side

3. DATABASE (RLS opcional)
   → Row-Level Security no PostgreSQL como backup
   → Todas queries carregam orgId via middleware
```

## 3. Endpoints de Auth

Prefixo: `/api/v1/auth`

### 3.1 POST /auth/login

Login com email + senha. Retorna JWT access + refresh token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "supersecret123"
}
```

**Responses:**
- `200 OK` — Login bem-sucedido (sem MFA necessária)
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "user": {
      "id": "cm4x9y2za0001a2b3c4d5e6f",
      "email": "user@example.com",
      "name": "John Doe",
      "mfaEnabled": false
    }
  }
}
```
- `202 Accepted` — Login bem-sucedido, MFA necessária
```json
{
  "data": {
    "accessToken": "eyJ...mfa_pending...",
    "refreshToken": "...",
    "expiresIn": 900,
    "mfaRequired": true,
    "mfaType": ["totp", "email", "backup"]
  }
}
```
- `401 Unauthorized` — Credenciais inválidas
- `429 Too Many Requests` — Rate limit de login (5 tentativas / 15 min por email + IP)
- `423 Locked` — Conta bloqueada (lockout progressivo após 5/10/20 falhas)

**Headers:** `Idempotency-Key` suportado.
**Cookies:** Se `Set-Cookie` aceito pelo client, tokens são enviados como `af_access` (httpOnly, Secure, SameSite=Lax) e `af_refresh` (httpOnly, Secure, SameSite=Strict).

### 3.2 POST /auth/refresh

Troca refresh token por novo access token. Rotaciona refresh token (family token).

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f67890..."
}
```

**Responses:**
- `200 OK`
```json
{
  "data": {
    "accessToken": "eyJ...novo...",
    "refreshToken": "novo_refresh_token_hex_64",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```
- `401 Unauthorized` — Refresh token inválido, expirado ou revogado
- `419 Authentication Timeout` — Refresh token expirado (30 dias)

**Security:** Reuse detection — se refresh token já foi rotacionado, revoga toda a sessão (`family-reuse`). Evento de auditoria `auth.session.reuse_detected`.

### 3.3 POST /auth/logout

Revoga refresh token (logout local). Opcionalmente logout global.

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f67890...",  // opcional se via cookie
  "global": false  // true = revoga todas as sessões do usuário
}
```

**Responses:**
- `200 OK` — `{ "data": { "ok": true } }`
- `401 Unauthorized` — Token inválido

**Cookies:** Limpa `af_access` e `af_refresh`.

### 3.4 POST /auth/mfa/verify

Verifica código MFA e emite token completo.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "method": "totp",  // "totp" | "email" | "backup"
  "rememberDevice": true  // True = trust por 30 dias (device fingerprint)
}
```

**Responses:**
- `200 OK`
```json
{
  "data": {
    "accessToken": "eyJ...full_scope...",
    "refreshToken": "...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```
- `401 Unauthorized` — Código inválido
- `429 Too Many Requests` — 10 tentativas MFA / 15 min

### 3.5 POST /auth/mfa/totp

Inicia enrolamento TOTP. Exige senha atual + email verificado.

**Request:**
```json
{
  "password": "currentPassword123"
}
```

**Responses:**
- `200 OK`
```json
{
  "data": {
    "secret": "JBSWY3DPEHPK3P7R",  // Mostrado UMA VEZ — salvar antes de fechar
    "otpauthUrl": "otpauth://totp/AgentFlow:user@example.com?secret=JBSWY3DP...",
    "backupCodes": ["a1b2c3d4", "e5f6g7h8", "...10 codes..."]
  }
}
```
- `401 Unauthorized` — Senha incorreta
- `409 Conflict` — MFA já ativada

### 3.6 POST /auth/mfa/backup-codes

Regenera backup codes (invalida os anteriores).

**Request:** `{ "password": "currentPassword123" }`

**Responses:**
- `200 OK` — `{ "data": { "backupCodes": ["...", 10 codes] } }`
- `401 Unauthorized`

### 3.7 POST /auth/mfa/email/send

Envia OTP de 6 dígitos por email (fallback TOTP).

**Request:** `{ "email": "user@example.com" }`

**Responses:**
- `200 OK` — `{ "data": { "ok": true, "expiresIn": 600 } }`
- `429 Too Many Requests` — 5 envios / 15 min

### 3.8 POST /auth/mfa/email/verify

Verifica OTP enviado por email.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "rememberDevice": true
}
```

**Responses:** Igual ao 3.4 (retorna tokens completos).

### 3.9 POST /auth/mfa/disable

Desativa MFA. Revoga todas as sessões e envia alerta.

**Request:** `{ "password": "currentPassword123" }`

**Responses:**
- `200 OK`
- `401 Unauthorized`

### 3.10 POST /auth/password-reset

Inicia fluxo de recuperação de senha.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Responses:**
- `200 OK` — Sempre retorna 200 (não revela se email existe): `{ "data": { "message": "If the email exists, a reset link has been sent." } }`
- Rate limit: 3 requisições / hora por email + IP

### 3.11 POST /auth/password-reset/confirm

Redefine senha com token one-time.

**Request:**
```json
{
  "token": "reset_token_from_email",  // TTL 30 min
  "password": "NovaSenha123!"
}
```

**Responses:**
- `200 OK` — `{ "data": { "ok": true } }` (revoga todas as sessões)
- `401 Unauthorized` — Token inválido ou expirado
- `422 Unprocessable Entity` — Senha fraca (mínimo 10 chars, check contra breached passwords)

### 3.12 GET /auth/me

Retorna dados do usuário autenticado + contexto de org.

**Responses:**
- `200 OK`
```json
{
  "data": {
    "user": {
      "id": "cm4x9y2za0001a2b3c4d5e6f",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "mfaEnabled": true,
      "ssoOnly": false,
      "createdAt": "2026-08-20T14:30:00.000Z"
    },
    "org": {
      "id": "cm4x9y2za0002o3p4q5r6s7t",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "plan": "PRO",
      "role": "admin"
    },
    "memberships": [
      { "orgId": "cm4x...", "orgName": "Acme Corp", "role": "admin", "isDefault": true }
    ]
  }
}
```
- `401 Unauthorized`

### 3.13 PATCH /auth/me

Atualiza perfil do usuário (nome, avatar).

**Request:**
```json
{
  "name": "John Doe Updated",
  "avatarUrl": "https://..."  // upload via signed URL separado
}
```

**Responses:**
- `200 OK` — `{ "data": { "user": {...} } }`
- `401 Unauthorized`
- `400 Bad Request` — Validação

### 3.14 POST /auth/api-keys

Gerencia API keys do usuário.

**Request:**
```json
{
  "name": "CI/CD Pipeline",
  "scope": "workflows:read workflows:write executions:read",  // opcional, default = full
  "expiresAt": "2027-08-20T00:00:00.000Z"  // opcional
}
```

**Responses:**
- `201 Created`
```json
{
  "data": {
    "id": "cm4x9y2za0003u4v5w6x7y8z",
    "name": "CI/CD Pipeline",
    "key": "af_51k8s9d7f2h3j4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9",  // Mostrado UMA VEZ
    "scope": "workflows:read workflows:write executions:read",
    "expiresAt": "2027-08-20T00:00:00.000Z",
    "createdAt": "2026-08-20T14:30:00.000Z"
  }
}
```
- `401 Unauthorized`

### 3.15 GET /auth/api-keys

Lista API keys do usuário (sem valores).

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "name": "CI/CD Pipeline",
      "scope": "workflows:read workflows:write",
      "lastUsed": "2026-08-20T10:00:00.000Z",
      "expiresAt": "2027-08-20T00:00:00.000Z",
      "createdAt": "2026-08-20T14:30:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

### 3.16 DELETE /auth/api-keys/:id

Revoga API key.

**Responses:**
- `204 No Content`
- `401 Unauthorized`
- `404 Not Found`

## 4. Endpoints de Organizações

Prefixo: `/api/v1/orgs`

### 4.1 GET /orgs

Lista organizações do usuário autenticado.

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x9y2za0002o3p4q5r6s7t",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "plan": "PRO",
      "logoUrl": "https://...",
      "role": "admin",
      "createdAt": "2026-08-20T14:30:00.000Z",
      "updatedAt": "2026-08-20T14:30:00.000Z"
    }
  ]
}
```

### 4.2 POST /orgs

Cria nova organização (usuário vira owner).

**Request:**
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",  // único, lowercase, kebab-case
  "plan": "FREE"  // default
}
```

**Responses:**
- `201 Created` — `{ "data": { ...org, role: "owner" } }`
- `409 Conflict` — Slug já existe
- `422 Unprocessable Entity` — Slug inválido

### 4.3 GET /orgs/:id

Obtém detalhes da org.

**Responses:**
- `200 OK` — `{ "data": { id, name, slug, plan, logoUrl, billingEmail, createdAt, updatedAt, usage: {...} } }`
```json
{
  "data": {
    "id": "cm4x...",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "PRO",
    "logoUrl": "https://...",
    "billingEmail": "billing@acme.com",
    "usage": {
      "executionsThisMonth": 1250,
      "executionLimit": 10000,
      "workflows": 24,
      "workflowLimit": 100,
      "users": 5,
      "userLimit": 20
    },
    "policies": {
      "requireMfa": false,
      "passwordMinLength": 10,
      "sessionTtl": 900
    },
    "createdAt": "2026-08-20T14:30:00.000Z",
    "updatedAt": "2026-08-20T14:30:00.000Z"
  }
}
```
- `404 Not Found` — Org não existe ou acesso negado

### 4.4 PATCH /orgs/:id

Atualiza org (apenas owner/admin).

**Request:**
```json
{
  "name": "Acme Corp Updated",
  "logoUrl": "https://...",
  "billingEmail": "billing@acme.com",
  "policies": {
    "requireMfa": true
  }
}
```

**Responses:**
- `200 OK`
- `403 Forbidden` — Não é admin/owner
- `404 Not Found`

### 4.5 POST /orgs/:id/members

Convida membro para a org.

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "editor"  // "owner" | "admin" | "editor" | "viewer"
}
```

**Responses:**
- `201 Created` — `{ "data": { id, email, role, invitedAt, inviteToken } }` (convite por email)
- `403 Forbidden` — Apenas admin/owner podem convidar (não promover a owner)
- `409 Conflict` — Usuário já é membro

### 4.6 PATCH /orgs/:id/members/:userId

Atualiza role de membro (admin/owner only).

**Request:**
```json
{
  "role": "admin"
}
```

**Responses:**
- `200 OK`
- `403 Forbidden` — Apenas owner pode promover a admin; admin pode promover a editor/viewer
- `403 Forbidden` — Tentar rebaixar último owner
- `404 Not Found`

### 4.7 DELETE /orgs/:id/members/:userId

Remove membro da org.

**Responses:**
- `204 No Content`
- `403 Forbidden` — Tentar remover owner
- `404 Not Found`

### 4.8 GET /orgs/:id/roles

Lista roles disponíveis + permissões.

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "role": "owner",
      "label": "Owner",
      "description": "Full access to all org resources",
      "permissions": [
        { "resource": "workflow", "action": "create" },
        ...
      ]
    },
    { "role": "admin", "label": "Admin", "permissions": [...] },
    { "role": "editor", "label": "Editor", "permissions": [...] },
    { "role": "viewer", "label": "Viewer", "permissions": [...] }
  ]
}
```

### 4.9 GET /orgs/:id/audit-logs

Lista logs de auditoria (apenas owner/admin).

**Query params:**
- `action` (string) — Filtra por ação (ex: `workflow.create`, `credential.decrypt`)
- `resource` (string) — Filtra por recurso
- `userId` (string) — Filtra por usuário
- `from` / `to` (ISO date) — Range temporal
- Paginação padrão

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "action": "credential.decrypt",
      "resource": "credential",
      "resourceId": "cm4x...",
      "userId": "cm4x...",
      "userEmail": "admin@example.com",
      "orgId": "cm4x...",
      "ip": "203.0.113.42",
      "userAgent": "Mozilla/5.0...",
      "success": true,
      "metadata": { "purpose": "execution" },
      "createdAt": "2026-08-20T14:30:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

## 5. Endpoints de Workflows

Prefixo: `/api/v1/workflows`

### 5.1 GET /workflows

Lista workflows da org autenticada.

**Query params:**
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `limit` | int | Não | Resultados por página (1-100, default 20) |
| `cursor` | string | Não | Cursor opaco (preferido) |
| `offset` | int | Não | Offset (legacy, para compat n8n) |
| `active` | bool | Não | Filtra por workflows ativos |
| `status` | string[] | Não | Filtra por status: `DRAFT`, `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `tags` | string | Não | Filtra por tags (comma-separated) |
| `name` | string | Não | Busca parcial por nome |
| `search` | string | Não | Busca full-text (nome + tags + descrição) |
| `sort` | string | Não | `createdAt`, `updatedAt`, `name` — prefixo `-` para desc (default: `-updatedAt`) |
| `folderId` | string | Não | Filtra por pasta |
| `projectId` | string | Não | Filtra por projeto |

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x9y2za000abc123def456",
      "name": "Sync CRM contacts",
      "description": "Syncs contacts from CRM to Google Sheets daily",
      "status": "ACTIVE",
      "active": true,
      "versionId": "cm4x...v1",
      "version": 3,
      "triggerCount": 2,
      "nodeCount": 5,
      "isArchived": false,
      "tags": ["crm", "daily"],
      "folderId": null,
      "projectId": null,
      "ownerId": "cm4x...user1",
      "orgId": "cm4x...org1",
      "settings": {
        "executionOrder": "v1",
        "executionTimeout": 3600,
        "saveManualExecutions": true,
        "timezone": "America/Sao_Paulo"
      },
      "webhookCount": 1,
      "scheduleCount": 1,
      "lastExecutedAt": "2026-08-20T10:00:00.000Z",
      "createdAt": "2026-08-20T14:30:00.000Z",
      "updatedAt": "2026-08-20T15:00:00.000Z"
    }
  ],
  "meta": {
    "total": 24,
    "cursor": "eyJpZCI6ImNtNHg5...",
    "nextCursor": "eyJpZCI6ImNtNHgy...",
    "hasNext": true
  },
  "links": {
    "self": "/api/v1/workflows?limit=20",
    "next": "/api/v1/workflows?cursor=eyJpZCI6ImNtNHgy..."
  }
}
```

### 5.2 POST /workflows

Cria novo workflow (status DRAFT).

**Request:**
```json
{
  "name": "Novo Workflow",
  "description": "Descrição do workflow",
  "tags": ["tag1", "tag2"],
  "folderId": null,
  "projectId": null,
  "nodes": [
    {
      "id": "n8n-node-1",  // opcional, gerado se omitido
      "type": "webhook",
      "label": "Incoming Webhook",
      "config": {
        "httpMethod": "POST",
        "path": "my-webhook"
      },
      "position": { "x": 250, "y": 300 }
    }
  ],
  "edges": [],
  "settings": {
    "executionOrder": "v1",
    "executionTimeout": 3600,
    "timezone": "UTC"
  }
}
```

**Responses:**
- `201 Created` — `{ "data": { ...workflow } }`
- `403 Forbidden` — Limite de workflows no plano atingido
- `422 Unprocessified Entity` — Validação (schema Zod)
- `409 Conflict` — Path de webhook já usado por outro workflow ativo
- Headers: `Idempotency-Key` suportado

**Schema de validação (Zod):**
```typescript
const WorkflowNodeSchema = z.object({
  id: z.string().optional(),
  type: NodeTypeSchema,  // enum: webhook, cron, http, condition, transform, code, merge, delay, ai_agent, approval, etc.
  label: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  width: z.number().optional(),
  height: z.number().optional(),
  disabled: z.boolean().default(false),
  notes: z.string().optional(),
  retryOnFail: z.boolean().default(false),
  maxTries: z.number().int().positive().default(3),
  waitBetweenTries: z.number().int().positive().default(1000),
  continueOnFail: z.boolean().default(false),
}).passthrough();

const WorkflowEdgeSchema = z.object({
  id: z.string().optional(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
}).passthrough();
```

### 5.3 GET /workflows/:id

Obtém workflow completo.

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `include` | string | Expande relacionamentos: `nodes,edges,versions` |
| `excludePinnedData` | bool | Exclui dados fixados (default: false) |

**Responses:**
- `200 OK`
```json
{
  "data": {
    "id": "cm4x...",
    "name": "Sync CRM contacts",
    "description": "...",
    "status": "ACTIVE",
    "active": true,
    "versionId": "cm4x...v3",
    "version": 3,
    "triggerCount": 1,
    "nodes": [
      {
        "id": "n8n-node-1",
        "type": "webhook",
        "label": "Incoming Webhook",
        "config": { "httpMethod": "POST", "path": "my-webhook" },
        "position": { "x": 250, "y": 300 },
        "width": 180,
        "height": 60,
        "disabled": false,
        "nodeGroup": null,
        "typeVersion": 1
      }
    ],
    "edges": [],
    "settings": { "executionOrder": "v1", "executionTimeout": 3600, "timezone": "UTC" },
    "staticData": {},
    "pinData": {},
    "tags": ["crm"],
    "folderId": null,
    "projectId": null,
    "meta": {},
    "ownerId": "cm4x...",
    "orgId": "cm4x...",
    "createdAt": "2026-08-20T14:30:00.000Z",
    "updatedAt": "2026-08-20T15:00:00.000Z"
  }
}
```
- `404 Not Found` — Workflow não existe ou acesso negado (org scoping)

### 5.4 PUT /workflows/:id

Substitui definição completa do workflow (nodes, edges, settings). Cria nova versão.

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `publishIfActive` | bool | Se true e workflow está ativo, publica nova versão (default: true) |

**Request:** Mesmo schema do POST, mas todos os campos são obrigatórios (substituição completa).

**Responses:**
- `200 OK` — `{ "data": { ...workflow } }`
- `404 Not Found`
- `409 Conflict` — Conflito de webhook (workflow review ou duplicata)
- `422 Unprocessable Entity`

**Versionamento:** Cada PUT cria `WorkflowVersion` com snapshot JSON. Versão é imutável.

### 5.5 PATCH /workflows/:id

Atualiza parcialmente metadados do workflow.

**Request:**
```json
{
  "name": "Nome Atualizado",
  "description": "Nova descrição",
  "tags": ["novo", "tag"],
  "folderId": "cm4x...",
  "status": "PAUSED"  // se mover de ACTIVE → PAUSED, desregistra webhooks/crons
}
```

**Responses:**
- `200 OK`
- `404 Not Found`
- `403 Forbidden` — Tentar publicar sem permissão `workflow:publish`

### 5.6 POST /workflows/:id/publish

Publica workflow (DRAFT/PAUSED → ACTIVE). Valida nós, registra webhooks e crons, cria versão.

**Request (opcional):**
```json
{
  "name": "v1.0 - Production release",  // nome da versão
  "description": "Initial production deployment"
}
```

**Responses:**
- `200 OK` — `{ "data": { ...workflow, status: "ACTIVE" } }`
- `400 Bad Request` — Workflow sem trigger válido (webhook/cron/manual)
- `409 Conflict` — Review aberto ou conflito de webhook
```json
{
  "error": {
    "code": "WORKFLOW_REVIEW_REQUIRED",
    "message": "Workflow requires review before publishing",
    "details": {
      "workflowReviewRequestId": "cm4x..."
    }
  }
}
```
- `422 Unprocessable Entity` — Nós órfãos ou configuração inválida

### 5.7 POST /workflows/:id/unpublish

Desativa workflow (ACTIVE → PAUSED). Desregistra webhooks e crons.

**Responses:** `200 OK` — `{ "data": { ...workflow, status: "PAUSED" } }`

### 5.8 POST /workflows/:id/activate

Alias de publish (compat com n8n). Redireciona para 5.6.

### 5.9 POST /workflows/:id/deactivate

Alias de unpublish (compat com n8n). Redireciona para 5.7.

### 5.10 POST /workflows/:id/execute

Executa workflow manualmente.

**Request:**
```json
{
  "input": { "email": "user@example.com", "action": "notify" },
  "runOptions": {
    "sync": false,  // true = espera conclusão (max 30s), false = 202 Accepted async
    "startNodes": ["node-id-1"],  // inicia de nós específicos (test mode)
    "timeOverride": "2026-08-20T15:00:00.000Z"
  }
}
```

**Responses:**
- `202 Accepted` (async) — `{ "data": { "executionId": "cm4x...", "status": "PENDING" } }`
- `200 OK` (sync) — `{ "data": { ...execution } }` — se completar em ≤30s
- `404 Not Found` — Workflow não encontrado ou não está ACTIVE
- `403 Forbidden` — Quota de execuções excedida
- `422 Unprocessable Entity` — Validação de input

**Headers:** `Idempotency-Key` suportado — retry não cria duplica.

### 5.11 POST /workflows/:id/test

Executa workflow em modo teste (usa pinData, não afeta produção).

**Request:**
```json
{
  "startNodes": ["node-id"],
  "input": {}
}
```

**Responses:** `202 Accepted` ou `200 OK` (sync) — mesmo formato de execução.

### 5.12 GET /workflows/:id/versions

Lista versões históricas do workflow.

**Query params:** Paginação padrão + `include` (content/data).

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "version": 3,
      "snapshot": { ... },  // full JSON do workflow nesta versão
      "name": "v1.0 - Production release",
      "description": "Initial production deployment",
      "createdById": "cm4x...",
      "createdAt": "2026-08-20T14:30:00.000Z"
    }
  ],
  "meta": { "total": 3 }
}
```

### 5.13 POST /workflows/:id/versions/:versionId/restore

Restaura uma versão anterior (cria nova versão).

**Responses:**
- `200 OK` — `{ "data": { ...workflow, version: newVersion } }`
- `404 Not Found` — Versão não encontrada

### 5.14 GET /workflows/:id/export

Exporta workflow em formato compatível com n8n.

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `format` | string | `n8n` (default) ou `agentflow` |

**Responses:** `200 OK` — JSON compatível com n8n (conforme `referencia-n8n.md`):
```json
{
  "data": {
    "name": "Sync CRM contacts",
    "nodes": [ { ...n8n format... } ],
    "connections": { ... },
    "settings": { ... },
    "meta": {}
  }
}
```

### 5.15 POST /workflows/import

Importa workflow de JSON n8n (ou AgentFlow).

**Request:**
```json
{
  "workflowJson": { ... },  // JSON no formato n8n
  "activate": false,  // se true, publica após import
  "credentialMapping": { "Old Cred Name": "New Cred ID" }  // mapeia credenciais n8n → AgentFlow
}
```

**Responses:**
- `201 Created` — `{ "data": { ...workflow }, "warnings": ["unmapped credential: Old API Key"] }`
- `422 Unprocessable Entity` — JSON inválido

### 5.16 Tags & Folders (CRUD)

#### GET /tags
Lista tags da org.

**Responses:** `200 OK`
```json
{
  "data": [
    { "name": "crm", "count": 5, "color": "#3b82f6" },
    { "name": "daily", "count": 3 }
  ]
}
```

#### POST /tags
Cria tag.

**Request:** `{ "name": "new-tag", "color": "#ef4444" }`

#### DELETE /tags/:name
Deleta tag (remove de todos workflows).

### 5.17 Folders

#### GET /folders
Lista pastas da org.

#### POST /folders
Cria pasta.

**Request:** `{ "name": "Marketing Workflows", "parentId": null }`

#### PATCH /folders/:id
Renomeia/move pasta.

#### DELETE /folders/:id
Remove pasta (workflows movidos para raiz).

## 6. Endpoints de Execuções

Prefixo: `/api/v1/executions`

### 6.1 GET /executions

Lista execuções (org-wide ou scoped a workflow).

**Query params:**
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `limit` | int | Não | 1-100, default 20 |
| `cursor` | string | Não | Cursor opaco |
| `status` | string[] | Não | `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `CANCELLED`, `WAITING_APPROVAL` |
| `workflowId` | string | Não | Filtra por workflow |
| `trigger` | string[] | Não | `webhook`, `manual`, `cron`, `api` |
| `from` / `to` | ISO date | Não | Range temporal |
| `mode` | string | Não | `full` (com dados) ou `summary` (apenas metadados, default) |
| `redactData` | bool | Não | Ofusca dados sensíveis em output (default: true) |

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "status": "SUCCESS",
      "trigger": "webhook",
      "workflowId": "cm4x...",
      "workflowName": "Sync CRM contacts",
      "orgId": "cm4x...",
      "userId": "cm4x...",
      "input": null,
      "output": null,
      "error": null,
      "startedAt": "2026-08-20T14:30:00.000Z",
      "finishedAt": "2026-08-20T14:30:05.000Z",
      "duration": 5234,
      "retryOf": null,
      "approvalIds": [],
      "hasData": false
    }
  ],
  "meta": { "total": 1250, "cursor": "eyJpZCI6ImNtNHg5..." }
}
```

### 6.2 GET /executions/:id

Detalhes completos de uma execução.

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `include` | string | `nodes,approvals` |
| `redactData` | bool | Ofusca credenciais em runData (default: true) |

**Responses:** `200 OK`
```json
{
  "data": {
    "id": "cm4x...",
    "status": "RUNNING",
    "trigger": "webhook",
    "mode": "webhook",
    "input": { "email": "user@example.com" },
    "output": null,
    "error": null,
    "startedAt": "2026-08-20T14:30:00.000Z",
    "finishedAt": null,
    "duration": null,
    "workflowId": "cm4x...",
    "workflowName": "Sync CRM contacts",
    "orgId": "cm4x...",
    "userId": "cm4x...",
    "nodes": [
      {
        "id": "n8n-exec-node-1",
        "nodeId": "n8n-node-1",
        "nodeType": "webhook",
        "nodeLabel": "Incoming Webhook",
        "status": "SUCCESS",
        "input": { "json": { ... } },
        "output": { "json": { "email": "user@example.com" } },
        "error": null,
        "logs": "[2024-01-01T10:00:00Z] Webhook received\n",
        "startedAt": "2024-01-01T10:00:00.000Z",
        "finishedAt": "2024-01-01T10:00:00.100Z",
        "duration": 100,
        "retryCount": 0,
        "idempotencyKey": null
      }
    ],
    "approvals": [],
    "retryOf": null,
    "customData": {}
  }
}
```
- `404 Not Found`

### 6.3 GET /executions/:id/data

Obtém dados completos da execução (runData, node outputs). Diferente do GET /:id que pode omitir dados grandes.

**Query params:** `redactData` (bool, default true), `ignoreDataSizeLimit` (bool)

**Responses:** Formato n8n-compatível com `resultData.runData`.

### 6.4 POST /executions/:id/retry

Re-executa a partir de um nó falho.

**Request:**
```json
{
  "retryOnNode": "n8n-node-3",  // opcional: reexecuta a partir deste nó
  "input": {},  // opcional: sobrescreve input
  "mode": "full"  // "full" (reexecuta tudo) | "fromNode" (a partir do node falho)
}
```

**Responses:**
- `202 Accepted` — `{ "data": { "executionId": "cm4x...", "status": "PENDING" } }`
- `404 Not Found`
- `409 Conflict` — Execução ainda em andamento
- `422 Unprocessable Entity` — Execução não está em estado retryável

### 6.5 POST /executions/:id/cancel

Cancela execução em andamento.

**Responses:**
- `200 OK` — `{ "data": { ...execution, status: "CANCELLED" } }`
- `409 Conflict` — Execução já finalizada
- `404 Not Found`

### 6.6 GET /executions/:id/logs

Stream de logs via SSE (Server-Sent Events).

**Headers:**
```
Accept: text/event-stream
```

**Responses:** `200 OK` (SSE stream)
```
event: node.started
data: {"nodeId":"n8n-node-2","nodeType":"http","label":"HTTP Request"}
event: node.log
data: {"nodeId":"n8n-node-2","timestamp":"2026-08-20T14:30:01.000Z","level":"info","message":"Sending request to https://api.example.com"}
event: node.completed
data: {"nodeId":"n8n-node-2","status":"SUCCESS","duration":245}
event: execution.completed
data: {"executionId":"cm4x...","status":"SUCCESS","duration":3500}
```

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `lastEventId` | string | Reconexão incremental |
| `from` | ISO date | Replay desde (para logs históricos) |

**Eventos SSE disponíveis:**
- `execution.started`, `execution.completed`, `execution.failed`
- `node.started`, `node.log`, `node.completed`, `node.failed`
- `approval.created`, `approval.resolved`
- `notification` — mensagens do sistema

### 6.7 DELETE /executions

Limpa execuções (admin/owner only).

**Request:**
```json
{
  "workflowId": "cm4x...",  // opcional
  "status": "SUCCESS",  // opcional: limpa apenas de um status
  "before": "2026-08-01T00:00:00.000Z",  // limpa execuções anteriores a esta data
  "dryRun": false  // preview sem deletar
}
```

**Responses:**
- `200 OK` — `{ "data": { "deleted": 150, "remaining": 1100 } }`
- `202 Accepted` — Operação assíncrona (mass delete)
- `403 Forbidden`

## 7. Endpoints de Credenciais

Prefixo: `/api/v1/credentials`

> **IMPORTANTE**: Dados sensíveis (`data`) NUNCA são retornados por list/get. Apenas `hasValue: true`. A desencriptação ocorre apenas no runner (executor) ou via endpoint dedicado auditado (`credential:decrypt`).

### 7.1 GET /credentials

Lista credenciais da org (mascaradas).

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `type` | string | Filtra por tipo: `api_key`, `oauth2`, `basic`, `token` |
| `provider` | string | Filtra por provider: `stripe`, `openai`, `telegram`, etc. |
| `search` | string | Busca por nome |

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "name": "Production OpenAI Key",
      "type": "api_key",
      "provider": "openai",
      "createdAt": "2026-08-20T14:30:00.000Z",
      "updatedAt": "2026-08-20T14:30:00.000Z",
      "data": { "hasValue": true },  // NUNCA o valor real
      "usedByWorkflows": 3,
      "lastTestedAt": "2026-08-19T10:00:00.000Z",
      "testResult": "ok",
      "shares": [{ "projectId": "cm4x...", "role": "read" }]
    }
  ],
  "meta": { "total": 5 }
}
```

### 7.2 POST /credentials

Cria nova credencial (criptografa `data` server-side).

**Request:**
```json
{
  "name": "Production OpenAI Key",
  "type": "api_key",
  "provider": "openai",
  "data": { "apiKey": "sk-abc123..." },
  "metadata": {
    "description": "Key for production AI agents",
    "scopes": ["chat", "embeddings"]
  }
}
```

**Responses:**
- `201 Created` — Mesmo formato do GET (mascarado), nunca retorna `data` descriptografado
- `422 Unprocessable Entity` — Validação Zod
- `409 Conflict` — Nome duplicado na mesma org

### 7.3 POST /credentials/:id/test

Testa conexão da credencial (chama API do provider). Nunca vaza segredo.

**Responses:**
- `200 OK`
```json
{
  "data": {
    "success": true,
    "latencyMs": 142,
    "errorClass": null  // "auth" | "network" | "timeout" | "invalid-config"
  }
}
```
- `502 Bad Gateway` — Falha na conexão com provider
- `401 Unauthorized` — Credencial inválida (sem vazar detalhe)

### 7.4 GET /credentials/providers

Lista providers suportados com schema de campos.

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "provider": "openai",
      "type": "api_key",
      "label": "OpenAI",
      "fields": [
        { "name": "apiKey", "type": "string", "label": "API Key", "required": true, "masked": true }
      ],
      "testSupported": true,
      "oauthSupported": false
    },
    {
      "provider": "google",
      "type": "oauth2",
      "label": "Google OAuth2",
      "fields": [],
      "oauthUrl": "/auth/sso/google",
      "testSupported": true
    }
  ]
}
```

### 7.5 POST /credentials/:id/shared

Compartilha credencial entre projetos da mesma org.

**Request:**
```json
{
  "projectId": "cm4x...",
  "role": "read"  // "read" | "use" (decrypt for exec)
}
```

**Responses:**
- `201 Created` — `{ "data": { ...credential, shares: [...] } }`
- `403 Forbidden` — `credential:share` requer owner/admin
- `404 Not Found`

### 7.6 POST /credentials/rotate-key

Rotação de chave mestra (admin/owner). Job assíncrono.

**Request:** `{}`

**Responses:**
- `202 Accepted` — `{ "data": { "jobId": "cm4x...", "status": "started", "estimatedDuration": 300 } }`
- `403 Forbidden`

### 7.7 GET /credentials/:id/audit-logs

Lista logs de auditoria da credencial (owner/admin).

## 8. Endpoints de Templates

Prefixo: `/api/v1/templates`

### 8.1 GET /templates

Lista templates públicos/privados da org.

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `category` | string | `marketing`, `sales`, `engineering`, `ai`, `all` |
| `search` | string | Busca por nome/descrição |
| `featured` | bool | Apenas destacados |
| `scope` | string | `public` (default) ou `org` (privados da org) |

**Responses:** `200 OK`
```json
{
  "data": [
    {
      "id": "cm4x...",
      "name": "Webhook to Slack + Google Sheets",
      "description": "Receives webhook, posts to Slack, logs to Sheets",
      "category": "marketing",
      "featured": true,
      "usageCount": 1247,
      "rating": 4.8,
      "reviewCount": 23,
      "nodeCount": 3,
      "tags": ["webhook", "slack", "sheets"],
      "previewImage": "https://...",
      "isOrgTemplate": false
    }
  ],
  "meta": { "total": 156 }
}
```

### 8.2 GET /templates/:id

Obtém template completo.

**Responses:** `200 OK`
```json
{
  "data": {
    "id": "cm4x...",
    "name": "Webhook to Slack + Google Sheets",
    "description": "...",
    "category": "marketing",
    "workflowJson": { ... },  // JSON do workflow
    "credentialRequirements": [
      { "provider": "slack", "type": "api_key", "required": true },
      { "provider": "googleSheets", "type": "oauth2", "required": true }
    ],
    "rating": 4.8,
    "reviewCount": 23,
    "usageCount": 1247
  }
}
```

### 8.3 POST /templates

Publica template (owner/admin da org ou contribuidor).

**Request:**
```json
{
  "name": "My Custom Template",
  "description": "...",
  "category": "engineering",
  "workflowJson": { ... },
  "credentialRequirements": [...],
  "tags": ["custom"],
  "isPublic": false  // false = privado da org
}
```

### 8.4 POST /templates/:id/use

Instancia template → cria workflow.

**Request:**
```json
{
  "name": "My New Workflow From Template",
  "credentialMapping": { "slack_api_key": "cred_id_123" },
  "folderId": null,
  "activate": false
}
```

**Responses:**
- `201 Created` — `{ "data": { ...workflow }, "warnings": [] }`
- `422 Unprocessable Entity` — Credenciais requeridas não mapeadas

### 8.5 POST /templates/:id/ratings

Avalia template (stars 1-5).

**Request:** `{ "rating": 5, "review": "Works perfectly!" }`

## 9. Outros Endpoints

### 9.1 Node Types

Prefixo: `/api/v1/nodes`

#### GET /nodes/types
Lista tipos de nó disponíveis (categorizados).

**Responses:**
```json
{
  "data": [
    {
      "key": "webhook",
      "displayName": "Webhook",
      "category": "trigger",
      "description": "Receives HTTP webhooks",
      "icon": "Webhook",
      "color": "#6366f1",
      "version": 1,
      "isTrigger": true,
      "supportsAsync": true,
      "parametersSchema": { ... },  // JSON Schema
      "outputsSchema": { ... }
    }
  ]
}
```

#### GET /nodes/types/:key
Schema completo de um tipo de nó.

### 9.2 Schedules

Prefixo: `/api/v1/workflows/:id/schedule`

#### GET /workflows/:id/schedule
Obtém agendamento do workflow.

**Responses:** `200 OK`
```json
{
  "data": {
    "id": "cm4x...",
    "workflowId": "cm4x...",
    "cronExpression": "0 9 * * 1-5",
    "timezone": "America/Sao_Paulo",
    "enabled": true,
    "nextRunAt": "2026-08-21T13:00:00.000Z",
    "lastRunAt": "2026-08-20T13:00:00.000Z",
    "createdAt": "2026-08-20T14:30:00.000Z",
    "updatedAt": "2026-08-20T14:30:00.000Z"
  }
}
```

#### PUT /workflows/:id/schedule
Cria/atualiza agendamento.

**Request:**
```json
{
  "cronExpression": "0 9 * * 1-5",
  "timezone": "America/Sao_Paulo"
}
```

#### DELETE /workflows/:id/schedule
Remove agendamento.

#### POST /workflows/:id/schedule/enable
Ativa agendamento.

#### POST /workflows/:id/schedule/disable
Desativa agendamento.

### 9.3 Webhooks (Management)

Prefixo: `/api/v1/webhooks`

#### GET /webhooks
Lista webhooks da org.

**Responses:**
```json
{
  "data": [
    {
      "id": "cm4x...",
      "path": "stripe",
      "method": "POST",
      "active": true,
      "workflowId": "cm4x...",
      "workflowName": "Process Stripe Events",
      "triggerPath": "acme-corp/stripe",
      "createdAt": "2026-08-20T14:30:00.000Z"
    }
  ]
}
```

#### POST /webhooks
Cria webhook.

**Request:**
```json
{
  "path": "stripe",
  "method": "POST",
  "workflowId": "cm4x...",
  "secret": "meu-segredo-super-seguro-123"  // opcional, gerado se omitido
}
```

**Responses:**
- `201 Created` — Inclui `secret` UMA VEZ (nunca retornado novamente)
```json
{
  "data": {
    "id": "cm4x...",
    "path": "stripe",
    "method": "POST",
    "workflowId": "cm4x...",
    "triggerPath": "acme-corp/stripe",
    "secret": "meu-segredo-super-seguro-123",
    "createdAt": "2026-08-20T14:30:00.000Z"
  }
}
```

#### GET /webhooks/:id
Obtém webhook (sem secret).

#### PATCH /webhooks/:id
Atualiza (active, method, workflowId).

#### POST /webhooks/:id/test
Envia payload de teste.

**Request:** `{ "payload": { "test": "data" } }`

#### DELETE /webhooks/:id
Remove webhook.

#### Webhook Público (trigger)

**Endpoint público:** `POST /api/webhooks/trigger/:orgSlug/:path`

- **Auth:** Nenhuma (público por natureza)
- **Verificação:** HMAC-SHA256 via header `X-Webhook-Signature: sha256=<hmac>`
- **Rate limit:** 60 req/min por IP (whitelist de IPs para planos enterprise)
- **Quota:** Conta para quota mensal de execuções
- **Resposta:** `202 Accepted` — `{ "executionId": "cm4x..." }` immediatamente (async)

### 9.4 Approvals

Prefixo: `/api/v1/approvals`

#### GET /approvals
Lista aprovações pendentes do usuário.

**Responses:**
```json
{
  "data": [
    {
      "id": "cm4x...",
      "executionId": "cm4x...",
      "workflowId": "cm4x...",
      "workflowName": "Approval Required Workflow",
      "status": "PENDING",
      "message": "Review this critical change before proceeding",
      "context": { "nodeId": "approval-node-1", "input": { ... } },
      "createdAt": "2026-08-20T14:30:00.000Z"
    }
  ]
}
```

#### GET /approvals/:id
Detalhes da aprovação.

#### POST /approvals/:id/approve
Aprova (retoma execução).

**Request:** `{ "message": "Approved by John" }` (opcional)

**Responses:**
- `200 OK` — `{ "data": { ...approval, status: "APPROVED" } }`
- `409 Conflict` — Execução já finalizada

#### POST /approvals/:id/reject
Rejeita (finaliza execução como FAILED).

**Request:** `{ "message": "Reason for rejection" }`

### 9.5 AI Providers & Costs

Prefixo: `/api/v1/ai`

#### GET /ai/providers
Lista provedores de IA conectados (credenciais).

**Responses:**
```json
{
  "data": [
    { "id": "cm4x...", "name": "OpenAI", "type": "openai", "model": "gpt-4o-mini", "isDefault": true },
    { "id": "cm4x...", "name": "NVIDIA NIM", "type": "nvidia", "model": "nvidia/nemotron-4-340b-reward", "isDefault": false }
  ]
}
```

#### GET /ai/costs
Obtém custos de IA por período.

**Query params:** `from`, `to`, `granularity` (day/week/month)

### 9.6 Usage & Quota

Prefixo: `/api/v1/usage`

#### GET /usage
Retorna uso atual da org (quota).

**Responses:** `200 OK`
```json
{
  "data": {
    "plan": "PRO",
    "period": { "start": "2026-08-20", "end": "2026-09-19" },
    "limits": {
      "executionsPerMonth": 10000,
      "workflows": 100,
      "users": 20,
      "storageMB": 1000,
      "credentials": 50
    },
    "usage": {
      "executionsThisMonth": 1250,
      "workflows": 24,
      "users": 5,
      "storageMB": 142,
      "credentials": 8
    },
    "resetAt": "2026-09-20T00:00:00.000Z"
  }
}
```

#### GET /usage/quota
Verifica se há capacidade para uma ação.

**Query params:** `action` (execution, workflow_create, credential_create)

**Responses:** `200 OK`
```json
{
  "data": {
    "allowed": true,
    "limit": 10000,
    "used": 1250,
    "remaining": 8750
  }
}
```

### 9.7 Health

Prefixo: `/api/v1`

#### GET /health
Health check público (sem auth).

**Responses:** `200 OK`
```json
{
  "data": {
    "status": "healthy",
    "version": "2.0.0",
    "timestamp": "2026-08-20T14:30:00.000Z",
    "uptime": 86400,
    "services": {
      "database": { "status": "up", "latencyMs": 2 },
      "redis": { "status": "up", "latencyMs": 1 },
      "queue": { "status": "up", "workers": 3 }
    }
  }
}
```

#### GET /health/live
Liveness probe (Kubernetes).

#### GET /health/ready
Readiness probe (Kubernetes).

### 9.8 Metrics

Prefixo: `/api/v1/metrics`

#### GET /metrics
Métricas Prometheus (endpoint interno, auth por service account).

Formato: Prometheus exposition (`text/plain`).

Métricas incluem: `http_requests_total`, `execution_duration_seconds`, `workflow_active_count`, `credential_decrypt_total`, `rate_limit_hits_total`.

### 9.9 Notifications

Prefixo: `/api/v1/notifications`

#### GET /notifications
Lista notificações do usuário.

**Query params:** `read` (bool), `limit`, `cursor`

#### POST /notifications/acknowledge
Marca como lidas.

**Request:** `{ "ids": ["cm4x...", "cm4x..."] }` ou `{ "all": true }`

## 10. Paginação e Filtros

### 10.1 Estratégias

| Estratégia | Query param | Uso |
|------------|-------------|-----|
| **Cursor** (recomendado) | `cursor`, `limit` | Consistente com inserts/deletes; sem duplicatas |
| **Offset** (legacy) | `offset`, `limit` | Compatibilidade com n8n API v1 |

### 10.2 Cursor Pagination

- `cursor` é um base64url-encoded JSON contendo `id` + `sort` (ex: `{"id":"cm4x...","sort":"-updatedAt"}`)
- `nextCursor` presente quando `hasNext === true`
- `prevCursor` presente quando `hasPrev === true`
- `limit` default 20, max 100

### 10.3 Filtros Padrão

Todos endpoints de listagem suportam:

| Param | Tipo | Descrição |
|-------|------|-----------|
| `limit` | int | Itens por página (1-100) |
| `cursor` | string | Cursor opaco |
| `sort` | string | Campo de ordenação (`-` desc); múltiplos separados por `,` |
| `search` | string | Full-text search |
| `createdAfter` | ISO date | Filtra por data mínima |
| `createdBefore` | ISO date | Filtra por data máxima |
| `updatedAfter` | ISO date | Filtra por atualização mínima |

### 10.4 Ordenação Padrão

| Recurso | Default sort |
|---------|-------------|
| workflows | `-updatedAt` |
| executions | `-startedAt` |
| credentials | `-createdAt` |
| templates | `usageCount` (desc) |
| audit logs | `-createdAt` |

## 11. Formato de Erros

### 11.1 Estrutura de Erro Padrão

```json
{
  "error": {
    "code": "WORKFLOW_NOT_FOUND",
    "message": "Workflow not found or access denied",
    "details": {
      "workflowId": "cm4x..."
    },
    "requestId": "req_abc123def456",
    "timestamp": "2026-08-20T14:30:00.000Z"
  }
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `code` | string | Código de erro padronizado (sempre presente) |
| `message` | string | Mensagem legível (sem vazar dados sensíveis) |
| `details` | object | Contexto adicional (chave/valor) |
| `requestId` | string | Correlation ID para suporte (header `x-request-id`) |
| `timestamp` | string | ISO 8601 UTC |

### 11.2 Códigos HTTP por Tipo

| HTTP | Quando | Error codes típicos |
|------|--------|---------------------|
| `400` | Bad request — validação de input | `INVALID_INPUT`, `VALIDATION_ERROR`, `NO_ORG` |
| `401` | Não autenticado | `AUTH_FAILED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `MISSING_SIGNATURE` |
| `403` | Proibido (RBAC/RBAC/tenant) | `FORBIDDEN`, `ORG_REQUIRED`, `INSUFFICIENT_PERMISSIONS`, `PLAN_LIMIT_REACHED`, `MFA_REQUIRED` |
| `404` | Recurso não encontrado | `NOT_FOUND`, `WORKFLOW_NOT_FOUND`, `EXECUTION_NOT_FOUND`, `CREDENTIAL_NOT_FOUND` |
| `409` | Conflito de estado | `CONFLICT`, `PATH_EXISTS`, `WORKFLOW_REVIEW_REQUIRED`, `DUPLICATE_NAME`, `CONCURRENT_MODIFICATION` |
| `422` | Validação falhou | `VALIDATION_ERROR`, `INVALID_WORKFLOW`, `MISSING_CREDENTIAL_MAPPING`, `INVALID_SIGNATURE` |
| `429` | Rate limit | `RATE_LIMIT_EXCEEDED` (+ `Retry-After`) |
| `500` | Erro interno | `INTERNAL_ERROR`, `QUEUE_UNAVAILABLE` |
| `502` | Provider external failed | `PROVIDER_ERROR`, `BAD_GATEWAY` |
| `503` | Serviço indisponível | `SERVICE_UNAVAILABLE`, `QUEUE_UNAVAILABLE` |

### 11.3 Headers de Rate Limit (em todas as respostas)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 842
X-RateLimit-Reset: 1692521400  (Unix timestamp)
```

### 11.4 i18n

- Header `Accept-Language` controla idioma das mensagens (`pt-BR`, `en`, `es`).
- `code` permanece constante (não traduzido).
- Mensagens `message` e `details` são traduzíveis.

### 11.5 Correlation ID

- Header `x-request-id` (gerado se ausente)
- Propagado através de todos os serviços (API → Queue → Worker)
- Incluído em logs e respostas de erro
- Usuário deve incluir em qualquer ticket de suporte

## 12. Rate Limiting

### 12.1 Estratégia Geral

Rate limiting implementado via Redis (sliding window). As chaves são compostas por escopo: `ratelimit:{orgId}:{userId}:{endpoint}:{ip}`.

### 12.2 Limites por Tipo

| Categoria | Limite | Janela | Escopo |
|-----------|--------|--------|--------|
| **Login** | 5 req | 15 min | email + IP |
| **Login falho (lockout)** | 5 falhas | 1 min | email |
| | 10 falhas | 15 min | email |
| | 20 falhas | 1h | email (bloqueio até reset) |
| **MFA verify** | 10 req | 15 min | userId |
| **Refresh token** | 10 req | 15 min | userId |
| **API Keys (list, create)** | 30 req | 1 min | userId |
| **Workflows (CRUD)** | 60 req | 1 min | orgId |
| **Workflow execute** | 30 req | 1 min | orgId |
| **Executions (list)** | 120 req | 1 min | orgId |
| **Credentials (CRUD)** | 30 req | 1 min | orgId |
| **Credential decrypt** | 200 req | 1 min | orgId (mais permissivo — uso em execução) |
| **Credential rotate** | 1 req | 1h | orgId (extremamente restrito) |
| **Templates (list)** | 30 req | 1 min | IP (anon) ou orgId |
| **Public webhook trigger** | 60 req | 1 min | IP (whitelist para enterprise) |
| **General API** | 1000 req | 1 min | userId |

### 12.3 Tabela de Rate Limits por Plano

| Plano | Workflow exec (min) | Workflows | Credentials | Execuções (list) | Webhooks | Webhook trigger (min) | API Keys |
|-------|--------------------|-----------|-------------|-------------------|----------|----------------------|----------|
| **FREE** | 10 | 10 | 5 | 60 | 5 | 10 | 2 |
| **STARTER** | 30 | 50 | 20 | 120 | 20 | 60 | 5 |
| **BASIC** | 60 | 100 | 50 | 300 | 100 | 120 | 10 |
| **GROWTH** | 120 | 250 | 100 | 600 | 250 | 300 | 25 |
| **PRO** | 300 | 500 | 200 | 1200 | 500 | 600 | 50 |
| **ENTERPRISE** | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

> Planos herdar limites base. Limites podem ser sobrescritos por IP allowlist em planos Enterprise.

### 12.4 Headers de Resposta

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 27
X-RateLimit-Reset: 1692521400
Retry-After: 45  (presente apenas em 429)
```

### 12.5 Whitelist para Webhooks

- Planos **Enterprise** podem configurar IP allowlist para endpoints de webhook trigger.
- Planos Free/Standard: limite por IP + org, sem allowlist.

## 13. Realtime (SSE/WebSocket)

### 13.1 Server-Sent Events (SSE) — `/api/v1/events`

Endpoint principal de realtime via SSE. Conexão longa com reconexão automática.

**Autenticação:** Query param `token=<access_jwt>` (SSE não suporta headers customizados confiavelmente).

**Conexões:**
```
GET /api/v1/events?token=<jwt>&events=execution,notification,approval,workflow
```

**Query params:**
| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `token` | string | Sim | Access JWT |
| `events` | string | Não | Lista de eventos desejados (comma-separated) |
| `lastEventId` | string | Não | Reconexão incremental |

**Eventos suportados:**
| Evento | Payload | Condição |
|--------|---------|----------|
| `execution.started` | `{ executionId, workflowId, trigger }` | Execução iniciada |
| `execution.progress` | `{ executionId, nodeId, status, progress }` | Update de progresso de nó |
| `execution.log` | `{ executionId, nodeId, level, message, timestamp }` | Log de nó |
| `execution.completed` | `{ executionId, status, duration }` | Execução finalizada |
| `execution.failed` | `{ executionId, error, nodeId? }` | Execução falhou |
| `workflow.updated` | `{ workflowId, changes }` | Workflow modificado |
| `workflow.status` | `{ workflowId, status }` | Status mudou (publish/unpublish) |
| `approval.created` | `{ approvalId, executionId, workflowId, message }` | Nova aprovação pendente |
| `approval.resolved` | `{ approvalId, executionId, decision, approverId }` | Aprovação resolvida |
| `credential.updated` | `{ credentialId }` | Credencial modificada |
| `notification` | `{ id, type, title, message, read }` | Notificação do sistema |

**Formato SSE:**
```
event: execution.completed
id: evt_1692521400
data: {"executionId":"cm4x...","status":"SUCCESS","duration":5234}

event: execution.log
data: {"executionId":"cm4x...","nodeId":"n8n-node-2","level":"info","message":"Request sent","timestamp":"2026-08-20T14:30:01.000Z"}

: heartbeat (comentário SSE vazio a cada 30s)
```

**Reconexão:** O cliente usa `Last-Event-ID` para retomar do último evento. Eventos são mantidos por 5 minutos no Redis Pub/Sub.

### 13.2 WebSocket (opcional)

**Endpoint:** `wss://api.agentflow.io/ws`

Suporta:
- Subscrição a canais: `{ "type": "subscribe", "channel": "execution:cm4x..." }`
- Subscrição a eventos por tipo: `{ "type": "subscribe", "events": ["execution", "notification"] }`
- Unsubscrição: `{ "type": "unsubscribe", "channel": "..." }`
- Heartbeat: ping a cada 30s
- Auth via query string: `wss://...?token=<jwt>`

### 13.3 SSE para Logs de Execução

Endpoint alternativo para streaming de logs de uma execução específica:

```
GET /api/v1/executions/:id/logs
Accept: text/event-stream
```

Eventos: `node.started`, `node.log`, `node.completed`, `node.failed`, `execution.completed`.

## 14. Segurança

### 14.1 CORS

- **Produção:** Apenas domínios da org são allowlistados (`NEXT_PUBLIC_APP_URL`).
- Configurable via painel: `Settings → Security → CORS Origins`.
- Credenciais (cookies) requerem `credentials: include` no frontend e `Access-Control-Allow-Origin` específico (nunca `*`).

### 14.2 CSRF

Protege endpoints que usam cookie auth:
- **Double-submit cookie:** `af_csrf_token` (random 32-byte) + header `X-CSRF-Token`.
- Aplicado em todos os `POST`, `PUT`, `PATCH`, `DELETE` quando auth é via cookie.
- **NÃO aplicado** quando auth é via Bearer token ou API key (imune a CSRF por natureza).

### 14.3 Validação de Input

- **Zod** schemas em todos os endpoints (compartilhado via `@agentflow/shared`).
- Validação estrita: `unknown` rejeitado, campos extras rejeitados via `.strict()`.
- Sanitização: HTML escaping em campos de texto livre (workflow name, description).
- Limite de profundidade JSON: 10 níveis.
- Limite de tamanho de string: 10KB para campos de texto, 1MB para JSON complexo.

### 14.4 Idempotency Keys

- Header: `Idempotency-Key: <UUID v4>`
- Armazenado por 24h no Redis (`idempotency:{orgId}:{key}` → full response).
- Aplicado em: login, workflow create, execution retry, credential create.
- Replays retornam mesma resposta + header `X-Idempotent-Replay: true`.

### 14.5 Signed URLs para Download

Arquivos binários (logs, exports) são servidos via signed URLs:

```
GET /api/v1/files/{fileId}?token=<signed_jwt>
```

- JWT com `fileId`, `expiresAt`, assinado com `FILE_SIGNING_KEY`.
- TTL: 15 minutos.
- IP binding opcional (Enterprise).

### 14.6 Auditoria de Mutações

Toda operação sensível gera `AuditLog`:
- `auth.login`, `auth.logout`, `auth.mfa_enable`, `auth.password_change`
- `workflow.create`, `workflow.update`, `workflow.publish`, `workflow.delete`, `workflow.execute`
- `credential.create`, `credential.read`, `credential.update`, `credential.delete`, `credential.decrypt`, `credential.rotate`
- `org.member_invite`, `org.member_role_change`, `org.member_remove`
- `execution.retry`, `execution.cancel`
- `webhook.create`, `webhook.update`, `webhook.delete`
- `template.use`, `template.rate`

**Formato do log:**
```typescript
interface AuditLogEntry {
  action: string;        // "workflow.create"
  resource: string;      // "workflow"
  resourceId?: string;   // ID do recurso
  metadata?: Record<string, unknown>;  // Contexto
  ip?: string;
  userAgent?: string;
  userId: string;
  orgId: string;
  requestId: string;
  createdAt: Date;
}
```

- Imutável (append-only)
- Retenção mínima: 1 ano (LGPD)
- Exportável para SIEM

### 14.7 SSRF Protection

Aplicável ao HTTP Request node e OAuth broker:
1. **Resolve DNS duas vezes** (pré-conexão + pós-conexão) — anti-DNS-rebinding.
2. **Guard de IPs privados:** bloqueia `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `169.254.x`, `::1`, `fc00::/7`.
3. **Egress proxy obrigatório:** proxy HTTP dedicado com allowlist de domínios por tenant/plano.
4. **TLS 1.2+** obrigatório para provider HTTPS.
5. **Timeout de conexão:** 10s, max response size: 10MB.

### 14.8 Protegendo Credenciais

- **Envelope encryption:** AES-256-GCM + DEK por tenant + KEK (env var ou KMS).
- **Mascaramento:** API nunca retorna `data` descriptografado. Apenas `hasValue: true`.
- **Decrypt exclusivo:** Apenas via método interno `decryptForExecution()` (worker) ou `credential:decrypt` (owner/admin auditado).
- **Roterade chave:** Job BullMQ `credential:rotate` re-encripta por tenant. Dual-write: versão antiga válida até migração completa.
- **Sanitizer de logs:** Regex global remove valores de credenciais de logs (headers `Authorization`, `X-API-Key`, etc.).

### 14.9 Sandbox de Code Node

- **isolate-vm** (process isolation) — substitui vm2 deprecado.
- **Limites:** memória 128MB, CPU 5s, timeout 30s.
- **Zero acesso a:** `require`, `process`, `fs`, `net`, `child_process`.
- **Rede:** bloqueada — saídas interceptadas pelo proxy egress.

### 14.10 Headers de Segurança

| Header | Valor |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'` |
| `X-XSS-Protection` | `0` (CSP é a proteção primária) |

## 15. SDK e CLI

### 15.1 SDK TypeScript

Auto-gerado do OpenAPI spec (`/api/v1/openapi.json`).

```typescript
import { AgentFlowClient } from "@agentflow/sdk";

const client = new AgentFlowClient({
  baseURL: "https://api.agentflow.io",
  apiKey: "af_...",  // ou token JWT
});

// Workflows
const workflows = await client.workflows.list({ status: "ACTIVE" });
const workflow = await client.workflows.get("cm4x...");
await client.workflows.execute("cm4x...", { input: { email: "user@x.com" } });

// Executions
const exec = await client.executions.get<Execution>("cm4x...");

// SSE
client.events.subscribe(["execution", "notification"], (event) => {
  console.log(event.type, event.data);
});
```

### 15.2 CLI

```bash
# Instalação
npm install -g @agentflow/cli

# Autenticação
agentflow login  # abre browser → callback → salva tokens

# Workflows
agentflow wf list
agentflow wf get <id>
agentflow wf create --name "My WF" --file workflow.json
agentflow wf execute <id> --data '{"email":"test@x.com"}'
agentflow wf export <id> --format n8n > wf.json
agentflow wf import --file wf.json

# Executions
agentflow exec list --workflow <id>
agentflow exec logs <execId>  # stream SSE

# Credenciais
agentflow cred list
agentflow cred test <id>

# Orgs
agentflow org list
agentflow org switch <slug>

# Templates
agentflow template list
agentflow template use <id> --name "My Copy"
```

### 15.3 Compatibilidade n8n → AgentFlow

A API é retrocompatível com n8n API v1 para:
- Listar/Get/Criar/Update/Delete workflows
- Listar/Get workflows
- Listar/Get execuções
- Listar credenciais (mascaradas)

Diferenças:
- n8n usa `X-N8N-API-KEY` → AgentFlow usa `X-AgentFlow-API-Key`
- n8n retorna `{ data, nextCursor }` → AgentFlow retorna `{ data, meta, links }` (envelope expandido)
- n8n: `active` boolean → AgentFlow: `status` enum (DRAFT/ACTIVE/PAUSED/ARCHIVED)

## 16. OpenAPI

### 16.1 Especificação

A spec completa está disponível em:
- **JSON:** `GET /api/v1/openapi.json`
- **YAML:** `GET /api/v1/openapi.yaml`
- **Swagger UI:** `GET /api/v1/docs`

### 16.2 Security Schemes

```yaml
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: "JWT access token (15 min). Obtain via POST /auth/login"
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-AgentFlow-API-Key
      description: "API key with prefix af_. Obtain via POST /auth/api-keys"
    CookieAuth:
      type: apiKey
      in: cookie
      name: af_access
      description: "Access token as httpOnly cookie"
    CsrfToken:
      type: apiKey
      in: header
      name: X-CSRF-Token
      description: "CSRF token (required for cookie auth on mutations)"
```

### 16.3 Exemplo OpenAPI — Endpoint 1: Login

```yaml
openapi: 3.0.3
info:
  title: AgentFlow API v1
  version: 1.0.0
  description: REST API for AgentFlow workflow automation platform
servers:
  - url: https://api.agentflow.io
    description: Production
  - url: http://localhost:3001
    description: Local development

paths:
  /api/v1/auth/login:
    post:
      tags:
        - Auth
      summary: Login with email and password
      description: Returns access JWT + refresh token. If MFA is enabled, returns a pending token requiring MFA verification.
      operationId: login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
            example:
              email: user@example.com
              password: supersecret123
      responses:
        '200':
          description: Login successful (no MFA required)
          headers:
            X-RateLimit-Limit:
              $ref: '#/components/headers/RateLimitLimit'
            X-RateLimit-Remaining:
              $ref: '#/components/headers/RateLimitRemaining'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginResponse'
              example:
                data:
                  accessToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                  refreshToken: a1b2c3d4e5f6789012345678901234567890abcdef
                  expiresIn: 900
                  tokenType: Bearer
                  user:
                    id: cm4x9y2za0001a2b3c4d5e6f
                    email: user@example.com
                    name: John Doe
                    mfaEnabled: false
        '202':
          description: Login successful, MFA required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MfaRequiredResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimit'
      security: []

components:
  schemas:
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          format: password
          minLength: 1
    LoginResponse:
      type: object
      properties:
        data:
          type: object
          properties:
            accessToken:
              type: string
            refreshToken:
              type: string
            expiresIn:
              type: integer
            tokenType:
              type: string
              enum: [Bearer]
            user:
              $ref: '#/components/schemas/User'
    MfaRequiredResponse:
      type: object
      properties:
        data:
          type: object
          properties:
            accessToken:
              type: string
              description: JWT with mfa:false and reduced scope
            refreshToken:
              type: string
            expiresIn:
              type: integer
            mfaRequired:
              type: boolean
              example: true
            mfaType:
              type: array
              items:
                type: string
                enum: [totp, email, backup]
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
          format: email
        name:
          type: string
        mfaEnabled:
          type: boolean
```

### 16.4 Exemplo OpenAPI — Endpoint 2: Create Workflow

```yaml
  /api/v1/workflows:
    post:
      tags:
        - Workflows
      summary: Create a new workflow
      description: Creates a new workflow in DRAFT status. Supports idempotency key.
      operationId: createWorkflow
      security:
        - BearerAuth: []
        - ApiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateWorkflowRequest'
            example:
              name: Sync CRM contacts
              description: Syncs contacts from CRM to Google Sheets daily
              tags: [crm, daily]
              nodes:
                - type: webhook
                  label: Incoming Webhook
                  config:
                    httpMethod: POST
                    path: my-webhook
                  position: { x: 250, y: 300 }
              edges: []
              settings:
                executionOrder: v1
                executionTimeout: 3600
                timezone: UTC
      responses:
        '201':
          description: Workflow created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WorkflowResponse'
        '403':
          description: Plan limit reached
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: PLAN_LIMIT_REACHED
                  message: "Your plan allows 100 workflows"
        '409':
          description: Webhook path conflict
        '422':
          description: Validation error
      headers:
        Idempotency-Key:
          description: Retry with same key returns this response
          schema:
            type: string
        X-Idempotent-Replay:
          description: Present and true if this was a replayed request
          schema:
            type: boolean

  components:
    schemas:
      CreateWorkflowRequest:
        type: object
        required: [name]
        properties:
          name:
            type: string
            minLength: 1
            maxLength: 200
          description:
            type: string
            maxLength: 2000
          tags:
            type: array
            items:
              type: string
          nodes:
            type: array
            items:
              $ref: '#/components/schemas/WorkflowNode'
          edges:
            type: array
            items:
              $ref: '#/components/schemas/WorkflowEdge'
          settings:
            $ref: '#/components/schemas/WorkflowSettings'
      WorkflowNode:
        type: object
        properties:
          id:
            type: string
          type:
            type: string
            enum: [webhook, cron, http, email, condition, transform, code, merge, delay, ai_agent, approval]
          label:
            type: string
          config:
            type: object
          position:
            type: object
            properties:
              x: { type: number }
              y: { type: number }
          disabled:
            type: boolean
          retryOnFail:
            type: boolean
          maxTries:
            type: integer
          continueOnFail:
            type: boolean
      WorkflowEdge:
        type: object
        required: [sourceNodeId, targetNodeId]
        properties:
          sourceNodeId:
            type: string
          targetNodeId:
            type: string
          sourceHandle:
            type: string
          targetHandle:
            type: string
```

### 16.5 Exemplo OpenAPI — Endpoint 3: Get Execution

```yaml
  /api/v1/executions/{executionId}:
    get:
      tags:
        - Executions
      summary: Get execution details
      description: Returns detailed execution including node-level results. Use ?include=nodes for node data.
      operationId: getExecution
      security:
        - BearerAuth: []
        - ApiKeyAuth: []
      parameters:
        - name: executionId
          in: path
          required: true
          schema:
            type: string
        - name: include
          in: query
          schema:
            type: array
            items:
              type: string
              enum: [nodes, approvals]
            style: form
            explode: false
        - name: redactData
          in: query
          schema:
            type: boolean
            default: true
      responses:
        '200':
          description: Execution details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExecutionResponse'
        '404':
          $ref: '#/components/responses/NotFound'
```

## 17. Compatibilidade e Migrção (n8n → AgentFlow)

### 17.1 Mapeamento de Endpoints n8n v1 → AgentFlow v1

| n8n v1 | AgentFlow v1 | Observação |
|--------|-------------|------------|
| `GET /api/v1/workflows` | `GET /api/v1/workflows` | + cursor pagination (n8n usa offset) |
| `POST /api/v1/workflows` | `POST /api/v1/workflows` | + idempotency key |
| `PUT /api/v1/workflows/{id}` | `PUT /api/v1/workflows/{id}` | Cria versão automática |
| `POST /api/v1/workflows/{id}/publish` | `POST /api/v1/workflows/{id}/publish` | n8n: `/activate` |
| `POST /api/v1/workflows/{id}/unpublish` | `POST /api/v1/workflows/{id}/unpublish` | n8n: `/deactivate` |
| `POST /api/v1/workflows/{id}/run` | `POST /api/v1/workflows/{id}/execute` | n8n: `/run` |
| `DELETE /api/v1/workflows/{id}` | `DELETE /api/v1/workflows/{id}` | AgentFlow: ARCHIVED (soft delete) |
| `GET /api/v1/executions` | `GET /api/v1/executions` | + status filter, org scoping |
| `GET /api/v1/executions/{id}` | `GET /api/v1/executions/{id}` | + include param |
| `DELETE /api/v1/executions/{id}` | `DELETE /api/v1/executions` | Mass delete (body filter) |
| `GET /api/v1/credentials` | `GET /api/v1/credentials` | Mascado (hasValue only) |
| `POST /api/v1/credentials` | `POST /api/v1/credentials` | Criptografado server-side |
| `POST /webhook/{path}` | `POST /api/webhooks/trigger/{orgSlug}/{path}` | + HMAC signature |
| — | `POST /api/v1/auth/login` | Novo |
| — | `POST /api/v1/auth/refresh` | Novo |
| — | `POST /api/v1/auth/logout` | Novo |
| — | `POST /api/v1/auth/mfa/verify` | Novo |
| — | `GET /api/v1/orgs` | Novo (multi-tenant) |
| — | `GET /api/v1/usage` | Novo (quota) |
| — | `GET /api/v1/events` | Novo (SSE realtime) |

### 17.2 Diferenças de Contrato

| Aspecto | n8n v1 | AgentFlow v2 |
|--------|--------|-------------|
| Auth header | `X-N8N-API-KEY` | `X-AgentFlow-API-Key` (prefixo `af_`) |
| Token format | Bearer JWT | Bearer JWT (15min) + Refresh (30d) |
| Org scoping | Não (single tenant) | Sim (multi-tenant, orgId no token) |
| Pagination | `{ data, nextCursor }` | `{ data, meta, links }` |
| Workflow status | `active: boolean` | `status: enum` |
| Credential data | Descriptografado (owner) | Mascado (`hasValue`) em todas as respostas |
| Webhook | Sem signature obrigatória | HMAC-SHA256 obrigatório |
| Executions | Numeric IDs | string cuid() |
| Versionamento | versionId string | versionId + version number |

### 17.3 Headers de Migração

Clientes n8n existentes podem usar header alternativo para compatibilidade:
```
X-N8N-API-Key: <key>  →  aceito como alias de X-AgentFlow-API-Key
```

---

## Anexos

### A. Schemas de Dados (TypeScript/Zod resumidos)

```typescript
// Organization
interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: "FREE" | "STARTER" | "BASIC" | "GROWTH" | "PRO" | "ENTERPRISE";
  billingEmail?: string;
  policies: { requireMfa?: boolean; passwordMinLength?: number; sessionTtl?: number };
  createdAt: Date;
  updatedAt: Date;
}

// Workflow
interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  version: number;
  versionId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  tags: string[];
  folderId?: string;
  projectId?: string;
  ownerId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Node
interface WorkflowNode {
  id: string;
  type: string;
  label?: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  disabled?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  continueOnFail?: boolean;
}

// Execution
interface WorkflowExecution {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "WAITING_APPROVAL";
  trigger: "webhook" | "manual" | "cron" | "api";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  duration?: number;
  workflowId: string;
  orgId: string;
  userId?: string;
  nodes: NodeExecution[];
  approvals: Approval[];
}
```

### B. Enum Completo de Error Codes

```
AUTH_FAILED, TOKEN_EXPIRED, TOKEN_REVOKED, MFA_REQUIRED, MFA_INVALID, INVALID_CREDENTIALS
NOT_FOUND, WORKFLOW_NOT_FOUND, EXECUTION_NOT_FOUND, CREDENTIAL_NOT_FOUND
FORBIDDEN, INSUFFICIENT_PERMISSIONS, ORG_REQUIRED, PLAN_LIMIT_REACHED, QUOTA_EXCEEDED
CONFLICT, PATH_EXISTS, WORKFLOW_REVIEW_REQUIRED, DUPLICATE_NAME, CONCURRENT_MODIFICATION
INVALID_INPUT, VALIDATION_ERROR, INVALID_WORKFLOW, INVALID_SIGNATURE
RATE_LIMIT_EXCEEDED, LOCKED, SERVICE_UNAVAILABLE, QUEUE_UNAVAILABLE, INTERNAL_ERROR
```

### C. Rate Limit Headers Resumidas

Todas as respostas incluem:
```
X-RateLimit-Limit: <int>      # limite da janela atual
X-RateLimit-Remaining: <int>  # restante na janela
X-RateLimit-Reset: <unix_ts>  # quando a janela reseta
Retry-After: <seconds>        # presente apenas em 429
```

### D. Eventos SSE Resumidos

`execution.started`, `execution.progress`, `execution.log`, `execution.completed`, `execution.failed`, `workflow.updated`, `workflow.status`, `approval.created`, `approval.resolved`, `credential.updated`, `notification`

### E. Versionamento da API

- `/api/v1` — versão atual (estável).
- Breaking changes exigem nova minor version (`/api/v2`).
- Deprecations comunicadas 90 dias antes via `Deprecation` header.
- `Accept: application/vnd.agentflow.v1+json` header opcional para explicitar versão.

---

*Documento produzido para a missão "Recriar n8n no AgentFlow — Especificação da API REST v2". Baseado em: `api-n8n.md`, `design-seguranca.md`, `v2-security-spec.md`, `design-recriacao.md`, `referencia-n8n.md`, `glossario.md`, schema Prisma e código existente em `apps/api/src/`.*
