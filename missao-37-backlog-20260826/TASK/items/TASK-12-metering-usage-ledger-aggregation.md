# TASK-12: Ledger Contábil de Medição & Agregação de Uso por Organização

- **Prioridade:** P1 (Contabilidade de Recursos & Billing)
- **Domínio:** Usage Metering / Billing Ledger / Accounting
- **Alvo:** `apps/api/src/services/metering.ts` & `apps/api/src/routes/usage.ts`

## 1. Contexto & Problema
Para faturamento de precisão e governança multi-tenant, é obrigatório registrar cada evento de consumo (tempo de CPU, execuções de nós, tokens de LLM e transferência de dados) em um ledger imutável agregado mensalmente.

## 2. Objetivos & Especificação
1. **Registro Atômico de Uso:**
   - Gravação de eventos na tabela `UsageEvent`: `orgId`, `workflowId`, `executionId`, `metricType` (`execution_count`, `execution_duration_ms`, `llm_prompt_tokens`, `llm_completion_tokens`, `storage_bytes`), `value`, `timestamp`.
2. **Agregação em Tempo Real & Histórica:**
   - Agrupamento mensal e diário com caching em Redis e consolidação em banco.
   - Endpoint `GET /api/organizations/:id/usage` com detalhamento por workflow e período.
3. **Garantia de Não-Falsificação:**
   - Registros do ledger assinados ou inseridos estritamente em transações isoladas.

## 3. Critérios de Aceite
- [ ] Execução de workflows grava eventos precisos de medição no ledger.
- [ ] Relatórios agregados de consumo calculam métricas mensais sem inconsistências.
- [ ] Testes unitários cobrindo agregação de tokens LLM e duração de execução.
