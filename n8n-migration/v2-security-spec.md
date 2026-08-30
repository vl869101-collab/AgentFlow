# Especificação de Segurança — AgentFlow v2 (Plataforma de Automação de Workflows)

> **Missão**: Recriar n8n no AgentFlow
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-19
> **Status**: DESIGN — não implementar, não commitar
> **Responsável**: Pane ESPECIFICAÇÃO DE SEGURANÇA
> **Base**: `design-seguranca.md` (criptografia de credenciais, complementado e estendido aqui)
> **Escopo**: plataforma completa — auth, RBAC, credenciais, OAuth, sandbox, rede, API, tenancy, auditoria, webhooks, execução, OWASP Top 10

---

## 0. Resumo Executivo e Modelo de Confiança

### 0.1 Objetivo

Esta especificação define o modelo de segurança completo do AgentFlow, uma plataforma
multi-tenant de automação de workflows (tipo n8n) construída sobre:
`Fastify` (API, Node/ESM) · `Next.js 15` (web) · `Prisma + PostgreSQL` (dados) ·
`BullMQ + Redis` (fila/execução) · `zod` (validação, compartilhada em `@agentflow/shared`).

A referência de comportamento é o modelo de segurança do n8n. Onde o n8n é fraco
(comunidade), esta spec **endurece**:

| Área | n8n (comunidade) | AgentFlow v2 (esta spec) |
|------|------------------|--------------------------|
| Sandbox Code node | JS roda no processo principal (VM frágil/inexistente em versões antigas) | `isolate-vm` com limites de memória/CPU/tempo e zero rede |
| Credenciais | Chave única em env var, decript no processo, sem rotação nativa | Envelope encryption com DEK por tenant, KEK rotável, rotação programada |
| MFA | Não disponível na comunidade | TOTP + email OTP + backup codes (nativo) |
| RBAC | Apenas owner/member na comunidade | owner/admin/editor/viewer + permissões por recurso + deny-by-default |
| Sessões | JWT sem revogação prática | Access token curto + refresh token opaco em DB (revogável) |
| SSRF | Bloqueio de IPs privados adicionado tardiamente | Guard em todas as saídas + proxy egress obrigatório + anti-DNS-rebinding |
| Rate limiting | Ausente na comunidade | Por usuário/IP/chave em todas as rotas sensíveis |
| Auditoria | Enterprise-only | Log imutável com hash chain |
| Webhooks | Autenticação básica por header, sem assinatura | HMAC-SHA256 + nonce + timestamp + payload limit + IP allowlist |

### 0.2 Princípios de Segurança

| Princípio | Aplicação |
|-----------|-----------|
| **Deny-by-default** | Nenhum acesso concedido sem permissão explícita; nenhum egress de rede sem allowlist |
| **Least privilege** | Roles mínimas, escopos mínimos de OAuth, credenciais resolvidas apenas no executor |
| **Defense in depth** | Cada ameaça tem ≥2 controles independentes (ex.: RLS **e** scoping no service layer) |
| **Fail secure** | Erros genéricos ao usuário, detalhes no log auditado; nunca vazar segredo em mensagem |
| **Tenant isolation** | Toda query carrega `orgId`; dados de tenants distintos nunca compartilham worker/estado |
| **Audit first** | Toda ação sensível gera entrada imutável antes de completar |
| **Rotate & revoke** | Chaves, tokens e sessões têm ciclo de vida com rotação automática e revogação imediata |

### 0.3 Modelo de Confiança

- **Ator externo** (não autenticado): só alcança `/auth/*`, `/webhook/*` (públicos por
  natureza) e rotas de health. Nada mais.
- **Usuário autenticado**: autenticado mas **não confiável** — pode ser malicioso.
  Todo recurso acessado é verificado contra RBAC + escopo de tenant.
- **Tenant** (organização): unidades isoladas entre si. Credenciais, workflows,
  execuções e usuários de um tenant são invisíveis para outro (ver seção 10).
- **Executor (worker)**: executa código não confiável (Code node) em sandbox
  com zero acesso à rede; o próprio worker é tratado como potencialmente comprometido
  e não recebe chaves mestras.
- **Admin da plataforma** (self-hosted): confiável; auditado.

---

## 1. Diagrama de Ameaças e Superfícies de Ataque

### 1.1 Arquitetura com Superfícies de Ataque (ASCII)

