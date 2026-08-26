# TASK-03: Resiliência de Grafo — Nó ErrorTrigger & Subfluxos de Fallback

- **Prioridade:** P0 (Resiliência)
- **Domínio:** Error Handling / Graph Resilience
- **Alvo:** `apps/api/src/services/nodes/` & `apps/api/src/services/executor.ts`

## 1. Contexto & Problema
Falhas em nós de integração (ex: APIs instáveis, rate limits) não devem quebrar o pipeline silenciosamente. É necessário captura estruturada, retentativa configurável por nó e acionamento de subfluxos de erro.

## 2. Objetivos & Especificação
1. **Nó ErrorTrigger:**
   - Gatilho global ativado quando qualquer nó não-tratado falha no workflow.
   - Injeta contexto padronizado: `{ errorMessage, errorCode, failedNodeId, failedNodeType, timestamp, executionId, retryCount, inputData }`.
2. **Políticas onError por Nó:**
   - Opções configuráveis: `stop` (interrompe fluxo), `continueRegularOutput` (ignora erro e segue com payload nulo), `routeToErrorBranch` (desvia para porta de erro dedicada).
3. **Subfluxos de Notificação & Contingência:**
   - Roteamento garantido para canais de contingência (Slack, Teams, Webhook de alerta, Sentry) antes de finalizar o registro de execução.

## 3. Critérios de Aceite
- [ ] Erro em nó com `onError: routeToErrorBranch` desvia o fluxo sem falhar a execução geral.
- [ ] Falha fatal em workflow com `errorTrigger` aciona o subfluxo de recuperação e gera trace auditável.
- [ ] Testes unitários cobrindo todos os modos de tratamento de exceções em nós.
