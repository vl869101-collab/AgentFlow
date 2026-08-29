# HANDOFF SECURITY REVIEW — Missão 43 (TASK-01..20 AgentFlow)

**Data**: 2026-08-28  
**Auditor**: security-reviewer  
**Escopo**: Auditoria de Segurança Completa de Back-End, MCP, Vault, SSRF, HMAC e Resiliência (TASK-01 a TASK-20)  
**Base Commit**: `d157423`  
**WorkDir**: `missao-37-fanout-20260826`  
**Status**: `GO` (Aprovado sem bloqueadores de segurança)

---

## 1. Sumário Executivo & Veredito

| Dimensão de Segurança | Status | Severidade Máxima | Veredito |
| :--- | :--- | :--- | :--- |
| **Secret Hygiene & Gitignore** | Conforme | Nenhuma | **GO** |
| **SSRF Guards & DNS Rebinding** | Conforme | Nenhuma | **GO** |
| **HMAC Webhooks & Timing Attacks** | Conforme | Nenhuma | **GO** |
| **RBAC MCP Scopes & Authorization** | Conforme | Nenhuma | **GO** |
| **Vault AES-256-GCM & OAuth Refresh** | Conforme | Nenhuma | **GO** |
| **Rate Limiting & Circuit Breakers** | Conforme | Nenhuma | **GO** |

**Veredito Final**: **GO** (Produção Aprovada)

---

## 2. Auditoria Detalhada por Dimensão

### 2.1 Secret Hygiene & Exclusão de Credenciais
- **Gitignore Protection**:
  - `apps/api/.env.production` e arquivos de ambiente de produção são rigorosamente ignorados em `.gitignore:7` (`*.env.production`).
  - `.env`, `.env.local` e `.env.production` mantidos fora do controle de versão (`.gitignore:5-7`).
- **Scan de Segredos Hardcoded**:
  - Variáveis de ambiente como `CREDENTIAL_ENCRYPTION_KEY`, `JWT_SECRET`, `NVIDIA_NIM_API_KEY` são lidas exclusivamente via `process.env` ou `getEnv()`.
  - Exceções seguras e validações hexadecimais de 64 caracteres (32 bytes) em `apps/api/src/lib/crypto.ts:7-15`.

### 2.2 Proteções Anti-SSRF, DNS Rebinding & Metadata Shield
- **Localização**: `apps/api/src/lib/ssrf.ts:9-29`, `apps/api/src/lib/ssrf.ts:46-71`, `apps/api/src/lib/ssrf.ts:189-212`, `apps/api/src/lib/ssrf.ts:230-280`.
- **IPs e Metadados Bloqueados**:
  - `169.254.169.254`, `169.254.170.2` (AWS/GCP/Azure link-local instance metadata).
  - `100.100.100.200` (Alibaba Cloud metadata).
  - `metadata.google.internal`, `metadata.goog`, `instance-data`, `localhost`.
  - Sufixos de TLD privados e não roteáveis (`.local`, `.internal`, `.lan`, `.home`, `.corp`, etc.).
- **DNS Resolution & Multi-IP Validation**:
  - `resolveAllAddresses` resolve registros IPv4 e IPv6 e inspeciona cada endereço retornado via `ipaddr.js`.
  - Validação estrita de `range === 'unicast'` (`apps/api/src/lib/ssrf.ts:66-67`), bloqueando loopback, private RFC1918, carrier-grade NAT e multicast.
- **Redirect Egress Protection**:
  - `safeFetch` utiliza `redirect: "manual"` e revalida o cabeçalho `Location` contra as regras de SSRF a cada salto antes de prosseguir (`apps/api/src/lib/ssrf.ts:262-277`).

### 2.3 Webhooks HMAC, Timing Safe & Proteção contra Replay
- **Localização**: `apps/api/src/services/webhook-verifier.ts:14-30`, `apps/api/src/services/webhook-verifier.ts:69-115`, `apps/api/src/services/webhook-verifier.ts:121-155`.
- **Prevenção de Side-Channel Timing Attacks**:
  - Implementado `safeCompare` utilizando `crypto.timingSafeEqual` com compensação de buffer dummy em caso de divergência de tamanho para evitar vazamento temporal (`apps/api/src/services/webhook-verifier.ts:19-24`).
- **Suporte Multi-Provedor**:
  - **GitHub**: SHA-256 HMAC verificado com prefixo `sha256=` (`apps/api/src/services/webhook-verifier.ts:36-49`).
  - **Shopify**: SHA-256 HMAC com digest base64 (`apps/api/src/services/webhook-verifier.ts:55-63`).
  - **Stripe**: SHA-256 HMAC com `t=` timestamp e limite estrito de tolerância contra Replay Attack (máximo 300 segundos / 5 minutos) (`apps/api/src/services/webhook-verifier.ts:69-115`).
  - **Slack**: Assinatura versão `v0` com basestring concatenada e verificação de timestamp (`apps/api/src/services/webhook-verifier.ts:121-155`).