```
                          SUPERFÍCIES DE ATAQUE (S1..S12)
  ┌────────────────────────┐        ┌────────────────────────────┐
  │        BROWSER         │        │       CLIENTE EXTERNO       │
  │  (editor AgentFlow)    │        │   (curl, script, bot, CI)   │
  └───────────┬────────────┘        └──────────────┬─────────────┘
              │ S1: XSS, CSRF,                    │ S3: força bruta,
              │     Clickjacking,                 │     enumeration,
              │     UI redressing                 │     scraping
              ▼                                   ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                   EDGE / REVERSE PROXY (S2)                   │
  │  TLS 1.3 · rate limit por IP · headers de segurança ·        │
  │  WAF opcional · CORS restrito                                │
  └──────────────────────────┬────────────────────────────────────┘
                             ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                   API (Fastify) — S4..S9                      │
  │  ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐  │
  │  │ Auth         │ │ RBAC/Org      │ │ Rate Limiter         │  │
  │  │ (JWT + MFA + │ │ (deny-default)│ │ (user/IP/key)        │  │
  │  │  SSO)        │ └──────┬────────┘ └─────────┬────────────┘  │
  │  └──────┬───────┘        │                    │               │
  │  ┌──────▼───────┐ ┌──────▼────────┐ ┌─────────▼────────────┐  │
  │  │ Credentials  │ │ Workflows/    │ │ OAuth Broker         │  │
  │  │ Vault        │ │ Executions    │ │ (S5: state, S6:      │  │
  │  │ (S4: vault)  │ │ (S7: IDOR)    │ │  auth code swap)     │  │
  │  └──────┬───────┘ └──────┬────────┘ └─────────┬────────────┘  │
  └─────────┼────────────────┼────────────────────┼───────────────┘
            │                │                    │
            ▼                ▼                    ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              SERVICES / EXECUTOR (workers BullMQ)             │
  │  ┌────────────────┐  ┌─────────────────────────────────────┐  │
  │  │ Code Node      │  │ HTTP Request / Integrações          │  │
  │  │ Sandbox        │  │ (S8: SSRF, S9: exfil via HTTP)      │  │
  │  │ (isolate-vm,   │  │  → egress proxy com allowlist       │  │
  │  │  no rede/fs)   │  │  → guard de IPs privados/metadata   │  │
  │  └────────────────┘  └──────────────────┬──────────────────┘  │
  └──────────────────────┬─────────────────┼──────────────────────┘
                         │                 │
             ┌───────────▼─────┐  ┌────────▼──────────┐
             │  Postgres       │  │  Redis (BullMQ)   │
             │  (S10: RLS,     │  │  (S11: credenciais│
             │   data at rest) │  │   nunca em jobs)  │
             └─────────────────┘  └───────────────────┘
  ┌───────────────────────────────────────────────────────────────┐
  │            PROVEDORES EXTERNOS (S12)                          │
  │  OIDC/SAML (Google, MS, GitHub, Okta) · APIs (OpenAI,        │
  │  HTTP) · Webhook callbacks                                    │
  └───────────────────────────────────────────────────────────────┘
```

### 1.2 Catálogo de Superfícies e Ameaças Primárias

| ID | Superfície | Ameaças primárias | Controles-chave (seção) |
|----|-----------|-------------------|------------------------|
| S1 | Browser / editor | XSS em conteúdo de nodes, CSRF em mutações, clickjacking, exfil de token via script | CSP, sanitização, SameSite, anti-clickjacking (§12, §7) |
| S2 | Edge/proxy | DDoS, TLS downgrade, CORS abuso | Rate limit por IP, TLS 1.3, CORS allowlist, headers (§7) |
| S3 | Login/registro | Força bruta, credential stuffing, user enumeration, phishing SSO | Lockout, Argon2id, MFA, mensagens genéricas, emails de alerta (§3) |
| S4 | Credential vault | Exfiltração de segredos, uso indevido de credencial de outro tenant, rotação incompleta | Envelope encryption, RLS, permissão `credential:decrypt`, auditoria (§5) |
| S5 | OAuth broker | State fixation, code injection, consent phishing, leak de access token em callback | PKCE, state nonce, validação de redirect_uri, storage isolado (§6) |
| S6 | Callbacks de integração | Manipulação de callback, reuso de authorization code | One-time code, jti, validação de issuer/audience (§6, §4) |
| S7 | Workflows/execuções | IDOR/BOLA, edição de workflow de outro tenant, execução forçada | RBAC + scoping por orgId em **toda** query, RLS (§4, §10) |
| S8 | HTTP Request / egress | SSRF (metadata 169.254.169.254, localhost, DNS rebinding), exfil | Proxy egress, guard IP, allowlist de domínio, anti-rebinding (§8) |
| S9 | Code node | Leitura de fs, rede, processo; exfil de variáveis de ambiente; DoS de CPU/mem | Sandbox isolate-vm, timeout, limites, sem network (§7 → sandbox §6) |
| S10 | Postgres | SQL injection, tenant leak via query errada, backups não criptografados | Prisma parametrizado, orgId em toda query, RLS, cripto em repouso (§7, §10) |
| S11 | Redis | Vazamento de credencial em job payload, execução de job forjado | Nunca persistir segredo em job; signature/tenant check no job (§11) |
| S12 | Provedores externos | Webhook spoofing, replay, SSRF reverso (callback para hosts internos) | HMAC, timestamp, nonce, allowlist de IP, validar callback (§12) |

