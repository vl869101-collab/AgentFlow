# TASK-14: Suíte de Testes E2E de Carga a 100 RPS & Testes de Caos

- **Prioridade:** P1 (Qualidade & Resiliência de Carga)
- **Domínio:** QA / Performance / Chaos Engineering
- **Alvo:** `apps/api/test/load/`, `apps/api/test/chaos/` & scripts de teste

## 1. Contexto & Problema
O backend precisa suportar carga contínua de 100 RPS com latência p95 < 300ms e demonstrar resiliência diante de quedas de conexão do Redis, interrupções no banco ou reinícios abruptos de workers.

## 2. Objetivos & Especificação
1. **Suíte de Carga a 100 RPS:**
   - Cenários simulando disparos simultâneos de webhooks, invocações MCP e execuções de grafos complexos.
   - Validação de SLA de performance: p95 < 300ms, taxa de erro < 0.1%.
2. **Testes de Caos & Injeção de Falhas:**
   - Simulação de desconexão momentânea do Redis durante enfileiramento.
   - Simulação de timeout em chamadas de banco e recuperação automática do pool.
   - Simulação de término forçado de processos worker e retomada correta de jobs travados.

## 3. Critérios de Aceite
- [ ] Teste de carga de 100 RPS atinge meta de latência p95 < 300ms.
- [ ] Falhas transitórias de infraestrutura são tratadas sem corrupção de estado ou travamento definitivo.
- [ ] Relatório consolidado gerado automaticamente na suíte de testes.
