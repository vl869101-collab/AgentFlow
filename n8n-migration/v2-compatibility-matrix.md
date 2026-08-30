# Matriz de Compatibilidade n8n → AgentFlow v2

> **Missão**: Recriar n8n no AgentFlow  
> **Work dir**: `n8n-migration/`  
> **Papel**: Pane MATRIZ DE COMPATIBILIDADE  
> **Data**: 2026-08-19  
> **Fontes**: `v2-security-spec.md`, `referencia-n8n.md`, `api-n8n.md`, `catalogo-nodes.md`, `inventario.md`

---

## Índice

1. [JSON Import/Export](#1-json-importexport)
2. [Expressions Engine](#2-expressions-engine)
3. [Credentials](#3-credentials)
4. [Node Versions & Catalogo](#4-node-versions--catálogo)
5. [Webhooks](#5-webhooks)
6. [Executions](#6-executions)
7. [Community Nodes](#7-community-nodes)
8. [Sumário de Gaps Críticos](#8-sumário-de-gaps-críticos)

---

## 1. JSON Import/Export

### Matriz de Campo

| Campo / Feature | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|----------------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| `name` (workflow) | string ✅ | API propõe `name` no POST/PUT (api-n8n.md §2, §4) | 🔴 Crítica | api-n8n.md §2-4: "Equivalente AgentFlow (proposto): POST /api/v1/workflows" | Baixo | Mapear direto no schema Prisma | Round-trip: importar workflow e validar campo name |
| `nodes[]` | array ✅ | `nodes: Node[]` no WorkflowCreate (api-n8n.md §3) | 🔴 Crítica | api-n8n.md §3 interface WorkflowCreate | Baixo | Parser zod para Node[] | Comparar nodes originais vs parseados campo a campo |
| `connections{}` | object ✅ | `connections: Record<string, Connection>` (api-n8n.md §3) | 🔴 Crítica | api-n8n.md §3 | Baixo | Serializar estrutura nested `connections["Source"]["main"][][]` | Validar estrutura nested (output ports, input index, fan-out) |
| `settings` | object ❌ | `settings: WorkflowSettings` no POST (api-n8n.md §3) | 🔴 Crítica | api-n8n.md §3; referencia-n8n §1.3 | Médio | Mapear fields conhecidos: executionOrder, saveManualExecutions, executionTimeout, timezone, errorWorkflow, callerPolicy | Testar cada field de settings (6 campos documentados) |
| `id` (workflow) | string ❌ | `id: string` no response (api-n8n.md §2) | 🟡 Alta | api-n8n.md §2: `id` no response | Baixo | Regenerar UUID no AgentFlow (n8n também pode regenerar) | Verificar que import preserva workflow funcional mesmo sem id original |
| `versionId` | string ❌ | `versionId: string` no response (api-n8n.md §2) | 🟡 Alta | api-n8n.md §2; inventario.md mostra versão com counter | Médio | Mapear para controle de versão interno; inventario mostra formatos diferentes (UUID vs counter) | Verificar version locking: PUT com versionId deve funcionar |
| `active` | boolean ❌ | `active: boolean` no PUT (api-n8n.md §4) + publish/unpublish (§5, §6) | 🔴 Crítica | api-n8n.md §2, §4-6 | Baixo | `active` via PUT; publish/unpublish como endpoints separados | Ativar/desativar e validar estado ativo reflete no GET |
| `tags[]` | array ❌ | `tags: []` no response (api-n8n.md §2) | 🟢 Média | api-n8n.io §2 | Baixo | Mapear como JSON/array no DB | Import com tags, validar listagem filtrada por tags |
| `createdAt/updatedAt` | ISO8601 ❌ | timestamps no response (api-n8n.md §2) | 🟢 Média | api-n8n.io §2 | Baixo | Gerenciar pelo Prisma (`@@updatedAt`) | Validar timestamps preenchidos automaticamente |
| `meta` | object ❌ | `meta: WorkflowMeta` no response (api-n8n.io §2) | 🟢 Média | api-n8n.io §2; referencia-n8n §1.4 | Baixo | Preservar como JSON opaco | Verificar campos meta do inventario (templateId, instanceId) |
| `staticData` | object/null ❌ | `staticData: Record<string, any> \| null` (api-n8n.io §2) | 🟡 Alta | api-n8n.io §2 | Médio | Preservar como JSON opaco; sem docs de uso no v2-security-spec | Testar staticData null vs object; validar persistência entre execuções |
| `pinData` | object ❌ | `pinData: Record<string, any> \| null` (api-n8n.io §2) | 🟡 Alta | api-n8n.io §2; referencia-n8n §1.5 (dados fixados para testes) | Médio | Preservar como JSON; usar no modo de teste do executor | Import com pinData, executar, validar que nó downstream recebe dados fixados |
| `description` | string ❌ | `description?: string` (api-n8n.io §2) | 🟢 Média | api-n8n.io §2 interface Workflow | Baixo | Campo opcional no schema | Verificar campo description nos workflows exportados |
| `isArchived` | boolean ❌ | `isArchived: boolean` (api-n8n.io §2) | 🟢 Média | api-n8n.io §2 | Baixo | Campo booleano no schema | Verificar arquivamento/reflag |
| `parentFolderId` | string ❌ | `parentFolderId?: string \| null` (api-n8n.io §3) | 🟢 Média | api-n8n.io §3 | Baixo | Campo opcional | Testar workflows organizados em pastas |
| `triggerCount` | number ❌ | `triggerCount: number` (api-n8n.io §2) | 🟢 Média | api-n8n.io §2 | Baixo | Derivado: contar trigger nodes no parse | Validar contagem após import |
| **Endpoint POST /import** | `POST /api/v1/workflows/import` (aceita JSON completo) | Não documentado em api-n8n.md | 🔴 Crítica | api-n8n.io: "O import aceita o JSON completo exportado" | Alto | **GAP**: n8n tem endpoint `/import` dedicado. AgentFlow documenta apenas `POST /api/v1/workflows` | Testar import de JSON exportado real via POST /workflows; validar regeneração de IDs |
| **Endpoint GET (list)** | `GET /api/v1/workflows?limit&cursor` | `GET /api/v1/workflows` com `limit, cursor, ...` (api-n8n.io §1) | 🔴 Crítica | api-n8n.io §1: "Equivalente AgentFlow" | Baixo | Mapear query params: limit, cursor, active, tags, name, projectId, excludePinnedData | Listar workflows filtrados e validar paginação |
| **Endpoint GET (single)** | `GET /api/v1/workflows/{id}?excludePinnedData` | `GET /api/v1/workflows/{id}` (api-n8n.io §2) | 🔴 Crítica | api-n8n.io §2 | Baixo | Mapear query param excludePinnedData | Obter workflow por ID e validar pinData excluído quando solicitado |
| **Endpoint PUT (update)** | `PUT /api/v1/workflows/{id}?publishIfActive` | `PUT /api/v1/workflows/{id}` (api-n8n.io §4) | 🔴 Crítica | api-n8n.io §4 | Médio | **GAP**: n8n tem `publishIfActive`. AgentFlow não documenta. | PUT sem publishIfActive e validar comportamento |
| **Endpoint POST /run** | `POST /api/v1/workflows/{id}/run` com `data, startNodes, runOptions` | `POST /api/v1/workflows/{id}/run` (api-n8n.io §7) | 🔴 Crítica | api-n8n.io §7 | Médio | Mapear `data`, `startNodes`, `runOptions` | Executar workflow via API com dados de entrada |
| **Endpoint DELETE** | `DELETE /api/v1/workflows/{id}` | `DELETE /api/v1/workflows/{id}` (api-n8n.io §8) | 🔴 Crítica | api-n8n.io §8 | Baixo | Direto | Deletar e validar 200 + recurso removido |
| **Formato de resposta** | `{ data: [...], nextCursor: string }` | `{ data: [...], nextCursor: string }` (api-n8n.io §1) | 🔴 Crítica | api-n8n.io §"Formato Base de Resposta" | Baixo | Wrapper idêntico documentado | Validar wrapper em todas as listagens |

### Análise de JSON Import/Export

**Status**: PARCIALMENTE COMPATÍVEL.

A API REST proposta no `api-n8n.md` cobre 8 dos 11 endpoints de workflow (equivalentes diretos), mas **não documenta** o endpoint `/import` dedicado (n8n §7.6) nem o `publishIfActive` (n8n §4 query param). O `catalogo-nodes.md` §"Próximos Passos para Builder" #1 afirma que o parser/serializer ainda precisa ser criado ("Builder pode usar esta referência para implementar o parser/serializer de workflow JSON").

Os campos essenciais (`name`, `nodes`, `connections`, `active`) são documentados como equivalentes (api-n8n.md §6.1). Campos opcionais como `staticData`, `pinData`, `meta` têm tipos no schema TS mas **não há comportamento definido** para persistência entre execuções ou uso no modo de teste.

---

## 2. Expressions Engine

### Matriz de Expression Patterns

| Pattern / Variável | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|-------------------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| `{{ $json.campo }}` | ✅ Substituição simples | ✅ `catalogo-nodes.md §"Expression Engine"`: lista explicitamente `{{ $json.path.to.value }}` | 🔴 Crítica | catalogo-nodes.md §Expression Engine (Subset n8n) | Baixo | Implementar no ExpressionEngine.evaluate() | Testar nested path: `{{ $json.user.name }}` |
| `{{= expressão JS }}` | ✅ Avaliação full JS (ex: `{{= $json.idade * 2 }}`) | ✅ Proposto no ExpressionEngine; handlers usam `new Function()` (catalogo-nodes.md §§9-13) | 🔴 Crítica | catalogo-nodes.md §Expression Engine: `{{= expressão JS }}`; código dos handlers | Alto | **ALERTA**: handlers usam `new Function()` sem sandbox — risco de injeção (v2-security-spec §S9 recomenda isolate-vm para Code node, mas expressions não têm sandbox definido) | Testar expressões JS complexas; validar sandboxing |
| `{{ $json.campo.toUpperCase() }}` | ✅ Method chaining suportado | ❌ Não listado no subset | 🟡 Alta | catalogo-nodes.md §Expression Engine lista apenas patterns lineares, não method calls | Alto | Gap: o subset não suporta method chaining | Testar `.toUpperCase()`, `.length` em expressions |
| `{{ $query.param }}` | ✅ Query params no webhook | ✅ Listado no subset (catalogo-nodes.md) | 🟡 Média | catalogo-nodes.md §1 (Webhook): `{{ $query }}` mencionado; §Expression Engine lista `{{ $query.param }}` | Baixo | Mapear do triggerData.query | Testar query params em webhook de entrada |
| `{{ $header.name }}` | ✅ Headers HTTP | ✅ Listado no subset (catalogo-nodes.md) | 🟡 Média | catalogo-nodes.md §Expression Engine: `{{ $header.name }}` | Baixo | Mapear do triggerData.headers | Testar headers customizados |
| `{{ $now }}` | ✅ Data atual | ✅ Listado no subset (catalogo-nodes.md) | 🟢 Média | catalogo-nodes.md §Expression Engine | Baixo | `new Date()` no contexto | Testar formato ISO8601 |
| `{{ $parameter.name }}` | ✅ Parâmetros do nó | ✅ Listado no subset (catalogo-nodes.md) | 🟢 Média | catalogo-nodes.md §Expression Engine | Baixo | Mapear do nodeConfig.parameters | Testar acesso a parâmetros do nó |
| `{{ $credentials.name }}` | ✅ Credenciais resolvidas | ✅ Listado no subset (catalogo-nodes.md) | 🟡 Alta | catalogo-nodes.md §Expression Engine: `{{ $credentials.name }}`; §5.3 v2-security-spec: credenciais referenciadas por nome | Médio | Resolvido do vault apenas no runner (v2-security-spec §5.3) | Testar credential reference resolution em expression |
| `{{ $workflow.id }}` | ✅ Metadados do workflow | ✅ Listado no subset (catalogo-nodes.md) | 🟢 Média | catalogo-nodes.md §Expression Engine: `{{ $workflow.id }}` | Baixo | Mapear do contexto workflowId | Testar acesso a ID do workflow |
| `$helpers.request()` | ✅ Helper HTTP integrado | ❌ Não listado no subset; v2-security-spec §S9 bloqueia rede no Code node | 🔴 Crítica | catalogo-nodes.md §2.7: `$helpers` incluído; mas v2-security-spec §S8 impõe proxy egress + allowlist | Alto | **GAP CRÍTICO**: n8n permite `$helpers.request()` de dentro de expressions. AgentFlow v2 exige saída via proxy egress (§8) com allowlist. Chamadas diretas deveriam ser bloqueadas ou redirecionadas pelo proxy. | Testar `$helpers.request()` e validar SSRF guard |
| `$input.all()` / `$input.first()` | ✅ Acesso a items de input | ❌ Não listado como expression pattern (é usado no Code node, não em expressions inline) | 🟢 Média | referencia-n8n.md §2.7; catalogo-nodes.md §6 (Code node usa `$input`) | Baixo | Disponível no Code node sandbox (catalogo §6) | Testar em Code node context |
| `$node`, `$workflow` (objeto completo) | ✅ Metadados ricos (name, type, etc.) | ❌ Apenas `$workflow.id` listado no subset | 🟢 Média | referencia-n8n.md §2.7: `$node - Metadados do nó`; catalogo-nodes.md §Expression Engine: apenas `$workflow.id` | Médio | Gap parcial: $node não documentado no AgentFlow | Testar acesso a $node em expressions |
| **Function call `.includes()`, `.split()`** | ✅ String methods funcionam | ❌ Regex substituição não suporta methods | 🟡 Alta | catalogo-nodes.md §§9-13 handlers usam regex `\{\{\s*\$(\w+)\.(\w+)\s*\}\}` — não suporta chained methods | Alto | Gap: regex-based evaluation não suporta JavaScript real em expressions simples | Testar `.includes()`, `.split()` em expressions de IF/Set nodes |

### Análise de Expressions Engine

**Status**: PARCIALMENTE COMPATÍVEL (subset).

O `catalogo-nodes.md` §"Expression Engine (Subset n8n)" define explicitamente um **subset** compatível. Os patterns listados são: `{{ $json.path.to.value }}`, `{{ $query.param }}`, `{{ $header.name }}`, `{{ $now }}`, `{{ $parameter.name }}`, `{{ $credentials.name }}`, `{{ $workflow.id }}`, `{{= expressão JS }}`.

**Gaps identificados**:
1. Method chaining (`.toUpperCase()`, `.length`) **não** suportado pelo regex-based evaluator nos handlers — todos os handlers de expression usam regex simples que não captura method calls.
2. `$helpers.request()` — disponível no n8n mas no AgentFlow o Code node tem zero acesso à rede (v2-security-spec §S9). Expressions que fazem chamadas HTTP precisam de roteamento pelo proxy egress.
3. `$node` e `$workflow` (objeto completo) — o subset apenas suporta `$workflow.id`, não o objeto rico.
4. **Risco de segurança**: os handlers usam `new Function()` para `{{= expressão JS }}` sem isolamento — embora o Code node use vm2/isolate-vm (v2-security-spec §6.4), as expressions inline não têm sandbox definido.

---

## 3. Credentials

### Matriz de Credential Types e Security

| Feature | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|---------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| **Referência no JSON** | Por nome: `"httpBasicAuth": "My Credential"` | Por nome no import/export (v2-security-spec §5.3); por ID no DB | 🔴 Crítica | referencia-n8n.md §4: `"credentials": { "credType": "credName" }`; v2-security-spec §5.3: "credenciais referenciadas por nome" | Baixo | Name-based reference preserved; mapear nome → UUID interno | Importar workflow com credential ref, validar resolução |
| **Armazenamento** | Encrypted em DB (`data: { accessToken: "encrypted:..." }`) | Envelope encryption: DEK por tenant AES-256-GCM, KEK fora do DB (env/KMS) (v2-security-spec §5.1) | 🔴 Crítica | referencia-n8n.md §4.4; v2-security-spec §5.1-5.2 | Médio | **INCOMPATIBILIDADE DE FORMATO**: n8n usa formatos próprios de encrypt. AgentFlow usa envelope AES-256-GCM com DEK por tenant. Migração requer decrypt n8n → re-encrypt AgentFlow. | Teste round-trip encrypt/decrypt; teste migração de credencial existente |
| **API nunca retorna valor** | ❌ API retorna `data` com encrypted values em endpoints | ✅ API retorna apenas `{ hasValue: { apiKey: true } }` (v2-security-spec §5.4, §5.6) | 🔴 Crítica | v2-security-spec §5.4: "API: get() sem valores"; §5.6: "nunca o valor"; referencia-n8n §4.4 mostra `data` no DB | Baixo | AgentFlow é mais restritivo — safe by design. n8n clients esperando `data` precisam adaptar. | Validar que GET /credentials não retorna valores |
| **Resolução no runner** | Descriptografa no processo (com risco, v2-security-spec §0.1 critica) | Descriptografa SOMENTE no executor com auditoria (v2-security-spec §5.1, §5.3) | 🔴 Crítica | v2-security-spec §5.1: "DEK por tenant"; §5.3: "Resolução ocorre somente no runner, no momento da execução, com auditoria" | Baixo | Hardening: AgentFlow resolvi no runner, não na API | Teste de execução: validar credential decrypt no runner |
| **Permissão decrypt** | Todos que têm acesso à credencial veem valor | `credential:decrypt` só para owner/admin (v2-security-spec §4.1, §5.6) | 🔴 Crítica | v2-security-spec §4.1: viewer "ver (hasValue, nunca valor)"; §5.6 tabela; §5.6: "revelar exige permissão credential:decrypt" | Médio | AgentFlow mais restritivo. n8n editors podem ver valores — AgentFlow não. | Testar permissão decrypt por role |
| **Tipos de credencial** | httpBasicAuth, httpHeaderAuth, oAuth1Api, oAuth2Api, digestAuth, googleOAuth2Api, gmailOAuth2Api, openAiApi, telegramApi | Tipos mapeados no `type` do CredentialMeta (v2-security-spec §5.6: `type: string`); handlers resolvem por tipo (catalogo-nodes §2.3, §11.3, etc.) | 🔴 Crítica | referencia-n8n.md §4.2 (exemplos por tipo); v2-security-spec §5.6: `CredentialMeta.type`; catalogo-nodes §4.3 | Alto | **GAP**: n8n tem dezenas de tipos de credencial built-in + community. AgentFlow documenta tipos específicos nos handlers (httpBasicAuth, googleOAuth2Api, gmailOAuth2Api, openAiApi, telegramApi) mas não há catálogo completo. Tipos n8n não mapeados falham. | Listar credential types do inventario (gmailOAuth2Api, googleDriveOAuth2Api, IMAP) e validar cobertura no catalogo |
| **Teste conexão** | ✅ Disponível via UI/API | ✅ `testConnection()` sem vazar segredo (v2-security-spec §5.5) | 🟡 Alta | v2-security-spec §5.5: "Teste de Conexão Sem Vazar Segredo"; "resultado exposto: { ok, latencyMs, errorClass }" | Médio | AgentFlow mais seguro: não expõe mensagem crua do provedor | Testar connection test e validar sanitized output |
| **Rotação de segredo** | ❌ Sem rotação nativa na comunidade | ✅ `POST /credentials/:id/rotate-secret` (v2-security-spec §5.6) | 🟡 Alta | v2-security-spec §5.6: "Rotação de segredo de credencial individual" | Baixo | AgentFlow tem feature não existente no n8n comunidade | Teste rotação de API key |
| **Rotação de KEK/DEK** | ❌ Sem rotação de chave | ✅ Job `credential:rotate` agendado, dual-write (v2-security-spec §5.6) | 🟡 Alta | v2-security-spec §5.6: "Rotação de DEK/KEK (agendada, default 90 dias)" | Baixo | Hardening extra | Teste rotação agendada |
| **Revogação** | ❌ Não documentado | ✅ `revoke()` marca `revokedAt`, runner recusa decrypt (v2-security-spec §5.6) | 🟡 Alta | v2-security-spec §5.6: "Revogação: revoke marca revokedAt; runner recusa decrypt" | Baixo | Hardening extra | Teste revogação de credential |
| **Credenciais do inventário** | Gmail OAuth2 API, Google Drive OAuth2 API, IMAP Email | Gmail OAuth2 (handler gmail.ts), Google Drive (NÃO no catalogo), IMAP (NÃO no catalogo) | 🔴 Crítica | inventario.md §"Credenciais Utilizadas": 3 credenciais; catalogo-nodes.md lista 16 nodes mas googleDrive e emailReadImap não estão | Alto | **GAP CRÍTICO**: 2 de 3 credenciais do inventário mapeiam para nodes não documentados (googleDrive, emailReadImap). gmail está no catalogo mas com type v1.2 vs v2.2 no inventario. | Mapear credentials do inventario aos handlers existentes |

### Análise de Credentials

**Status**: PARCIALMENTE COMPATÍVEL + HARDENING.

AgentFlow implementa um modelo de credenciais **mais seguro** que n8n comunidade: envelope encryption por tenant, permissão `decrypt` restrita, teste de conexão sem vazamento. Mas há **gaps críticos de tipo**:

- `googleDrive OAuth2 API` (do inventário) — **nenhum handler documentado** em `catalogo-nodes.md`.
- `IMAP Email` (do inventário) — **nenhum handler documentado**.
- `gmailOAuth2Api` está no catalogo (GmailNodeHandler) mas n8n usa v2.2 no inventário vs v1.2 no catalogo.
- O formato de criptografia é incompatível (n8n proprietary vs AES-256-GCM envelope).

---

## 4. Node Versions & Catálogo

### Matriz de Node Type Coverage

| Node Type (n8n) | typeVersion no inventário | No catalogo? | Handler planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|-----------------|--------------------------:|-------------:|-------------------|------------|-----------|-------|-------------------------------|-------------------|
| `n8n-nodes-base.webhook` | — (catálogo) | ✅ v1 | `WebhookTriggerHandler` (catalogo §1) | 🔴 Crítica | catalogo-nodes.md §1 | Baixo | Mapear direto | Testar webhook trigger com HMAC |
| `n8n-nodes-base.cron` | — (catálogo) | ✅ v1 | `CronTriggerHandler` (catalogo §2) | 🔴 Crítica | catalogo-nodes.md §2 | Baixo | bullmq repeatable jobs | Testar cron expression |
| `n8n-nodes-base.httpRequest` | v4.1 (catálogo) | ✅ v4.1 | `HttpRequestHandler` (catalogo §3) | 🔴 Crítica | catalogo-nodes.md §3 | Médio | Mapear authentication types; v2-security-spec §S8 impõe proxy egress | Testar SSRF guard com HTTP Request |
| `n8n-nodes-base.if` | v1 | ✅ v1 | `IfNodeHandler` (catalogo §4) | 🟡 Alta | catalogo-nodes.md §4 | Baixo | Mapear conditions | Testar operators |
| `n8n-nodes-base.switch` | v1 | ✅ v1 | `SwitchNodeHandler` (catalogo §5) | 🟡 Alta | catalogo-nodes.md §5 | Baixo | Mapear modes | Testar mode value/expression |
| `n8n-nodes-base.function` | v1/2 | ✅ | `FunctionNodeHandler` (catalogo §6) | 🔴 Crítica | catalogo-nodes.md §6 | Alto | **ALERTA**: v2-security-spec §S9 recomenda `isolate-vm`; catalogo §6 sugere `vm2` (deprecated) ou `isolated-vm` | Testar sandbox escape attempt |
| `n8n-nodes-base.merge` | v1 | ✅ v1 | `MergeNodeHandler` (catalogo §7) | 🟡 Alta | catalogo-nodes.md §7 | Médio | Multi-input support no NodeExecutionContext | Testar modes wait/choose/multiplex |
| `n8n-nodes-base.splitInBatches` | v1 | ✅ v1 | `SplitInBatchesHandler` (catalogo §8) | 🟡 Alta | catalogo-nodes.md §8 | Médio | Execution state persistence | Testar batch looping |
| `n8n-nodes-base.set` | v3.2 | ✅ v3.2 | `SetNodeHandler` (catalogo §9) | 🔴 Crítica | catalogo-nodes.md §9 | Médio | Mapear keepOnlySet, values types | Testar coerceType |
| `@n8n/n8n-nodes-langchain.openAi` | v1 | ✅ v1 | `OpenAiNodeHandler` (catalogo §10) | 🔴 Crítica | catalogo-nodes.md §10 | Médio | Mapear para AgentFlow AI routes (v2-security-spec não detalha AI) | Testar chat/completion/embeddings/image |
| `n8n-nodes-base.telegram` | v1 | ✅ v1 | `TelegramNodeHandler` (catalogo §11) | 🟡 Alta | catalogo-nodes.md §11 | Médio | Mapear operations | Testar sendMessage/sendPhoto |
| `n8n-nodes-base.gmail` | v1.2 (catalogo) vs v2.2 (inventario) | ✅ v1.2 | `GmailNodeHandler` (catalogo §12) | 🟡 Alta | catalogo-nodes.md §12 vs inventario.md v2.2 | Alto | **GAP**: inventário usa v2.2, catalogo documenta v1.2. typeVersion mismatch pode causar param changes. | Testar gmail v2.2 import |
| `n8n-nodes-base.googleSheets` | v4.1 | ✅ v4.1 | `GoogleSheetsNodeHandler` (catalogo §13) | 🟡 Alta | catalogo-nodes.md §13 | Médio | Mapear operations | Testar append/get/update |
| `n8n-nodes-base.formTrigger` | v1 | ✅ v1 | `FormTriggerHandler` (catalogo §14) | 🟢 Média | catalogo-nodes.md §14 | Médio | HTML generation | Testar form submit flow |
| `n8n-nodes-base.errorTrigger` | v1 | ✅ v1 | `ErrorTriggerHandler` (catalogo §15) | 🟢 Média | catalogo-nodes.md §15 | Médio | Event bus integration | Testar error triggering |
| `n8n-nodes-base.wait` | v1.1 | ✅ v1.1 | `WaitNodeHandler` (catalogo §16) | 🟡 Alta | catalogo-nodes.md §16 | Médio | Execution persistence for pause | Testar resume via webhook |
| **`n8n-nodes-base.gmailTrigger`** | v1.4 | ❌ **NÃO** | ❌ | 🔴 Crítica | inventario.md: "On New Email (n8n-nodes-base.gmailTrigger v1.4)" em "Save Gmail Attachments to Google Drive" | Alto | **GAP CRÍTICO**: gmailTrigger não está no catalogo. É um trigger de polling Gmail diferente do gmail node (action). | Precisa de gmailTrigger handler — polling via Gmail API |
| **`n8n-nodes-base.googleDrive`** | v3 | ❌ **NÃO** | ❌ | 🔴 Crítica | inventario.md: "Upload to Google Drive (n8n-nodes-base.googleDrive v3)" | Alto | **GAP CRÍTICO**: googleDrive não no catalogo | Precisa de googleDrive handler |
| **`n8n-nodes-base.code`** | v2 | Parcial (function) | `FunctionNodeHandler` (catalogo §6) | 🔴 Crítica | inventario.md: "Split Attachments (n8n-nodes-base.code v2)"; catalogo §6 tem `function`/`functionItem` | Alto | **GAP**: inventário usa `code` (novo nome), catalogo usa `function`. typeVersion v2 no inventário vs v1/2 no catalogo. | Mapear `code` → `function` handler; validar typeVersion |
| **`n8n-nodes-base.evaluationTrigger`** | v4.7 | ❌ **NÃO** | ❌ | 🟢 Média | inventario.md: "When fetching a dataset row (n8n-nodes-base.evaluationTrigger v4.7)" em "My workflow" | Médio | **GAP**: evaluationTrigger não documentado. Workflow não ativo no inventário. | Avaliar se workflow é necessário |
| **`n8n-nodes-base.emailReadImap`** | v2.2 | ❌ **NÃO** | ❌ | 🟡 Alta | inventario.md: "Email Trigger (IMAP) (n8n-nodes-base.emailReadImap v2.2)" em "My workflow 2" | Alto | **GAP CRÍTICO**: emailReadImap não no catalogo | Precisa de emailReadImap handler |
| **Community node types** | varia | ❌ N/A | ❌ | 🟡 Alta | catalogo-nodes.md não documenta mecanismo de carregamento de community nodes | Alto | Ver §7 Community Nodes | Testar community node import |

### Análise de Node Versions & Catálogo

**Status**: PARCIALMENTE COMPATÍVEL — GAP CRÍTICO.

O `catalogo-nodes.md` documenta **16 node types**, mas o `inventario.md` mostra **6 tipos únicos** sendo usados, dos quais **4 NÃO estão no catálogo**:

1. `n8n-nodes-base.gmailTrigger` (v1.4) — trigger de polling do Gmail, **crítico** para "Save Gmail Attachments to Google Drive".
2. `n8n-nodes-base.googleDrive` (v3) — upload para Google Drive, **crítico** para mesmo workflow.
3. `n8n-nodes-base.code` (v2) — o catalogo documenta `function` (nome legado), mas inventário usa `code` (nome atual n8n).
4. `n8n-nodes-base.emailReadImap` (v2.2) — trigger IMAP, **crítico** para "My workflow 2".
5. `n8n-nodes-base.evaluationTrigger` (v4.7) — trigger de avaliação, workflow não ativo.

Além disso, `n8n-nodes-base.gmail` está no catalogo com v1.2, mas o inventário usa v2.2 — **mismatch de typeVersion**.

**Node handler types no contexto** (catalogo-nodes.md §"Arquitetura Comum"):
- `NodeExecutionContext` inclui `nodeConfig.typeVersion: number` → o executor reconhece typeVersion.
- Mas **não há documentação de migration/upgrade de typeVersion** — o que fazer quando n8n v2.2 mas catalogo documenta v1.2?

---

## 5. Webhooks

### Matriz de Webhook Features

| Feature | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|---------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| **Path format** | `/webhook/<path>` produção, `/webhook-test/<path>` teste | `/webhook/<path>` (catalogo §1); production vs test? | 🔴 Crítica | referencia-n8n.md §5.3; catalogo-nodes.md §1 | Médio | **GAP**: n8n distingue `/webhook/` (ativo) vs `/webhook-test/` (teste). AgentFlow não documenta `/webhook-test/`. Inventario.md mostra 1 webhook ativo. | Testar webhook-test para workflows inativos |
| **webhookId** | string único gerado pelo n8n | `context.webhookId` no NodeExecutionContext (catalogo §1) | 🔴 Crítica | referencia-n8n.md §5.2: `webhookId`; catalogo §1: `webhookId` no output | Baixo | Mapear; usar como roteamento interno | Testar webhookId como route identifier |
| **httpMethod** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS | ✅ enum no schema (catalogo §1) | 🔴 Crítica | referencia-n8n.md §2.2; catalogo §1 | Baixo | Mapear direto | Testar todos os métodos |
| **responseMode** | `onReceived`, `lastNode`, `responseNode` | ✅ `WebhookTriggerHandler` implementa (catalogo §1) | 🔴 Crítica | referencia-n8n.md §2.2; catalogo §1: responseMode no handler | Médio | Mapear os 3 modes; `responseNode` requer Webhook Response node | Testar cada responseMode |
| **responseCode** | number (padrão 200) | ✅ no schema (catalogo §1) | 🟡 Alta | referencia-n8n.md §2.2; catalogo §1 | Baixo | Mapear direto | Testar códigos 200, 201, 204 |
| **responseData** | string (expressão) | ✅ resolvido via ExpressionEngine (catalogo §1) | 🟡 Alta | catalogo §1: `this.evaluateExpression(params.responseData, outputItem)` | Médio | Dependente do expression engine (ver §2) | Testar `{{ $json }}` response |
| **HMAC-SHA256** | ❌ Header `X-Webhook-Signature` apenas (n8n comunidade) | ✅ HMAC-SHA256 + nonce + timestamp + payload limit + IP allowlist (v2-security-spec §S12, §0.1) | 🔴 Crítica | v2-security-spec §0.1: webhook hardening; §S12; catalogo §1: `verifyHmac` | Alto | **DIFERENÇA DE COMPORTAMENTO**: AgentFlow é mais seguro. Webhooks externos precisam enviar HMAC com nonce+timestamp. n8n comunidade não exige isso. | Testar webhook sem HMAC (deve falhar no AgentFlow); testar com HMAC válido |
| **rawBody** | `options.rawBody` (buffer sem parse) | ✅ no schema (catalogo §1) | 🟢 Média | referencia-n8n.md §2.2; catalogo §1 | Baixo | Mapear | Testar raw body para HMAC verification |
| **allowUnknownPaths** | `options.allowUnknownPaths` | ✅ no schema (catalogo §1) | 🟢 Média | referencia-n8n.md §2.2; catalogo §1 | Baixo | Mapear | Testar path desconhecido |
| **Webhook Response node** | `n8n-nodes-base.webhookResponse` (v1) | ❌ Não no catalogo | 🟡 Alta | referencia-n8n.md §5.4: webhookResponse node | Alto | **GAP**: responseMode=responseNode precisa deste node. Não documentado em catalogo-nodes.md. | Precisa de webhookResponse handler |
| **Webhook do inventário** | POST em `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd` (path/ID) | Mapear para WebhookTriggerHandler | 🔴 Crítica | inventario.md §"Webhooks": 1 webhook em "My workflow 2" | Médio | Webhook usa UUID como path — mapear para webhookId interno | Importar "My workflow 2" e validar webhook route |

### Análise de Webhooks

**Status**: PARCIALMENTE COMPATÍVEL + HARDENING.

AgentFlow implementa webhook **mais seguro** que n8n comunidade (HMAC + nonce + timestamp + IP allowlist vs apenas assinatura básica). Mas:

- **GAP**: nenhum endpoint `/webhook-test/` documentado — workflows inativos não podem ser testados.
- **GAP**: `webhookResponse` node (para `responseMode=responseNode`) **não documentado** no catalogo.
- **Risco operacional**: webhooks externos (Stripe, GitHub, etc.) que funcionam no n8n com apenas assinatura básica **quebram** no AgentFlow que exige HMAC+nonce+timestamp+IP allowlist.

---

## 6. Executions

### Matriz de Execution Features

| Feature | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|---------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| **Execução mode** | `cli, error, integrated, internal, manual, retry, trigger, webhook, evaluation, chat` (api-n8n.md §5) | Não enum documentado (v2-security-spec menciona BullMQ jobs, quotas) | 🔴 Crítica | api-n8n.md §"Execution.mode"; v2-security-spec §0.1 | Alto | **GAP**: AgentFlow não documenta os modes de execução. `evaluation` e `chat` modes (usados no inventório) não mapeados. | Mapear modes; testar manual/webhook/trigger |
| **Execução status** | `canceled, crashed, error, new, running, success, unknown, waiting` (api-n8n.md §4) | Não enum documentado; catalogo menciona `isComplete`, `paused` | 🔴 Crítica | api-n8n.md §"Execution.status"; catalogo §8, §16 | Alto | **GAP**: sem enum de status no AgentFlow. `waiting` (n8n) mapeia para `paused` (catalogo §16). | Testar lifecycle: new → running → success/error |
| **runData por node** | `data.resultData.runData` — output de cada nó (api-n8n.md §3) | `NodeOutput.items` + `outputRouting` (catalogo §"Arquitetura Comum") | 🔴 Crítica | api-n8n.md §3: `runData`; catalogo §"NodeOutput interface" | Médio | Mapear NodeOutput → runData estrutura | Executar workflow e validar runData salvo |
| **retryOf / retrySuccessId** | `retryOf: number|null`, `retrySuccessId` (api-n8n.io §3) | ❌ Não documentado | 🟡 Alta | api-n8n.io §3 interface Execution | Alto | **GAP**: retry tracking não documentado no AgentFlow | Precisa de job retry tracking |
| **redactionInfo** | `redactionInfo: { isRedacted, reason, canReveal }` (api-n8n.io §3) | `hasValue` no credential + timing-safe errors (v2-security-spec §5.4, §5.5) | 🟡 Alta | api-n8n.io §3; v2-security-spec §5.4: "hasValue"; §5.5: "timing-safe" | Médio | **DIFERENÇA**: n8n usa redactionInfo no execution data. AgentFlow nunca expõe secrets — abordagem preventiva vs reativa. | Testar execution com dados sensíveis — validar que secrets não aparecem |
| **includeData query** | `includeData, ignoreDataSizeLimit, redactExecutionData` (api-n8n.io §4, §7) | `GET /api/v1/executions` (api-n8n.io §"Mapeamento"), mas params não detailados | 🟡 Alta | api-n8n.io §"Mapeamento": GET /api/v1/executions | Médio | **GAP**: query params de execução não detailados. | Listar execuções com includeData=true |
| **Pagination** | `limit, cursor` (cursor-based) | `limit, cursor` (api-n8n.io §"Mapeamento") | 🟢 Média | api-n8n.io §1: "Paginação baseada em cursor"; §"Mapeamento" | Baixo | Documentado como equivalente | Testar paginação cursor-based |
| **Timeout** | `settings.executionTimeout` (padrão 3600s) | BullMQ job timeout + v2-security-spec §2.5 (DoS quotas) | 🔴 Crítica | v2-security-spec §2.5: "quota de execuções + rate limit"; §2.5: "budget de execução"; referencia-n8n §1.3 | Médio | AgentFlow: timeout via BullMQ job TTL + quota por tenant | Testar timeout de execução longa |
| **Retry/backoff** | `retryOnFail, maxTries, waitBetweenTries` no node (referencia-n8n §2.1) | `retryOnFail, maxTries, waitBetweenTries` no NodeExecutionContext (catalogo §"Arquitetura Comum") | 🟡 Alta | referencia-n8n §2.1; catalogo §"NodeExecutionContext" | Baixo | Mapear campos no scheduler de jobs | Testar retry com maxTries=3 |
| **continueOnFail** | Boolean no node (continua workflow mesmo se falhar) | `continueOnFail` no NodeExecutionContext (catalogo) | 🟡 Alta | referencia-n8n §2.1; catalogo §"NodeExecutionContext" | Médio | Mapear direto | Testar node falhando com continueOnFail=true |
| **Execution persistence** | Salva execução completa no DB (runData, status) | BullMQ + Redis (fila), Postgres (dados) (v2-security-spect §0.1) | 🔴 Crítica | v2-security-spec §0.1: "BullMQ + Redis (fila/execução)"; §1.3: Postgres | Alto | **ARQUITETURA DIFERENTE**: n8n salva tudo no DB. AgentFlow usa Redis+BullMQ + Postgres. Estado de execução deve ser persistido entre job resumes (catalogo §16: `saveExecutionState`). | Testar execution resume após pausa (Wait node) |
| **BullMQ parent/child jobs** | ❌ n8n usa scheduler próprio | ✅ DAG execution via parent/child jobs (catalogo §"Próximos Passos" #3) | 🔴 Crítica | catalogo-nodes.md §"Próximos Passos para Builder" #3: "Implementar WorkflowExecutor usando bullmq parent/child jobs para DAG" | Médio | Novo approach — validar topological order | Testar workflow com múltiplos branches + Merge |
| **Quotas por tenant** | ❌ Não na comunidade | ✅ Quota de execuções + rate limit (v2-security-spec §2.5 A7) | 🔴 Crítica | v2-security-spec §2.5: "A7 — Abuse de recursos: tenant cria 10k execuções" | Médio | Hardening extra vs n8n | Testar 10k execuções simultâneas |

### Análise de Executions

**Status**: PARCIALMENTE COMPATÍVEL — ARQUITETURA DIFERENTE.

n8n salva execuções completas no DB com `runData`. AgentFlow usa **BullMQ + Redis + Postgres** com parent/child jobs para DAG. A persistência de estado entre pauses (Wait node, SplitInBatches) é documentada no catalogo (§8, §16) mas não há enum de status/mode mapeado.

**Gaps críticos**:
- `evaluation` e `chat` execution modes (do inventário) — `evaluationTrigger` workflow existe, mas não há mapping de mode.
- `retryOf`/`retrySuccessId` — não documentado.
- Query params de execução (`includeData`, `redactExecutionData`) — propostos mas não detalhados.

---

## 7. Community Nodes

### Matriz de Community Nodes

| Feature | n8n existente | AgentFlow planejado | Prioridade | Evidência | Risco | Estratégia de compatibilidade | Teste necessário |
|---------|---------------|---------------------|------------|-----------|-------|-------------------------------|-------------------|
| **Carregamento dinâmico** | npm packages: `@n8n/n8n-nodes-langchain`, custom community nodes | ❌ Nenhum mecanismo documentado | 🔴 Crítica | v2-security-spec: não menciona; catalogo-nodes.md: não documenta loader | Alto | **GAP CRÍTICO**: n8n carrega community nodes via npm. AgentFlow não documenta plugin system. | Testar import de workflow com community node type |
| **Namespace `@scope/package`** | `@n8n/n8n-nodes-langchain.openAi` | ✅ Handler reconhece type string `@n8n/n8n-nodes-langchain.openAi` (catalogo §10) | 🔴 Crítica | catalogo-nodes.md §10: `readonly type = '@n8n/n8n-nodes-langchain.openAi'` | Médio | O type é reconhecido, mas não há loader dinâmico. Apenas hardcoded. | Verificar type resolution no NodeRegistry |
| **NodeRegistry dinâmico** | ✅ n8n node registry com descoberta automática de nodes | "Registrar nodes no NodeRegistry para descoberta dinâmica" (catalogo §"Próximos Passos" #7) | 🔴 Crítica | catalogo-nodes.md §"Próximos Passos para Builder" #7 | Alto | **GAP**: NodeRegistry é um "próximo passo", não implementado. Handlers hardcoded por type. | Listar node types conhecidos vs registrados |
| **Community node types do inventário** | `@n8n/n8n-nodes-langchain.openAi` (LangChain) | ✅ no catalogo §10 | 🔴 Crítica | catalogo-nodes.md §10 | Médio | Mapeado, mas sem loader dinâmico | Testar OpenAI node import |
| **Custom community nodes** | Qualquer npm package com node definitions | ❌ Não suportado | 🟡 Alta | v2-security-spec §0.1: não menciona community nodes; catalogo não documenta | Alto | **INCOMPATÍVEL**: workflows usando community nodes customizados não funcionam no AgentFlow | Testar import de workflow com node type não encontrado |
| **NodeHandler interface** | N/A (n8n usa node class definitions diferentes) | `NodeHandler<TParams>` interface com `type`, `execute()` (catalogo §"Arquitetura Comum") | 🔴 Crítica | catalogo-nodes.md §"Arquitetura Comum: Node Handler Interface" | Médio | Novo interface — não 1:1 com n8n node definitions | Testar handler dispatch por type string |

### Análise de Community Nodes

**Status**: NÃO COMPATÍVEL.

n8n suporta carregamento dinâmico de community nodes via npm packages. O AgentFlow **não documenta nenhum mecanismo** de plugin loading ou community node registry. O `catalogo-nodes.md` §"Próximos Passos" #7 menciona "Registrar nodes no NodeRegistry" como um passo futuro, não implementado.

O tipo `@n8n/n8n-nodes-langchain.openAi` é **hardcoded** em `OpenAiNodeHandler` (catalogo §10), não carregado dinamicamente. Workflows do usuário que usam community nodes customizados **não funcionarão** no AgentFlow.

---

## 8. Sumário de Gaps Críticos

### Gaps por prioridade

| # | Gap | Feature | Severidade | Evidência |
|----|-----|---------|------------|-----------|
| G1 | `gmailTrigger` node não documentado no catalogo | Node catalog | 🔴 Crítica | inventario.md (workflow "Save Gmail Attachments") usa `n8n-nodes-base.gmailTrigger v1.4`; catalogo-nodes.md não lista |
| G2 | `googleDrive` node não documentado no catalogo | Node catalog | 🔴 Crítica | inventario.md usa `n8n-nodes-base.googleDrive v3`; catalogo não lista |
| G3 | `emailReadImap` node não documentado no catalogo | Node catalog | 🔴 Crítica | inventario.md usa `n8n-nodes-base.emailReadImap v2.2`; catalogo não lista |
| G4 | `code` (v2) vs `function` no catalogo — nome e typeVersion divergem | Node versions | 🔴 Crítica | inventario.md: `n8n-nodes-base.code v2`; catalogo-nodes.md §6: `n8n-nodes-base.function v1/2` |
| G5 | `gmail` typeVersion: inventário v2.2 vs catalogo v1.2 | Node versions | 🔴 Crítica | inventario.md vs catalogo-nodes.md §12 |
| G6 | `evaluationTrigger` (v4.7) não documentado | Node catalog | 🟡 Alta | inventario.md; catalogo não lista |
| G7 | Endpoint `/workflows/import` não documentado (n8n tem) | JSON export/import | 🔴 Crítica | api-n8n.md não menciona; referencia-n8n.md §7.6 documenta em n8n |
| G8 | `publishIfActive` query param não documentado (n8n tem) | API | 🟡 Alta | api-n8n.md §4 não menciona; referencia-n8n.md §7.5 documenta |
| G9 | Expression engine é subset — method chaining não suportado | Expressions | 🔴 Crítica | catalogo-nodes.md §"Expression Engine (Subset n8n)"; handlers usam regex simplificado |
| G10 | `$helpers.request()` bloqueado no Code node (n8n permite) | Expressions / Code node | 🔴 Crítica | v2-security-spec §S9: zero network no sandbox; referencia-n8n §2.7 lista `$helpers` |
| G11 | `webhookResponse` node não documentado (necessário para responseMode=responseNode) | Webhooks | 🟡 Alta | referencia-n8n.md §5.4; catalogo-nodes.md não lista |
| G12 | `/webhook-test/` endpoint não documentado (n8n tem para workflows inativos) | Webhooks | 🟡 Alta | referencia-n8n.io §7.13; api-n8n.md não menciona |
| G13 | Execution modes `evaluation`, `chat` não mapeados | Executions | 🔴 Crítica | inventario.md usa evaluationTrigger; api-n8n.io §"Execution.mode" lista 10 modes; v2-security-spec não documenta |
| G14 | Execution status enum não documentado (n8n tem 8 statuses) | Executions | 🔴 Crítica | api-n8n.io §"Execution.status"; v2-security-spec não documenta enum |
| G15 | `retryOf`/`retrySuccessId` não documentado | Executions | 🟡 Alta | api-n8n.io §3; v2-security-spec não documenta |
| G16 | Formato de encrypt de credencial incompatível (n8n proprietary vs AES-256-GCM envelope) | Credentials | 🔴 Crítica | referencia-n8n §4.4: `encrypted:bot-token-here`; v2-security-spec §5.1: envelope AES-256-GCM DEK-per-tenant |
| G17 | `googleDrive OAuth2` e `IMAP Email` credentials não têm handlers | Credentials | 🔴 Crítica | inventario.md §"Credenciais Utilizadas": 3 credenciais; catalogo documenta apenas gmail, googleSheets, openAi, telegram, httpBasicAuth |
| G18 | Nenhum mecanismo de community node loading | Community nodes | 🔴 Crítica | v2-security-spec: não menciona; catalogo "Próximos Passos" #7 (futuro) |
| G19 | NodeRegistry dinâmico não implementado (hardcoded) | Community nodes | 🔴 Crítica | catalogo §"Próximos Passos" #7 |
| G20 | `new Function()` em expressions sem sandbox (risco de injeção) | Expressions / Security | 🟡 Alta | catalogo-nodes.md §§9-13: handlers usam `new Function()`; v2-security-spec §S9 recomenda isolate-vm apenas para Code node |

### Workflow-level Impact Map (do inventário)

| Workflow do inventário | Nodes | Gaps bloqueantes |
|------------------------|-------|------------------|
| **Save Gmail Attachments to Google Drive** | gmailTrigger v1.4, code v2, googleDrive v3 | G1, G4, G17 (googleDrive credential) |
| **My workflow** | evaluationTrigger v4.7 | G6, G13 (evaluation mode) |
| **My workflow 2** | emailReadImap v2.2, gmail v2.2 + webhook | G3, G5, G17 (IMAP credential), G12 (webhook-test) |

### Conclusão

**Compatibilidade geral: PARCIAL (subset)**.

- **API REST**: 8 de 11 endpoints documentados como equivalentes (api-n8n.io). Gaps em `/import`, `publishIfActive`, execution query params.
- **Expressions**: Subset suportado. Method chaining e `$helpers.request()` não funcionam. Risco de injeção via `new Function()`.
- **Credentials**: Modelo mais seguro (envelope encryption, hasValue-only, decrypt permission). Mas 2 de 3 credenciais do inventário não têm handlers.
- **Nodes**: 16 documentados no catalogo, mas **4 de 6** nodes do inventário não estão cobertos (gmailTrigger, googleDrive, emailReadImap, evaluationTrigger). `code` vs `function` naming mismatch.
- **Webhooks**: Mais seguro (HMAC+nonce+timestamp+IP allowlist). Mas `/webhook-test/` e `webhookResponse` não documentados.
- **Executions**: Arquitetura diferente (BullMQ+Redis vs n8n DB). Status/mode enums não documentados.
- **Community nodes**: **NÃO COMPATÍVEL** — nenhum plugin system documentado.

---

*Documento*: `n8n-migration/v2-compatibility-matrix.md`  
*Baseado exclusivamente em evidências dos arquivos*: `v2-security-spec.md`, `referencia-n8n.md`, `api-n8n.md`, `catalogo-nodes.md`, `inventario.md`.