### 1.3 Trilhas de Atacante (Attack Paths) Prioritárias

1. **A1 — Ransomware/Exfil de credenciais**: atacante autenticado (ou SSO comprometido)
   → tenta `GET /credentials/:id` de outro tenant → bloqueado por RBAC+org scoping.
2. **A2 — SSRF pivô**: workflow malicioso → HTTP Request para `http://169.254.169.254/`
   → bloqueado pelo guard de rede no proxy egress.
3. **A3 — Code node malicioso**: executa `require('fs').readFileSync('/etc/passwd')`
   → sandbox sem `require` global, sem fs, sem rede.
4. **A4 — Token theft**: XSS no editor rouba access token → CSP + httpOnly + tokens de
   curta duração + revogação de refresh.
5. **A5 — Webhook abuse**: atacante reenvia payload de webhook autenticado → nonce +
   timestamp window + HMAC.
6. **A6 — Insider tenant**: usuário convidado tenta ler workflow/credential de outro
   projeto do mesmo tenant sem permissão → RBAC por projeto + deny-by-default.
7. **A7 — Abuse de recursos**: tenant cria 10k execuções para DoS de CPU → quotas por
   tenant/usuário + rate limit + budget de execução.

---

## 2. Modelo de Ameaças (STRIDE) e Controles

Aplicado por **componente**, com a ameaça, exemplo concreto e o controle que a mitiga.
Cada linha mapeia para um ou mais controles da matriz (§14).

### 2.1 Autenticação & Sessão

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | Atacante forja JWT com `sub` de outro usuário | Assinatura HS256 com chave forte; verificação `iss/aud/exp/nbf`; `jti` revogável |
| S | Spoofing | Replay de access token vazado em log | Tokens de 15 min; nenhum token em logs; rotação no refresh |
| T | Tampering | Modificação de claims (`role: viewer` → `admin`) | JWT assinado (nunca apenas codificado); claims de role **nunca** lidas do client — role vem do DB em cada request autorizado |
| T | Tampering | Cookie de sessão alterado | Refresh token opaco (random 256-bit) armazenado em DB, hash SHA-256 no banco |
| I | Information disclosure | User enumeration via "email não cadastrado" | Mensagens genéricas; timing equalizado; lockout sem revelar existência |
| I | Information disclosure | Token em URL de callback | Tokens só em headers/body; `referrerPolicy` |
| D | DoS | 10⁶ tentativas de login | Lockout progressivo + rate limit por IP/email (§7) |
| E | Elevation | Reuso de senha em vazamento público | Argon2id + breached-password check no registro/reset |
| E | Elevation | Sessão ativa pós troca de senha | Revogação de **todas** as sessões na troca/remoção de MFA |

### 2.2 RBAC & Autorização

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | Usuário de org A se passa por org B em header | orgId **nunca** confiado ao client; resolvido do token + DB |
| T | Tampering | Role alterada no payload de update de usuário | Validação zod estrita; `role` alterável só por admin; imutabilidade de `owner` (último owner não pode se rebaixar) |
| I | Disclosure | Viewer lista credenciais com valores | API nunca retorna `data`; apenas `hasValue` (§5.6) |
| D | DoS | Editor cria 100k workflows | Quotas por tenant/plano |
| E | Elevation | Editor promove a si mesmo a admin | Só admin promove; auditoria de `role:change` |
| E | Elevation | IDOR: `GET /workflows/:id` de outro org | Toda query: `WHERE id = ? AND orgId = ?` + RLS + teste automatizado de isolamento |

### 2.3 Credenciais & Vault

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| I | Disclosure | Dump do Postgres vaza plaintext de credenciais | Envelope AES-256-GCM + DEK por tenant; KEK fora do DB (env/KMS) |
| I | Disclosure | Log de erro contém `apiKey` | Sanitizer global de logs (regex + redação de valores de credencial) (§11) |
| T | Tampering | Alteração de `encryptedData` sem detecção | GCM autentica (tag 128-bit); qualquer alteração falha decrypt |
| T | Tampering | Rollback de versão de chave (reuse de nonce) | `kv` no envelope + rejeição de chaves deprecated; nonce aleatório 96-bit |
| D | DoS | Rotação deixa credenciais inacessíveis | Rotação dual-write: nova versão ativa, antiga válida até reencrypt de todos (§5.5) |
| E | Elevation | Editor lê valor de credencial de outro node | Permissão `credential:decrypt` só para owner/admin + execução; auditoria |

