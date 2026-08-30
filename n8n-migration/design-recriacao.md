# Design: Recriar n8n no AgentFlow

> **Missão**: Recriar n8n dentro do AgentFlow (monorepo Next.js + Prisma/Postgres)  
> **Work dir**: `n8n-migration/`  
> **Data**: 2025-08-20  
> **Status**: DESIGN — não implementar, não commitar

---

## Resumo Executivo

Este documento propõe a arquitetura para recriar as funcionalidades centrais do n8n (editor visual de workflows, execução assíncrona, gerenciamento de credenciais, webhooks) aproveitando ao máximo o que **já existe** no repositório AgentFlow:

- **Prisma schema** já possui modelos para `Workflow`, `WorkflowNode`, `WorkflowEdge`, `WorkflowExecution`, `NodeExecution`, `Credential`, `Webhook`, `Approval`
- **API (Fastify)** já tem rotas para workflows, execuções, credenciais, webhooks
- **Web (Next.js 15 + React 19)** já usa `@xyflow/react` v12 para o canvas visual
- **Queue/Worker** já usa `bullmq` + Redis para execução assíncrona
- **Criptografia** já implementada em `apps/api/src/lib/crypto.ts` (AES-256-GCM + envelope JSON)

O design abaixo **não introduz novas dependências pesadas**; apenas estende, completa e conecta o que já está lá.

---

## (a) Modelos Prisma Propostos

> **Nota**: O schema atual (`packages/database/prisma/schema.prisma`) já cobre ~90% do necessário. Abaixo estão as **adições/ajustes** recomendados.

### Enums (já existentes — confirmar apenas)

```prisma
enum WorkflowStatus {
  DRAFT      // Em edição, não executável via webhook/cron
  ACTIVE     // Publicado, executável via webhook/cron/API
  PAUSED     // Publicado mas pausado (não dispara webhooks/crons)
  ARCHIVED   // Arquivado, somente leitura
}

enum ExecutionStatus {
  PENDING            // Na fila, aguardando worker
  RUNNING            // Executando
  SUCCESS            // Concluído com sucesso
  FAILED             // Falhou (erro em node não-crítico ou erro global)
  CANCELLED          // Cancelado pelo usuário
  WAITING_APPROVAL   // Pausado aguardando aprovação humana
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}
```

### Tabelas Principais (já existem — ver schema.prisma:76-149, 155-233)

| Modelo | Propósito | Campos-Chave |
|--------|-----------|--------------|
| `Workflow` | Definição do workflow (metadados + versão atual) | `id`, `name`, `description`, `status`, `ownerId`, `orgId`, `versions[]`, `nodes[]`, `edges[]`, `webhooks[]` |
| `WorkflowVersion` | Versionamento imutável (snapshot JSON completo) | `id`, `version`, `snapshot (Json)`, `workflowId` |
| `WorkflowNode` | Nó individual no canvas | `id`, `type`, `label`, `config (Json)`, `position (Json)`, `width`, `height`, `workflowId` |
| `WorkflowEdge` | Conexão entre nós | `id`, `sourceNodeId`, `targetNodeId`, `sourceHandle`, `targetHandle`, `label`, `condition (Json)`, `workflowId` |
| `WorkflowExecution` | Execução de um workflow | `id`, `status`, `trigger`, `input`, `output`, `error`, `startedAt`, `finishedAt`, `duration`, `workflowId`, `orgId`, `userId`, `nodes[]`, `approvals[]` |
| `NodeExecution` | Execução de um nó específico | `id`, `status`, `input`, `output`, `error`, `logs`, `startedAt`, `finishedAt`, `duration`, `nodeId`, `executionId`, `retryCount`, `idempotencyKey` |
| `Credential` | Credencial criptografada por org | `id`, `name`, `type` (api_key, oauth2, basic, token), `provider`, `data (String encrypted)`, `orgId` |
| `Webhook` | Endpoint público para disparar workflow | `id`, `path`, `secret`, `method`, `active`, `workflowId?`, `orgId` |

---

### Adições Recomendadas (NOVO)

```prisma
// ═══════════════════════════════════════════
// Node Types Registry (catálogo de tipos de nó suportados)
// ═══════════════════════════════════════════

model NodeType {
  id          String   @id @default(cuid())
  key         String   @unique // "httpRequest", "webhook", "cron", "if", "set", "code", "aiAgent", etc.
  displayName String   // "HTTP Request", "Webhook", "Cron", "IF", "Set", "Code", "AI Agent"
  category    String   // "trigger", "action", "logic", "transform", "ai"
  description String?
  icon        String?  // lucide icon name ou SVG
  color       String?  // hex color para UI
  version     Int      @default(1)
  
  // Schema JSON do parâmetros do nó (Zod/JSON Schema)
  parametersSchema Json   @default("{}")
  // Schema JSON dos outputs do nó
  outputsSchema    Json   @default("{}")
  // Se é um trigger (inicia workflow)
  isTrigger        Boolean @default(false)
  // Se suporta execução assíncrona (webhook, cron, etc.)
  supportsAsync    Boolean @default(false)
  // Config defaults
  defaults         Json   @default("{}")
  // Se é built-in (sistema) vs custom (usuário)
  isBuiltIn        Boolean @default(true)
  enabled          Boolean @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([category, enabled])
  @@index([isTrigger, enabled])
}

// ═══════════════════════════════════════════
// Workflow Schedule (para triggers cron/agendados)
// ═══════════════════════════════════════════

model WorkflowSchedule {
  id          String   @id @default(cuid())
  workflowId  String   @unique
  cronExpression String  // "0 9 * * 1-5" (UTC)
  timezone    String   @default("UTC")
  enabled     Boolean  @default(true)
  nextRunAt   DateTime?
  lastRunAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([enabled, nextRunAt])
}

// ═══════════════════════════════════════════
// Workflow Trigger (webhooks ativos por workflow)
// ═══════════════════════════════════════════

model WorkflowTrigger {
  id        String   @id @default(cuid())
  workflowId String
  type      String   // "webhook", "cron", "manual", "api"
  config    Json     @default("{}") // { path: "/webhook/xyz", method: "POST" } ou { cron: "0 * * * *" }
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workflow  Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, type])
  @@index([workflowId, active])
}
```

