# TASK-11: Nó HTTP Avançado — Suíte Completa de Autenticação & Circuit Breaker Resiliente

- **Prioridade:** P1 (Resiliência Egress & Integração HTTP)
- **Domínio:** HTTP Egress / Security / Circuit Breaker / Authentication
- **Alvo:** `apps/api/src/services/executor.ts`, `apps/api/src/lib/circuit-breaker.ts` & `apps/api/src/lib/ssrf.ts`

## 1. Contexto & Problema
O nó `http` é a espinha dorsal de integrações com APIs externas. Ele precisa suportar todos os esquemas modernos de autenticação com injeção automática e proteger o sistema contra travamentos em cascata quando serviços externos estiverem fora do ar.

## 2. Objetivos & Especificação
1. **Suíte Completa de Autenticação HTTP:**
   - **Basic Auth:** Injeção automática de header `Authorization: Basic <base64>`.
   - **Bearer Token:** Header `Authorization: Bearer <token>`.
   - **API Key:** Injeção em Header (ex: `X-API-Key`, `api-key`) ou Query Parameter dinâmico.
   - **OAuth2 Auto-Injection:** Descriptografia de credencial do Vault e injeção transparente do `accessToken` atualizado.
   - **Digest Auth:** Negociação de desafio digest HTTP RFC 7616.
   - **Client Certificate / mTLS:** Suporte a certificados TLS de cliente (PFX / PEM) para APIs financeiras e corporativas.
2. **Circuit Breaker para Egress:**
   - Estados de operação:
     - `CLOSED`: tráfego normal.
     - `OPEN`: interrompe requisições para o host após 5 falhas consecutivas ou timeout de 10s, retornando erro imediato sem prender conexões.
     - `HALF-OPEN`: permite requisição de teste após período de cooldown (ex: 30s) para reavaliar a saúde do host.
3. **SSRF Guard & Segurança de Rede:**
   - Bloqueio estrito de IPs privados (RFC 1918), link-local (RFC 3927) e endpoints de metadados de nuvem (AWS/GCP/Azure).

## 3. Critérios de Aceite
- [ ] Nó HTTP realiza requisições utilizando com sucesso todos os 6 esquemas de autenticação.
- [ ] Host em colapso aciona abertura do Circuit Breaker e protege os workers de esgotamento de conexões.
- [ ] Tentativas de requisição para endereços de rede privada são rejeitadas pelo SSRF guard.
- [ ] Testes automatizados cobrindo todos os modos de autenticação e transições de estado do Circuit Breaker.
