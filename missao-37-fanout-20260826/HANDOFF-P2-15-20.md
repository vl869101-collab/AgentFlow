# HANDOFF — P2 TASK-15 + TASK-20

**Data:** 2026-08-29  
**Status:** DONE no escopo; typecheck e testes focados verdes

## TASK-15 — workflow snapshots e diff

- Cada gravação do canvas persiste um `WorkflowVersion` imutável e devolve `version`/`versionId`.
- Contratos Zod validam versão, diff e rollback, preservando os aliases legados `v1`/`v2` e `version`.
- API expõe histórico, snapshot individual, diff semântico e rollback, sempre com isolamento por organização.
- O diff detecta nós/edges adicionados, removidos e alterados, incluindo dimensões, handles e rewiring por ID estável.
- O editor web ganhou um painel acessível de versões com seleção `from/to`, resumo visual e lista de mudanças.

## TASK-20 — audit ledger append-only

- Eventos de workflow e execução são anexados ao ledger SHA-256 encadeado; não há rotas de update/delete.
- Metadados não podem injetar campos internos de hash, timestamps são monotônicos e escritas concorrentes por organização preservam uma única cadeia no processo.
- Listagem, verificação de integridade e export assinado usam o mesmo formato normalizado.
- Contratos Zod validam criação, filtros e intervalo de exportação.
- `ponytail`: o lock é por processo; múltiplas réplicas devem trocar isso por advisory lock/transação serializável no banco.

## Evidência

```text
pnpm typecheck
exit 0 — 6/6 tasks successful

pnpm --filter @agentflow/api exec tsx --test --test-concurrency=1 --test-name-pattern "TASK-15" test/executor-queue-group.test.ts
exit 0 — 3/3 tests passed

pnpm --filter @agentflow/api exec tsx --test --test-concurrency=1 --test-name-pattern "TASK-20" test/auth-vault-mission37.test.ts
exit 0 — 6/6 tests passed
```

Uma execução combinada sem filtro encontrou somente uma falha fora deste escopo em `TASK-19: reencryptVaultCredentials` (`0 !== 1`); TASK-15 e TASK-20 passaram nessa mesma execução após a correção do fallback de identidade de edges.
