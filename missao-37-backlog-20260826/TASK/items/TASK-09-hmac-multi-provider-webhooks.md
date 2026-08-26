# TASK-09: Verificação Criptográfica de Webhooks HMAC Multi-Provedor

- **Prioridade:** P1 (Segurança de Ingestão & Integridade)
- **Domínio:** Webhooks / Security / Ingestion
- **Alvo:** `apps/api/src/routes/webhooks.ts` & `apps/api/src/services/webhook-verifier.ts`

## 1. Contexto & Problema
Endpoints de webhook expostos publicamente sofrem riscos de falsificação e repetição. É indispensável verificar a assinatura criptográfica HMAC fornecida pelos provedores antes de processar o payload.

## 2. Objetivos & Especificação
1. **Verificação Especializada Multi-Provedor:**
   - **GitHub:** cabeçalho `X-Hub-Signature-256` (HMAC-SHA256).
   - **Shopify:** cabeçalho `X-Shopify-Hmac-SHA256` (Base64 HMAC-SHA256).
   - **Stripe:** cabeçalho `Stripe-Signature` (timestamp `t` + assinatura `v1` com tolerância temporal de 5min contra replay attacks).
   - **Slack:** cabeçalho `X-Slack-Signature` com versão `v0` e timestamp `X-Slack-Request-Timestamp`.
   - **Genérico:** suporte a HMAC-SHA256, HMAC-SHA512 e HMAC-SHA1 com segredo configurável.
2. **Comparação Timing-Safe:**
   - Uso obrigatório de `crypto.timingSafeEqual` para prevenir vulnerabilidades de timing attack.
3. **Preservação de Raw Body:**
   - Interceptor Fastify mantendo o buffer raw exato para cálculo fiel do digest criptográfico.

## 3. Critérios de Aceite
- [ ] Webhooks com assinaturas válidas de GitHub, Shopify, Stripe e Slack são aceitos e disparados no workflow.
- [ ] Assinaturas forjadas ou payloads alterados são sumariamente rejeitados com `401/403`.
- [ ] Replay attacks com timestamps antigos são bloqueados.
- [ ] Testes unitários com vetores de teste oficiais de cada provedor.
