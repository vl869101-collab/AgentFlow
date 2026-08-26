# TASK-08: Arquitetura Completa MCP Server & Client com RBAC Granular por Ferramenta

- **Prioridade:** P1 (Protocolo Model Context Protocol & Segurança)
- **Domínio:** MCP Protocol / Agents / Security
- **Alvo:** `apps/api/src/mcp/`, `apps/api/src/routes/mcp.ts` & `apps/api/src/services/nodes/mcp-client.ts`

## 1. Contexto & Problema
O AgentFlow opera como hub central para agentes de IA. Ele precisa atuar tanto como **MCP Server** (expondo workflows, credenciais e ferramentas para LLMs via JSON-RPC 2.0 e SSE) quanto como **MCP Client** (permitindo que workflows consumam servidores MCP remotos com RBAC fino e validação de escopos).

## 2. Objetivos & Especificação
1. **Servidor MCP Completo (JSON-RPC 2.0 & SSE):**
   - Endpoints `POST /api/mcp` e streaming `GET /api/mcp/sse`.
   - Handlers canônicos: `initialize` (capabilities, protocolVersion 2024-11-05), `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`.
   - Suporte a 125+ ferramentas prontas mapeadas para ações de nós do AgentFlow.
2. **Nó MCP Client (Consumo Remoto):**
   - Handler `mcpClient` que se conecta a servidores MCP remotos via HTTP/SSE ou STDIO.
   - Descoberta dinâmica de ferramentas remotas e invocação parametrizada com tipagem Zod.
3. **RBAC Fino & Validação de Escopos:**
   - Definição estrita de escopos por ferramenta: `workflow:read`, `workflow:execute`, `vault:decrypt`, `tools:call`, `admin:queues`.
   - Validação em tempo de execução das permissões do token (JWT/API Key).
   - Retorno padronizado de erro JSON-RPC `-32003 (Forbidden / Insufficient Scopes)` em caso de falta de permissão.

## 3. Critérios de Aceite
- [ ] Handshake MCP retorna capacidades e versão do protocolo 2024-11-05 conforme especificação.
- [ ] Invocação de ferramentas valida escopos e rejeita requisições não autorizadas com código -32003.
- [ ] Nó MCP Client conecta a servidores externos e executa chamadas de ferramentas repassando dados estruturados.
- [ ] Suporte a transporte SSE bidirecional e requisições HTTP stateless.
- [ ] Cobertura de testes unitários e de integração cobrindo MCP Server, Client e RBAC.
