# TASK-06: Sincronização Stripe Bidirecional, Ciclo de Vida de Planos & Quota Middleware

- **Prioridade:** P0 (Monetização & Governança)
- **Domínio:** Billing / Subscriptions / Quotas
- **Alvo:** `apps/api/src/routes/stripe-webhook.ts`, `apps/api/src/services/billing.ts` & `apps/api/src/middlewares/quota.ts`

## 1. Contexto & Problema
É crítico sincronizar em tempo real eventos de assinatura Stripe (criação, upgrade, downgrade, cancelamento, inadimplência) e aplicar bloqueios automáticos de execução quando cotas do plano (Free, Pro, Enterprise) forem ultrapassadas.

## 2. Objetivos & Especificação
1. **Webhook Handler Stripe Idempotente:**
   - Trata eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
   - Atualização atômica de plano e status da organização (`active`, `past_due`, `canceled`).
2. **Quota Enforcement Middleware:**
   - Intercepta gatilhos e execuções verificando limites do plano atual (número de execuções mensais, nós de IA, conexões simultâneas).
   - Retorna `402 Payment Required / Quota Exceeded` com cabeçalhos claros de limite.
3. **Degradação Graciosa:**
   - Em caso de cancelamento/inadimplência, suspende execução de workflows não-críticos e alerta no painel de administração.

## 3. Critérios de Aceite
- [ ] Eventos do Stripe alteram status de plano e limites da organização no banco em tempo real.
- [ ] Organizações sem cota disponível recebem 402 e têm execuções bloqueadas antes da fila do BullMQ.
- [ ] Testes unitários com simulação de webhooks Stripe assinados e cenários de limite de cota.
