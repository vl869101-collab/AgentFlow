# WF1 — Recriação: "Save Gmail Attachments to Google Drive"

## Brief resumido

Recriar do zero, no formato nativo do AgentFlow, o workflow **"Save Gmail Attachments to Google Drive"** (original em n8n). O workflow:

1. **Trigger**: "On New Email" — `gmailTrigger` v1.4 — pega emails com anexos não lidos (`has:attachment`, `readStatus: unread`)
2. **Transform**: "Split Attachments" — `code` v1 — separa anexos do email em itens individuais
3. **Action**: "Upload to Google Drive" — `googleDrive` v1 — faz upload de cada anexo para uma pasta do Google Drive

## Arquivos criados

```
n8n-migration/recriacao/
├── handlers/
│   ├── types.ts              # Interfaces: NodeHandler, NodeExecutionContext, NodeExecutionResult
│   ├── code-sandbox.ts       # Sandbox vm seguro (blocklist de globals, timeout, memory limit)
│   ├── gmailTrigger.ts       # GmailTriggerHandler (trigger — email simulado → anexos no binary)
│   ├── code.ts               # CodeNodeHandler (transform — vm sandbox, runOnceForEachItem/runOnceForAllItems)
│   └── googleDrive.ts        # GoogleDriveHandler (action — upload simulado via credencial mock)
├── wf1-workflow.ts           # createWf1Workflow() — definição nativa AgentFlow (3 nodes, 2 edges)
├── credenciais.ts            # createMockCredential / decryptCredentialData (AES-256-GCM via crypto.ts)
├── runner.ts                 # topologicalSort + runWorkflow (orquestrador local de execução)
├── vitest.config.ts          # Config de teste (include coverage: handlers/**, runner.ts, credenciais.ts, wf1-workflow.ts)
├── vitest.setup.ts           # Define CREDENTIAL_ENCRYPTION_KEY antes do carregamento de módulos
├── test/
│   └── wf1-executor.test.ts  # 74 testes — todos passando
├── registracoes-pendentes.md # Linhas de registro para APPEND no executor.ts (Parte 2)
└── wf1-resultado.md          # Este documento
```

## Definição nativa (equivalente ao original)

### Tabela de mapeamento n8n → AgentFlow

| n8n ID | n8n Node Type | n8n v | AgentFlow Type | Handler |
|---|---|---|---|---|
| On New Email | gmailTrigger | 1.4 | gmailTrigger | GmailTriggerHandler |
| Split Attachments | code | 1 | code | CodeNodeHandler |
| Upload to Google Drive | googleDrive | 1 | googleDrive | GoogleDriveHandler |

### Edges

1. `gmailTrigger` → `code`
2. `code` → `googleDrive`

### Credenciais (fake / mock)

| Credencial | Type | Provider | Dados |
|---|---|---|---|
| cred-gmail-wf1 | oauth2 | gmail | `{ accessToken: "fake-gmail-token-wf1", refreshToken: "fake-refresh-wf1", scope: "gmail.modify" }` |
| cred-drive-wf1 | oauth2 | google_drive | `{ accessToken: "fake-drive-token-wf1", refreshToken: "fake-refresh-drive-wf1", scope: "drive.file" }` |

Ambas encriptadas via `encryptCredential()` (AES-256-GCM, `apps/api/src/lib/crypto.ts`).

## Handler — gmailTrigger

**Arquivo**: `handlers/gmailTrigger.ts`

- Tipo nativo: `GMAIL_TRIGGER_NATIVE_TYPE = "gmailTrigger"`
- Parameters preservados do n8n: `event`, `simple`, `pollTimes`, `filters` (`q`, `readStatus`), `options` (`downloadAttachments`, `dataPropertyAttachmentsPrefixName`)
- Em teste: aceita payload de email simulado (formato Gmail API: `{ id, threadId, labelIds, snippet, subject, from, to, date, attachments[] }`)
- `extractAttachments()` suporta dois formatos de anexo:
  1. **Array `attachments`**: itens com `{ id, filename, mimeType, size, data }`
  2. **Propriedades prefixadas**: chaves como `attachment_invoice` (prefixo configurado)
- Popula `binary` do output item com os anexos, usando o prefixo (`attachment_<name>`), incluindo `fileName`, `mimeType`, `size`, `data` — compatível com o `code` node original

## Handler — code

**Arquivo**: `handlers/code.ts` + `handlers/code-sandbox.ts`

- Tipo nativo: `CODE_NODE_NATIVE_TYPE = "code"`
- Substitui o `CodeExecutionDisabledError` (ver `reviewer-relatorio.md` §6) com sandbox seguro
- **Modos suportados**:
  - `runOnceForEachItem`: código executado uma vez por item de entrada
  - `runOnceForAllItems`: código executado uma vez com todos os itens
