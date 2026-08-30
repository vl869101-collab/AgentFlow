# Builder Relatório — Recriação n8n no AgentFlow

**Missão**: P7y4T8TltPAy  
**Pane**: BUILDER  
**Data**: 2026-08-19  
**Status**: DONE

---

## Resumo Executivo

Foram implementados: tipos de node n8n no shared, mapeador n8n→AgentFlow, handlers no executor, rota de importação, script de seed, e 39 testes unitários — todos passando.

---

## 1. Implementação por Workflow

### Workflow 1: Save Gmail Attachments to Google Drive

| Campo | Valor |
|-------|-------|
| ID n8n | `7JJEwYx7pRTWLvSo` |
| Status | DRAFT (inativo) |
| Nodes | 3 |

**Nós mapeados:**

| # | Nome n8n | Tipo n8n | Tipo AgentFlow | Config preservada |
|---|----------|----------|----------------|-------------------|
| 1 | On New Email | `gmailTrigger` v1.4 | `gmailTrigger` | event, filters (q=has:attachment), options (downloadAttachments) |
| 2 | Split Attachments | `code` v2 | `code` | mode (runOnceForEachItem), jsCode completo preservado |
| 3 | Upload to Google Drive | `googleDrive` v3 | `googleDrive` | resource=file, operation=upload, name expression, driveId/folderId refs |

**Conexões:** On New Email → Split Attachments → Upload to Google Drive (linear, 2 edges)

**Credenciais referenciadas:** Gmail OAuth2, Google Drive OAuth2 (placeholders)

---

### Workflow 2: My workflow

| Campo | Valor |
|-------|-------|
| ID n8n | `SkxlGdS2egKPhibM` |
| Status | DRAFT (inativo) |
| Nodes | 1 |

**Nós mapeados:**

| # | Nome n8n | Tipo n8n | Tipo AgentFlow | Config preservada |
|---|----------|----------|----------------|-------------------|
| 1 | When fetching a dataset row | `evaluationTrigger` v4.7 | `evaluationTrigger` | dataTableId (referência RL) |

**Conexões:** Nenhuma (standalone trigger)

---

### Workflow 3: My workflow 2

| Campo | Valor |
|-------|-------|
| ID n8n | `2ZImw8KzAbLMT7ca` |
| Status | DRAFT (inativo) |
| Nodes | 2 |

**Nós mapeados:**

| # | Nome n8n | Tipo n8n | Tipo AgentFlow | Config preservada |
|---|----------|----------|----------------|-------------------|
| 1 | Email Trigger (IMAP) | `emailReadImap` v2.2 | `emailReadImap` | options |
| 2 | Add label to message | `gmail` v2.2 | `gmail` | operation=addLabels, webhookId preservado |

**Conexões:** Email Trigger (IMAP) → Add label to message (1 edge)

**Webhook referenciado:** `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd` (no node gmail, preservado em config)

**Credenciais referenciadas:** IMAP Email, Gmail OAuth2 (placeholders)

---

## 2. Tabela Node Type → Handler

| Node Type n8n | Tipo AgentFlow | Handler no Executor | Categoria |
|---------------|----------------|---------------------|-----------|
| `n8n-nodes-base.gmailTrigger` | `gmailTrigger` | Pass-through + metadata (_trigger, _config com event/filters/options) | trigger |
| `n8n-nodes-base.code` | `code` | Erro controlado (code execution disabled) | transform |
| `n8n-nodes-base.googleDrive` | `googleDrive` | Pass-through + metadata (_action, _config com resource/operation/name) | action |
| `n8n-nodes-base.evaluationTrigger` | `evaluationTrigger` | Pass-through + metadata (_trigger, _config com dataTableId) | trigger |
| `n8n-nodes-base.emailReadImap` | `emailReadImap` | Pass-through + metadata (_trigger, _config com options) | trigger |
| `n8n-nodes-base.gmail` | `gmail` | Pass-through + metadata (_action, _config com operation) | action |

**Nota:** Todos os handlers para os 3 workflows reais funcionam como pass-through com metadata, pois:
- Os workflows reais usam credenciais OAuth2/IMAP que requerem integração real com APIs externas
- O executor preserva todos os parâmetros originais do n8n no `config.parameters`
- O código JS do node "Split Attachments" está preservado integralmente para uso futuro com sandbox

