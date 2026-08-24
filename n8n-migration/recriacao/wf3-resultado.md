# WF3 — Recriação: "My workflow 2"

## Brief resumido

Recriar do zero, no FORMATO NATIVO do AgentFlow, o workflow **"My workflow 2"** (n8n id `2ZImw8KzAbLMT7ca`). O workflow:

1. **Trigger**: "Email Trigger (IMAP)" — `n8n-nodes-base.emailReadImap` v2.2 — leitura de emails via IMAP
2. **Action**: "Add label to message" — `n8n-nodes-base.gmail` v2.2 (operation `addLabels`) — adiciona labels a uma mensagem Gmail

Conexão 1→2. Credenciais: IMAP Email + Gmail OAuth2.

## Arquivos criados

```
n8n-migration/recriacao/wf3/
├── handlers/
│   ├── types.ts               # Re-export de NodeHandler, NodeExecutionContext, NodeExecutionResult
│   ├── email-read-imap.ts     # EmailReadImapHandler (trigger — leitura simulada IMAP)
│   ├── gmail.ts               # GmailHandler (action — addLabels/removeLabels/send/get)
│   └── index.ts               # Re-export de todos os handlers
├── wf3-workflow.ts            # createWf3Workflow() — definição nativa AgentFlow (2 nodes, 1 edge)
├── credenciais-wf3.ts         # createWf3Credentials(orgId) — credenciais IMAP + Gmail OAuth2 fake
├── runner.ts                  # createWf3Registry() + runWorkflow() — runner local
├── vitest.config.ts           # Config isolada (root=wf3/, coverage thresholds)
├── seed.ts                    # Fixture loader + API seeder (Fastify)
└── tests/
    ├── setup.ts               # Define CREDENTIAL_ENCRYPTION_KEY
    ├── email-read-imap.test.ts   # 23 testes unitários
    ├── gmail.test.ts                  # 22 testes unitários
    └── wf3-integration.test.ts         # 25 testes de integração
```

## Definição nativa (equivalente ao original)

### Tabela de mapeamento n8n → AgentFlow

| n8n Node | n8n Type | n8n v | AgentFlow Type | Handler |
|---|---|---|---|---|
| Email Trigger (IMAP) | `n8n-nodes-base.emailReadImap` | 2.2 | `emailReadImap` | `EmailReadImapHandler` |
| Add label to message | `n8n-nodes-base.gmail` | 2.2 | `gmail` | `GmailHandler` |

### Edges

1. `emailReadImap` → `gmail` (sourceHandle=`"main"`, targetHandle=`"main"`)

### Credenciais (fake / mock)

| Credencial | Type | Provider | Dados |
|---|---|---|---|
| `cred-imap-wf3` | `api_key` (IMAP) | `imap` | `{ host: "imap.gmail.com", port: 993, user: "user@example.com", password: "mock-imap-password-123", secure: true, mailbox: "INBOX" }` |
| `cred-gmail-oauth2-wf3` | `oauth2` | `gmail` | `{ client_id: "mock-gmail-client-id...", refresh_token: "mock-gmail-refresh...", access_token: "mock-gmail-access...", scope: "https://www.googleapis.com/auth/gmail.modify" }` |

Ambas encriptadas via `encryptCredential()` (AES-256-GCM, `apps/api/src/lib/crypto.ts`).

## Handler — emailReadImap

**Arquivo**: `handlers/email-read-imap.ts`

- Tipo nativo: `EMAIL_READ_IMAP_NATIVE_TYPE = "emailReadImap"`
- Category: `trigger`
- Parameters preservados do n8n: `options` (`mailbox`, `postProcess`, `markAsRead`, `limit`, `filterBySubject`, `stripAttachments`)
- Em teste: aceita payload de email simulado (formato `{ id, subject, from, to, date, attachments[], ... }`)
- `formatEmailItem()` normaliza anexos: suporta `filename`/`name`/`id` fallback, `mimeType`/`contentType` fallback, `data`/`content` fallback
- Popula `binary` do output item com os anexos (chave = nome do arquivo sem extensão)
- `extractEmailAttachments()` extrai anexos do output para uso no próximo node

## Handler — gmail

**Arquivo**: `handlers/gmail.ts`

- Tipo nativo: `GMAIL_NATIVE_TYPE = "gmail"`
- Category: `action`
- Operations suportadas: `addLabels`, `removeLabels`, `send`, `get`
- `addLabels` (default): obtém message ID do input, adiciona labels configuradas, retorna `{ id, threadId, labelIds, labelAdded, operation, subject, success }`
- `removeLabels`: remove labels especificadas, retorna `{ id, labelRemoved, operation, success }`
- `send`: envia novo email (via `params.message`) ou reenvia mensagens do input, retorna `{ id, threadId, labelIds, to, subject, operation, success }`
- `get`: obtém detalhes da mensagem, retorna `{ id, subject, from, snippet, labelIds, operation, success }`
- `extractMessageData()` extrai `id` via fallback: `id` → `messageId` → `messageID` → `uid`
- Unknown operation: pass-through do input com log de warning

## Runner (execução local)

**Arquivo**: `runner.ts`

