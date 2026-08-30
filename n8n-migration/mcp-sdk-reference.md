# Referência MCP + Workflow SDK do n8n

> Documento de referência para a recriação dos workflows no AgentFlow.
> Fonte: exploração ao vivo da instância de origem via **n8n MCP Server** (2026-08-20).

## Status

| Item | Status |
|---|---|
| Conexão MCP com instância de origem | ✅ |
| Inventário da instância (workflows/credenciais) | ✅ |
| Captura do `get_workflow_sdk_reference` | ✅ |
| Taxonomia de best practices (17 técnicas) | ✅ |
| Amostra do catálogo de nodes (`search_nodes`/`get_node_types`) | ✅ |
| Prova de ponta a ponta (validate → create) | ✅ |

---

## 1. Acesso MCP à instância

- **Endpoint:** `POST https://victor11111.app.n8n.cloud/mcp-server/http`
- **Auth:** `Authorization: Bearer <MCP access token>` (token gerado em *Settings → Instance-level MCP*; distinto da API key pública `/api/v1`)
- **Transporte:** Streamable HTTP. Respostas chegam como **SSE** (`data: {json}` por linha).
  - ⚠️ PowerShell `Invoke-WebRequest` falha silenciosamente neste endpoint — usar **curl.exe** sempre.
- **Servidor:** "n8n MCP Server" v1.1.0, protocolo MCP `2025-03-26`, capabilities `tools` + `resources`.

### Ferramentas disponíveis (120+; principais agrupadas)

| Grupo | Ferramentas |
|---|---|
| Workflows | `search_workflows`, `execute_workflow`, `get_workflow_execution`, `search_workflow_executions`, `get_workflow_details`, `get_workflow_history`, `get_workflow_version`, `get_workflow_versions_diff`, `publish_workflow`, `unpublish_workflow`, `prepare_workflow_pin_data`, `test_workflow`, `archive_workflow`, `update_workflow` (ops atômicas), `restore_workflow_version` |
| Build pipeline | `get_workflow_sdk_reference`, `get_workflow_best_practices`, `search_nodes`, `get_node_types`, `explore_node_resources`, `validate_node_config`, `validate_workflow`, `create_workflow_from_code` |
| Infra | `list_credentials`, `list_n8n_connect_services`, `list_workflow_tags`, CRUD de data tables, CRUD de projects/folders |

### Estado da instância de origem

- 6 workflows, **todos inativos** (triggerCount 0): `My workflow` … `My workflow 5` (experimentos vazios) + template *Save Gmail Attachments to Google Drive*.
- 1 credencial: **Composio account** (`composioMcpOAuth2Api`, id `qsZKE6PVmZdrW11K`), projeto pessoal de Victor.

---

## 2. Workflow SDK — resumo operacional

O SDK (`@n8n/workflow-sdk`) é um **subconjunto restrito de TypeScript**: o código é interpretado por AST e vira um **grafo estático** — nada executa no build.

### Regras duras (validadas)

- ❌ Funções, loops, classes, `try/throw`, `await`, `new`, destructuring, reassinatura, member access computado.
- ✅ Apenas `const`; único `import` permitido é o do SDK; só `export default`.
- Globals bloqueados, exceto `JSON.stringify` e `.repeat/.trim`.
- **Todo node precisa de `output: [itens de exemplo]`.**
- Índices `.input(n)` / `.output(n)` são **0-based**.
- `expr('...')` usa aspas simples/duplas (**nunca backtick**); variáveis sempre dentro de `{{ }}`.
- `$json` = predecessor imediato apenas; upstream via `$('Node').item.json` ou `nodeJson(node,'path')`.

### Fábricas e encadeamento

- Fábricas: `workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch` + AI (`languageModel, memory, tool, outputParser, embedding(s), vectorStore, retriever, documentLoader, textSplitter, reranker`) + `fromAi()` + `expr()`.
- Métodos: `.add/.to/.group`, `.input(n)/.output(n)`, `.onTrue/.onFalse/.onCase(idx,n)/.onEachBatch/.onDone(nextBatch(sib))`, `.onError(handler)` (+ config `onError:'continueErrorOutput'`), `.connect`.