### 2.4 RBAC, MCP Scopes & Authorization
- **Localização**: `apps/api/src/mcp/tools.ts:1996-2067`, `apps/api/src/routes/mcp.ts:23-58`, `apps/api/src/mcp/server.ts:25-88`.
- **Hierarquia e Normalização de Escopos**:
  - Validador `scopeMatches` com suporte a aliases (`workflows:read`, `workflow:execute`, `credentials:read`, `vault:decrypt`).
  - Suporte a wildcards de domínio (`*`, `admin`, `domain:*`, `tools:call`).
  - Bloqueio imediato com código JSON-RPC `-32003` para chamadas de ferramentas fora do escopo do token do usuário (`apps/api/src/mcp/tools.ts:2062-2065`).

### 2.5 Vault AES-256-GCM & Ciclo de Vida OAuth2
- **Localização**: `apps/api/src/lib/crypto.ts:1-66`, `apps/api/src/services/vault/oauth-refresh.ts:65-316`.
- **Criptografia Autenticada**:
  - Algoritmo `aes-256-gcm` com IV aleatório de 12 bytes (`96-bit`) e Auth Tag de 16 bytes (`128-bit`).
  - Rejeição estrita de envelopes corrompidos ou com autenticação violada.
- **OAuth2 Token Refresh On-Demand & Proativo**:
  - `ensureFreshOAuth2Token` garante validade de token antes da execução de nós (`apps/api/src/services/vault/oauth-refresh.ts:65-118`).
  - `refreshOAuth2Credential` trata rotação de refresh tokens, armazena novos segredos re-criptografados com AES-256-GCM e marca credenciais revogadas como `EXPIRED` com registro de auditoria (`audit-ledger`).

### 2.6 Rate Limiting e Circuit Breaker Egress
- **Localização**: `apps/api/src/middleware/rate-limit.ts:11-73`, `apps/api/src/lib/circuit-breaker.ts:1-148`.
- **Sliding Window Rate Limit**:
  - Janela deslizante em Redis por organização (`ratelimit:org:<id>`), usuário ou IP.
  - Limites escalonados por plano (FREE: 60 rpm, GROWTH: 300 rpm, PRO: 600 rpm, ENTERPRISE: 6000 rpm).
  - Emissão correta de cabeçalhos padrão RFC `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` e `Retry-After`.
- **Circuit Breaker**:
  - Máquina de estados `CLOSED`, `OPEN`, `HALF_OPEN` para requisições de saída.
  - Threshold de 5 falhas consecutivas para abertura do circuito e cooldown de 30s (`resetTimeoutMs`).

---

## 3. Matriz de Evidências de Código

| Componente | Arquivo e Linhas Auditadas | Validação |
| :--- | :--- | :--- |
| **Gitignore** | `.gitignore:1-13` | `*.env.production` devidamente coberto |
| **SSRF Guards** | `apps/api/src/lib/ssrf.ts:9-29, 46-71, 189-212` | Bloqueio de IP privado, Cloud metadata e DNS rebinding |
| **Safe Fetch** | `apps/api/src/lib/ssrf.ts:230-280` | Manual redirect handling e validação contínua de URL |
| **HMAC Timing** | `apps/api/src/services/webhook-verifier.ts:14-30` | `timingSafeEqual` com buffer de comprimento idêntico |
| **Replay Attack** | `apps/api/src/services/webhook-verifier.ts:96-104` | Tolerância máxima de 300s para Stripe/Slack |
| **MCP RBAC** | `apps/api/src/mcp/tools.ts:1996-2067` | Verificação de escopos e negação por padrão |
| **AES-256-GCM** | `apps/api/src/lib/crypto.ts:24-66` | Criptografia autenticada com IV e Tag |
| **OAuth Refresh**| `apps/api/src/services/vault/oauth-refresh.ts:65-316` | Rotação atômica de token e auditoria em caso de falha |
| **Rate Limit** | `apps/api/src/middleware/rate-limit.ts:11-73` | Sliding window por tier com cabeçalhos HTTP |
| **Circuit Breaker**| `apps/api/src/lib/circuit-breaker.ts:31-145` | Proteção contra cascata de falhas em chamadas HTTP |

---

## 4. Conclusão e Handoff

Todos os itens da auditoria de segurança da Missão 43 (TASK-01 a TASK-20) estão em conformidade com as melhores práticas OWASP, arquitetura segura e padrões da plataforma. O código está pronto para lançamento em produção.
