# TASK-09: Verificação Criptográfica de Webhooks HMAC Multi-Provedor

- **Prioridade:** P1 (Segurança de Ingestão & Integridade)
- **Status:** **DONE / APROVADO**
- **Arquivos Fonte:**
  - `apps/api/src/services/webhook-verifier.ts`
  - `apps/api/src/routes/webhooks.ts`
  - `apps/api/test/webhook-hmac-multi-provider.test.ts`
- **Commits Associados:** `cf5fef9`, `b3840bb`

---

## 1. Escopo & Implementação Técnica

1. **Verificação Especializada Multi-Provedor:**
   - **GitHub:** `X-Hub-Signature-256` (HMAC-SHA256), suporte com/sem prefixo `sha256=`, case-insensitive.
   - **Shopify:** `X-Shopify-Hmac-SHA256` (Base64 HMAC-SHA256), stripping de whitespace.
   - **Stripe:** `Stripe-Signature` (`t=<timestamp>,v1=<hex>`) com validação de payload `${timestamp}.${rawBody}`, tolerância temporal estrita de 5min ($\pm 300\text{s}$) e suporte a rotação com múltiplas assinaturas `v1`.
   - **Slack:** `X-Slack-Signature` (`v0=<hex>`) e `X-Slack-Request-Timestamp` com basestring `v0:${timestamp}:${rawBody}` e tolerância temporal de 5min contra replay attacks.
   - **Genérico:** Suporte a algoritmos `sha256`, `sha512` e `sha1` com digest em hex ou base64.
2. **Comparação Timing-Safe (`safeCompare`):**
   - Utilização de `crypto.timingSafeEqual` para comparação em tempo constante.
   - Execução de dummy comparison em caso de mismatch de tamanho de buffer para prevenir vazamento de tamanho por canal lateral (timing attack).
3. **Preservação de Raw Body:**
   - Captura e preservação do buffer raw exato no parser Fastify para cálculo fidedigno do digest criptográfico.
4. **Respostas e Códigos de Status Padronizados:**
   - Rejeição de assinaturas ausentes com `401 Unauthorized` e código `MISSING_SIGNATURE`.
   - Rejeição de assinaturas adulteradas com `401 Unauthorized` e código `INVALID_SIGNATURE`.
   - Rejeição de tentativas de replay com `401 Unauthorized` e código `REPLAY_ATTACK`.
   - Execuções válidas retornam `202 Accepted` com `executionId` (ou `200 OK` em caso de repetição idempotente com `IDEMPOTENT_REPLAY`).

---

## 2. Testes & Cobertura

- **Suíte de Testes:** `apps/api/test/webhook-hmac-multi-provider.test.ts`
- **Total de Testes:** 8/8 passando
- **Exit Code:** `0`
