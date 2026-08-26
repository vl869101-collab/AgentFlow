# TASK-18: Contrato OpenAPI 3.1 & Geração Automatizada de SDK TypeScript/Zod

- **Prioridade:** P2 (Developer Experience & SDK)
- **Domínio:** API Architecture / SDK / Developer Tooling
- **Alvo:** `apps/api/src/docs/openapi.ts`, `packages/sdk/` & scripts de build

## 1. Contexto & Problema
Para consumo externo e integração com clientes frontend e agentes autônomos, o AgentFlow precisa de um contrato OpenAPI 3.1 estritamente tipado e um SDK cliente em TypeScript gerado automaticamente.

## 2. Objetivos & Especificação
1. **Contrato OpenAPI 3.1 Unificado:**
   - Geração dinâmica a partir dos schemas Zod de rotas e nós.
   - Especificação de todos os parâmetros, payloads de request, respostas de sucesso e respostas de erro estruturado.
2. **SDK TypeScript / Zod:**
   - Pacote `@agentflow/sdk` gerado com tipagem ponta a ponta e clientes HTTP baseados em fetch/ky.
   - Métodos fluentes para: autenticação, execução de workflows, listagem de execuções, gerenciamento de credenciais e cliente MCP.

## 3. Critérios de Aceite
- [ ] Endpoint `/api/docs/json` exporta especificação válida OpenAPI 3.1.
- [ ] Pacote `@agentflow/sdk` compila sem erros TypeScript e fornece autocompletion completo de métodos e tipos.
- [ ] Testes unitários validando chamadas de API via SDK gerado.