- **Sandbox** (`code-sandbox.ts`):
  - Usa módulo nativo `vm` do Node.js (`runInContext`)
  - Contexto criado com `vm.createContext()` e `Object.setPrototypeOf(context, null)` — isolamento de protótipo
  - **Blocklist de globals**: `require`, `process`, `global`, `__dirname`, `eval`, `Function`, `fetch`, `import`, `module`, `exports`, `console` (parcial), `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `setImmediate`, `clearImmediate`, `Buffer`, `URLSearchParams`, `AbortController`, `structuredClone`, `crypto` (Node global)
  - **Padrões perigosos detectados em tempo de parse** (`detectDangerousPatterns`): `require(`, `process.`, `global.`, `eval(`, `Function(`, `__dirname`, `__filename`, `import(`, `fetch(`, `import.meta`, `process.env`
  - **Timeout**: padrão 5s (`DEFAULT_TIMEOUT_MS = 5000`), configurável
  - **Memory limit**: `DEFAULT_MEMORY_LIMIT_MB = 512`
  - **Variáveis n8n injetadas no contexto**: `$input` (com `item`, `all()`, `first()`, `last()`), `$json`, `$parameter`, `$credentials`, `$now`, `$helpers` (`returnJsonArray`, `createBinary`)
  - **Console sandbox**: `log`, `warn`, `error`, `info`, `dir`, `debug` — todos logam para o array de logs, nenhum acessa I/O
- **Error codes**:
  - `CODE_SECURITY_BLOCK` — código bloqueado por padrões perigosos
  - `CODE_TIMEOUT` — execução excedeu o timeout
  - `CODE_RUNTIME_ERROR` — erro de runtime no código do usuário
  - `CODE_EXECUTION_ERROR` — erro genérico de execução

## Handler — googleDrive

**Arquivo**: `handlers/googleDrive.ts`

- Tipo nativo: `GOOGLE_DRIVE_NATIVE_TYPE = "googleDrive"`
- Parameters preservados: `resource`, `operation`, `inputDataFieldName`, `name`, `driveId`, `folderId`, `options`
- `resolveExpression()` resolve expressões n8n `={{ $json.field }}` (stripping `=` prefix)
- `simulateUpload()` simula upload com credencial mock — retorna `{ id, name, mimeType, size, webViewLink, downloadLink, uploadIndex }`
- Registra uploads simulados no array `.uploads` para asinçāo em testes

## Runner (execução local)

**Arquivo**: `runner.ts`

- `topologicalSort(nodes, edges)` — ordenação topológica via DFS (detecta cycles, identifica trigger)
- `LocalNodeRegistry` — registra e despacha handlers por node type
- `runWorkflow(workflow, credentials, input, registry)` — orquestra a execução:
  1. Ordena nodes topologicalmente a partir do trigger
  2. Executa cada node em sequência, passando `result.items` como input do próximo
  3. Acumula `steps` com status, output e logs
  4. Retorna `WorkflowExecutionResult`

## Teste local — validação aceita

**Arquivo**: `test/wf1-executor.test.ts`

### Scenario: manual trigger com payload de email (2 anexos)

**Input simulado** (`createSimulatedEmail()`):
```json
{
  "id": "sim-msg-001",
  "subject": "Relatório de vendas — Anexos",
  "from": "sales@empresa.com",
  "to": "user@example.com",
  "date": "2026-08-19T10:00:00Z",
  "snippet": "Segue em anexo...",
  "attachments": [
    { "id": "att-001", "filename": "invoice.pdf", "mimeType": "application/pdf", "size": 102400, "data": "JVBERi0xLjQK..." },
    { "id": "att-002", "filename": "report.png", "mimeType": "image/png", "size": 204800, "data": "iVBORw0KGgoAAAANSUhEUg..." }
  ]
}
```

**Flow esperado**:
1. `gmailTrigger`: recebe email → extrai 2 anexos → popula `binary` com `attachment_invoice` e `attachment_report` → output: 1 item com `json` (metadata do email + `attachments[]`) e `binary` (2 anexos)
2. `code` (Split Attachments): itera `binary` keys → cria 2 items, cada um com `json` (fileName, mimeType, subject, from) e `binary.data` (anexo) → output: 2 items
3. `googleDrive` (Upload): processa 2 items → simula 2 uploads → output: 2 items com `json` (id, name, webViewLink, etc.)

**Validações no teste**:
- 74 testes, 100% passando
- Coverage (v8):
  - Statements: 97.38%
  - Branches: 77.94%
  - Functions: 93.87%
  - Lines: 97.38%

## Resultados de cobertura (v8)

| Arquivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| credenciais.ts | 100% | 100% | 100% | 100% |
| runner.ts | 91.77% | 79.41% | 100% | 91.77% |
| wf1-workflow.ts | 100% | 100% | 100% | 100% |
| code-sandbox.ts | 100% | 80% | 100% | 100% |
| code.ts | 96.77% | 82% | 80% | 96.77% |
| gmailTrigger.ts | 100% | 68.29% | 100% | 100% |
| googleDrive.ts | 95.91% | 75% | 100% | 95.91% |
| types.ts | 100% | 100% | 100% | 100% |
| **All files** | **97.38%** | **77.94%** | **93.87%** | **97.38%** |

## Como rodar

```bash
# Do workspace root (ou apps/api)
set NODE_ENV=development
pnpm --filter @agentflow/api exec vitest run --root ../../n8n-migration/recriacao --coverage.enabled

# Ou via config
# n8n-migration/recriacao/vitest.config.ts já tem coverage thresholds configurados
```

## Decisões de projeto

1. **Sandbox vm vs vm2**: Usado módulo nativo `vm` (sem dependências externas). `vm2` e `isolated-vm` não estão instalados no workspace. O `vm` módulo com contexto nulificado e blocklist é suficiente para isolamento de código do usuário.
2. **Credenciais fake**: OAuth2 com `accessToken` e `refreshToken` falsos. Descriptografadas via `decryptCredential()` do crypto.ts existente.
3. **Handler files isolados**: Criados em `n8n-migration/recriacao/handlers/` — NÃO editam `apps/api/src/services/executor.ts`. As linhas de registro para integração estão em `registracoes-pendentes.md`.
4. **Nenhuma dependência nova adicionada**: apenas APIs nativas do Node.js (`vm`, `crypto`).
