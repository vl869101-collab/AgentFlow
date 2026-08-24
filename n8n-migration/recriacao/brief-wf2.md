# Brief WF2 — My workflow (+ integração final)

Missão: EfqC5HPgSwto · Propósito: TESTE de paridade n8n → AgentFlow. YOLO autorizado pelo usuário — execute direto. NÃO faça commit.

## Parte 1 — Workflow "My workflow" (n8n id SkxlGdS2egKPhibM)
Recriar do zero no FORMATO NATIVO do AgentFlow. Sem converter.
- 1 node: **When fetching a dataset row** — `n8n-nodes-base.evaluationTrigger` v4.7 (trigger de avaliação; sem conexões, sem credenciais)
- Criar handler do tipo (arquivo novo seu), workflow no schema nativo, teste local manual, cobertura ≥80% no módulo novo.
- NÃO edite o registry compartilhado: APPEND sua seção em `n8n-migration/recriacao/registracoes-pendentes.md`.
- Refs: `n8n-migration/inventario.md` §2, `mcp-sdk-reference.md`, `design-recriacao.md`, `catalogo-nodes.md`.

## Parte 2 — Integração final (faça DEPOIS da Parte 1)
Os panes WF1 e WF3 trabalham em paralelo e vão APPENDar suas pendências de registro em `n8n-migration/recriacao/registracoes-pendentes.md`. Quando o arquivo tiver as 3 seções (wf1, wf2, wf3):
1. Aplique TODAS as linhas de registro no(s) arquivo(s) de registry do executor (`apps/api`)
2. Rode a suíte de testes completa dos apps afetados (ex.: `pnpm --filter api test`) + typecheck/lint se existirem
3. Corrija o que quebrar DENTRO do escopo desta missão

Se as seções dos outros ainda não estiverem lá, aguarde verificando o arquivo a cada ~60s (timeout 15 min; se estourar, registre no relatório e siga só com a sua parte).

## Entrega
- `n8n-migration/recriacao/wf2-resultado.md` (Parte 1)
- `n8n-migration/recriacao/relatorio-final.md` (Parte 2: registros aplicados, resultado da suíte, cobertura global dos módulos novos, pendências restantes)
