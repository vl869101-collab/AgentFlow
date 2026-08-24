# Registrações Pendentes — Recriação n8n → AgentFlow

> **Work dir**: `n8n-migration/recriacao/`
> **Missão**: Acumular pendências de registro de node types / handlers para a Parte 2
> (integração final). Cada "pane" APPENDa sua seção aqui. Quando as 3 seções
> (wf1, wf2, wf3) estiverem presentes, aplicar TODAS as linhas de registro no(s)
> arquivo(s) de registry do executor (`apps/api`).

---

## wf2 — My workflow (n8n id: SkxlGdS2egKPhibM)

- **Workflow n8n**: `My workflow` — 1 node, 0 edges, nenhuma credencial.
- **Node**: `When fetching a dataset row` — `n8n-nodes-base.evaluationTrigger` v4.7 (trigger de avaliação).

### Handler criado (arquivo novo)

- `apps/api/src/services/nodes/evaluationTrigger.ts`
  - `EvaluationTriggerParamsSchema` (Zod)
  - `executeEvaluationTrigger(config, input)`
  - `buildEvaluationTriggerConfig(dataTableId, overrides)`
  - `parseEvaluationTriggerConfig(config)`
  - `isEvaluationTrigger(config)`
  - Constantes: `EVALUATION_TRIGGER_TYPE`, `EVALUATION_TRIGGER_NATIVE_TYPE`, `EVALUATION_TRIGGER_VERSION`

### Workflow nativo persistido

- Fixture: `n8n-migration/recriacao/fixtures/wf2-native-workflow.json`
- Persistido no store in-memory (ALLOW_MEMORY_DB=1) nos testes:
  - 1 WorkflowNode: type=`evaluationTrigger`, label=`When fetching a dataset row`
  - 0 WorkflowEdge
  - 1 WorkflowVersion (snapshot)

### Pendências de registro no executor (`apps/api/src/services/executor.ts`)

1. **Adicionar `evaluationTrigger` à lista de triggers reconhecidos em `executeGraph`**
   - File: `apps/api/src/services/executor.ts`, line ~552
   - Current:
     ```typescript
     const trigger = nodes.find((node) => ["trigger", "webhook", "cron", "manual"].includes(node.type));
     ```
   - Proposed:
     ```typescript
     const trigger = nodes.find((node) =>
       ["trigger", "webhook", "cron", "manual", "evaluationTrigger"].includes(node.type),
     );
     ```

2. **Refatorar o case inline `evaluationTrigger` no `executeNode` switch para delegar no handler dedicado**
   - File: `apps/api/src/services/executor.ts`, lines ~475-482
   - Current:
     ```typescript
     case "evaluationTrigger": {
       const params = node.config.parameters as Record<string, unknown> | undefined;
       return {
         ...asObject(input),
         _trigger: "evaluationTrigger",
         _config: { dataTableId: params?.dataTableId },
       };
     }
     ```
   - Proposed: delegar para `executeEvaluationTrigger(node.config, input)` importado de `../services/nodes/evaluationTrigger.js`, mantendo o output shape compatível:
     ```typescript
     case "evaluationTrigger":
       return executeEvaluationTrigger(node.config, input);
     ```

3. **Adicionar `evaluationTrigger` à lista de `canvasKind` triggers em `apps/api/src/routes/workflows.ts`** (já presente — linha 19: `includes("evaluationTrigger")` retorna `"trigger"`). Nenhuma alteração necessária.

### Pendências de registro no registry compartilhado (`packages/shared/src/index.ts`)

- O tipo `evaluationTrigger` já está em `workflowNodeTypeValues` (line 66) e em `NODE_TYPES` (line 292).
- **Nenhuma alteração no registry compartilhado** — conforme requisito do briefing (NÃO editar).

---

## wf1 — Save Gmail Attachments to Google Drive (n8n id: wf1)

- **Workflow n8n**: `Save Gmail Attachments to Google Drive` — 3 nodes, 2 edges, 2 credenciais (fake).
- **Nodes n8n originais**:
  1. `On New Email` — `gmailTrigger` v1.4 (trigger)
  2. `Split Attachments` — `code` v1 (transform)
  3. `Upload to Google Drive` — `googleDrive` v1 (action)

### Handlers criados (arquivo novo)

| File | Exports |
|---|---|
| `n8n-migration/recriacao/handlers/types.ts` | `NodeHandler`, `NodeExecutionContext`, `NodeExecutionResult`, `CodeExecutionError`, `createCodeExecutionError` |
| `n8n-migration/recriacao/handlers/code-sandbox.ts` | `executeCodeInSandbox`, `detectDangerousPatterns`, `DEFAULT_TIMEOUT_MS`, `DEFAULT_MEMORY_LIMIT_MB` |
| `n8n-migration/recriacao/handlers/gmailTrigger.ts` | `GmailTriggerHandler`, `extractAttachments`, `GMAIL_TRIGGER_NATIVE_TYPE` |
| `n8n-migration/recriacao/handlers/code.ts` | `CodeNodeHandler`, `CODE_NODE_NATIVE_TYPE` |
| `n8n-migration/recriacao/handlers/googleDrive.ts` | `GoogleDriveHandler`, `GOOGLE_DRIVE_NATIVE_TYPE` |

