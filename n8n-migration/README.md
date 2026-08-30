# Migração n8n → AgentFlow — README Central

> Objetivo: recriar IGUALZINHO os workflows do n8n cloud do usuário dentro do app AgentFlow.

## Status dos entregáveis

| # | Entregável | Arquivo | Status |
|---|-----------|---------|--------|
| 1 | Workflows exportados (3) | `workflows/*.json` | ✅ |
| 2 | Inventário | `inventario.md` | ✅ |
| 3 | Resumo | `resumo.md` | ✅ |
| 4 | Glossário | `glossario.md` | ✅ |
| 5 | Priorização P0-P3 | `priorizacao.md` | ✅ |
| 6 | Integrações existentes | `integracoes-existentes.md` | ✅ |
| 7 | Plano 7 horas | `plano-7h.md` | ✅ |
| 8 | Padrões e conformidade | `padroes-conformidade.md` | ✅ |
| 9 | Design do runner | `design-runner.md` | ✅ |
| 10 | Setup dev | `setup-dev.md` | ✅ |
| 11 | Guia webhooks + testes | `guia-webhooks.md` + `testes-webhooks/` | ✅ |
| 12 | Design da recriação | `design-recriacao.md` | ✅ |
| 13 | Design de testes | `design-testes.md` | ✅ |
| 14 | Deps e libs | `deps-e-libs.md` | ✅ |
| 15 | Referência n8n | `referencia-n8n.md` | ✅ |
| 16 | Catálogo de nodes | `catalogo-nodes.md` | ✅ |
| 17 | Design de segurança | `design-seguranca.md` | ✅ |
| 18 | API n8n | `api-n8n.md` | ✅ |
| 19 | Wireframes UI | `wireframes/` (5 páginas) | ✅ |
| 20 | Conversor | `converter/convert.ts` + exemplos | ✅ |
| 21 | Fixtures | `fixtures/` (5 cenários) | ✅ |
| 22 | Mapa do repo | `repo-map.md` | ✅ |
| 23 | README central | `README.md` | ✅ |
| — | **Recriar 3 workflows no AgentFlow** | apps/web + apps/api | ⏳ Builder |

## Ordem de leitura

1. `inventario.md` — o que existe no n8n (3 workflows)
2. `repo-map.md` — o que o AgentFlow já tem
3. `design-recriacao.md` — como encaixar
4. `catalogo-nodes.md` + `design-runner.md` — como executar
5. `priorizacao.md` + `plano-7h.md` — ordem e cronograma
6. `design-seguranca.md` — credenciais encriptadas
7. Demais docs conforme necessidade

## Fluxo

**Scout ✅ → Builder ⏳ → Reviewer** — comparar JSON node a node com os exports originais, testar webhooks locais (guia-webhooks.md).

## Checklist de aceite final

- [ ] 3 workflows recriados no AgentFlow com nodes/connections equivalentes
- [ ] JSON convertido via `converter/convert.ts` sem perda
- [ ] Execução local testada (trigger manual + webhook)
- [ ] Credenciais encriptadas (design-seguranca.md)
- [ ] Testes ≥ 80% cobertura (design-testes.md)