# Handoff P2 — TASK-16 e TASK-17

## Entrega

- Microsoft Teams: mensagens, menções, webhooks e Adaptive Cards 1.5 via Microsoft Graph.
- WhatsApp Cloud API: texto, template, mídia, botões, localização e reação via Meta Graph.
- Google Calendar: criação, listagem, leitura, atualização, remoção e quick-add de eventos.
- Google Docs: criação, leitura, extração de texto, inserção, substituição e remoção de conteúdo.
- Os quatro handlers validam entradas com Zod, processam lotes no formato de nodes e resolvem OAuth no vault por organização, com refresh antes do uso.
- Chamadas externas usam `safeFetch`; mock explícito continua disponível para testes e desenvolvimento.

## Arquivos

- `apps/api/src/services/nodes/oauth.ts`
- `apps/api/src/services/nodes/teams.ts`
- `apps/api/src/services/nodes/whatsapp.ts`
- `apps/api/src/services/nodes/google-calendar.ts`
- `apps/api/src/services/nodes/google-docs.ts`
- `apps/api/test/nodes-p2-16-17.test.ts`

## Verificação

- `pnpm typecheck` — 6/6 tarefas concluídas em 5 pacotes.
- `pnpm --filter @agentflow/api exec tsx --test --test-concurrency=1 test/nodes-p2-16-17.test.ts` — 4/4 testes aprovados.
- `pnpm --filter @agentflow/api exec tsx --test --test-concurrency=1 test/mcp-nodes-sdk.test.ts` — 12/12 testes aprovados, incluindo TASK-16 e TASK-17.

## Observação operacional

Sem credencial/token e sem `mock` explícito, os handlers mantêm o fallback mock já esperado pelo projeto. Em produção, configure credenciais OAuth por organização no vault (ou os tokens de ambiente suportados por Google/WhatsApp).