### 2.4 OAuth Broker

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | Login social com email forjado | Verificação de `email_verified` + assinatura do id_token (JWKS) |
| S | Spoofing | Authorization code roubado em callback | PKCE obrigatório (S256); code one-time com TTL 5 min |
| T | Tampering | `state` manipulado (login CSRF) | `state` = HMAC do session id + nonce aleatório; verificado no callback |
| I | Disclosure | Access token de integração vazado no browser | Tokens OAuth criptografados no vault; só descriptografados no executor (§5, §6) |
| D | DoS | Loop de refresh infinito | Rate limit por credencial; parada em erros persistentes |
| E | Elevation | Escopos ampliados silenciosamente | Escopos fixados na criação; alteração exige re-consentimento explícito |

### 2.5 Sandbox do Code Node

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | Código forja identidade do workflow | Contexto imutável injetado pelo runner; `$execution` congelado |
| T | Tampering | Código altera estado global entre execuções | Isolamento total por execução (novo context por run) |
| I | Disclosure | `process.env` lido pelo código | Sandbox sem `process`; envs nunca injetados no sandbox |
| I | Disclosure | Exfil via `fetch` | Sem rede no sandbox; exfil via node HTTP é interceptado pelo proxy e auditado (§6, §8) |
| D | DoS | `while(true)` infinito | Timeout duro por execução + limites de CPU/memória (§6.4) |
| E | Elevation | Escape do VM para o processo | Sandbox de múltiplas camadas: isolate-vm + worker thread + capacidade zero do worker (§6.3, ADR-2) |

### 2.6 Rede & SSRF

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | DNS rebinding: domínio allowlistado resolve para 127.0.0.1 | Resolver IPs **duas vezes** (pré-conexão + pós-conexão) e validar ambos (§8) |
| I | Disclosure | `169.254.169.254` metadata da cloud | Guard de CIDR privados/link-local em toda conexão de egress |
| T | Tampering | Response de HTTP Request alterado | TLS 1.2+ obrigatório; verificação de cert (sem `rejectUnauthorized:false`) |
| D | DoS | Slowloris via HTTP Request | Timeouts de conexão, max response size |
| E | Elevation | HTTP Request a serviço interno admin | Proxy egress dedicado com allowlist por tenant/plano (§8) |

### 2.7 API, Tenancy & Auditoria

| Letra | Ameaça | Exemplo | Controles |
|-------|--------|---------|-----------|
| S | Spoofing | API key vazada em repositório público | Scoped keys (só execução), rotação, last-used tracking |
| I | Disclosure | IDOR via cursor de paginação | Paginação segura por cursor opaco, nunca offset com IDs (§7.4) |
| T | Tampering | Log de auditoria apagado | Append-only + hash chain; escrita via tabela separada com permissões restritas (§9) |
| D | DoS | Abuso de execução paga | Quota de execuções + rate limit por rota |
| E | Elevation | Tenant A acessa dados do tenant B via Redis | Chaves Redis prefixadas por org; job payload carrega `orgId` verificado no worker (§10, §11) |

---

## 3. Autenticação

### 3.1 Visão Geral dos Fluxos

```
            ┌────────────────────────────────────────────────┐
            │            FLUXOS DE AUTENTICAÇÃO              │
            │                                                │
            │  login/senha ──► Argon2id verify ──► [MFA?]    │
            │  SSO OIDC    ──► callback ────────► [email     │
            │  SSO SAML    ──► ACS parse ───────►  match?]   │
            │  magic link  ──► token one-time ──► account    │
            │  API key     ──► header X-API-Key ─┘  vinculada│
            │                                                │
            │  sucesso ──► access JWT (15 min)               │
            │           ──► refresh token opaco (30 dias)    │
            │           ──► optional MFA challenge           │
            └────────────────────────────────────────────────┘
```

### 3.2 Hash de Senha — Argon2id (ADR-1)

- **Algoritmo**: Argon2id (memória dura — resistente a GPU/ASIC).
- **Parâmetros** (mínimos): `m=64 MiB`, `t=3`, `p=1` (valores revisáveis conforme
  OWASP Password Storage Cheat Sheet).
- **Formato**: PHC string — `$argon2id$v=19$m=65536,t=3,p=1$<salt16B$<hash32B>`.
- **Fallback**: nenhum para novos hashes; suporte a bcrypt apenas para migração de
  hashes existentes (transparente, re-hash na próxima autenticação válida).
- **Rejeição de senhas fracas**: mínimo 10 caracteres + check contra lista de
  breached passwords (hash do prefixo SHA-1 via k-anonymity, ou lista local).