### Relações Importantes (já no schema)

```
Workflow 1──* WorkflowVersion
Workflow 1──* WorkflowNode
Workflow 1──* WorkflowEdge
Workflow 1──* WorkflowExecution
Workflow 1──* Webhook
Workflow 1──1 WorkflowSchedule (opcional)
Workflow 1──* WorkflowTrigger

WorkflowNode 1──* WorkflowEdge (source)
WorkflowNode 1──* WorkflowEdge (target)
WorkflowNode 1──* NodeExecution

WorkflowExecution 1──* NodeExecution
WorkflowExecution 1──* Approval

Credential *──1 Organization
```

---

## (b) Endpoints REST/API Routes Propostos

> **Base path**: `/api/v1` (já configurado no Fastify)  
> **Autenticação**: JWT Bearer token (middleware `requireAuth`)  
> **Organização**: `orgId` extraído do token ou header `X-Org-Id`

### Workflows

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/workflows` | Listar workflows da org (paginado, filtros: status, search) |
| `POST` | `/workflows` | Criar workflow (status DRAFT) |
| `GET` | `/workflows/:id` | Obter workflow completo (nodes, edges, config) |
| `PATCH` | `/workflows/:id` | Atualizar metadados (name, description) |
| `PUT` | `/workflows/:id` | Substituir definição completa (nodes, edges) — cria nova `WorkflowVersion` |
| `DELETE` | `/workflows/:id` | Arquivar workflow (status → ARCHIVED) |
| `POST` | `/workflows/:id/activate` | Publicar (DRAFT → ACTIVE) — valida, registra webhooks/crons |
| `POST` | `/workflows/:id/pause` | Pausar (ACTIVE → PAUSED) — desregistra webhooks/crons |
| `POST` | `/workflows/:id/duplicate` | Clonar workflow (novo ID, status DRAFT) |
| `GET` | `/workflows/:id/versions` | Listar versões históricas |
| `POST` | `/workflows/:id/versions/:version/restore` | Restaurar versão anterior (cria nova versão) |
| `GET` | `/workflows/:id/export` | Exportar JSON compatível n8n |
| `POST` | `/workflows/import` | Importar JSON n8n → cria workflow DRAFT |

### Execuções

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/workflows/:id/executions` | Listar execuções (paginado, filtros: status, date range) |
| `POST` | `/workflows/:id/execute` | Executar manualmente (sync ou async via queue) |
| `GET` | `/executions/:executionId` | Detalhes da execução (nodes, inputs, outputs, logs) |
| `GET` | `/executions/:executionId/nodes/:nodeId` | Detalhes de execução de um nó |
| `POST` | `/executions/:executionId/retry` | Re-executar a partir do nó falho |
| `POST` | `/executions/:executionId/cancel` | Cancelar execução em andamento |
| `GET` | `/executions/:executionId/logs` | Stream de logs (Server-Sent Events) |

### Nós (Node Types Registry)

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/node-types` | Listar tipos de nó disponíveis (categorizados) |
| `GET` | `/node-types/:key` | Schema completo de um tipo (parameters, outputs, defaults) |
| `POST` | `/node-types` | Registrar custom node type (admin only) |

### Credenciais

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/credentials` | Listar credenciais da org (sem descriptografar `data`) |
| `POST` | `/credentials` | Criar credencial (criptografa `data` server-side) |
| `GET` | `/credentials/:id` | Obter credencial (data descriptografada — apenas owner/admin) |
| `PATCH` | `/credentials/:id` | Atualizar nome/tipo (re-criptografa se `data` mudou) |
| `DELETE` | `/credentials/:id` | Deletar credencial |
| `POST` | `/credentials/:id/test` | Testar credencial (chama API do provider) |
| `GET` | `/credentials/providers` | Listar providers suportados com campos obrigatórios |

### Webhooks

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/webhooks` | Listar webhooks da org |
| `POST` | `/webhooks` | Criar webhook (gera `path` único, `secret`) |
| `GET` | `/webhooks/:id` | Obter webhook |
| `PATCH` | `/webhooks/:id` | Atualizar (active, workflowId) |
| `DELETE` | `/webhooks/:id` | Deletar webhook |
| `POST` | `/webhooks/:id/test` | Enviar payload de teste |
| **`ANY`** | `/webhook/:orgSlug/:path` | **Endpoint público** — recebe payload, valida HMAC, enfileira execução |

### Agendamentos (Schedules)

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/workflows/:id/schedule` | Obter agendamento do workflow |
| `PUT` | `/workflows/:id/schedule` | Criar/atualizar agendamento (cron expression) |
| `DELETE` | `/workflows/:id/schedule` | Remover agendamento |
| `POST` | `/workflows/:id/schedule/enable` | Ativar agendamento |
| `POST` | `/workflows/:id/schedule/disable` | Desativar agendamento |