### Pendências de registro no executor (`apps/api/src/services/executor.ts`)

1. **Adicionar import dos handlers nativos** (após o topo do arquivo)
   ```typescript
   import { GmailTriggerHandler } from "../../../n8n-migration/recriacao/handlers/gmailTrigger.js";
   import { CodeNodeHandler } from "../../../n8n-migration/recriacao/handlers/code.js";
   import { GoogleDriveHandler } from "../../../n8n-migration/recriacao/handlers/googleDrive.js";
   ```

2. **Instanciar e registrar no NodeRegistry** (após o construtor/registro de handlers)
   ```typescript
   nodeRegistry.register("gmailTrigger", new GmailTriggerHandler());
   nodeRegistry.register("code", new CodeNodeHandler());
   nodeRegistry.register("googleDrive", new GoogleDriveHandler());
   ```

3. **Adicionar `code` à lista de tipos de node com suporte ao sandbox** (não retornar mais `CodeExecutionDisabledError`)
   - File: `apps/api/src/services/executor.ts`, `executeNode` switch
   - Current (bloqueado):
     ```typescript
     case "code": {
       throw createCodeExecutionError(
         "Code execution is not allowed in this environment.",
         "CODE_EXECUTION_DISABLED",
       );
     }
     ```
   - Proposed: delegar para `new CodeNodeHandler().execute(ctx)` que usa `executeCodeInSandbox()` com sandbox `vm` seguro.

4. **Adicionar `gmailTrigger` e `googleDrive` ao trigger-type check em `executeGraph`** (junto com `evaluationTrigger`)
   - File: `apps/api/src/services/executor.ts`, line ~552
   - Proposed:
     ```typescript
     const trigger = nodes.find((node) =>
       ["trigger", "webhook", "cron", "manual", "gmailTrigger", "evaluationTrigger"].includes(node.type),
     );
     ```

### Persistência do workflow nativo

- Fixture: `n8n-migration/recriacao/wf1-workflow.ts` (função `createWf1Workflow()`)
- 3 WorkflowNodes (types: `gmailTrigger`, `code`, `googleDrive`)
- 2 WorkflowEdges (gmailTrigger → code → googleDrive)
- 2 WorkflowCredentials (fake OAuth2 — `gmailOAuth2Api`, `googleApi`) encriptadas via AES-256-GCM

### Testes locais

- File: `n8n-migration/recreacao/test/wf1-executor.test.ts`
- Coverage (v8): 97.38% stmts, 77.94% branch, 93.87% funcs, 97.38% lines
- 74 testes — todos passando
- Inclui: sandbox unitários (security blocks, timeout, runtime errors), handlers unitários, end-to-end (email com 2 anexos → split → upload, email sem anexos)

---

## wf3 — My workflow 2 (n8n id: 2ZImw8KzAbLMT7ca)

- **Workflow n8n**: `My workflow 2` — 2 nodes, 1 edge, 2 credenciais (fake).
- **Nodes n8n originais**:
  1. `Email Trigger (IMAP)` — `n8n-nodes-base.emailReadImap` v2.2 (trigger)
  2. `Add label to message` — `n8n-nodes-base.gmail` v2.2 (action, operation `addLabels`, webhookId `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd`)

### Handlers criados (arquivo novo)

| File | Exports |
|---|---|
| `n8n-migration/recriacao/wf3/handlers/types.ts` | re-export de `NodeHandler`, `NodeExecutionContext`, `NodeExecutionResult`, `NodeItem` de `../../handlers/types.js` |
| `n8n-migration/recriacao/wf3/handlers/email-read-imap.ts` | `EmailReadImapHandler` (class, `type="emailReadImap"`, `category="trigger"`, `execute(ctx)`), `EMAIL_READ_IMAP_NATIVE_TYPE`, `EMAIL_READ_IMAP_ORIGINAL_TYPE` + tipos `EmailReadImapParameters`, `ImapCredentialData`, `SimulatedEmail`, `AttachmentData` |
| `n8n-migration/recriacao/wf3/handlers/gmail.ts` | `GmailHandler` (class, `type="gmail"`, `category="action"`, `execute(ctx)`), `GMAIL_NATIVE_TYPE`, `GMAIL_ORIGINAL_TYPE` + tipos `GmailParameters`, `GmailCredentialData` |
| `n8n-migration/recriacao/wf3/handlers/index.ts` | re-export de todos os handlers e tipos acima |

> API em estilo classe (`NodeHandler` interface — compatível com o runner WF1).
> `execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult>`.

### Arquivos de suporte (arquivo novo)