```typescript
// packages/shared/src/auth/password.ts (schemas e contratos — implementação no API)
import { z } from "zod";

export const passwordPolicySchema = z.object({
  minLength: z.number().default(10),
  maxLength: z.number().default(128), // limite superior contra DoS do hash
  requireUpper: z.boolean().default(false),
  requireNumber: z.boolean().default(false),
  breachedCheck: z.boolean().default(true),
});
export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

export interface IPasswordHasher {
  /** Retorna PHC string; rejeita senha que falhe a política */
  hash(plain: string, policy: PasswordPolicy): Promise<string>;
  /** Retorna true se ok; também sinaliza rehash necessário */
  verify(plain: string, phc: string): Promise<{ ok: boolean; needsRehash: boolean }>;
  /** true se o hash foi feito com algoritmo/parâmetros atuais */
  isCurrentAlgorithm(phc: string): boolean;
}
```

### 3.3 Sessões — Access JWT + Refresh Token (ADR-3)

| Propriedade | Access token | Refresh token |
|-------------|-------------|---------------|
| Formato | JWS compacto (HS256, chave 256-bit rotável) | Opaco: 32 bytes aleatórios, armazenado como SHA-256 |
| TTL | 15 minutos | 30 dias (sliding: renovado se usado) |
| Storage | Memory (client) — nunca localStorage | httpOnly + Secure + SameSite=Lax cookie |
| Revogação | Impossível (curto) — mitigada por curta duração | Imediata: delete do DB; rotação na família de sessão |
| Claims | `sub, orgId, role, sid, iss, aud, exp, nbf, jti` | — (opaco, resolvido no DB) |

**Regras de sessão:**
1. Na troca (refresh), o token antigo é invalidado e um novo emitido (detecção de
   reuso = possível roubo → revoga a família inteira da sessão).
2. `sid` (session id) permite revogar todas as sessões de um usuário (logout global,
   troca de senha, suspeita de comprometimento).
3. Máximo de sessões simultâneas configurável por org (default 10).
4. Tokens expirados retornam 401 com `WWW-Authenticate`; o client roda um único refresh
   e repete a request (sem loops infinitos: refresh com rate limit dedicado).

```typescript
// packages/shared/src/auth/session.ts
export interface SessionClaims {
  sub: string;        // userId
  orgId: string;
  role: Role;         // copiado para conveniência; NUNCA a fonte de verdade
  sid: string;        // session id (revogação)
  iss: "agentflow-api";
  aud: "agentflow-web";
  exp: number;
  nbf: number;
  jti: string;
}

export interface ISessionManager {
  /** Cria família de sessão após autenticação bem-sucedida (com ou sem MFA) */
  create(userId: string, orgId: string, ctx: RequestContext):
    Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;
  /** Troca refresh válido por novo par; reuso detectado revoga a família */
  rotate(refreshToken: string, ctx: RequestContext): Promise<SessionRotationResult>;
  revoke(refreshToken: string): Promise<void>;
  revokeAllForUser(userId: string, reason: RevocationReason): Promise<void>;
  revokeSession(sid: string, reason: RevocationReason): Promise<void>;
  validateAccess(token: string): Promise<SessionClaims>; // verifica assinatura + jti não-revogado
  requireMfaIfNeeded(userId: string, ctx: RequestContext): Promise<MfaChallenge | null>;
}

export type RevocationReason =
  | "logout" | "password-change" | "mfa-removed" | "security-suspicion"
  | "admin-revoke" | "session-limit" | "family-reuse";

export interface SessionRotationResult {
  ok: true; accessToken: string; refreshToken: string; expiresIn: number;
} | { ok: false; reason: "invalid" | "revoked" | "reuse-detected" | "expired" };
```

### 3.4 MFA — TOTP, Email OTP, Backup Codes