### Aprovações

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/approvals` | Listar aprovações pendentes (para o usuário logado) |
| `GET` | `/approvals/:id` | Detalhes da aprovação |
| `POST` | `/approvals/:id/approve` | Aprovar (retoma execução) |
| `POST` | `/approvals/:id/reject` | Rejeitar (finaliza execução como FAILED) |

---

## (c) UI Proposta (Páginas Next.js App Router)

> **Stack**: Next.js 15 App Router + React 19 + `@xyflow/react` v12 + `framer-motion` + `lucide-react` + Tailwind v4  
> **Componentes já existentes**: `WorkflowCanvas`, `NodePalette`, `NodeConfigPanel`, `AIGeneratorModal`, `AppLayout`, UI kit (Button, Card, Modal, Select, Badge)

### Estrutura de Rotas

```
app/
├── (dashboard)/
│   ├── workflows/
│   │   ├── page.tsx                    # Lista de workflows (já existe)
│   │   ├── new/
│   │   │   └── page.tsx                # Criar novo workflow (modal → redirect para editor)
│   │   ├── [id]/
│   │   │   ├── editor/
│   │   │   │   └── page.tsx            # Editor visual (já existe — estender)
│   │   │   ├── executions/
│   │   │   │   ├── page.tsx            # Lista de execuções do workflow
│   │   │   │   └── [executionId]/
│   │   │   │       └── page.tsx        # Detalhes da execução (timeline, node details)
│   │   │   ├── settings/
│   │   │   │   └── page.tsx            # Configurações (webhooks, schedule, permissões)
│   │   │   └── versions/
│   │   │       └── page.tsx            # Histórico de versões
│   ├── credentials/
│   │   ├── page.tsx                    # Lista de credenciais
│   │   ├── new/
│   │   │   └── page.tsx                # Criar credencial (form por provider)
│   │   └── [id]/
│   │       └── page.tsx                # Ver/editar credencial (test connection)
│   ├── executions/
│   │   └── page.tsx                    # Lista global de execuções (todas workflows)
│   └── approvals/
│       └── page.tsx                    # Aprovações pendentes do usuário
```

### 1. Lista de Workflows (`/workflows` — **já existe**)

**Melhorias propostas**:
- Filtros: status (tabs), search por nome, sort por updatedAt
- Ações em lote: ativar, pausar, arquivar, duplicar, deletar
- Badge de status com cores: 🟢 ACTIVE, 🟡 PAUSED, 🔵 DRAFT, ⚫ ARCHIVED
- Indicador visual se tem webhook/cron ativo
- Empty state com CTA "Criar primeiro workflow" + templates rápidos

### 2. Editor Visual (`/workflows/[id]/editor` — **já existe base**)

**Componentes atuais**: `WorkflowCanvas` (React Flow), `NodePalette` (sidebar esquerda), `NodeConfigPanel` (sidebar direita), `AIGeneratorModal`

**Extensões necessárias**:

| Funcionalidade | Status | Implementação |
|----------------|--------|---------------|
| **Node Registry** | ⚠️ Parcial | Carregar `/api/v1/node-types` → popular `NodePalette` dinamicamente |
| **Custom Nodes** | ❌ Falta | Criar componentes React Flow para cada tipo: `TriggerNode`, `ActionNode`, `LogicNode`, `TransformNode`, `AINode` |
| **Parameter Panel** | ⚠️ Parcial | `NodeConfigPanel` usa JSON genérico → trocar por forms tipados por node type (Zod + React Hook Form) |
| **Edge Routing** | ⚠️ Básico | Adicionar `orthogonal` + `smoothstep` edges, handles typed (source/target por tipo) |
| **Undo/Redo** | ❌ Falta | `useHistory` hook (50 steps) + shortcuts Ctrl+Z/Ctrl+Y |
| **Multi-select** | ❌ Falta | Shift+click, marquee selection, delete/copy em lote |
| **Copy/Paste** | ❌ Falta | Ctrl+C/Ctrl+V entre abas/workflows (serializa nodes+edges selecionados) |
| **Snap to Grid** | ⚠️ Parcial | Ativar `snapGrid={[16, 16]}` no `<ReactFlow>` |
| **Minimap** | ❌ Falta | `<MiniMap />` component |
| **Execution Highlight** | ❌ Falta | Ao abrir execução passada, destacar nodes executados (cores: success/error/running) |
| **Keyboard Shortcuts** | ❌ Falta | Delete, Duplicate (Ctrl+D), Select All (Ctrl+A), Zoom (Ctrl++/Ctrl+-) |
| **Auto-save** | ❌ Falta | Debounced (2s) → `PATCH /workflows/:id` (apenas nodes/edges) |
| **Validation** | ❌ Falta | Validar: pelo menos 1 trigger, sem nós órfãos, config obrigatória preenchida |
| **Version History** | ❌ Falta | Sidebar com lista de versões, preview diff, restore |

**Layout do Editor** (3 painéis redimensionáveis):

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: [Logo] [Workflow Name ▼] [Status Badge] [Save] [▶] │
├──────┬────────────────────────────┬────────────────────────┤
│      │                            │                        │
│ Node │      WorkflowCanvas        │   NodeConfigPanel      │
│Palette│  (React Flow)             │   (Dynamic Form)       │
│      │                            │                        │
│      │  - Nodes customizados      │   - Tabs: Parameters  │
│      │  - Edge routing            │             Settings  │
│      │  - Selection box           │             Info      │
│      │  - Minimap (canto)         │   - Validação inline  │
│      │  - Execution overlay       │   - Test node button  │
│      │                            │                        │
├──────┴────────────────────────────┴────────────────────────┤
│ Status Bar: [Zoom] [Grid] [Undo/Redo] [Last saved] [Org]   │
└─────────────────────────────────────────────────────────────┘
```

