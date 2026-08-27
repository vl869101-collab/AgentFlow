# TASK-06: Sincronização Stripe Bidirecional, Ciclo de Vida de Planos & Quota Middleware

- **Prioridade:** P0 (Monetização & Governança)
- **Domínio:** Billing / Subscriptions / Quotas
- **Alvo:** `apps/api/src/routes/stripe-webhook.ts`, `apps/api/src/services/billing.ts`, `apps/api/src/lib/plans.ts`, `apps/api/src/services/metering.ts` & `apps/api/src/middlewares/quota.ts`
- **Status:** CONCLUÍDO

---

## 1. Contexto & Problema
É crítico sincronizar em tempo real eventos de assinatura Stripe (criação, upgrade, downgrade, cancelamento, inadimplência) com idempotência garantida e aplicar bloqueios automáticos de execução quando cotas do plano (Free, Starter, Basic, Growth, Pro, Enterprise) forem ultrapassadas ou houver inadimplência de assinatura.

---

## 2. Objetivos & Especificação Implementada

1. **Webhook Handler Stripe Idempotente e Assinado (`apps/api/src/services/billing.ts` & `apps/api/src/routes/stripe-webhook.ts`):**
   - Verificação criptográfica de assinatura de webhooks Stripe com tolerância a replay attack (`stripe.webhooks.constructEvent` com raw body e HMAC-SHA256).
   - Idempotência rigorosa de 7 dias via Redis SET NX / memory fallback (`checkAndSetWebhookIdempotency`) baseado no Stripe `event.id`, retornando status de replay idempotente sem reprocessar.
   - Tratamento de todos os eventos do ciclo de vida:
     - `checkout.session.completed`: ativação atômica de assinatura e upgrade de plano/limites da organização.
     - `customer.subscription.created` & `customer.subscription.updated`: sincronização bidirecional de status (`active`, `trialing`, `past_due`, `unpaid`, `canceled`), períodos de vigência e planos.
     - `customer.subscription.deleted`: cancelamento de assinatura e downgrade automático da organização para `FREE`.
     - `invoice.payment_succeeded`: renovação de status `active` e restauração do plano contratado.
     - `invoice.payment_failed`: transição para `past_due` com ativação de suspensão graciosa de workflows e alerta de auditoria.

2. **Definições Canônicas de Planos e Preços (`apps/api/src/lib/plans.ts`):**
   - Definição completa de todas as camadas de assinatura: `FREE`, `STARTER`, `BASIC`, `GROWTH`, `PRO`, `ENTERPRISE`.
   - Limites de execuções mensais, nós/chamadas de IA, workflows ativos, membros de equipe e concorrência máxima de execuções simultâneas.
   - Helpers: `limitsForPlan`, `getPlanConfig`, `planForPrice`, `getStripePriceIdForPlan`, `getStripeProductDefinitions`.

3. **Quota Enforcement Middleware & Suspensão Graciosa (`apps/api/src/services/metering.ts`, `apps/api/src/routes/webhooks.ts` & `apps/api/src/middlewares/quota.ts`):**
   - Interceptação de gatilhos manuais, API e webhooks antes da criação de execuções e do enfileiramento no BullMQ.
   - Verificação de suspensão graciosa: organizações com assinatura `past_due`, `unpaid` ou `canceled` têm execuções bloqueadas com retorno `402 Payment Required` (`PAYMENT_REQUIRED`), cabeçalho `X-Subscription-Status` e `X-Quota-Blocked: true`.
   - Verificação de limites mensais: organizações com cota estourada recebem `402 Payment Required / Quota Exceeded` (`QUOTA_EXCEEDED`) com cabeçalhos padronizados (`X-Quota-Limit`, `X-Quota-Used`, `X-Quota-Remaining`, `X-Quota-Reset`, `X-Plan-Tier`).
   - Verificação de concorrência: bloqueio com `402 CONCURRENCY_LIMIT_EXCEEDED` quando o número de execuções concorrentes atinge o teto do plano.
   - Registro de auditoria (`prisma.auditLog`) para eventos críticos de sincronização e degradação.

---

## 3. Arquivos Modificados / Criados