- **TOTP**: RFC 6238 (SHA-1 8 dígitos, janela ±1), secret de 160 bits gerado no servidor,
  exibido uma única vez como QR (otpauth://). Verificação em hardware (WebAuthn/FIDO2)
  fica como extensão futura na interface.
- **Email OTP**: código de 6 dígitos, TTL 10 min, one-time, rate limit de envio
  (5/15 min por conta), usado como fallback quando TOTP indisponível.
- **Backup codes**: 10 códigos gerados no servidor, exibidos uma única vez, cada um
  one-time; reutilizados a cada 90 dias (mostra "último uso" para avisar).
- **Regras**: MFA exigida após o login por senha se o usuário tiver MFA ativada
  (adaptive: orgs podem forçar MFA para todos via policy). Sessão pré-MFA recebe token
  com claim `mfa:false` e escopo reduzido (só `mfa.verify` e `mfa.enroll`).
- **Enrolamento seguro**: exige senha atual + email verificado; gera alerta por email
  de segurança.

```typescript
// packages/shared/src/auth/mfa.ts
export interface IMfaService {
  enrollTopt(userId: string, ctx: RequestContext):
    Promise<{ secret: string; otpauthUrl: string; backupCodes: string[] }>;
  verifyTopt(userId: string, code: string): Promise<boolean>;
  sendEmailOtp(userId: string, ctx: RequestContext): Promise<void>;
  verifyEmailOtp(userId: string, code: string): Promise<boolean>;
  issueBackupCodes(userId: string): Promise<string[]>;
  consumeBackupCode(userId: string, code: string): Promise<boolean>;
  removeMfa(userId: string, ctx: RequestContext): Promise<void>; // revoga sessões + alerta
}
```

### 3.5 SSO — OIDC e SAML

| Provedor | Protocolo | Detalhe |
|----------|-----------|---------|
| Google | OIDC | `email_verified=true` exigido; escopos `openid email profile` |
| Microsoft Entra | OIDC | Validação de `tid`/`iss` contra tenant esperado |
| GitHub | OAuth2 + userinfo | Verificar `email` e `email_verified` na userinfo (quando privado) |
| Okta | OIDC + SAML | OKTA no broker genérico |
| Genérico | OIDC discovery | `/.well-known/openid-configuration` + JWKS, `iss` estrito |

**Regras de provisionamento:**
- `email` do IdP é a chave de vinculação; caso não exista usuário, cria com role
  `viewer` por padrão (deny-by-default) — **nunca** auto-promove.
- Conta vinculada a SSO tem `ssoOnly: true` (senha desabilitada) — evita backdoor de senha.
- Desvinculação de SSO exige re-autenticação e revoga sessões.
- SAML: parse estrito de XML (biblioteca com hardening contra XXE: `disableEntityResolution=true`),
  validação de `AssertionConsumerServiceURL` e de assinatura.
- JIT provisioning registra auditoria (`sso:user:created`) e alerta quando um usuário
  externo é criado pela primeira vez.

```typescript
// packages/shared/src/auth/sso.ts
export interface ISsoProvider {
  getAuthorizationUrl(opts: { state: string; nonce: string; redirectUri: string }): Promise<string>;
  /** Valida callback: troca code, valida id_token (iss/aud/nonce/sig), retorna identidade */
  handleCallback(opts: { code: string; state: string; nonce: string; redirectUri: string }):
    Promise<ExternalIdentity>;
  /** Falso quando provider exige interação (logout remoto etc.) */
  supportsLogout(): boolean;
}
export interface ExternalIdentity {
  provider: "google" | "microsoft" | "github" | "okta" | string;
  externalId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  rawClaims: Record<string, unknown>; // nunca logado na íntegra
}
```

### 3.6 Recovery de Conta e Lockout

- **Recovery**: email com token one-time (TTL 30 min), revoga sessões, exige MFA
  quando ativa. Sem resposta "conta existe ou não" — sempre "se o email existir, enviamos".
- **Lockout** (anti brute-force, progressivo por identidade *e* IP):
  1. 5 falhas → bloqueio de 1 minuto (email) e 15 min (IP).
  2. 10 falhas → 15 minutos (email) e 60 min (IP).
  3. 20 falhas → bloqueio até reset por admin OU prova MFA.
  4. Lockout NUNCA revela se a conta existe; email de alerta de segurança em falhas>3.
- **Rate limit de auth**: todas as rotas de auth com limite agressivo (§7.3).

---

## 4. Autorização — RBAC e Permissões

### 4.1 Modelo RBAC

Roles de **plataforma** (por usuário-org) e **projetos** (por usuário-projeto):

| Role | Workflows | Credenciais | Execuções | Usuários | Projetos | Billing/Org settings |
|------|-----------|-------------|-----------|----------|----------|----------------------|
| **owner** | CRUD + executar + publicar | criar/editar/decrypt/rotacionar | ver/parar/retry/export | convidar/promover/rebaixar/remover | criar/editar/deletar | tudo |
| **admin** | CRUD + executar + publicar | criar/editar/decrypt | ver/parar/retry/export | convidar/remover (não promover a owner) | criar/editar | ver billing |
| **editor** | CRUD + executar | criar/editar (sem decrypt de outros) | ver/parar/retry | ver | ver | — |
| **viewer** | ver | ver (hasValue, nunca valor) | ver | ver | ver | — |

**Projeto** (project scope): membro de projeto pode ser `project:editor` / `project:viewer`,
sempre subordinado à role da org (interseção de permissões — nunca ampliação).

### 4.2 Permissões por Recurso (Resource Actions)

```typescript
// packages/shared/src/rbac/types.ts
export type Role = "owner" | "admin" | "editor" | "viewer";

export const RESOURCE = {
  workflow: "workflow", credential: "credential", execution: "execution",
  user: "user", project: "project", org: "org", webhook: "webhook",
} as const;
export type Resource = (typeof RESOURCE)[keyof typeof RESOURCE];

export type Action =
  | "create" | "read" | "update" | "delete" | "execute" | "publish"
  | "decrypt" | "rotate" | "test" | "invite" | "promote" | "demote" | "remove"
  | "retry" | "stop" | "export" | "manage" | "list";

export interface Permission {
  resource: Resource;
  action: Action;
  scope: "org" | "project" | "self";
}

export const RBAC_MATRIX: Record<Role, readonly Permission[]> = {
  owner:  [/* wildcard implícito */],
  admin:  [/* wildcard menos promote/owner */],
  editor: [
    { resource: "workflow",   action: "create" | "read" | "update" | "delete" | "execute" | "publish", scope: "org" },
    { resource: "credential", action: "create" | "read" | "update" | "test", scope: "org" },
    { resource: "execution",  action: "read" | "retry" | "stop", scope: "org" },
  ],
  viewer: [
    { resource: "workflow",   action: "read", scope: "org" },
    { resource: "credential", action: "read", scope: "org" }, // apenas hasValue
    { resource: "execution",  action: "read", scope: "org" },
  ],
};
```

### 4.3 Motor de Autorização (deny-by-default)

```typescript
// packages/shared/src/rbac/authorizer.ts
export interface IAuthorizer {
  /** Gate central: todo handler chama isso ANTES de tocar o DB */
  assert(user: AuthPrincipal, permission: Permission, resource?: { orgId: string; projectId?: string }): Promise<void>;
  can(user: AuthPrincipal, permission: Permission, resource?: { orgId: string; projectId?: string }): Promise<boolean>;
  /** Filtra listagens: projeta o prisma query com scoping de org/projeto */
  scopeQuery(user: AuthPrincipal, model: string): Record<string, unknown>;
}
export interface AuthPrincipal {
  userId: string;
  orgId: string;
  role: Role; // fonte de verdade: DB (cache curto), nunca claims do JWT
  projectRoles: Record<string, ProjectRole>;
  mfaVerified: boolean;
}
```

**Regras do motor:**
1. **Deny por padrão** — permissão não listada = negada (403 genérico, sem detalhe).
2. Role da **fonte de verdade**: o middleware resolve o principal do DB (ou cache TTL
   curto) em cada request mutável; claims do JWT são só conveniência de display.
3. `assert` é chamado no início de cada handler; **nunca** confiar em filtragem
   client-side.
4. Projeto: `can(user, permission, {projectId})` intersecciona role da org e do projeto.
5. Owner: regra de invariante — o último `owner` ativo de uma org não pode ser
   rebaixado/removido (evita org órfã).

### 4.4 Escopos por Organização/Equipe e Políticas por Projeto

- Org define **políticas de segurança** aplicadas a todos os projetos:
  `requireMfa`, `passwordPolicy`, `sessionTtl`, `allowSso`, `allowWebhooks`,
  `egressAllowlist` (herdado; projeto só restringe, nunca amplia).
- Projeto define escopo de recursos e membros; credenciais podem ser compartilhadas
  entre projetos da mesma org **apenas** com permissão explícita
  (`credential:share` owner/admin) e auditoria de cada acesso.
- Delegação de execução (webhook → workflow) é escopada ao workflow dono; o trigger
  de webhook **nunca** recebe credenciais de outro projeto.

---

## 5. Credenciais e Segredos — Vault

> Constrói sobre `design-seguranca.md` (§1–§4). Extensões v2: DEK por tenant,
> rotação agendada, teste de conexão sem vazar segredo, referência por node.

### 5.1 Arquitetura de Criptografia (Envelope Encryption)

```
                        ┌──────────────────────────┐
                        │   KEK (Key Encryption    │
                        │   Key) — fora do DB:     │
                        │   • env (self-hosted)    │
                        │   • KMS (cloud)          │
                        └───────────┬──────────────┘
                                    │ wrap/unwrap (AES-KW ou KMS API)
                    ┌───────────────▼───────────────┐
                    │  DEK por tenant (32 bytes)    │
                    │  armazenado no DB como:       │
                    │  wrap(DEK) + {alg, kv, nonce} │
                    └───────────────┬───────────────┘
                                    │ AES-256-GCM
        ┌───────────────┐   ┌───────▼────────┐   ┌──────────────────┐
        │ Credential    │   │  DEK          │   │ nonce 96-bit     │
        │ JSON:         │──►│  encrypt      │──►│ único por        │
        │ {apiKey, ...} │   │               │   │ encriptação      │
        └───────────────┘   └───────────────┘   └──────────────────┘
```

**Decisões (ADR-1, ADR-4):**
- DEK por **tenant** (não global, não por credencial): um tenant comprometido
  (KEK vazada de uma credencial) não expõe outros tenants; custo de rotação por
  tenant é aceitável.
- Envelope: ciphertext nunca depende de segredo no DB; `kv` permite rotação sem
  migração de schema.
- GCM autentica; nonce aleatório 96-bit; rejeitar nonce repetido (crash/alert).

### 5.2 Contratos TypeScript

```typescript
// packages/shared/src/credentials/credential.ts
export type EncryptedEnvelope = {
  alg: "AES-256-GCM" | "XChaCha20-Poly1305";
  kv: string;            // key version, ex: "v2"
  nonce: string;         // base64url, 12 bytes (GCM) ou 24 (XChaCha)
  ciphertext: string;    // base64url
  tag: string;           // base64url, 16 bytes
};

export interface ICredentialStorage {
  /** Cria envelope; o plaintext NUNCA deixa o service layer */
  create(input: NewCredential, principal: AuthPrincipal, ctx: RequestContext): Promise<CredentialMeta>;
  get(credentialId: string, principal: AuthPrincipal): Promise<CredentialMeta>;        // sem valores
  /** Decrypt exclusivo do runner (execução) e owner/admin com audit obrigatório */
  decrypt(credentialId: string, principal: AuthPrincipal, purpose: DecryptPurpose): Promise<Record<string, string>>;
  update(credentialId: string, patch: CredentialPatch, principal: AuthPrincipal): Promise<CredentialMeta>;
  delete(credentialId: string, principal: AuthPrincipal): Promise<void>;
  list(orgId: string, principal: AuthPrincipal): Promise<CredentialMeta[]>;             // mascarado
  rotateKey(orgId: string, principal: AuthPrincipal): Promise<RotationReport>;          // async, agendado
  testConnection(credentialId: string, principal: AuthPrincipal): Promise<TestResult>;  // nunca loga segredo
}
export type DecryptPurpose = "execution" | "test" | "export" | "admin-view";
export type CredentialMeta = {
  id: string; name: string; type: string; orgId: string;
  createdAt: Date; updatedAt: Date; hasValue: Record<string, boolean>; // ex.: {apiKey: true}
  lastTestedAt: Date | null; usedByWorkflows: number; shares: Array<{ projectId: string }>;
};

export interface ICryptoEngine {
  encryptDEK(dek: Buffer): Promise<{ wrapped: string; kv: string }>;   // KEK wrap
  unwrapDEK(wrapped: string, kv: string): Promise<Buffer>;
  encryptSecret(plain: string, dek: Buffer): Promise<EncryptedEnvelope>;
  decryptSecret(env: EncryptedEnvelope, dek: Buffer): Promise<string>;
  rotateKEK(oldWrapped: string): Promise<{ wrapped: string; kv: string }>;
}
```

### 5.3 Referência por Node (nunca expor valor)

- Workflow JSON armazena `credentialId` + `credentialType` (nunca o valor). Resolução
  ocorre **somente** no runner, no momento da execução, com auditoria `DECRYPT` por
  propósito.
- A API de workflows valida que o node referencia uma credencial **da mesma org**;
  `credentialId` inexistente ou de outra org = 422 genérico (sem confirmar existência
  de credencial alheia).
- Imports/exportação de workflow: credenciais referenciadas por **nome**
  (não id) com mapeamento opcional; valores nunca acompanham o export.

### 5.4 Mascaramento na UI

- Resposta da API: `{ hasValue: { apiKey: true } }` — nunca o valor.
- Campos `password`/`apiKey` são masked no editor (input `type=password` + blur
  automático em 30 s); "revelar" exige permissão `credential:decrypt` e registra
  auditoria `READ_FULL` (com purpose `admin-view`).
- Dados de teste de conexão exibidos sem segredo; resposta de erro sanitizada.

### 5.5 Teste de Conexão Sem Vazar Segredo

1. O teste roda **no worker** (não na API) com a credencial resolvida localmente.
2. Logs do teste passam pelo sanitizer (§11.2) — URLs com query contendo `api_key=`
   são redigidas.
3. O resultado exposto: `{ ok: boolean; latencyMs: number; errorClass: "auth"|"network"|"timeout"|"invalid-config" }` —
   nunca a mensagem crua do provedor.
4. Tempo de resposta padronizado para erros (timing-safe): auth falha ≈ network fail.

### 5.6 Rotação e Revogação

- **Rotação de DEK/KEK** (agendada, default 90 dias, configurável): job BullMQ
  `credential:rotate` processa por tenant com janela de manutenção; modo dual:
  versão antiga continua válida para decrypt até todos os envelopes migrados
  (marca `deprecatedAt`, rejeita **novas** encriptações).
- **Rotação de segredo de credencial individual** (ex.: API key expirada):
  `POST /credentials/:id/rotate-secret` gera novo valor apenas para tipos com
  geração automática; senão guia o usuário (nunca re-usa o valor antigo).
- **Revogação**: `revoke` marca `revokedAt`; runner recusa decrypt de credencial
  revogada (falha explícita na execução, nunca silenciosa).
- **Alertas**: uso de credencial após `lastTestedAt > 30 dias` gera warning;
  decrypt por usuário que não é o criador gera evento de auditoria com severidade.

<!-- CHUNK-BOUNDARY-2 -->