### 3. Execuções (`/workflows/[id]/executions`)

- Tabela paginada: Status badge, Trigger, Input (truncado), Started, Duration, Actions
- Filtros: status, date range, trigger type
- Clique → navega para `/workflows/[id]/executions/[executionId]`

### 4. Detalhes de Execução (`/workflows/[id]/executions/[executionId]`)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Workflow Name | Execution #123 | Status | Duration │
├─────────────────────────────────────────────────────────────┤
│ Timeline (vertical):                                        │
│  ● START (webhook)     10:00:00.000  ✓  5ms                │
│  ● HTTP Request        10:00:00.005  ✓  245ms  [view]      │
│  ● IF (condition)      10:00:00.250  ✓  2ms   [view]       │
│  ● SET (true branch)   10:00:00.252  ✓  1ms   [view]       │
│  ● AI Agent            10:00:00.253  ✗  3.2s  [view] [retry]│
│  ● END                 10:00:03.505  ✗                      │
├─────────────────────────────────────────────────────────────┤
│ Node Detail Panel (ao clicar [view]):                       │
│  Input:  { "url": "https://api.example.com", ... }          │
│  Output: { "status": 200, "data": {...} }                   │
│  Error:  "Timeout after 30000ms"                            │
│  Logs:   [stdout/stderr do node]                            │
└─────────────────────────────────────────────────────────────┘
```

- **Replay/Re-executar**: Botão "Re-executar a partir daqui" em qualquer nó
- **SSE Logs**: Stream em tempo real se execução estiver RUNNING

### 5. Credenciais (`/credentials`)

- Lista: Nome, Tipo, Provider, Criado em, Último uso
- Modal "Nova Credencial": Select provider → Form dinâmico (Zod schema por provider)
- Botão "Testar Conexão" chama `POST /credentials/:id/test`
- **Segurança**: `data` **nunca** no frontend — apenas nome/tipo/provider. Descriptografia só no backend via endpoint dedicado (auditado)

### 6. Configurações do Workflow (`/workflows/[id]/settings`)

Tabs:
- **General**: Name, Description, Timezone, Error workflow (fallback)
- **Webhooks**: Lista webhooks ativos, botão "Criar webhook", testar
- **Schedule**: Cron expression picker, timezone, preview próximas execuções
- **Permissions**: Quem pode ver/editar/executar (baseado em MemberRole)

---

## (d) Mapeamento JSON n8n → Modelos AgentFlow

> **Objetivo**: Importar/Exportar workflows n8n sem perda de informação

### Estrutura n8n (referência)

```json
{
  "name": "My Workflow",
  "nodes": [
    {
      "id": "1",
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": { "url": "https://api.example.com", "method": "GET" },
      "credentials": { "httpBasicAuth": "my-cred" }
    }
  ],
  "connections": {
    "HTTP Request": {
      "main": [[{ "node": "IF", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "meta": { "templateCredsSetupCompleted": true }
}
```

### Mapeamento Proposto

| n8n Field | AgentFlow Model | Transformação |
|-----------|-----------------|---------------|
| `name` | `Workflow.name` | Direto |
| `nodes[]` | `WorkflowNode[]` | Ver detalhes abaixo |
| `connections` | `WorkflowEdge[]` | Ver detalhes abaixo |
| `active` | `Workflow.status` | `true` → `ACTIVE`, `false` → `DRAFT` |
| `settings` | `Workflow.config` (Json) | Merge com defaults |
| `meta` | `Workflow.meta` (Json) | Preservar para compatibilidade |
| `credentials` (em nodes) | `WorkflowNode.config.credentials` | Referência por nome → resolve para `Credential.id` na importação |

### Nodes: n8n → AgentFlow

```typescript
// n8n node → AgentFlow WorkflowNode
interface N8nNode {
  id: string;                    // → WorkflowNode.id (cuid novo na importação)
  name: string;                  // → WorkflowNode.label
  type: string;                  // → WorkflowNode.type (mapear "n8n-nodes-base.httpRequest" → "httpRequest")
  typeVersion: number;           // → WorkflowNode.config.typeVersion
  position: [number, number];    // → WorkflowNode.position { x, y }
  parameters: JsonObject;        // → WorkflowNode.config.parameters
  credentials?: JsonObject;      // → WorkflowNode.config.credentials (refs por nome)
  disabled?: boolean;            // → WorkflowNode.config.disabled
  notes?: string;                // → WorkflowNode.config.notes
  notesInFlow?: boolean;         // → WorkflowNode.config.notesInFlow
}
```

**Mapeamento de Tipos (n8n → AgentFlow)**:

| n8n Type | AgentFlow Type | Category |
|----------|----------------|----------|
| `n8n-nodes-base.webhook` | `webhook` | trigger |
| `n8n-nodes-base.cron` | `cron` | trigger |
| `n8n-nodes-base.httpRequest` | `httpRequest` | action |
| `n8n-nodes-base.if` | `if` | logic |
| `n8n-nodes-base.set` | `set` | transform |
| `n8n-nodes-base.code` | `code` | transform |
| `n8n-nodes-base.delay` | `delay` | logic |
| `n8n-nodes-base.merge` | `merge` | transform |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | logic |
| `n8n-nodes-base.emailSend` | `emailSend` | action |
| `@n8n/n8n-nodes-langchain.agent` | `aiAgent` | ai |
| ... | ... | ... |

> **Tabela completa** mantida em `packages/shared/src/n8n-node-type-map.ts`

### Connections: n8n → AgentFlow

```typescript
// n8n connections → AgentFlow WorkflowEdge[]
// n8n: { "SourceNode": { "main": [[{ node: "TargetNode", type: "main", index: 0 }]] } }
// AgentFlow: [{ sourceNodeId, targetNodeId, sourceHandle?, targetHandle?, label? }]

function convertConnections(n8nConnections: JsonObject, nodeIdMap: Map<string, string>): WorkflowEdgeInput[] {
  const edges: WorkflowEdgeInput[] = [];
  
  for (const [sourceName, outputs] of Object.entries(n8nConnections)) {
    const sourceId = nodeIdMap.get(sourceName);
    if (!sourceId) continue;
    
    for (const [outputType, connections] of Object.entries(outputs as JsonObject)) {
      // outputType = "main" (padrão) ou nome do output customizado
      for (const branch of connections as any[][]) {
        for (const conn of branch) {
          const targetId = nodeIdMap.get(conn.node);
          if (!targetId) continue;
          
          edges.push({
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            sourceHandle: outputType === "main" ? undefined : outputType,
            targetHandle: conn.type === "main" ? undefined : conn.type,
            label: conn.index !== undefined ? String(conn.index) : undefined,
          });
        }
      }
    }
  }
  
  return edges;
}
```

### Export AgentFlow → n8n

Inverso do acima. Gera JSON compatível com n8n para backup/migração.

---

## (e) Estratégia de Execução (Fila, Runner, Worker)

> **Já existe**: `bullmq` + Redis (`apps/api/src/services/queue.ts`), `executor.ts` (parcial)

### Arquitetura Atual

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API        │────▶│  BullMQ     │────▶│  Worker     │
│  (Fastify)  │     │  Queue      │     │  (Process)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Redis      │     │  Executor   │
                    │  (Queue +   │     │  (Node      │
                    │   Results)  │     │   Runner)   │
                    └─────────────┘     └─────────────┘
```

### Componentes

#### 1. Queue (`apps/api/src/services/queue.ts` — **já existe**)

```typescript
// Job: "execute"
// Data: { executionId: string }
// Options: { jobId: executionId, removeOnComplete: 1000, removeOnFail: 5000 }
// Priority: opcional (manual > webhook > cron)
```

#### 2. Worker Process (NOVO — `apps/api/src/workers/execution.worker.ts`)

```typescript
// Processo separado (ou mesmo processo com cluster)
// - Consome jobs da queue "workflows"
// - Chama Executor.run(executionId)
// - Trata: retries, timeout global, cleanup
// - Emite eventos: execution.started, node.started, node.completed, execution.completed
```

#### 3. Executor (`apps/api/src/services/executor.ts` — **estender**)

**Responsabilidades**:
- Carregar workflow + versão ativa
- Resolver topologia (DAG) → ordem de execução
- Para cada nó:
  - Carregar `NodeType` schema (validação)
  - Resolver credenciais (descriptografar)
  - Executar handler do tipo de nó
  - Persistir `NodeExecution` (input, output, error, logs, duration)
  - Tratar retries (config por nó)
  - Tratar condicionais (IF, SWITCH) → pular branches não executados
  - Tratar loops (SplitInBatches, Loop) → criar sub-execuções
- Agregar resultado final → `WorkflowExecution.output`
- Webhooks assíncronos: responder 202 imediatamente, processar em background

**Handler por Node Type** (Registry Pattern):

```typescript
// packages/shared/src/workflow/node-registry.ts
interface NodeHandler {
  // Valida config do nó contra schema
  validate(config: JsonObject): ValidationResult;
  
  // Executa o nó
  execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult>;
  
  // Opcional: estima duração para progress UI
  estimateDuration?(config: JsonObject): number;
}

interface NodeExecutionContext {
  executionId: string;
  nodeId: string;
  nodeConfig: JsonObject;        // parameters + credentials resolvidas
  input: Json;                   // Output do nó anterior (ou workflow input)
  workflowInput: Json;           // Input original do workflow
  nodeExecutions: NodeExecution[]; // Execuções anteriores neste workflow
  credentials: Map<string, Credential>; // Credenciais descriptografadas
  helpers: {
    http: HttpClient;            // Com timeout, retry, egress allowlist
    crypto: CryptoHelper;
    date: DateHelpers;
    json: JsonHelpers;
  };
}
```

**Handlers Built-in** (implementar em `apps/api/src/services/nodes/`):

| Tipo | Handler | Dependências Externas |
|------|---------|----------------------|
| `webhook` | Recebe payload, valida HMAC, inicia execução | — |
| `cron` | Agendador (ver abaixo) | — |
| `httpRequest` | `fetch` com retry, timeout, redirect | — |
| `if` | Avalia expressão (JSONPath/JS) → branch true/false | — |
| `set` | Define/transforma dados (expressões) | — |
| `code` | Executa JS/TS sandboxado (vm2 ou isolated-vm) | `isolated-vm` |
| `delay` | `setTimeout` / agenda job futuro | — |
| `merge` | Combina múltiplos inputs (modos: append, merge, wait) | — |
| `splitInBatches` | Divide array em batches → sub-execuções | — |
| `emailSend` | Nodemailer / SendGrid / Resend | Provider SDK |
| `aiAgent` | Chama LLM (OpenAI, Anthropic, NVIDIA NIM) | SDKs respectivos |
| `approval` | Cria `Approval` record, pausa execução, notifica | Email/Slack/In-app |

#### 4. Cron Scheduler (NOVO — `apps/api/src/workers/scheduler.worker.ts`)

```typescript
// Processo separado (single instance — leader election via Redis)
// - A cada minuto: query WorkflowSchedule onde enabled=true e nextRunAt <= now
// - Para cada: cria WorkflowExecution (trigger="cron"), enfileira
// - Atualiza nextRunAt (cron parser: croner ou similar)
// - Leader election: Redis SETNX lock com TTL 30s
```

#### 5. Webhook Receiver (já em `apps/api/src/routes/webhooks.ts`)

```typescript
// Endpoint público: ANY /webhook/:orgSlug/:path
// 1. Valida HMAC (header X-Signature / sha256)
// 2. Busca Webhook record (orgId + path)
// 3. Se workflowId e workflow.status === ACTIVE:
//    - Cria WorkflowExecution (trigger="webhook", input=body)
//    - Enfileira em queue (priority: HIGH)
//    - Responde 202 { executionId }
// 4. Senão: 404/410
```

### Configuração de Execução

| Config | Valor Padrão | Onde |
|--------|--------------|------|
| `EXECUTION_TIMEOUT_MS` | 300000 (5 min) | `env.ts` |
| `NODE_TIMEOUT_MS` | 60000 (1 min) | `env.ts` |
| `MAX_RETRIES` | 3 (por nó) | `NodeType.defaults` |
| `RETRY_DELAY_MS` | 1000, 5000, 30000 (exponential) | `NodeType.defaults` |
| `QUEUE_CONCURRENCY` | 10 (por worker) | `bullmq` worker options |
| `MAX_PAYLOAD_SIZE` | 10MB | Fastify body parser |

---

## (f) Encriptação de Credenciais

> **Já implementado**: `apps/api/src/lib/crypto.ts` — **AES-256-GCM** com envelope JSON

### Esquema Atual (crypto.ts)

```typescript
// Envelope format:
{
  "v": 1,                    // Versão do envelope
  "alg": "AES-256-GCM",      // Algoritmo
  "salt": "base64",          // Salt PBKDF2 (16 bytes)
  "iv": "base64",            // IV único por encriptação (12 bytes)
  "ct": "base64",            // Ciphertext + auth tag
  "kdf": "PBKDF2",           // Key derivation
  "iter": 100000             // Iterações PBKDF2
}
```

**Chave mestra**: Derivada de `JWT_SECRET` (mín. 32 chars) via PBKDF2 + salt por credencial.

### Fluxo

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│  API        │────▶│  Database   │
│  (plain)    │     │  encrypt()  │     │  (encrypted)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  JWT_SECRET │
                    │  (env var)  │
                    └─────────────┘
```

**API Credentials**:
- `POST /credentials` → body: `{ name, type, provider, data: { apiKey: "sk-...", ... } }` → API criptografa `data` → salva `Credential.data = envelope`
- `GET /credentials/:id` → **apenas owner/admin** → API descriptografa → retorna `{ ..., data: { apiKey: "sk-..." } }`
- `POST /credentials/:id/test` → API descriptografa, chama provider, retorna sucesso/falha (sem vazar segredo)

### Rotação de Chave (Key Rotation)

```typescript
// NOVO: apps/api/src/lib/crypto.ts
export async function reencryptCredential(
  envelope: string, 
  newMasterKey: string
): Promise<string> {
  const plaintext = decryptCredential(envelope);
  return encryptCredential(plaintext, newMasterKey);
}

// Job admin: reencryptAllCredentials(newMasterKey)
// - Processa em batches (100 por job)
// - Loga progresso em AuditLog
// - Rollback se falha > 5%
```

### Boas Práticas (já no código)

- ✅ **Salt único por credencial** (previne rainbow tables)
- ✅ **IV único por encriptação** (previne análise de padrão)
- ✅ **Auth tag GCM** (integridade + autenticidade)
- ✅ **PBKDF2 100k iterações** (resistência a brute-force)
- ✅ **Chave mestra fora do código** (env var `JWT_SECRET`)
- ⚠️ **Falta**: Rotação automática programada (ex: a cada 90 dias)
- ⚠️ **Falta**: HSM/KMS integration para produção enterprise (AWS KMS, GCP KMS, Azure Key Vault)

---

## (g) Roadmap em Fases (P0 → P3)

> **Princípio**: Entregar valor incrementalmente. Cada fase é **usável sozinha**.

### P0 — Foundation (Semana 1-2) ✅ **MAIORIA JÁ FEITA**

| Task | Status | Esforço |
|------|--------|---------|
| Prisma models (Workflow, Node, Edge, Execution, Credential, Webhook) | ✅ Pronto | — |
| API routes CRUD workflows | ✅ Pronto | — |
| API routes CRUD credentials + crypto | ✅ Pronto | — |
| API routes webhooks (management + receiver) | ✅ Pronto | — |
| Queue (bullmq) + enqueueExecution | ✅ Pronto | — |
| Web: Workflows list page | ✅ Pronto | — |
| Web: Editor canvas base (@xyflow/react) | ✅ Pronto | — |
| Web: NodePalette + NodeConfigPanel base | ✅ Pronto | — |

**Entregável P0**: Workflow CRUD + Canvas vazio + Credenciais criptografadas + Webhook receiver funcional

---

### P1 — Editor Funcional (Semana 3-4)

| Task | Descrição | Esforço |
|------|-----------|---------|
| **Node Type Registry** | Criar `NodeType` model + seed com 15+ tipos built-in + API `/node-types` | M |
| **Custom React Flow Nodes** | Componentes por categoria: TriggerNode, ActionNode, LogicNode, TransformNode, AINode (handles typed, badges, cores) | L |
| **Dynamic Parameter Forms** | Zod schema por node type → React Hook Form no `NodeConfigPanel` + validação inline | L |
| **Edge Routing Avançado** | Orthogonal edges, handles typed (source/target por output/input), edge labels | M |
| **Undo/Redo** | `useHistory` hook (50 steps) + keyboard shortcuts | M |
| **Multi-select + Copy/Paste** | Marquee selection, Shift+click, Ctrl+C/V entre abas | M |
| **Minimap + Snap Grid** | `<MiniMap />`, `snapGrid={[16,16]}` | S |
| **Auto-save (debounced)** | Salva nodes/edges a cada 2s sem bloquear UI | S |
| **Validation Pré-publicação** | Check: 1+ trigger, sem nós órfãos, config obrigatória | M |

**Entregável P1**: Editor visual completo — criar, editar, conectar nós, configurar parâmetros, salvar

---

### P2 — Execução End-to-End (Semana 5-7)

| Task | Descrição | Esforço |
|------|-----------|---------|
| **Executor Core** | DAG resolver, execução sequencial/paralela, persistência NodeExecution | L |
| **Node Handlers Built-in** | httpRequest, if, set, code, delay, merge, splitInBatches, webhook (trigger) | L |
| **Worker Process** | Processo separado consumindo queue, timeouts, retries, cleanup | M |
| **Cron Scheduler** | Leader election, `WorkflowSchedule` → enfileira execuções | M |
| **Execution UI** | Lista execuções, detalhes com timeline, node drill-down, logs SSE | L |
| **Re-execução** | Retry from failed node, replay com mesmo input | M |
| **Aprovações (Human-in-the-loop)** | Node `approval` → cria `Approval` record → pausa execução → UI para aprovar/rejeitar | M |
| **Error Handling** | Error workflow (fallback), dead letter queue, alertas | M |

**Entregável P2**: Workflows executam de ponta a ponta — triggers (webhook, cron, manual), actions, logic, retry, aprovação humana

---

### P3 — Polishing & Enterprise (Semana 8-10)

| Task | Descrição | Esforço |
|------|-----------|---------|
| **Import/Export n8n** | Import JSON n8n → AgentFlow, Export AgentFlow → n8n JSON | M |
| **Templates Gallery** | Workflows pré-definidos (webhook → HTTP → Slack, etc.) | M |
| **AI Node Generator** | Expandir `AIGeneratorModal` → gera nodes+edges a partir de prompt | L |
| **Version History UI** | Sidebar com versões, diff visual, restore 1-click | M |
| **Execution Highlight no Canvas** | Abrir execução passada → nodes coloridos (success/error/running) | M |
| **Keyboard Shortcuts Completos** | Delete, Dup, Select All, Zoom, Pan, Search nodes (Cmd+K) | S |
| **Credential Rotation** | Job agendado para re-encrypt todas credenciais | S |
| **KMS/HSM Integration** | Provider abstraction para AWS KMS, GCP KMS, Azure Key Vault | L |
| **Audit Log Completo** | Todas ações sensíveis (cred create/read/execute) → `AuditLog` | S |
| **Performance** | Lazy load node components, virtualized execution list, query optimization | M |
| **Testes E2E** | Playwright: create workflow → add nodes → execute → verify output | L |

**Entregável P3**: Produto polido, compatível n8n, pronto para usuários reais

---

## Dependências Adicionais (Mínimas)

| Pacote | Propósito | Fase |
|--------|-----------|------|
| `croner` | Parse/next-run de cron expressions | P2 |
| `isolated-vm` ou `vm2` | Sandbox para node `code` (JS/TS seguro) | P2 |
| `jsonpath-plus` | Expressões JSONPath no node `if`/`set` | P2 |
| `zod-to-json-schema` | Gerar JSON Schema dos Zod schemas para UI | P1 |
| `react-hook-form` + `@hookform/resolvers` | Forms tipados no NodeConfigPanel | P1 |
| `@xyflow/system` (opcional) | Headless state para undo/redo complexo | P1 |

> **Nota**: Todas as deps principais (`@xyflow/react`, `bullmq`, `ioredis`, `zod`, `prisma`, `framer-motion`, `lucide-react`) **já estão no lockfile**.

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| `@xyflow/react` bundle size grande | Média | Performance inicial | Tree-shaking, lazy load node components, code splitting por rota |
| Sandbox `code` node (segurança) | Alta | Crítico | Usar `isolated-vm` (process isolation), timeout estrito, sem acesso a `fs`/`net`/`child_process` |
| Execuções longas travam worker | Média | Alto | Timeout por nó + global, heartbeat, worker watchdog |
| Credenciais vazadas no frontend | Baixa | Crítico | **Nunca** enviar `data` descriptografado ao frontend; endpoints dedicados auditados |
| Migração n8n incompleta | Média | Médio | Test suite com workflows n8n reais; mapeamento versionado |
| Queue/Redis indisponível | Baixa | Alto | Fallback: execução síncrona inline (com warning), health checks |

---

## Apêndice: Estrutura de Arquivos Proposta (Novos)

```
n8n-migration/
├── design-recriacao.md           # Este documento
├── deps-e-libs.md                # Análise de dependências (já existe)
│
packages/
├── shared/
│   └── src/
│       ├── workflow/
│       │   ├── node-registry.ts      # NodeType definitions + handlers map
│       │   ├── n8n-node-type-map.ts  # Mapeamento n8n ↔ AgentFlow
│       │   ├── n8n-import.ts         # Import logic
│       │   └── n8n-export.ts         # Export logic
│       └── validation/
│           └── node-schemas.ts       # Zod schemas por node type
│
apps/api/
├── src/
│   ├── services/
│   │   ├── executor.ts               # Estender: DAG runner, node handlers
│   │   ├── nodes/                    # Handlers built-in
│   │   │   ├── http-request.ts
│   │   │   ├── if.ts
│   │   │   ├── set.ts
│   │   │   ├── code.ts
│   │   │   ├── delay.ts
│   │   │   ├── merge.ts
│   │   │   ├── split-in-batches.ts
│   │   │   ├── email.ts
│   │   │   ├── ai-agent.ts
│   │   │   └── approval.ts
│   │   └── scheduler.ts              # Cron scheduler worker
│   ├── workers/
│   │   ├── execution.worker.ts       # BullMQ worker process
│   │   └── scheduler.worker.ts       # Cron scheduler process
│   └── routes/
│       ├── node-types.ts             # GET /node-types, /node-types/:key
│       └── schedules.ts              # CRUD /workflows/:id/schedule
│
apps/web/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── workflows/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── executions/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [executionId]/page.tsx
│   │   │   │   │   ├── settings/page.tsx
│   │   │   │   │   └── versions/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── credentials/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── executions/page.tsx
│   │   │   └── approvals/page.tsx
│   │   └── api/                      # Next.js route handlers (proxy para Fastify)
│   ├── components/
│   │   ├── workflow/
│   │   │   ├── nodes/                # Custom React Flow nodes
│   │   │   │   ├── TriggerNode.tsx
│   │   │   │   ├── ActionNode.tsx
│   │   │   │   ├── LogicNode.tsx
│   │   │   │   ├── TransformNode.tsx
│   │   │   │   └── AINode.tsx
│   │   │   ├── edges/
│   │   │   │   └── OrthogonalEdge.tsx
│   │   │   ├── NodePalette.tsx       # Estender: carrega /node-types
│   │   │   ├── NodeConfigPanel.tsx   # Estender: forms dinâmicos (RHF + Zod)
│   │   │   ├── ExecutionOverlay.tsx  # Highlight nodes por execução
│   │   │   ├── MiniMap.tsx
│   │   │   └── Toolbar.tsx           # Undo/Redo, Zoom, Save, Execute
│   │   └── credentials/
│   │       ├── CredentialForm.tsx    # Form dinâmico por provider
│   │       └── CredentialTest.tsx
│   └── lib/
│       ├── workflow/
│       │   ├── useHistory.ts         # Undo/Redo hook
│       │   ├── useAutoSave.ts        # Debounced save
│       │   └── validation.ts         # Client-side validation
│       └── api.ts                    # Adicionar endpoints novos
```

---

## Conclusão

O AgentFlow **já possui 70% da infraestrutura** necessária para recriar o n8n. O trabalho restante foca em:

1. **Completar o editor visual** (custom nodes, forms dinâmicos, UX polida) — **P1**
2. **Implementar o executor robusto** (DAG, handlers, worker, scheduler) — **P2**
3. **Polir e adicionar features enterprise** (import/export n8n, templates, AI, versionamento) — **P3**

Todas as decisões técnicas aproveitam o stack existente (Prisma, Fastify, Next.js, React Flow, BullMQ, AES-256-GCM) sem introduzir dependências arriscadas.