- `createWf3Registry()` — registra `EmailReadImapHandler` e `GmailHandler` no `LocalNodeRegistry`
- `topologicalSort()` — reutilizado do runner WF1 (importado de `../runner.js`)
- `runWorkflow(workflow, input, credentials, options)` — orquestra a execução:
  1. Ordena nodes topologicalmente a partir do trigger
  2. Executa cada node em sequência, passando `result.items` como input do próximo
  3. Acumula `steps` com status, output e logs
  4. Retorna `WorkflowExecutionResult`
- `resolveNodeCredentials()` — mapeia `emailReadImap` → `imap`, `gmail` → `gmail`

## Teste local — validação

### Scenario: manual trigger com payload de email (2 anexos)

**Input simulado** (`createSimulatedEmail()`):
```json
{
  "id": "sim-msg-001",
  "subject": "Q3 Financial Report",
  "from": "ceo@acmecorp.com",
  "to": "accounting@acmecorp.com",
  "date": "2026-08-19T10:30:00Z",
  "snippet": "Please find the invoice and report attached.",
  "attachments": [
    { "id": "att-001", "filename": "invoice.pdf", "mimeType": "application/pdf", "size": 102400, "data": "JVBERi0xLjQK" },
    { "id": "att-002", "filename": "report.png", "mimeType": "image/png", "size": 51200, "data": "iVBORw0KGgo" }
  ]
}
```

**Flow esperado**:
1. `emailReadImap`: recebe email → normaliza 2 anexos → popula `binary` com `invoice` e `report` → output: 1 item com `json` (metadata do email + `attachments[]`) e `binary` (2 anexos)
2. `gmail` (addLabels): obtém message ID do input → adiciona label `Label_1` → output: 1 item com `{ success: true, labelIds: ["Label_1"] }`

### Scenario: webhook HMAC + payload dispatch

- Webhook path: `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd` (preservado do n8n original)
- HMAC-SHA256 verificado via `createHmac("sha256", secret).update(body).digest("hex")` — mesmo algoritmo usado em `apps/api/src/routes/webhooks.ts`
- Workflow despachado com o payload do webhook como input do trigger

### Validações no teste

- **70 testes — todos passando** (3 arquivos de teste)
- Testes unitários `EmailReadImapHandler`: type/category, processamento de emails com anexos, sem anexos, input vazio/objeto vazio/null, array de emails, filterBySubject (case-insensitive), limit, stripAttachments, fallback de filename/mimeType, markAsRead, multiple recipients, log verification, campos alternativos de anexo
- Testes unitários `GmailHandler`: type/category, addLabels (message ID, custom labels, defaults), removeLabels, send (params.message + input items), get, unknown operation (pass-through), error cases (no ID, null input, empty input)
- Testes de integração: workflow definition (2 nodes, 1 edge, credential refs), credential encryption round-trip (AES-256-GCM), HMAC signature verification (valid/invalid/different secret), registry (2 handlers, unknown type), full workflow execution (E2E: IMAP → addLabels), webhook trigger simulation

## Resultados de cobertura (v8)

| Arquivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `credenciais-wf3.ts` | 100% | 100% | 100% | 100% |
| `runner.ts` | 99.09% | 68.75% | 100% | 99.09% |
| `wf3-workflow.ts` | 100% | 100% | 100% | 100% |
| `handlers/email-read-imap.ts` | 79.64% | 82.25% | 80% | 79.64% |
| `handlers/gmail.ts` | 95.37% | 71.42% | 100% | 95.37% |
| **All files** | **92.54%** | **76.47%** | **95%** | **92.54%** |

Todos os thresholds globais atendidos: stmts ≥80%, branch ≥75%, funcs ≥80%, lines ≥80%.

## Como rodar

```bash
# Do workspace root
cd apps/api
npx vitest run --config ../../n8n-migration/recriacao/wf3/vitest.config.ts --coverage
```

## Pendências

- **Parte 2 (integração final)**: As linhas de registro exatas para `apps/api/src/services/executor.ts` estão em `n8n-migration/recriacao/registracoes-pendentes.md` (seção `## wf3`).
- O switch case `emailReadImap` e `gmail` já existem no executor (lines ~480-496) e `emailReadImap` já está na trigger list (line ~550).
- O import dos handlers e registro no `NodeRegistry` estão pendentes para quando o executor adotar o padrão `NodeHandler` registry (Parte 2).
- O handler `gmail` suporta 4 operations (`addLabels`, `removeLabels`, `send`, `get`) — o n8n original usa apenas `addLabels`.

## Decisões de projeto

1. **Sandbox vm vs server import**: Para evitar problemas de resolução de módulos (`ipaddr.js`, `bullmq`, `prisma`), os testes WF3 usam o runner local (mesmo padrão do WF1), sem importar o servidor Fastify.
2. **Credenciais fake**: OAuth2 + IMAP com valores fictícios. Encriptadas via `encryptCredential()` (AES-256-GCM, `apps/api/src/lib/crypto.ts`).
3. **Handler files isolados**: Criados em `n8n-migration/recriacao/wf3/handlers/` — NÃO editam `apps/api/src/services/executor.ts`. As linhas de registro estão em `registracoes-pendentes.md`.
4. **Class-based handlers**: Seguem o padrão `NodeHandler` (interface) do WF1, compatíveis com o `LocalNodeRegistry` e `runWorkflow` do runner compartilhado.
5. **Nenhuma dependência nova adicionada**: apenas APIs nativas do Node.js (`crypto` para HMAC).