| File | Purpose |
|---|---|
| `n8n-migration/recriacao/wf3/wf3-workflow.ts` | `createWf3Workflow()` — definição nativa AgentFlow (2 nodes, 1 edge, credentialRefs) |
| `n8n-migration/recriacao/wf3/credenciais-wf3.ts` | `createWf3Credentials(orgId)` — credenciais IMAP + Gmail OAuth2 fake (AES-256-GCM) |
| `n8n-migration/recriacao/wf3/runner.ts` | `createWf3Registry()`, `runWorkflow()` — runner local (reutiliza `LocalNodeRegistry` + `topologicalSort` do runner WF1) |
| `n8n-migration/recriacao/wf3/tests/setup.ts` | Define `CREDENTIAL_ENCRYPTION_KEY` antes do carregamento de módulos |
| `n8n-migration/recriacao/wf3/vitest.config.ts` | Config isolada: root=`wf3/`, include=`tests/**/*.test.ts`, coverage thresholds 80/75/80/80 |

### Pendências de registro no executor (`apps/api/src/services/executor.ts`)

**Status: switch cases e trigger list já presentes (Parte 1 concluída)**

1. **`emailReadImap` já está na lista de triggers em `executeGraph`** — line ~552:
   ```typescript
   ["trigger", "webhook", "cron", "manual", "evaluationTrigger", "gmailTrigger", "emailReadImap"].includes(node.type)
   ```
   Nenhuma alteração necessária.

2. **Cases `emailReadImap` e `gmail` já existem no `executeNode` switch** — lines ~480-496:
   ```typescript
   case "emailReadImap": {
     const params = node.config.parameters as Record<string, unknown> | undefined;
     const options = asObject(params?.options);
     return { ...asObject(input), _trigger: "emailReadImap", _config: { options } };
   }
   case "gmail": {
     const params = node.config.parameters as Record<string, unknown> | undefined;
     return { ...asObject(input), _action: "gmail", _config: { operation: params?.operation } };
   }
   ```
   Nenhuma alteração necessária — estes cases preparam o execution input para o worker.

**Pendência Part 2 — import e delegação (a aplicar quando o worker/registry for integrado):**

3. **Importar os handlers** (topo do `executor.ts`, após o import de `evaluationTrigger`):
   ```typescript
   import { EmailReadImapHandler } from "../../../n8n-migration/recriacao/wf3/handlers/email-read-imap.js";
   import { GmailHandler } from "../../../n8n-migration/recriacao/wf3/handlers/gmail.js";
   ```

4. **Instanciar e registrar em NodeRegistry** (quando o executor adotar o padrão `NodeHandler` registry):
   ```typescript
   nodeRegistry.register("emailReadImap", new EmailReadImapHandler());
   nodeRegistry.register("gmail", new GmailHandler());
   ```

### Estado atual (PANE-701 — validação executor.ts)

- **Cases inline mantidos**: o `executor.ts` NÃO importa nem delega para as classes `EmailReadImapHandler`/`GmailHandler` de `wf3/handlers/`. Os cases `emailReadImap` (L491) e `gmail` (L500) permanecem inline, preparando o execution input para o worker. **Decisão documentada**: manter inline cases até o executor adotar o padrão `NodeHandler` registry (Part 2). Os handlers de classe existem e estão testados (70 testes, coverage 92.54%), mas não são referenciados pelo executor.
- **Trigger list** (L561) já inclui `evaluationTrigger`, `gmailTrigger`, `emailReadImap` — nenhuma alteração necessária.
- **wf1/wf2**: `CodeNodeHandler` importado (L9) e instanciado (L418); `executeEvaluationTrigger` importado (L8) e delegado (L490).

### Workflow nativo persistido

- Fixture: `n8n-migration/recriacao/wf3/wf3-workflow.ts` (`createWf3Workflow()`)
- 2 WorkflowNodes:
  - `type="emailReadImap"`, label=`"Email Trigger (IMAP)"`, `originalN8nType="n8n-nodes-base.emailReadImap"`, `typeVersion=2.2`
  - `type="gmail"`, label=`"Add label to message"`, `originalN8nType="n8n-nodes-base.gmail"`, `typeVersion=2.2`, `webhookId="09fc1dd4-a6dd-4e14-a817-de6d6c6503fd"`
- 1 WorkflowEdge: `emailReadImap` → `gmail` (sourceHandle=`"main"`, targetHandle=`"main"`)
- 2 credenciais (fake, AES-256-GCM):
  - `cred-imap-wf3` (provider: `imap`) — host, port, user, password, secure, mailbox
  - `cred-gmail-oauth2-wf3` (provider: `gmail`) — client_id, refresh_token, access_token, scope

### Testes locais

- Files: `n8n-migration/recriacao/wf3/tests/{email-read-imap,gmail,wf3-integration}.test.ts` + `setup.ts`
- Infra própria: `wf3/vitest.config.ts`, `wf3/tests/setup.ts`
- **70 testes — todos passando**
- Coverage (v8): 92.54% stmts, 76.47% branch, 95% funcs, 92.54% lines
- Mocks de IMAP/Gmail sem rede real (credenciais fake via AES-256-GCM)
- Webhook HMAC-SHA256 verificado localmente (`createHmac`) sem servidor Fastify