### Semântica de itens (armadilha principal)

- Encadeamento **multiplica itens** (N×M). Corrigir com `executeOnce:true` ou branches paralelos + `Merge` (`.input(0)/.input(1)`, mode `combine`/`combineByPosition`/`append`).
- Zero-itens: loops/filters viram no-op; **não** usar `alwaysOutputData` por padrão (footgun); não colocar IF antes de loop.
- Escolha de controle de fluxo:
  - loop por item c/ side effects → `splitInBatches(batchSize:1)` + `nextBatch`
  - descartar não-matching → filter
  - 2 caminhos exclusivos → `ifElse`
  - N caminhos → `switchCase` (`rules.values[]` com `outputKey` + `conditions{options,conditions,combinator}`)
- Inserir node no meio da cadeia **substitui o `$json` downstream** → nodes de escrita devem emitir a resposta da API, não o payload original.

### Guidelines de código/design

- `newCredential('Nome')` **somente** para credenciais (nunca ids falsos).
- Nomes descritivos; variáveis únicas; sem comentários (usar `sticky()`).
- Rastrear contagem de itens por aresta; convergência pós-branch com optional chaining `??` ou referência explícita.
- Preferir nodes de integração dedicados a HTTP Request genérico.
- Normalizar payload de webhook logo após o trigger (`$json.body?.x ?? $json.x ?? default`).
- Fan-out de side effects independentes com `onError: continueRegularOutput`.

---

## 3. Best practices — taxonomia (17 técnicas)

Documentadas (12): `scheduling`, `chatbot`, `form_input`, `scraping_and_research`, `triage`, `content_generation`, `document_processing`, `data_extraction`, `data_transformation`, `data_persistence`, `notification`, `web_app`.

Sem doc detalhada ainda (5): `monitoring`, `enrichment`, `data_analysis`, `knowledge_base`, `human_in_the_loop`.

Cada técnica tem guia próprio via `get_workflow_best_practices({ technique })` — consultar antes de desenhar cada workflow do AgentFlow.

---

## 4. Catálogo de nodes (amostra)

Exemplo da família Gmail (ver `%TEMP%\opencode\nodes-sample.md` para o dump completo):

- `n8n-nodes-base.gmail` **v2.2** — discriminadores `resource` (message|label|draft|thread) × `operation` (send, sendAndWait, get, getAll, reply, markAsRead, …).
- Variantes: `gmailTool` (AI tool), `gmailHitlTool` (aprovação humana), `gmailTrigger` **v1.4** `[TRIGGER]` polling.
- O campo `@relatedNodes` das defs orienta a escolha do trigger correto.
- `get_node_types({nodeIds:[{nodeId,resource,operation}]})` devolve a definição TS exata dos parâmetros — usar antes de montar qualquer config.

---

## 5. Prova de ponta a ponta

Pipeline validado na instância:

1. `validate_workflow` → `{valid:true, nodeCount:3}`
2. `create_workflow_from_code` → workflow **AgentFlow Reference Demo**
   - id `iY4oFbjh8Df5vMUF` · https://victor11111.app.n8n.cloud/workflow/iY4oFbjh8Df5vMUF
   - Manual Trigger → HTTP Request (GET jsonplaceholder todo) → Set "Build Summary" (expr)
- Nota: nodes HTTP Request são ignorados na auto-atribuição de credenciais.

Payloads reutilizáveis: `%TEMP%\opencode\mcp-validate.json` / `mcp-create.json`.

---

## 6. Implicações para o AgentFlow

1. **Paridade de modelo**: grafo estático de nodes com sample outputs por node = mesmo contrato que o `convert.ts` já assume nos fixtures.
2. **Validação antes de persistir**: espelhar o par validate→create (API do AgentFlow deve validar o JSON convertido antes de salvar).
3. **Semântica de itens** (multiplicação, zero-itens, `$json` = predecessor imediato) deve estar documentada no design-runner para que a execução local reproduza o comportamento do n8n.
4. **Best practices por técnica** podem virar templates/checklists no AgentFlow (12 técnicas documentadas já cobrem os 3 workflows alvo).
