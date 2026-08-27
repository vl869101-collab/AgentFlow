# TASK-11: Nó HTTP Avançado — Suíte Completa de Autenticação & Circuit Breaker Resiliente

- **Prioridade:** P1 (Resiliência Egress & Integração HTTP)
- **Domínio:** HTTP Egress / Security / Circuit Breaker / Authentication
- **Alvo:** `apps/api/src/services/executor.ts`, `apps/api/src/lib/circuit-breaker.ts`, `apps/api/src/lib/http-auth.ts` & `apps/api/src/lib/ssrf.ts`

## 1. Contexto & Problema
O nó `http` (e seu alias `httpRequest`) é a espinha dorsal de integrações com APIs externas. Ele precisa suportar todos os esquemas modernos de autenticação com injeção automática e proteger o sistema contra travamentos em cascata quando serviços externos estiverem fora do ar.

## 2. Objetivos & Especificação
1. **Suíte Completa de Autenticação HTTP (6 esquemas):**
   - **Basic Auth:** Injeção automática de header `Authorization: Basic <base64>` com suporte a credenciais arbitrárias.
   - **Bearer Token:** Header `Authorization: Bearer <token>`.
   - **API Key:** Injeção em Header (ex: `X-API-Key`, `api-key`) ou Query Parameter dinâmico (`apiKeyIn: "header" | "query"`).
   - **OAuth2 Auto-Injection:** Descriptografia de credencial do Vault e injeção transparente do `accessToken` atualizado via `ensureFreshOAuth2Token`.
   - **Digest Auth:** Negociação de desafio digest HTTP RFC 7616 com suporte a `MD5` e `SHA-256`, `qop="auth"`, `nonce`, `cnonce`, `nc` e `realm`.
   - **Client Certificate / mTLS:** Suporte a certificados TLS de cliente (`cert`, `key`, `ca`, `passphrase`, `pfx`) para APIs financeiras e corporativas.
2. **Circuit Breaker para Egress:**
   - Estados de operação:
     - `CLOSED`: tráfego normal.
     - `OPEN`: interrompe requisições para o host após 5 falhas consecutivas ou timeout de 10s, retornando erro imediato sem prender conexões (`CircuitBreakerOpenError`, 503).
     - `HALF-OPEN`: permite requisição de teste após período de cooldown (30s) para reavaliar a saúde do host. Transita para `CLOSED` após sucessos consecutivos ou retorna imediatamente a `OPEN` se a tentativa falhar.
3. **SSRF Guard & Segurança de Rede:**
   - Bloqueio estrito de IPs privados (RFC 1918), link-local (RFC 3927), loopback (127.0.0.1, ::1) e endpoints de metadados de nuvem (AWS/GCP/Azure).
   - Defesa contra DNS rebinding, credenciais embutidas na URL e protocolos não-HTTP(S).

## 3. Critérios de Aceite
- [x] Nó HTTP realiza requisições utilizando com sucesso todos os 6 esquemas de autenticação.
- [x] Host em colapso aciona abertura do Circuit Breaker e protege os workers de esgotamento de conexões.
- [x] Tentativas de requisição para endereços de rede privada são rejeitadas pelo SSRF guard.
- [x] Testes automatizados cobrindo todos os modos de autenticação e transições de estado do Circuit Breaker.