- `apps/api/src/lib/plans.ts`: Definições completas de planos (Free, Starter, Basic, Growth, Pro, Enterprise), limites e geradores de produtos Stripe.
- `apps/api/src/services/billing.ts`: Idempotência de eventos Stripe, sincronização atômica de planos e ciclo de vida, degradação graciosa e auditoria.
- `apps/api/src/services/metering.ts`: Enforçamento de cotas com retorno 402, verificação de concorrência, headers informativos e bloqueio por status de assinatura.
- `apps/api/src/routes/webhooks.ts`: Enforçamento de cota e bloqueio por suspensão em gatilhos de webhook externos antes do enfileiramento BullMQ.
- `apps/api/src/lib/store.ts`: Suporte a relações `workflow` em `webhook.findFirst/findUnique` e defaults no mock in-memory.
- `apps/api/tests/unit/billing-stripe.test.ts`: Suíte unitária focada para mapeamento de preços, planos, limites e catálogo Stripe.
- `apps/api/test/billing-observability.test.ts`: Suíte de integração cobrindo simulação de webhooks Stripe assinados, idempotência, ciclo de vida, bloqueio 402 por cota, concorrência e suspensão.
- `missao-37-fanout-20260826/TASK-06-billing-tier-limits-sync.md`: Relatório de execução e evidências.

---

## 4. Evidências de Aceite & Testes

### Execução da Suíte de Testes de Billing & Observability:
```text
TAP version 13
# [api] ALLOW_MEMORY_DB=1 — using the in-memory database
# Subtest: TASK-06: mapPriceToPlan correctly maps price IDs and metadata to tiers
ok 1 - TASK-06: mapPriceToPlan correctly maps price IDs and metadata to tiers
# Subtest: TASK-06: Stripe Webhook checkout.session.completed creates subscription and upgrades org plan
ok 2 - TASK-06: Stripe Webhook checkout.session.completed creates subscription and upgrades org plan
# Subtest: TASK-06: Stripe Webhook customer.subscription.updated and deleted lifecycle
ok 3 - TASK-06: Stripe Webhook customer.subscription.updated and deleted lifecycle
# Subtest: TASK-06: Invoice payment succeeded and payment failed events
ok 4 - TASK-06: Invoice payment succeeded and payment failed events
# Subtest: TASK-06: Quota middleware blocks execution with 402 when subscription is past_due or unpaid
ok 5 - TASK-06: Quota middleware blocks execution with 402 when subscription is past_due or unpaid
# Subtest: TASK-06: Signed Stripe Webhook signature verification and invalid signature rejection
ok 6 - TASK-06: Signed Stripe Webhook signature verification and invalid signature rejection
# Subtest: TASK-06: Stripe Webhook idempotency ignores replayed event ID
ok 7 - TASK-06: Stripe Webhook idempotency ignores replayed event ID
# Subtest: TASK-06: Monthly execution quota reached returns 402 with quota headers
ok 8 - TASK-06: Monthly execution quota reached returns 402 with quota headers
# Subtest: TASK-06: Concurrency limit reached returns 402 with concurrency headers
ok 9 - TASK-06: Concurrency limit reached returns 402 with concurrency headers
# Subtest: TASK-06: Webhook trigger route blocks execution with 402 when subscription is past_due
ok 10 - TASK-06: Webhook trigger route blocks execution with 402 when subscription is past_due
# Subtest: TASK-10: W3C Trace Context injection and extraction
ok 11 - TASK-10: W3C Trace Context injection and extraction
# Subtest: TASK-10: Hierarchical agentflow.node.<type> spans with standardized attributes and error recording
ok 12 - TASK-10: Hierarchical agentflow.node.<type> spans with standardized attributes and error recording
# Subtest: TASK-10: OTLP spans export representation and endpoints
ok 13 - TASK-10: OTLP spans export representation and endpoints
# Subtest: TASK-12: recordUsageEvent writes tamper-proof ledger entries with SHA256 signature
ok 14 - TASK-12: recordUsageEvent writes tamper-proof ledger entries with SHA256 signature
# Subtest: TASK-12: getOrgUsageBreakdown groups metrics by workflow and day
ok 15 - TASK-12: getOrgUsageBreakdown groups metrics by workflow and day
# Subtest: TASK-13: getTierRateLimit returns configured tier limits
ok 16 - TASK-13: getTierRateLimit returns configured tier limits
# Subtest: TASK-13: checkSlidingWindowRateLimit enforces accurate sliding window without boundary bursts
ok 17 - TASK-13: checkSlidingWindowRateLimit enforces accurate sliding window without boundary bursts
# Subtest: TASK-13: Rate limit headers and 429 response structure
ok 18 - TASK-13: Rate limit headers and 429 response structure
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4969.4995

Exit code: 0
```

### Typecheck (`pnpm --filter @agentflow/api typecheck`):
```text
> @agentflow/api@0.1.0 typecheck C:\Users\VICTOR\Downloads\Claude Code\AgentFlow\apps\api
> tsc --noEmit

Exit code: 0 (0 errors)
```
