# TASK-15: Versionamento Semântico e Diff Visual de Workflows

- **Prioridade:** P2 (Developer Experience & Versioning)
- **Domínio:** Workflow Engine / Version Control / Diffing
- **Alvo:** `apps/api/src/services/workflow-diff.ts` & `apps/api/src/routes/workflows.ts`

## 1. Contexto & Problema
Equipes colaborativas precisam visualizar alterações estruturais entre versões de um mesmo workflow antes de publicar em produção (nós adicionados, removidos, alterados, conexões modificadas).

## 2. Objetivos & Especificação
1. **Algoritmo de Diff Semântico:**
   - Comparação profunda entre duas versões de workflow (JSON do grafo).
   - Identificação de entidades:
     - `nodesAdded`, `nodesRemoved`, `nodesModified` (mudanças de parâmetros/credenciais).
     - `edgesAdded`, `edgesRemoved`, `edgesModified`.
2. **Endpoint de Diff:**
   - `GET /api/workflows/:id/diff?fromVersion=v1&toVersion=v2` retornando payload estruturado para renderização no canvas.
3. **Rollback Seguro de Versão:**
   - Rota para restauração instantânea de versão anterior mantendo snapshot histórico.

## 3. Critérios de Aceite
- [ ] Diff semântico aponta precisamente nós alterados, conexões refeitas e parâmetros editados.
- [ ] Rollback restaura o estado exato da versão desejada.
- [ ] Testes unitários com grafos divergentes validando o cálculo do diff.