---

## 3. Arquivos Criados/Alterados

### Criados

| Arquivo | Descrição |
|---------|-----------|
| `packages/shared/src/n8n-import.ts` | Mapeador n8n→AgentFlow (importação de workflows) |
| `apps/api/tests/unit/n8n-import.test.ts` | 30 testes do mapeador (3 workflows + edge cases + type mapping) |
| `apps/api/tests/unit/n8n-executor.test.ts` | 9 testes dos handlers do executor |
| `n8n-migration/seed-workflows.ts` | Script de seed para importar os 3 workflows via Prisma |
| `n8n-migration/builder-relatorio.md` | Este relatório |

### Alterados

| Arquivo | Mudança |
|---------|---------|
| `packages/shared/src/index.ts` | Adicionados 5 tipos n8n ao enum + export de importN8nWorkflow |
| `apps/api/src/services/executor.ts` | Adicionados 5 handlers para tipos n8n (gmailTrigger, googleDrive, evaluationTrigger, emailReadImap, gmail) |
| `apps/api/src/routes/workflows.ts` | Adicionada rota POST `/import` + atualizado canvasKind para novos tipos |

---

## 4. Testes com Resultados

### n8n-import.test.ts — 30 testes, todos passando ✅

```
✓ Save Gmail Attachments to Google Drive (7 testes)
  - name, status, 3 nodes, gmailTrigger/code/googleDrive mapping, 2 edges, no warnings
✓ My workflow (5 testes)
  - name, status, 1 node, evaluationTrigger mapping, no edges, no warnings
✓ My workflow 2 (6 testes)
  - name, status, 2 nodes, emailReadImap/gmail mapping, 1 edge, no warnings
✓ Importer edge cases (6 testes)
  - wrapped/flat format, auto-generated IDs, preserved IDs, missing node warnings, empty workflow
✓ Type mapping coverage (1 teste)
  - all 12 known n8n types map to valid AgentFlow types
```

### n8n-executor.test.ts — 9 testes, todos passando ✅

```
✓ gmailTrigger handler returns trigger metadata
✓ googleDrive handler returns action metadata
✓ chains: gmailTrigger → googleDrive produces expected output at each step
✓ evaluationTrigger handler returns trigger metadata
✓ emailReadImap handler returns trigger metadata
✓ gmail handler returns action metadata with operation
✓ chains: emailReadImap → gmail produces expected output
✓ trigger/webhook/cron/manual pass through input
✓ throws for unknown node type
```

### Validação cruzada

- `pnpm --filter @agentflow/shared run build` → OK
- `tsc --noEmit` (shared) → OK
- `tsc --noEmit` (api) → OK
- `vitest run tests/unit/n8n-import.test.ts tests/unit/n8n-executor.test.ts` → 39/39 pass

---

## 5. Pendências

| Pendência | Prioridade | Descrição |
|-----------|-----------|-----------|
| Handler `code` (JS sandbox) | Alta | O node "Split Attachments" tem jsCode funcional mas o executor bloqueia por segurança. Implementar sandbox com `isolated-vm` para executar código n8n |
| Handler Google Drive real | Alta | Fazer upload via Google Drive API (requer OAuth2 credential funcional) |
| Handler Gmail real | Alta | Operações Gmail (addLabels, send, etc.) via Gmail API (requer OAuth2 credential funcional) |
| Handler IMAP real | Média | Leitura de email via IMAP (requer credential IMAP funcional) |
| Cron Scheduler | Média | Agendar execuções via cron expressions para workflows com triggers temporais |
| Webhook receiver para n8n triggers | Média | Endpoints POST que disparam workflows a partir de triggers externos |
| UI NodePalette com tipos n8n | Baixa | Renderizar os 5 novos tipos de node no palette lateral do editor |
| Expressão engine (`{{ $json.x }}`) | Média | Implementar subset do expression engine n8n para resolver expressões em parâmetros |
| Undo/Redo no canvas | Baixa | Histórico de ações no editor visual |
| Testes E2E com DB real | Média | Testes de integração com PostgreSQL para workflows importados |
