# Execuções, Histórico e Depuração — AgentFlow

## 1. Visão geral

Este documento especifica o subsistema de **execuções, histórico e depuração** da plataforma AgentFlow — uma recriação do n8n focada em execução server-side 24/7. Ele complementa `v2-engine-spec.md` (motor de execução) e `v2-editor-spec.md` (editor visual), integrando-se ao schema Prisma existente (`packages/database/prisma/schema.prisma`) e às rotas API já implementadas em `apps/api/src/routes/executions.ts`.

**Objetivo**: Propor um sistema completo para listar, inspecionar, depurar, replayar, comparar e limpar execuções de workflows, com foco em: (a) visibilidade operacional, (b) ergonomia de depuração para desenvolvedores/analistas, (c) eficiência de armazenamento e custo, e (d) segurança (redação de segredos, controle de acesso, retenção).

**Escopo deste documento**: modelo de dados estendido, listagem/histórico, detalhe com timeline, pin/rerun parcial, replay, depuração passo-a-passo e breakpoints, tratamento de erros, API e UI, performance/sampling/streaming, retenção e limpeza, diagramas, ADRs e glossário. **Não altera código do app.**

### 1.1 Princípios de design

| Princípio | Aplicação |
|---|---|
| **Imutabilidade** | Uma execução concluída (SUCCESS/FAILED) nunca tem seu dado de saída modificado. Replay/rerun criam uma nova execução. |
| **Append-only logs** | Logs de execução são imutáveis — novas entradas são anexadas, nunca editadas. |
| **Separação de concerns** | Dados de execução (input/output/logs) vivem em tabelas dedicadas; metadados na tabela de execução. |
| **Referências, não blobs** | Dados binários são referenciados por storage (S3/GCS/R2), nunca embutidos no banco. |
| **Redação por padrão** | Segredos (credenciais, tokens, senhas) são redigidos em logs e em qualquer dado retornado à UI. |
| **Multi-tenant** | Toda query de execução é filtrada por `orgId`, herdando do modelo RLS existente. |
| **Sampling adaptativo** | Para execuções com milhões de itens, apenas N itens são armazenados para visualização, com opção de fetch on-demand. |
| **Eventos, não polling** | Live tail de logs usa SSE (Server-Sent Events) ou WebSocket; o worker emite eventos via BullMQ / Redis Pub/Sub. |

### 1.2 Contexto existente (o que já existe)

Do schema Prisma (`schema.prisma`):

```prisma
enum ExecutionStatus {
  PENDING            // Na fila, aguardando worker
  RUNNING            // Executando
  SUCCESS            // Concluído com sucesso
  FAILED             // Falhou
  CANCELLED          // Cancelado pelo usuário
  WAITING_APPROVAL   // Pausado aguardando aprovação humana
}

model WorkflowExecution {
  id         String          @id @default(cuid())
  status     ExecutionStatus @default(PENDING)
  trigger    String          // webhook, manual, cron, api
  input      Json?
  output     Json?
  error      String?
  startedAt  DateTime        @default(now())
  finishedAt DateTime?
  duration   Int?            // ms

  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  userId     String?
  user       User?   @relation("ExecutionUser", fields: [userId], references: [id])

  nodes       NodeExecution[]
  approvals   Approval[]

  @@index([orgId, startedAt])
  @@index([workflowId, startedAt])
  @@index([userId, startedAt])
}

model NodeExecution {
  id         String          @id @default(cuid())
  status     ExecutionStatus @default(PENDING)
  input      Json?
  output     Json?
  error      String?
  logs       String?    // logs de stdout/stderr do nó
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  duration   Int?       // ms

  nodeId     String
  node        WorkflowNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  retryCount  Int @default(0)
  idempotencyKey String? @unique

  @@index([executionId, startedAt])
}
```

Do executor (`apps/api/src/services/executor.ts`): o motor roda via `executeGraph()` — topological sort, resolver topologia DAG, executa nós sequencialmente, persiste `NodeExecution` a cada nó, trata retry/timeout/cancelamento.

Das rotas API (`apps/api/src/routes/executions.ts`): já existem `POST /trigger`, `GET /`, `GET /:id`, `POST /:id/cancel`, `GET /:id/nodes`.

Do briefing de database schema (`briefs/prompt-database-schema.md`): o modelo ideal inclui `execution_logs` (execution_id, node, level, message, timestamp, data), `execution_metrics` (tokens, custo, duração, itens processados), e `execution_data` (particionada/arquivada).

### 1.3 Status adicionais propostos

A extensão proposta adiciona dois status que o motor precisa para depuração avançada:

| Status | Categoria | Descrição |
|---|---|---|
| `PENDING` | Terminal? Não | Aguardando na fila (já existente) |
| `RUNNING` | Não | Em execução no worker (já existente) |
| `SUCCESS` | Terminal | Concluído com sucesso (já existente) |
| `FAILED` | Terminal | Erro irrecoverável (já existente) |
| `CANCELLED` | Terminal | Cancelado pelo usuário (já existente) |
| `WAITING_APPROVAL` | Não | Pausado aguardando aprovação (já existente) |
| **`PAUSED`** | Não | Pausado manualmente no debugger (NOVO) |
| **`TIMEOUT`** | Terminal | Estourou timeout global (NOVO — subtendido por FAILED hoje) |

**ADR-01**: `TIMEOUT` é separado de `FAILED` porque requer tratamento distinto (alerta de latência vs. erro de lógica) e ajuste de política. `PAUSED` é usado exclusivamente pelo modo debug interativo.

---

## 2. Modelo de dados (entidades + tabelas resumidas)

### 2.1 Entidades existentes (não alteradas)

**WorkflowExecution** — cabeçalho da execução. Campos-chave já mapeados no Prisma. Adicionamos colunas de controle para o subsistema de debug:

```prisma
model WorkflowExecution {
  id            String    @id @default(cuid())
  status        ExecutionStatus @default(PENDING)
  trigger       String     // webhook, manual, cron, api, schedule
  input         Json?      // Input original (evento, payload)
  output        Json?      // Output final do workflow
  error         String?    // Mensagem de erro (sem stack completo — veja logs)
  startedAt     DateTime   @default(now())
  finishedAt    DateTime?
  duration      Int?       // ms

  workflowId    String
  workflow      Workflow  @relation(fields: [workflowId], references: [id])
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id])
  userId        String?
  user          User? @relation("ExecutionUser", fields: [userId], references: [id])

  nodes         NodeExecution[]
  logs          ExecutionLog[]    // NOVO: log estruturado (append-only)
  metrics       ExecutionMetric[] // NOVO: métricas por passo
  binaryRefs    ExecutionBinaryRef[] // NOVO: referências a dados binários
  approvals     Approval[]

  // Campos de controle para debug/replay (NOVOS)
  debugSessionId String?  // ID da sessão de debug interativo (se estiver em andamento)
  parentExecutionId String? // Se este é um retry/replay: aponta para a execução original
  replayOf      String?    // Alias: executionId que originou este replay
  mode          String @default("production") // "production" | "test" | "debug" | "replay"
  nodeCount     Int?       // Quantidade total de nós no workflow na hora da execução

  @@index([orgId, startedAt])
  @@index([workflowId, startedAt])
  @@index([workflowId, status, startedAt])
  @@index([userId, startedAt])
  @@index([parentExecutionId])
  @@index([replayOf])
  @@index([mode, startedAt])
}
```

### 2.2 Entidades propostas (novas)

#### 2.2.1 ExecutionLog — logs estruturados append-only

```prisma
model ExecutionLog {
  id          String   @id @default(cuid())
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId      String?  // NULL = log de workflow; senão = log de nó específico
  node        WorkflowNode? @relation(fields: [nodeId], references: [id])
  level       ExecutionLogLevel // debug, info, warn, error
  message     String   // Mensagem humana (redigida)
  data        Json?    // Dados estruturados (redigidos)
  timestamp   DateTime @default(now())

  @@index([executionId, timestamp])
  @@index([executionId, nodeId, timestamp])
  @@index([executionId, level, timestamp])
}

enum ExecutionLogLevel {
  DEBUG
  INFO
  WARN
  ERROR
}
```

**Formato de registro**: Cada log é uma linha JSON estruturada. O worker grava logs via um `ExecutionLogger` que automaticamente injeta `executionId`, `nodeId`, `workflowId`, `orgId`, `traceId`.

#### 2.2.2 ExecutionMetric — métricas por node/execução

```prisma
model ExecutionMetric {
  id          String   @id @default(cuid())
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId      String?
  node        WorkflowNode? @relation(fields: [nodeId], references: [id])
  metric      String   // "tokens_input" | "tokens_output" | "cost_usd" | "items_processed" | "bytes_sent" | "bytes_received"
  value       String   // Armazenado como string para flexibilidade (JSON number/boolean)
  unit        String?  // "tokens" | "usd" | "items" | "bytes" | "ms"
  timestamp   DateTime @default(now())

  @@index([executionId, metric, timestamp])
  @@index([nodeId, metric])
}
```

#### 2.2.3 ExecutionBinaryRef — referências a dados binários

```prisma
model ExecutionBinaryRef {
  id            String   @id @default(cuid())
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId        String?  // Opcional: associa binário a um nó
  node          WorkflowNode? @relation(fields: [nodeId], references: [id])

  /// Storage location
  storageProvider String   // "s3" | "gcs" | "r2" | "memory" (dev)
  bucket          String
  key             String   // path no storage
  mimeType        String
  sizeBytes       Int
  checksum        String?  // SHA256 para integridade
  downloadUrl     String?  // URL temporária (curto TTL) — nunca expor permanentemente

  /// Contexto de uso
  field           String?  // campo no JSON que referencia este binário (ex: "binary.file")
  itemId          String?  // qual item do array (para node com múltiplos items)

  createdAt       DateTime @default(now())

  @@index([executionId, nodeId])
  @@index([storageProvider, bucket])
}
```

**Política**: Dados binários nunca são armazenados na base de dados. O worker, ao gerar output binário, envia para o storage configurado (`BINARY_STORAGE_PROVIDER`, `BINARY_STORAGE_BUCKET`) e grava apenas o `key`. A URL de download é gerada sob demanda com TTL curto (máx. 5 min) e apenas para usuários autorizados.

#### 2.2.4 NodeExecution (estendido)

Adicionamos campos para debug avançado:

```prisma
model NodeExecution {
  id            String    @id @default(cuid())
  status        ExecutionStatus @default(PENDING)
  input         Json?
  output        Json?
  error         String?
  logs          String?    // stdout/stderr do nó (texto plano, redigido)
  startedAt     DateTime  @default(now())
  finishedAt    DateTime?
  duration      Int?      // ms

  nodeId        String
  node          WorkflowNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  retryCount    Int @default(0)
  idempotencyKey String? @unique

  // === CAMPOS DE DEBUG (NOVOS) ===
  runIndex        Int?     // Índice desta tentativa do nó dentro da execução (0 = primeira tentativa)
  pausePoint       Boolean @default(false) // True se este nó foi um ponto de pausa no debug
  breakpointHit   Boolean @default(false)  // True se este nó teve breakpoint ativado
  errorStructured Json?   // JSON estruturado: { message, code, nodeId, stack, inputAtFailure, context, suggestions[] }
  pairedItem      Json?   // Para nodes de loop/batch: referência ao item que originou este input
  samplingApplied Boolean @default(false) // True se input/output foi amostrado (truncated)
  binaryKeys      String[] // Lista de chaves binárias no output (para resolução de ref)

  @@index([executionId, startedAt])
  @@index([executionId, nodeId, runIndex])
  @@index([status])
}
```

### 2.3 Estado da máquina de estados

```
                    ┌──────────┐
                    │  PENDING │
                    └────┬─────┘
                         │ inicia worker
                         ▼
                    ┌──────────┐       cancelamento
                    │  RUNNING │  ←──────────────┐
                    └────┬─────┘                 │
            sucesso     │  falha                 │
          ┌──────────┐   ▼                       │
          │ SUCCESS  │ ┌──────────┐              │
          └──────────┘ │  FAILED  │              │
                       └────┬─────┘              │
                            │ timeout               │
                            ▼                        │
                       ┌────────┐                   │
                       │ TIMEOUT│                    │
                            │ cancelamento              │
                       ┌────┴─────┐                  │
                       │CANCELLED │                  │
                       └──────────┘                  │
                            ▲                          │
                            │ aprovação                 │
                       ┌────┴─────┐                  │
                       │WAITING_  │                  │
                       │APPROVAL  │                  │
                       └────┬─────┘                  │
                            │ pausa manual (debug)    │
                       ┌────┴─────┐                  │
                       │  PAUSED  │ ── resume ────────┘
                       └──────────┘
```

**Transições válidas**:
- `PENDING → RUNNING`: worker inicia processamento
- `RUNNING → SUCCESS`: todos os nós concluíram sem erro fatal
- `RUNNING → FAILED`: erro em nó sem `continueOnFail` ou falha global
- `RUNNING → TIMEOUT`: estourou timeout global (`EXECUTION_TIMEOUT_MS`)
- `RUNNING → CANCELLED`: worker detecta flag de cancelamento
- `RUNNING → WAITING_APPROVAL`: nó `approval` pausa a execução
- `WAITING_APPROVAL → RUNNING`: aprovação aprovada (via `/approvals/:id/approve`)
- `WAITING_APPROVAL → FAILED`: aprovação rejeitada
- `RUNNING/PENDING → PAUSED`: pause manual via API (modo debug)
- `PAUSED → RUNNING`: resume via API
- `PAUSED → CANCELLED`: cancelamento durante debug
- `TIMEOUT/FAILED/CANCELLED/SUCCESS`: estados terminais — não transicionam

**Note**: `PAUSED` e `TIMEOUT` são estados propostos; `PAUSED` só existe no modo debug e não pode ser disparado por workflows em produção.

### 2.4 Tipos TypeScript (compartilhados)

```typescript
// packages/shared/src/execution-types.ts

export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | "WAITING_APPROVAL"
  | "PAUSED";

export type ExecutionLog = {
  id: string;
  executionId: string;
  nodeId?: string | null;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  data?: Record<string, unknown> | null;
  timestamp: string; // ISO
};

export type ExecutionMetric = {
  id: string;
  executionId: string;
  nodeId?: string | null;
  metric: string;
  value: string;
  unit?: string | null;
  timestamp: string;
};

export type ExecutionBinaryRef = {
  id: string;
  executionId: string;
  nodeId?: string | null;
  storageProvider: "s3" | "gcs" | "r2" | "memory";
  bucket: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  downloadUrl?: string | null;
  field?: string | null;
  itemId?: string | null;
  createdAt: string;
};

export type ErrorStructured = {
  message: string;
  code?: string;
  nodeId?: string;
  stack?: string;
  inputAtFailure?: unknown;
  context?: Record<string, unknown>;
  suggestions?: string[];
  timestamp: string;
};

export type NodeExecutionDetail = {
  id: string;
  status: ExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  logs?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  duration?: number | null;
  retryCount: number;
  runIndex?: number | null;
  errorStructured?: ErrorStructured | null;
  pairedItem?: Record<string, unknown> | null;
  samplingApplied: boolean;
  binaryKeys?: string[];
};

// Tipos para API
export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  orgId: string;
  status: ExecutionStatus;
  trigger: string;
  mode: string;
  startedAt: string;
  finishedAt?: string | null;
  duration?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  error?: string | null;
  nodeCount?: number | null;
  parentExecutionId?: string | null;
  replayOf?: string | null;
  // Métricas resumidas
  metrics?: {
    tokensInput?: number;
    tokensOutput?: number;
    costUsd?: number;
    itemsProcessed?: number;
  };
}

export interface ExecutionDetail extends ExecutionSummary {
  input?: unknown;
  output?: unknown;
  nodes: NodeExecutionDetail[];
  logs: ExecutionLog[];
  binaryRefs: ExecutionBinaryRef[];
  approvals: ApprovalInfo[];
  metrics: ExecutionMetric[];
}

export interface ApprovalInfo {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  message?: string | null;
  requesterId: string;
  approverId?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

// Tipos para filtros
export interface ExecutionFilter {
  status?: ExecutionStatus | ExecutionStatus[];
  workflowId?: string;
  trigger?: string | string[];
  mode?: string | string[];
  orgId?: string;
  userId?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  search?: string; // busca textual
  minDurationMs?: number;
  maxDurationMs?: number;
  hasError?: boolean;
  replayOf?: string; // execuções derivadas de X
  parentExecutionId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

---

## 3. Histórico e listagem

### 3.1 Visão geral da UI de listagem

A página de listagem de execuções (`/workflows/:id/executions` e `/executions` global) segue o layout do wireframe existente (`n8n-migration/wireframes/executions.html`), com sidebar de filtros à esquerda, tabela de resultados no centro e painel de detalhes à direita (ou navegação para página de detalhe).

### 3.2 Endpoint de listagem

```
GET /api/v1/executions
GET /api/v1/workflows/:id/executions
```

**Query parameters**:

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `page` | int (≥1) | Página atual (default 1) |
| `limit` | int (1-200) | Itens por página (default 50) |
| `status` | array | Filtra por status (múltiplo via `&status=RUNNING&status=FAILED`) |
| `workflowId` | string | Filtra por workflow específico |
| `trigger` | array | Filtra por tipo de trigger |
| `mode` | array | Filtra por modo (production/test/debug/replay) |
| `userId` | string | Filtra por usuário que iniciou |
| `dateFrom` | ISO8601 | Início do período |
| `dateTo` | ISO8601 | Fim do período |
| `search` | string | Busca textual em: workflow name, error message, input JSON (sampled) |
| `minDurationMs` | int | Filtra execuções que duraram mais que N ms |
| `maxDurationMs` | int | Filtra execuções que duraram menos que N ms |
| `hasError` | boolean | Apenas execuções com erro |
| `replayOf` | string | Execuções que são replay de X |
| `includeMetrics` | boolean | Inclui métricas resumidas no resultado |
| `includeWorkflow` | boolean | Inclui dados básicos do workflow |

**Resposta**:

```json
{
  "data": [
    {
      "id": "exec_01h8...",
      "workflowId": "wf_01h7...",
      "workflowName": "Processamento de Leads",
      "orgId": "org_01h2...",
      "status": "SUCCESS",
      "trigger": "webhook",
      "mode": "production",
      "startedAt": "2026-08-19T14:32:15.000Z",
      "finishedAt": "2026-08-19T14:32:17.320Z",
      "duration": 2320,
      "userId": "usr_01h3...",
      "userEmail": "analyst@example.com",
      "error": null,
      "nodeCount": 5,
      "metrics": { "tokensInput": 1234, "tokensOutput": 567, "costUsd": 0.0042 }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1238,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3.3 Busca textual

A busca textual (`search`) percorre:
1. **Nome do workflow** (case-insensitive, `ILIKE`)
2. **Mensagem de erro** do workflow e de cada nó
3. **Input truncado** (primeiros 512 bytes do JSON serializado)
4. **Tags do workflow** (se implementadas)

Para busca profunda em dados binários ou input completo, usa-se a API de detalhe (seção 4).

### 3.4 Filtros avançados na UI

A sidebar de filtros (já existente no wireframe) deve suportar:
- **Status**: checkboxes para cada status (SUCCESS, FAILED, RUNNING, CANCELLED, TIMEOUT, WAITING_APPROVAL, PAUSED)
- **Workflow**: dropdown/busca com workflows da org
- **Período**: atalhos (Hoje, 7 dias, 30 dias, Este mês, Personalizado)
- **Trigger**: checkboxes (webhook, manual, cron, api, schedule)
- **Modo**: checkboxes (Produção, Teste, Debug, Replay)
- **Usuário**: busca por email (para orgs com múltiplos usuários)
- **Duração**: slider range (min/max ms)
- **Tem erro**: toggle booleano

### 3.5 Ações em lote na listagem

- **Re-executar selecionadas**: cria novas execuções (replay) para as selecionadas
- **Cancelar selecionadas**: cancela execuções em PENDING/RUNNING
- **Exportar selecionadas**: CSV com metadados + JSON completo
- **Excluir selecionadas**: soft-delete (arquiva) — veja seção 11

### 3.6 Ordenação

Por padrão, ordenado por `startedAt DESC`. O usuário pode clicar nas colunas:
- Workflow (nome)
- Status
- Iniciado (startedAt)
- Duração
- Mode

---

## 4. Detalhe da execução e timeline

### 4.1 Página de detalhe

Rota: `GET /api/v1/executions/:id` → UI: `/workflows/:wfId/executions/:id`

**Resposta completa** (estrutura expandida):

```typescript
interface ExecutionDetailResponse {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowSnapshot: WorkflowSnapshot; // versão do workflow na hora da execução
  orgId: string;
  status: ExecutionStatus;
  trigger: string;
  mode: string;
  input: unknown;        // input original (sampled se muito grande)
  output: unknown;        // output final (sampled)
  error: string | null;   // mensagem de erro (sem stack — use logs)
  errorStructured?: ErrorStructured | null;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  userId?: string | null;
  userEmail?: string | null;
  nodeCount: number;
  parentExecutionId?: string | null;
  replayOf?: string | null;

  // Sub-coleções
  nodes: NodeExecutionDetail[];
  logs: ExecutionLog[];
  metrics: ExecutionMetric[];
  binaryRefs: ExecutionBinaryRef[];
  approvals: ApprovalInfo[];
}
```

### 4.2 Timeline visual

O timeline é uma visualização vertical (como no wireframe) mostrando cada evento significativo da execução:

```
Timeline (vertical):
  ● START (webhook)     10:00:00.000  ✓  5ms
  ● [LOG] Webhook recebeu payload     INFO   10:00:00.001
  ● HTTP Request        10:00:00.005  ✓  245ms  [view]
  ● [LOG] Requisição enviada          DEBUG  10:00:00.010  url=POST /api/leads
  ● IF (condition)      10:00:00.250  ✓  2ms   [view]
  ● [LOG] Condição avaliada: true    INFO   10:00:00.251
  ● SET (true branch)   10:00:00.252  ✓  1ms   [view]
  ● AI Agent            10:00:00.253  ✗  3.2s  [view] [retry]
  ● [LOG] Error: timeout              ERROR  10:00:03.453
  ● [LOG] Retry 1/3 in 1s             WARN   10:00:03.500
  ● AI Agent (retry 1)  10:00:04.500  ✓  1.1s  [view]
  ● END                 10:00:05.605  ✗
```

**Componentes do timeline**:
- **Marca de tempo absoluta** (HH:MM:SS.mmm) + duração do passo
- **Ícone de status** (✓ success, ✗ error, ⧖ running, ⧔ cancelled, ⧗ timeout)
- **Nome do nó** com badge de status
- **Ações inline**: `[view]` (abre input/output), `[retry]` (rerun parcial), `[logs]` (abre log detalhado)
- **Eventos de sistema**: START, END, retry, pause, resume, error trigger ativado
- **Logs inline**: mensagens de log filtráveis por nível (DEBUG oculto por padrão)
- **Zoom**: expansão/colapso de grupos de logs

### 4.3 Dados de entrada/saída por nó

Ao clicar em `[view]` de um nó, abre um modal/painel com:
- **Input**: JSON navegável (tree view + raw code view), com:
  - Indicação de quais campos vieram de quais nós predecessores (pairedItem)
  - Highlight de campos usados por expressões
  - Truncamento para dados grandes (>10KB → "mostrar mais")
  - Botão "copiar como JSON"
- **Output**: JSON navegável, mesmo formato
- **Diff modais**: comparação entre tentativas (runIndex 0 vs 1)
- **Binary preview**: para campos binários referenciados, preview inline (imagem, PDF, texto) com botão de download temporário
- **Logs do nó**: stdout/stderr com syntax highlight, filtráveis por nível

### 4.4 Stack traces e dados no momento da falha

Quando um nó falha:
- `errorStructured` contém: `{ message, code, nodeId, stack, inputAtFailure, context, suggestions[] }`
- `inputAtFailure` captura o input exato no momento da exceção (antes do `try/catch` do executor)
- `context` inclui: variáveis de ambiente relevantes, credencial utilizada (máscara), parâmetros do nó
- `stack` é a stack do JavaScript completa (apenas para erros de runtime, nunca para erros de validação)
- `suggestions` são dicas de diagnóstico baseadas no tipo de erro (ex: "Timeout: verifique se a API externa responde dentro de 30s", "ECONNREFUSED: verifique se o host está acessível")

### 4.5 Replay a partir do detalhe

No painel de detalhe, cada nó com erro ou sucesso tem botão **"Re-executar a partir daqui"** que:
1. Cria uma nova execução com `parentExecutionId` apontando para a original
2. Usa o `input` do nó selecionado como `input` da nova execução
3. Executa apenas os nós downstream (subgrafo)
4. Marca `mode: "replay"` e `replayOf: <original_execution_id>`

---

## 5. Pin e rerun parcial

### 5.1 Pin (dados fixados)

**Origem**: O campo `pinData` no JSON do n8n (ver `referencia-n8n.md` §1.5) contém dados fixados para testes. No AgentFlow, estende-se este conceito:

O workflow pode ter `pinData` definido via API ou UI:

```
PUT /api/v1/workflows/:id/pin
Body: { "nodeName": [{ json: {...}, binary: {...} }], ... }
```

**Comportamento no motor**:
- Quando o executor encontra um nó com `pinData`, **não executa o nó** — usa os dados pinnados como `output` diretamente
- Isso ignora o input do nó e usa os dados fixados
- Marca `NodeExecution.status = "SUCCESS"` com `runIndex = 0` e um flag `pinned: true`
- Útil para: testes, isolamento de falhas, debug

**UI**: No editor, botão "Pin" no painel de configuração de cada nó. Mostra um preview dos dados pinnados. Botão "Unpin" para remover.

### 5.2 Rerun parcial (de um nó específico)

**Endpoint**:

```
POST /api/v1/executions/:executionId/rerun-from
Body: { nodeId: string, input?: unknown, mode?: "fromNode" | "fromFailure" }
```

**Como funciona**:
- `fromNode`: pega o `input` armazenado do nó especificado, cria nova execução, executa apenas o subgrafo downstream
- `fromFailure`: identifica o primeiro nó com falha (`status=FAILED`), usa seu input, rerun parcial
- O worker carrega o workflow, constrói o subgrafo (topological sort apenas dos descendentes do nó de início), ignora nós já executados
- Nova execução tem `parentExecutionId` apontando para a original

**Restrições**:
- Não pode fazer rerun de nós que já foram executados nesta nova execução (evita loops)
- Se o nó de início for um trigger, o rerun inclui todo o workflow
- `input` opcional permite sobrescrever o input do nó (útil para testar com dados diferentes)

### 5.3 Rerun de nó único (sem subgrafo)

```
POST /api/v1/executions/:executionId/rerun-node
Body: { nodeId: string, input?: unknown }
```

- Executa **apenas** o nó especificado, isoladamente
- Não propaga output para downstream
- Útil para debug rápido de um nó problemático
- Marca `mode: "test"` e cria uma execução filha com apenas 1 nó

---

## 6. Replay

### 6.1 Replay vs. Execução nova

| Característica | Replay | Nova Execução |
|---|---|---|
| Input | Mesmo input original (ou input sobrescrito) | Input novo/fornecido |
| ID de execução | Novo (diferente) | Novo (diferente) |
| `parentExecutionId` | Aponta para execução original | NULL |
| `mode` | `"replay"` | `"production"` / `"test"` |
| Side effects | **Marcado como replay** — worker pode pular efeitos colaterais em modo dry-run | Efeitos colaterais reais |
| Idempotência | Verdadeira (mesmos dados → mesmo resultado) | N/A |

### 6.2 Endpoint de replay

```
POST /api/v1/executions/:id/replay
Body (opcional):
{
  "input": { ... },          // sobrescreve input original (opcional)
  "nodes": ["nodeId1", "nodeId2"], // replay apenas estes nós (opcional)
  "dryRun": false,           // se true: não executa side effects reais (ex: HTTP POST, email)
  "mode": "production"       // "production" | "test"
}
```

**Resposta**: `{ executionId: string, status: "PENDING", mode: "replay" }`

### 6.3 Replay de node único

```
POST /api/v1/executions/:id/replay-node
Body: { nodeId: string, input?: unknown, dryRun?: boolean }
```

- Re-executa apenas um nó específico com o input da execução original (ou input fornecido)
- Útil para testar se um nó específico funciona com dados conhecidos
- `dryRun: true` por padrão para replay-node (não queremos side effects ao replayar um HTTP node)

### 6.4 Idempotência no replay

O motor marca a execução como `mode: "replay"` e injeta um header/contexto que os node handlers podem verificar:

```typescript
// No NodeExecutionContext
context.isReplay: boolean;
context.dryRun: boolean;
context.originalExecutionId: string;
```

Node handlers que têm side effects (HTTP Request, Email, Telegram, Gmail) devem:
- Em modo `dryRun`: validar o request mas não enviá-lo, retornar `{ statusCode: 200, body: "DRY_RUN", dryRun: true }`
- Em modo `replay` sem dryRun: executar normalmente, mas logar que foi um replay

### 6.5 Fluxo de replay

```
1. Usuário clica "Replay" na UI
2. API valida permissões (orgId match)
3. Cria nova WorkflowExecution:
   - status: PENDING
   - mode: "replay"
   - parentExecutionId: <original>
   - input: original.input (ou input sobrescrito)
   - replayOf: <original>
4. Enfileira job no BullMQ com contexto de replay
5. Worker pega job, injeta contexto.isReplay=true, context.dryRun
6. Carrega workflow, resolve subgrafo se "nodes" foi especificado
7. Executa → persiste novo NodeExecution[]
8. Emite evento execution.completed
9. SSE notifica UI: nova execução concluída
```

---

## 7. Depuração passo a passo e breakpoints

### 7.1 Modo debug interativo

O editor visual (`apps/web/src/app/workflows/[id]/editor`) pode iniciar uma **sessão de debug** que pausa a execução após cada nó, permitindo inspeção interativa.

**Endpoint para iniciar debug**:

```
POST /api/v1/workflows/:id/debug
Body: { 
  input?: unknown,
  breakpoints?: string[],     // nodeIds para pausar
  pauseAfterEach?: boolean,   // pausar após cada nó (step mode)
  dryRun?: boolean           // não executar side effects
}
```

**Resposta**:
```json
{
  "executionId": "exec_...",
  "debugSessionId": "dbg_...",
  "status": "PAUSED",
  "pausingAt": null,          // null = ainda não começou ou pausado no trigger
  "nodeOutputs": {}           // outputs acumulados até o ponto de pausa
}
```

### 7.2 Máquina de estados do debug

```
[INICIAR DEBUG]
       │
       ▼
   PENDING ──► RUNNING ──► PAUSED (breakpoint/pauseAfterEach)
                      │
                      ├──► SUCCESS (fim do workflow)
                      ├──► FAILED (erro)
                      └──► CANCELLED (stop debug)
       │
       ▼ (resume)
   RUNNING ──► [next node or end]
```

### 7.3 Endpoints de controle de debug

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/v1/executions/:id/debug` | Inicia sessão de debug |
| `POST` | `/api/v1/executions/:id/debug/resume` | Continua execução (próximo breakpoint ou fim) |
| `POST` | `/api/v1/executions/:id/debug/step` | Executa exatamente um nó e pausa |
| `POST` | `/api/v1/executions/:id/debug/next` | Executa até o próximo breakpoint |
| `POST` | `/api/v1/executions/:id/debug/pause` | Pausa imediatamente (se RUNNING) |
| `POST` | `/api/v1/executions/:id/debug/stop` | Para execução, marca como CANCELLED |
| `PUT` | `/api/v1/executions/:id/debug/breakpoints` | Atualiza lista de breakpoints |
| `GET` | `/api/v1/executions/:id/debug/state` | Estado atual da sessão de debug |
| `GET` | `/api/v1/executions/:id/debug/stream` | SSE: eventos de debug em tempo real |

### 7.4 Inspeção de estado a cada passo

Quando a execução pausa (breakpoint ou step), o worker:
1. Persiste o `NodeExecution` do nó que acabou de rodar
2. Atualiza `WorkflowExecution.status = "PAUSED"` 
3. Emite evento via SSE para o editor com: `{ status: "paused", nodeId: "...", executionId, nodeOutputs: {...} }`
4. O editor destaca o nó atual no canvas e mostra seu input/output

### 7.5 Modificação de dados entre passos (opcional)

O editor pode permitir que o usuário edite o `input` ou `output` de um nó antes de dar continue. Isso requer:

```
PATCH /api/v1/executions/:id/debug/node/:nodeId
Body: { input?: unknown, output?: unknown }
```

O worker, ao retomar, usa o valor modificado como base para o próximo nó. **Cuidado**: isso invalida a imutabilidade da execução original — recomenda-se clonar a execução para debug exploratório.

### 7.6 Time-travel (voltar a estado anterior)

**Não implementado inicialmente.** A arquitetura atual salva `NodeExecution` apenas no fim (não checkpointa entre nós). Time-travel exigiria:
- Checkpoint por nó (salvar estado intermediário)
- Armazenamento de snapshots (custo elevado)

**Alternativa leve**: usar o rerun parcial (seção 5.2) — "volte" executando a partir de um nó anterior com dados conhecidos.

---

## 8. Erros e error workflow

### 8.1 Formato de erro por nó

Quando um nó falha, o executor captura:

```typescript
interface NodeError {
  message: string;           // Mensagem curta (1 frase)
  code: string;              // Código estruturado: "TIMEOUT" | "ECONNREFUSED" | "VALIDATION" | "SANDBOX" | "CREDENTIAL" | "UNKNOWN"
  nodeId: string;            // ID do nó que falhou
  stack?: string;            // Stack completo (apenas dev mode; nunca em prod para usuários não-admin)
  inputAtFailure: unknown;   // Input no momento da exceção
  context: {
    workflowId: string;
    executionId: string;
    attempt: number;          // tentativa (retryCount)
    nodeConfig: Record<string, unknown>;  // parâmetros do nó (sem credenciais)
    credentialRef?: string;   // ID da credencial (mascarado)
    environmentSnapshot: Record<string, string>; // env vars relevantes (mascarados)
  };
  suggestions: string[];     // Dicas de correção
  timestamp: string;         // ISO
  recoverable: boolean;      // Se pode ser recuperado por retry
}
```

### 8.2 Error workflow (workflow dedicado de erro)

Conforme n8n e o briefing de engine spec: o workflow pode ter uma `settings.errorWorkflow` que recebe dados do erro.

**Como funciona**:
1. Quando uma execução falha (FAILED), o motor verifica `settings.errorWorkflow`
2. Se configurado, enfileira uma nova execução do error workflow com `input = { error: ErrorStructured, originalExecutionId, workflowId, nodeId }`
3. O error workflow pode: enviar notificação, criar ticket, fazer rollback, etc.
4. O motor garante que o error workflow **não falhe silenciosamente** — se também falhar, loga como `errorWorkflow.failed`

**Endpoint auxiliar**:
```
POST /api/v1/executions/:id/error-workflow
Body: { workflowId: string }  // define/atualiza o error workflow
```

### 8.3 Diagnóstico automático (causa provável + dicas)

O sistema mantém um catálogo de diagnósticos baseados em padrões de erro comuns:

| Padrão de erro | Causa provável | Dica de correção |
|---|---|---|
| `ECONNREFUSED` | API externa não acessível | Verifique URL, firewall, egress allowlist |
| `ETIMEDOUT` / `Timeout` | API lenta ou bloqueada | Aumente timeout, verifique latência |
| `401 Unauthorized` | Credencial expirada | Renove credencial, verifique token |
| `403 Forbidden` | Permissão insuficiente | Verifique scopes, plano |
| `429 Too Many Requests` | Rate limit da API externa | Adicione delay, aumente retry backoff |
| `SyntaxError: Unexpected token` | Response não é JSON | Verifique Content-Type, use rawBody |
| `VMError` / `Sandbox` | Code node falhou | Verifique sintaxe JS, use try/catch |
| `ENOTFOUND` | DNS não resolve | Verifique domínio, DNS |
| `DataIntegrityViolation` | Dados de saída inválidos | Verifique schema de saída do nó |

### 8.4 Tratamento de erro no motor

O executor (`executor.ts`) já implementa:
- `try/catch` por nó → marca `NodeExecution.status = FAILED`
- `continueOnFail`: se true no nó, captura erro e retorna `{ error: message }` no output, execução continua
- `retryOnFail` + `maxTries` + `waitBetweenTries`: retry automático com backoff exponencial
- Error workflow disparado após falha definitiva

**Extensão proposta**: o `errorStructured` é populado no catch do executor e armazenado em `NodeExecution.errorStructured`. O diagnóstico é feito por um `ErrorDiagnosticService` que analisa o erro e adiciona `suggestions`.

---

## 9. API e UI (endpoints + páginas)

### 9.1 Endpoints API

#### Histórico e listagem

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/v1/executions` | Lista de execuções (com filtros, paginação) |
| `GET` | `/api/v1/workflows/:id/executions` | Lista de execuções de um workflow |
| `POST` | `/api/v1/workflows/:id/execute` | Executa manualmente |
| `POST` | `/api/v1/executions/trigger` | Trigger via API (já existe) |

#### Detalhe

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/v1/executions/:id` | Detalhes completos da execução |
| `GET` | `/api/v1/executions/:id/nodes` | Lista de execuções por nó |
| `GET` | `/api/v1/executions/:id/nodes/:nodeId` | Detalhes de um nó específico |
| `GET` | `/api/v1/executions/:id/logs` | Lista de logs estruturados |
| `GET` | `/api/v1/executions/:id/logs/stream` | SSE stream de logs (live) |
| `GET` | `/api/v1/executions/:id/metrics` | Lista de métricas |
| `GET` | `/api/v1/executions/:id/binary/:refId` | Download temporário de binário |

#### Replay e rerun

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/v1/executions/:id/replay` | Replay com mesmo input |
| `POST` | `/api/v1/executions/:id/replay-node` | Replay de node único |
| `POST` | `/api/v1/executions/:id/rerun-from` | Rerun parcial (subgrafo) |
| `POST` | `/api/v1/executions/:id/rerun-node` | Rerun de node único |

#### Depuração

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/v1/workflows/:id/debug` | Inicia sessão de debug |
| `POST` | `/api/v1/executions/:id/debug/resume` | Resume execução |
| `POST` | `/api/v1/executions/:id/debug/step` | Executa um nó e pausa |
| `POST` | `/api/v1/executions/:id/debug/next` | Executa até próximo breakpoint |
| `POST` | `/api/v1/executions/:id/debug/pause` | Pausa imediatamente |
| `POST` | `/api/v1/executions/:id/debug/stop` | Para e cancela debug |
| `PUT` | `/api/v1/executions/:id/debug/breakpoints` | Atualiza breakpoints |
| `GET` | `/api/v1/executions/:id/debug/state` | Estado da sessão |
| `GET` | `/api/v1/executions/:id/debug/stream` | SSE de eventos de debug |

#### Cancelamento e exclusão

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/v1/executions/:id/cancel` | Cancela execução em andamento |
| `DELETE` | `/api/v1/executions/:id` | Soft-delete (arquiva) |

#### Exportação

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/v1/executions/:id/export/json` | Exporta execução completa como JSON |
| `GET` | `/api/v1/executions/:id/export/csv` | Exporta dados de saída de um nó como CSV |
| `POST` | `/api/v1/executions/export/batch` | Exporta múltiplas execuções (JSON ou CSV) |

#### Comparação

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/api/v1/executions/compare` | Compara duas execuções (diff de output por nó) |

### 9.2 Páginas UI

#### `/workflows/:id/executions` — Lista de execuções do workflow

Conforme wireframe (`n8n-migration/wireframes/executions.html`):
- Tabela com colunas: Workflow, Status, Iniciado, Duração, Mode, Trigger, Ações
- Sidebar de filtros (status, workflow, período, trigger, modo, usuário, duração)
- Checkbox para seleção em lote
- Botões: Exportar CSV, Reexecutar Selecionadas, Cancelar Selecionadas
- Paginação com cursor

#### `/workflows/:wfId/executions/:id` — Detalhe da execução

Layout proposto (conforme engine spec §4.2):

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: [Workflow Name] | Exec #123 | Status | [Actions]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┬────────────────────────────┬───────────────────┐ │
│ │ Sidebar │   Timeline (vertical)       │ Node Detail       │ │
│ │ filtros │                              │ (painel direito)  │ │
│ │ de log  │  ● START (webhook)  ✓ 5ms    │                   │ │
│ │ level   │  ● HTTP Request    ✓ 245ms  │ Input (JSON)      │ │
│ │         │  ● IF              ✓ 2ms    │ Output (JSON)     │ │
│ │         │  ● AI Agent        ✗ 3.2s   │ Error (stack)     │ │
│ │         │  ● END             ✗         │ Logs              │ │
│ │         │                              │ Binary preview    │ │
│ └─────────┴────────────────────────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Ações no toolbar**:
- Re-executar (replay)
- Re-executar do início (rerun)
- Comparar com outra execução
- Exportar (JSON/CSV)
- Cancelar (se running)

#### `/executions` — Lista global de execuções

Lista todas as execuções da org (todos os workflows), com filtro adicional por workflow.

#### `/workflows/:id/debug/:executionId` — Sessão de debug

Página especial que carrega o editor com overlay de debug:
- Canvas com destaque visual de nó atual
- Timeline ao vivo (SSE)
- Painel de inspeção de dados (input/output do nó atual)
- Botões: Resume, Step, Next, Pause, Stop
- Breakpoints: clique em um nó para togglear breakpoint

#### `/executions/compare?a=ID&b=ID` — Comparação

Side-by-side:
- Timeline comparativo (linhas paralelas)
- Diff de output por nó (highlight de diferenças)
- Métricas comparativas (duração, tokens, custo)
- Download diff

### 9.3 Integração Web API (`apps/web/src/lib/api.ts`)

Adicionar chamadas:

```typescript
export const executions = {
  // ... existentes ...
  getDetail: (id: string) => api<ExecutionDetail>(`/api/executions/${id}`),
  getLogs: (id: string) => api<ExecutionLog[]>(`/api/executions/${id}/logs`),
  getLogsStream: (id: string): EventSource => new EventSource(`${API_BASE}/api/executions/${id}/logs/stream`),
  replay: (id: string, opts?: { input?: unknown; dryRun?: boolean }) =>
    api<{ executionId: string }> (`/api/executions/${id}/replay`, { method: "POST", body: opts ?? {} }),
  rerunFrom: (id: string, nodeId: string, opts?: { input?: unknown }) =>
    api<{ executionId: string }>(`/api/executions/${id}/rerun-from`, { method: "POST", body: { nodeId, ...opts } }),
  cancel: (id: string) => api(`/api/executions/${id}/cancel`, { method: "POST" }),
  exportJson: (id: string) => `${API_BASE}/api/executions/${id}/export/json`,
  exportCsv: (id: string, nodeId?: string) => `${API_BASE}/api/executions/${id}/export/csv?nodeId=${nodeId ?? ""}`,
  compare: (a: string, b: string) =>
    api<ExecutionComparison>(`/api/executions/compare`, { method: "POST", body: { a, b } }),
  delete: (id: string) => api(`/api/executions/${id}`, { method: "DELETE" }),
  // Debug
  startDebug: (workflowId: string, opts?: DebugOptions) =>
    api<{ executionId: string; debugSessionId: string }>(`/api/workflows/${workflowId}/debug`, { method: "POST", body: opts ?? {} }),
  debugResume: (id: string) => api(`/api/executions/${id}/debug/resume`, { method: "POST" }),
  debugStep: (id: string) => api(`/api/executions/${id}/debug/step`, { method: "POST" }),
  debugNext: (id: string) => api(`/api/executions/${id}/debug/next`, { method: "POST" }),
  debugPause: (id: string) => api(`/api/executions/${id}/debug/pause`, { method: "POST" }),
  debugStop: (id: string) => api(`/api/executions/${id}/debug/stop`, { method: "POST" }),
  debugState: (id: string) => api<DebugState>(`/api/executions/${id}/debug/state`),
  debugStream: (id: string): EventSource => new EventSource(`${API_BASE}/api/executions/${id}/debug/stream`),
};
```

---

## 10. Performance (sampling, streaming)

### 10.1 Sampling de dados para visualização

Quando uma execução processa **milhões de itens** (ex: SplitInBatches com 1M linhas), armazenar input/output completo é inviável. O motor aplica sampling:

| Tamanho do output | Estratégia |
|---|---|
| ≤ 10 itens | Armazenar tudo (input + output completo) |
| 11-1.000 itens | Armazenar amostra de 10 (índice 0, metade, fim) + metadados (count, sum, avg se numérico) |
| 1.001-100.000 itens | Armazenar amostra de 50 (percentil 0, 25, 50, 75, 99, e extremos) + metadados |
| > 100.000 itens | **NÃO** armazenar items — apenas metadados (count, sum, avg, min, max) + amostra de 10 |

**Configurável por plano**:
- Free: sampling agressivo (amostra 5 itens)
- Pro: sampling moderado (amostra 50 itens)
- Enterprise: sampling leve (amostra 500 itens) ou full (sob demanda)

**Flag**: `NodeExecution.samplingApplied = true` quando amostragem foi aplicada. A UI mostra aviso "Mostrando amostra de N de M itens".

### 10.2 Truncamento

- **Input/output**: truncado a 64KB por padrão. Se exceder, marca `truncated: true` e armazena hash (SHA256) para verificação.
- **Logs**: truncado a 10KB por entrada. Mensagens maiores são splitadas em múltiplas entradas.
- **Stack traces**: em produção, truncado a 2KB (config `ERROR_STACK_MAX_BYTES`).

### 10.3 Streaming de dados para a UI

Para execuções em andamento (status RUNNING):
- **SSE** (`GET /executions/:id/logs/stream`): o worker envia eventos para o topic `execution:events:{id}` no Redis. A API faz proxy SSE → Redis Pub/Sub.
- Eventos: `node.started`, `node.completed`, `node.failed`, `execution.log`, `execution.stateChanged`
- Formato SSE:
  ```
  event: node.completed
  data: {"nodeId": "...", "status": "SUCCESS", "duration": 245, "output": {...sampled...}}
  ```

### 10.4 Armazenamento de logs

- **Logs estruturados** (`execution_logs`): particionados por mês (`PARTITION BY RANGE (timestamp)`). Índice composto `(executionId, timestamp)`.
- **TTL**: logs são mantidos por 30 dias (free), 90 dias (pro), 1 ano (enterprise).
- **Cold storage**: logs arquivados para S3/GCS após 30 dias, com metadados mantidos no Postgres.

### 10.5 Indexação e queries quentes

Índices críticos (já parcialmente existentes):

| Tabela | Índice | Query atendida |
|---|---|---|
| `WorkflowExecution` | `(orgId, startedAt DESC)` | Lista de execuções por org |
| `WorkflowExecution` | `(workflowId, status, startedAt)` | Execuções de um workflow filtradas por status |
| `WorkflowExecution` | `(parentId)` | Replay tree |
| `NodeExecution` | `(executionId, startedAt)` | Timeline de nós |
| `NodeExecution` | `(executionId, nodeId, runIndex)` | Tentativas de um nó |
| `ExecutionLog` | `(executionId, timestamp)` | Logs de uma execução |
| `ExecutionLog` | `(executionId, level, timestamp)` | Logs filtrados por nível |
| `ExecutionMetric` | `(executionId, metric)` | Métricas de uma execução |
| `ExecutionBinaryRef` | `(executionId, nodeId)` | Binários de uma execução |

---

## 11. Retenção e limpeza

### 11.1 Políticas por plano

| Plano | Retenção de execuções | Retenção de logs | Retenção de binários | Execuções/mês |
|---|---|---|---|---|
| Free | 7 dias | 7 dias | 7 dias | 100 |
| Starter | 14 dias | 14 dias | 14 dias | 100 |
| Basic | 30 dias | 30 dias | 30 dias | 500 |
| Growth | 90 dias | 90 dias | 90 dias | 2.000 |
| Pro | Personalizável (mín. 90 dias) | 365 dias | 365 dias | Ilimitado |

**ADR-02**: A retenção é contada a partir de `startedAt`, não `finishedAt`. Execuções em andamento não são afetadas.

### 11.2 Job de limpeza

**Worker dedicado**: `apps/api/src/workers/cleanup.worker.ts`

- **Frequência**: roda a cada hora em horário de baixa demanda (2-4 AM UTC)
- **Lógica**:
  1. Query: `SELECT id FROM execution_logs WHERE execution.startedAt < NOW() - retention_days AND execution.status IN ('SUCCESS','FAILED')` — particionado por mês
  2. Deleta logs em batches de 10.000 (evita lock)
  3. Query: `SELECT id FROM workflow_executions WHERE startedAt < NOW() - retention_days AND status IN ('SUCCESS','FAILED')`
  4. Deleta NodeExecution, ExecutionMetric, ExecutionBinaryRef (cascade)
  5. Deleta WorkflowExecution (cascade)
  6. Remove binários do storage (S3/GCS) — não apenas referência
  7. Loga no `audit_log`: `{ action: "cleanup", deletedExecutions, deletedLogs, deletedBinaries, bytesFreed }`

**Arquivamento (opcional)**:
- Em vez de deletar, move para storage frio (S3 Glacier / GCS Coldline)
- Mantém metadados no Postgres (marca `archivedAt`)
- Query: soft-delete — `archivedAt IS NULL` em queries normais
- Restore via API: `POST /executions/:id/restore`

### 11.3 Exclusão segura (dados sensíveis)

- **Soft delete**: `DELETE /executions/:id` define `status = CANCELLED` + marca `deletedAt` (se coluna for adicionada). Na verdade, o modelo atual usa `delete` físico via Prisma `onDelete: Cascade` — proposto mudar para soft-delete para auditoria.
- **Exclusão por conta**: `DELETE /executions/:id?hard=true` — requer confirmação e role OWNER/ADMIN. Deleta físicamente (inclui cascata para nodes, logs, métricas, binários).
- **Redação de logs**: antes de qualquer exclusão, logs são reprocessados para remover PII (ver seção sobre redação).

### 11.4 Armazenamento em cold storage (frio)

```
WorkflowExecution (Postgres, hot)
  │
  ├── NodeExecution (Postgres, hot — mas input/output truncated se > 64KB)
  ├── ExecutionLog (Postgres, hot — TTL 30-365 dias)
  ├── ExecutionMetric (TimescaleDB hypertable — comprimido)
  └── ExecutionBinaryRef → S3/GCS/R2 (cold)
       └── Arquivo binário (imágem, PDF, etc.)
```

---

## 12. Diagramas ASCII

### 12.1 Arquitetura de execução e observabilidade

```
                    ┌─────────────────────────────────────────────┐
                    │                API (Fastify)                │
                    │  /executions/*  /workflows/:id/debug/*      │
                    │  SSE /logs/stream  /debug/stream            │
                    └──────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────────────┐
                    │           Redis (Pub/Sub + BullMQ)          │
                    │  - queue:workflows                           │
                    │  - channel:execution:events:{id}            │
                    │  - channel:debug:events:{id}                │
                    │  - rate-limit:{orgId}:*                     │
                    └──────────────┬──────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │              Worker (BullMQ)            │
              │  process "execute" jobs                 │
              │  - topologicalSort(nodes, edges)        │
              │  - for each node:                       │
              │    1. create NodeExecution(RUNNING)     │
              │    2. executeNode()                     │
              │    3. write logs/metrics (append)       │
              │    4. resolve binary → storage          │
              │    5. update NodeExecution(SUCCESS/ERR) │
              │    6. emit event → SSE channel          │
              │  - on finish: update WorkflowExecution  │
              └──────────────────┬─────────────────────┘
                                 │
                    ┌────────────┴───────────────────────────┐
                    │          PostgreSQL (Prisma)           │
                    │                                         │
                    │  WorkflowExecution                      │
                    │  ├── input / output (sampled)           │
                    │  ├── parentExecutionId / replayOf       │
                    │  ├── mode (production/test/replay)      │
                    │  └── debugSessionId                     │
                    │                                         │
                    │  NodeExecution[]                        │
                    │  ├── input/output (sampled)             │
                    │  ├── errorStructured (JSON)             │
                    │  ├── runIndex                           │
                    │  ├── samplingApplied                    │
                    │  └── binaryKeys                         │
                    │                                         │
                    │  ExecutionLog[]  (append-only)          │
                    │     (executionId, nodeId, level, msg, data)│
                    │                                         │
                    │  ExecutionMetric[]  (timeseries)        │
                    │     (metric, value, unit, timestamp)    │
                    │                                         │
                    │  ExecutionBinaryRef[]                   │
                    │     → S3/GCS/R2 (key, bucket, mime)      │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │  Object Storage (S3/GCS/R2)              │
                    │  - binários de execução                  │
                    │  - signed URLs (TTL 5min)                │
                    │  - lifecycle: 7-365 dias por plano       │
                    └──────────────────────────────────────────┘
```

### 12.2 Máquina de estados da execução

```
                    ┌──────────┐
                    │  PENDING │  (na fila BullMQ)
                    └────┬─────┘
                         │ worker pega job
                         ▼
                    ┌──────────┐       ┌─────────────┐
                    │  RUNNING │  ──► │   PAUSED    │ (debug step)
                    └────┬─────┘       └──────┬──────┘
            sucesso     │  falha              │ resume
                         │                    │
          ┌──────────┐   ▼                    ▼
          │ SUCCESS  │ ┌──────────┐   ┌───────────┐
          └──────────┘ │  FAILED  │   │  TIMEOUT  │
                       └────┬─────┘   └───────────┘
                            │ cancel
                       ┌────┴─────┐
                       │CANCELLED │
                       └──────────┘
                            ▲
                            │ approval pending
                       ┌────┴──────────┐
                       │ WAITING_      │
                       │ APPROVAL      │
                       └───────────────┘
```

### 12.3 Timeline de debug interativo

```
Editor Canvas:
  [Webhook] ──► [HTTP] ──► [IF] ──► [AI Agent ✗] ──► [Merge] ──► [Output]
                 │           │        (highlight)
                 │           └──────── (breakpoint)
                 └──────────────────── (completed ✓)

Debug Panel (right):
  ┌────────────────────────────────────┐
  │ Execution: exec_abc123             │
  │ Status: RUNNING (debug step)      │
  │ Paused at: AI Agent (node_04)     │
  ├────────────────────────────────────┤
  │ Input JSON:                        │
  │ { "prompt": "analyze data..." }   │
  │                                    │
  │ Output: (not yet computed)        │
  │                                    │
  │ [ Resume ▶ ] [ Step ▶▶ ] [Stop]   │
  └────────────────────────────────────┘

SSE Stream:
  event: node.started     → { nodeId: "node_04", ... }
  event: node.failed     → { nodeId: "node_04", error: "timeout" }
  event: execution.log    → { level: "WARN", message: "Retry 1/3 in 1s" }
  event: execution.state  → { status: "RUNNING", nodeOutputs: {...} }
```

### 12.4 Fluxo de replay

```
1. API POST /executions/:id/replay
   ↓
2. Create WorkflowExecution:
   - parentExecutionId = :id
   - replayOf = :id
   - mode = "replay"
   - input = original.input
   - status = PENDING
   ↓
3. BullMQ queue.add("execute", { executionId, replayContext })
   ↓
4. Worker:
   - Carrega execution (detecta mode="replay")
   - Configura context.isReplay = true
   - Se dryRun: pula side effects (HTTP POST, email, etc.)
   - Executa subgrafo se "nodes" especificado
   - Log: "Starting replay of exec_original → exec_new"
   ↓
5. SSE event: execution.completed
```

---

## 13. Troubleshooting (guia de diagnóstico)

### 13.1 Execução travada em PENDING — nada acontece

**Sintoma**: Workflow disparado mas fica em `PENDING` por mais de 60 segundos.

**Causas prováveis**:
1. **Fila vazia / worker offline**: nenhum worker está processando. Verifique `docker ps | grep worker` e os logs do worker (`docker logs agentflow-worker`). O worker deve logar "Worker registered: process execute jobs".
2. **Job removido da fila**: job foi removido manualmente via BullMQ UI (BullMQ Board) ou por um job de cleanup agressivo.
3. **BullMQ congestionada**: fila com milhares de jobs atrasados. Use `bull-board` ou `node -e "const q=new Queue('...'); console.log(await q.getJobCounts())"` para inspecionar.

**Solução**:
- Restart do worker: `docker compose restart worker`
- Verifique `REDIS_URL` — worker e API devem apontar para o mesmo Redis
- Aumente concorrência do worker em `apps/api/src/config/queue.config.ts` (`CONCURRENCY` env var)

**Comando de verificação**:
```bash
# Verifica se worker está conectado
docker logs agentflow-worker 2>&1 | tail -n 20 | grep -i "registered\|error\|connecting"
# Verifica contagem de jobs na fila
redis-cli LLEN "bull:workflows:waiting"
redis-cli LLEN "bull:workflows:active"
```

### 13.2 Execução travada em RUNNING — nó específico não avança

**Sintoma**: Execution fica em `RUNNING` mas o nó atual não tem log de conclusão.

**Causas**:
1. **HTTP node com timeout infinito**: o nó HTTP não tem `timeout` configurado (nó HTTP default: 30s, mas pode ser sobrescrito).
2. **AI node (OpenAI/Claude) lento**: latência da API externa. Verifique métricas de latência do provedor.
3. **Code node com loop infinito**: código JavaScript sem break/loop guard.
4. **Web node aguardando resposta**: HTTP node aguardando resposta que nunca volta (server não fecha conexão).

**Solução**:
- Use `GET /api/v1/executions/:id/logs/stream` para live tail — veja onde travou
- Use `POST /api/v1/executions/:id/cancel` para cancelar
- No detalhe, verifique o `NodeExecution` mais recente — se `startedAt` é antigo e `finishedAt` é null, o nó travou
- Em modo debug, use `/debug/stop` para interromper a sessão

### 13.3 Binário não carrega / preview quebrado

**Sintoma**: Clique em "view binary" retorna 404 ou erro de permissão.

**Causas**:
1. **URL expirou**: signed URL tem TTL de 5 min. Gere nova URL via `GET /api/v1/executions/:id/binary/:refId`
2. **Arquivo removido do storage**: job de limpeza apagou o binário mas referência no banco restou. Verifique se `ExecutionBinaryRef` existe mas `key` não existe no storage.
3. **Bucket incorreto**: `BINARY_STORAGE_BUCKET` mudou entre deploy. Re-configure.
4. **Credencial de storage expirou**: worker usava credencial temporária que expirou.

**Solução**:
- Force regeneração de URL: `POST /api/v1/executions/:id/binary/:refId/refresh-url`
- Verifique `BINARY_STORAGE_PROVIDER` e `BINARY_STORAGE_BUCKET` no `.env` do worker
- Se binário foi removido, não há como restaurar — mantenha política de retenção mais longa que a de limpeza

### 13.4 Replay falha com "credential not found"

**Sintoma**: Replay de execution antiga falha porque a credencial referenciada foi deletada.

**Causas**:
- Credencial foi excluída entre a execução original e o replay
- Workspace/tenant mudou e credencial não está mais acessível

**Solução**:
- O executor deve falhar GRACIOSAMENTE: logar warning "credential X not found, skipping node" e marcar nó como `FAILED` com `error.code = "CREDENTIAL_NOT_FOUND"` — **não** travar toda a execução
- Use pinData como workaround para replay sem credencial

### 13.5 Logs aparecem com [REDACTED] demais — não consigo debugar

**Sintoma**: Mensagem de erro útil foi totalmente redigida.

**Causas**:
- Padrão de redação muito agressivo (ex: redige qualquer coisa que contenha "key")
- Erro em nó de AI com JSON de output complexo, redação remove contexto

**Solução**:
- Use `GET /api/v1/executions/:id/error` (endpoint admin-only) que retorna `errorStructured` não redigido para roles OWNER/ADMIN
- Em ambiente de desenvolvimento, `REDACTION_ENABLED=false` desativa redação
- `errorStructured.context` preserva `nodeConfig` (sem credencial) para debug — use isso em vez de logs

### 13.6 Exportação CSV retorna dados incompletos

**Sintoma**: CSV exportado tem menos linhas que items processados.

**Causas**:
1. **Sampling aplicado**: output foi amostrado (1000 items → 50 amostrados). CSV reflete apenas a amostra.
2. **Output é um array aninhado**: CSV achata mal estruturas profundas.
3. **Truncamento de 64KB**: output maior que 64KB foi truncado.

**Solução**:
- Verifique `NodeExecution.samplingApplied` — se true, use `GET /api/v1/executions/:id/nodes/:nodeId/full` (paginado) para exportar tudo
- Para estruturas anidadas, prefira exportação JSON (`export/json`) e processe via script
- Aumente `OUTPUT_MAX_SIZE_BYTES` para exportações grandes (custo de memória)

### 13.7 Timeline não mostra nós em ordem correta

**Sintoma**: Nós aparecem fora de ordem cronológica no timeline.

**Causas**:
1. **Nó paralelo (Merge)**: múltiplos branches executam simultaneamente — order não é linear
2. **Retry**: nó falhou e foi retried — duas entradas para o mesmo nodeId
3. **Clock skew entre workers**: `startedAt` gravado em máquinas com relógios desincronizados

**Solução**:
- Timeline ordena por `startedAt` — mas para nós paralelos, use `runIndex` e `nodeId` como tiebreaker
- Para retries, o timeline mostra tentativas como sub-itens expansíveis
- Garanta NTP sincronizado entre todos os workers (`ntpd` ou `chrony` no container)

### 13.8 SSE stream desconecta frequentemente

**Sintoma**: `/logs/stream` conecta e desconecta a cada alguns segundos.

**Causas**:
1. **Timeout de proxy reverso**: nginx/traefik com `proxy_read_timeout` baixo (30s). Configure `proxy_read_timeout 300s`.
2. **Timeout de load balancer**: cloud LB com idle timeout de 60s.
3. **Worker morre**: se worker trava, não publica mais eventos — cliente não recebe. Reconexão não ajuda.
4. **Redis Pub/Sub overflow**: subscriber não consome rápido o suficiente, Redis dropa mensagens.

**Solução**:
- Configure `keepalive_timeout 300s` no nginx frontend
- API deve enviar `:keepalive\n\n` a cada 30s para manter conexão SSE viva
- Se worker morre, `POST /:id/cancel` + re-trigger manual

### 13.9 Retenção não está funcionando — execuções antigas não são deletadas

**Sintoma**: Execuções com mais de 90 dias (plano Pro) ainda visíveis.

**Causas**:
1. **Job de cleanup não está rodando**: worker `cleanup.worker.ts` não foi deployado ou está crashed.
2. **Job roda mas falha silenciosamente**: erro no batch delete não é logado.
3. **Soft-delete confundido com hard-delete**: `deletedAt` foi setado mas UI não filtra.

**Solução**:
- Verifique logs do worker de cleanup: `docker logs agentflow-worker | grep cleanup`
- Query manual: `SELECT COUNT(*) FROM "WorkflowExecution" WHERE "startedAt" < NOW() - INTERVAL '90 days' AND status IN ('SUCCESS','FAILED')`
- Force limpeza manual via CLI: `POST /api/v1/admin/cleanup?olderThan=90d` (admin only)

### 13.10 Debug session não para no breakpoint

**Sintoma**: Execução de debug passa direto pelo breakpoint configurado.

**Causas**:
1. **Breakpoint em nó errado**: breakpoint foi setado no `nodeName` mas workflow foi renomeado — use `nodeId` (UUID), não nome.
2. **Debug iniciado sem `breakpoints`**: `POST /debug` sem lista de breakpoints → roda sem pausas.
3. **Worker não carregou breakpoints**: contexto de debug não foi injetado no worker.
4. **Nó é do tipo "trigger"** — triggers sempre executam antes do primeiro breakpoint.

**Solução**:
- Use `GET /api/v1/executions/:id/debug/state` para ver breakpoints ativos
- Verifique se `debugSessionId` foi associado à `WorkflowExecution`
- Reinicie sessão de debug: `POST /debug/stop` + `POST /debug` com breakpoints corretos

---

## 14. ADRs (Decisões de Arquitetura)

### ADR-01: Separar TIMEOUT de FAILED

**Contexto**: O status atual `FAILED` não distingue timeout de erro de lógica. Isso prejudica alertas e SLOs.

**Decisão**: Adicionar status `TIMEOUT` e `PAUSED`.

**Consequências**:
- `TIMEOUT` gera alerta de latência (SLO: 95% < 30s)
- `FAILED` gera alerta de disponibilidade (SLO: 99.9%)
- `PAUSED` é exclusivo de modo debug — não aparece em filtros de produção
- Migração: execuções antigas com `error` contendo "timeout" são migradas para `TIMEOUT` via job de background

### ADR-02: Sampling de dados

**Contexto**: Execuções com milhares de items não cabem em JSONB sem degradar performance.

**Decisão**: Implementar sampling adaptativo (seção 10.1) com flag `samplingApplied`.

**Consequências**:
- UI mostra aviso quando dados são amostrados
- Endpoint `/executions/:id/full/:nodeId` retorna dados não-sampled (paginado) para uso programático
- Sampling aplicado apenas em `input`/`output`, nunca a `logs` (que já são estruturados)
- Configurável por plano

### ADR-03: Logs estruturados vs. texto plano

**Contexto**: O modelo atual `NodeExecution.logs` é um campo `String?` (texto plano). Para busca e análise, precisamos de estrutura.

**Decisão**: Criar tabela `ExecutionLog` estruturada (level, message, data JSON). Manter `NodeExecution.logs` como campo legado para retrocompatibilidade (stdout/stderr do node).

**Consequências**:
- `ExecutionLog` é o sistema de log primário — busca por nível, filtro por mensagem
- `NodeExecution.logs` continua para dados binários de stdout (ex: console.log do Code node)
- Redação de segredos aplicada no `message` e `data` de cada `ExecutionLog`

### ADR-04: Armazenamento binário fora do banco

**Contexto**: JSONB não é eficiente para arquivos grandes (imagens, PDFs, anexos).

**Decisão**: Dados binários → object storage (S3/GCS/R2). Banco apenas referenciamento (`ExecutionBinaryRef`).

**Consequências**:
- Worker envia binários ao storage e grava ref no banco
- URL de download é temporária (signed URL, TTL 5 min)
- Storage provider configurável via `BINARY_STORAGE_PROVIDER` env var
- Em desenvolvimento (sem storage), usa `memory` provider

### ADR-05: Replay cria nova execução (imutabilidade)

**Contexto**: Modificar execução existente invalida auditoria e histórico.

**Decisão**: Replay/rerun sempre criam nova `WorkflowExecution` com `parentExecutionId` apontando para a original.

**Consequências**:
- Toda execução tem histórico claro de derivação
- UI pode mostrar "árvore de replay" — quais execuções derivaram de qual
- `mode` campo distingue replay de production/test

### ADR-06: Error workflow como primeira classe

**Contexto**: O n8n tem `settings.errorWorkflow` para tratar falhas. Precisamos suportar isso para parity.

**Decisão**: O motor, ao detectar falha definitiva, automaticamente despacha uma execução do error workflow (se configurado), passando `{ error, originalExecutionId, workflowId, nodeId }`.

**Consequências**:
- Error workflow é uma execução filha com `trigger = "error"`
- Se o error workflow também falhar, loga como `errorWorkflow.failed` no audit log
- Error workflow não pode disparar recursivamente (loop protection: max 1 nível de profundidade)

### ADR-07: SSE para live tail de logs

**Contexto**: Polling a cada 1s para logs de execução em andamento é ineficiente.

**Decisão**: Usar SSE (Server-Sent Events) para stream de logs e eventos de debug. Redis Pub/Sub como backing.

**Consequências**:
- `GET /executions/:id/logs/stream` — SSE stream de `ExecutionLog`
- `GET /executions/:id/debug/stream` — SSE stream de eventos de debug
- API faz proxy SSE → Redis Pub/Sub (`execution:events:{id}`)
- Worker publica eventos na mesma channel
- Timeout de conexão SSE: 60s (reconexão automática do cliente)

### ADR-08: Dry-run no replay

**Contexto**: Replay de workflows com side effects (HTTP POST, email) pode causar duplicação indesejada.

**Decisão**: `POST /executions/:id/replay` aceita `dryRun: boolean`. Em modo dry-run, node handlers HTTP/email/telegram retornam simulação sem efeito colateral.

**Consequências**:
- Contexto `dryRun` injetado no `NodeExecutionContext`
- Handlers de ação devem verificar `context.dryRun` antes de side effects
- Output em dry-run marca `{ dryRun: true, simulatedResponse: true }`

### ADR-09: Retenção baseada em plano

**Contexto**: Free tier não pode armazenar indefinidamente; enterprise precisa de retenção longa.

**Decisão**: Retenção configurada por plano (tabela na seção 11.1). Job de limpeza roda periodicamente.

**Consequências**:
- Job `cleanup.worker.ts` lê `PLAN_LIMITS` para determinar TTL
- Soft-delete opcional → cold storage em vez de exclusão física
- Arquivamento requer aprovação (flag `archivedAt`)

### ADR-10: Comparação de execuções via diff estruturado

**Contexto**: Users precisam comparar outputs entre duas execuções (ex: antes/depois de mudança).

**Decisão**: Endpoint `POST /executions/compare` retorna um diff estruturado com: métricas comparativas, diff de output por nó (JSON Patch), timeline paralela.

**Consequências**:
- Diff usa algoritmo de comparação JSON (jsondiff) — deep equality por caminho
- Output truncado para amostra (não diff de 1M items)
- Download de diff como JSON Patch ou texto unificado

---

## 15. Segurança e custo de armazenar dados

### 15.1 Segurança de dados de execução

#### Redação (redaction) de segredos

Todo dado que passa pelo logger de execução passa por um **redactor** que mascara padrões conhecidos de segredos:

```typescript
const REDACT_PATTERNS = [
  { pattern: /api[_-]?key/i, replacement: "[REDACTED_API_KEY]" },
  { pattern: /password/i, replacement: "[REDACTED_PASSWORD]" },
  { pattern: /token/i, replacement: "[REDACTED_TOKEN]" },
  { pattern: /Bearer\s+[\w.-]+/, replacement: "Bearer [REDACTED]" },
  { pattern: /\b[AKIA[0-9A-Z]{16}\b/, replacement: "[REDACTED_AWS_KEY]" },
  { pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-0-9_-]+\.[A-Za-z0-9_-]+\b/, replacement: "[REDACTED_JWT]" },
];
```

- Redação aplicada em: `ExecutionLog.message`, `ExecutionLog.data`, `NodeExecution.logs`, `NodeExecution.error`, `WorkflowExecution.error`, `WorkflowExecution.input` (campos que contenham chaves "sensitive")
- Credenciais **nunca** aparecem no output de nodes — o executor resolve credenciais internamente e injeta apenas headers, nunca o secret em claro
- `errorStructured.context.nodeConfig` **nunca** inclui `credentials` — apenas o `credentialId` referencial (já existente no código do executor)

#### Controle de acesso (multi-tenant)

- Todas as queries de execução filtram por `orgId` (herdado do modelo de auth)
- Usuários VIEWER podem listar e ver detalhes, mas **não** podem: cancelar, deletar, replayar, ou ver `input`/`output` truculados se contiverem PII (configurável por policy)
- Usuários MEMBER/ADMIN/OWNER têm acesso completo
- `decryptCredential` (credencial) só é chamada pelo worker, nunca exposta à API de execução

#### Integridade

- `ExecutionBinaryRef.checksum` (SHA256) permite verificação de integridade de binários
- `idempotencyKey` em `NodeExecution` previne duplicação em retries
- `requestId` propagado por headers (`x-request-id`) até logs de execução

### 15.2 Custos de armazenamento

#### Estimativa por execução típica

| Componente | Tamanho médio | Retenção (Pro) | Custo/mês/1000 exec |
|---|---|---|---|
| `WorkflowExecution` | 2 KB | 90 dias | ~$0.0003 |
| `NodeExecution` (5 nós) | 10 KB | 90 dias | ~$0.0015 |
| `ExecutionLog` (50 logs) | 5 KB | 90 dias | ~$0.0007 |
| `ExecutionMetric` (5 métricas) | 0.5 KB | 90 dias | ~$0.0001 |
| `ExecutionBinaryRef` | 0.5 KB | 90 dias | ~$0.0001 |
| Binário (1MB imagem) | 1 MB | 90 dias | ~$0.023 (S3 Standard) |
| **Total (sem binário)** | ~18 KB | 90 dias | **~$0.0026** |
| **Total (com binário)** | ~1 MB | 90 dias | **~$0.0256** |

#### Escalabilidade para milhões de execuções/mês

| Volume | Armazenamento PostgreSQL | Armazenamento S3 | Custo/mês |
|---|---|---|---|
| 100K exec (sem binário) | ~1.8 GB | 0 | ~$0.26 |
| 100K exec (1MB binário cada) | ~1.8 GB | 100 TB | ~$2,560 |
| 1M exec (sem binário) | ~18 GB | 0 | ~$2.60 |
| 1M exec (1MB binário cada) | ~18 GB | 1 PB | ~$25,600 |

**Otimizações de custo**:
- **Sampling** (ADR-02): reduz 90%+ do tamanho de input/output
- **Cold storage** (Glacier/Deep Archive): 75% mais barato que Standard, mas com latência de restore
- **Compressão**: JSONB comprimido no Postgres (PG 14+ `COMPRESSION lz4`)
- **TTL automático**: job de limpeza remove dados expirados
- **Armazenamento de logs em TimescaleDB** (comprimido) ou CloudWatch (para planos enterprise)

#### Custos de compute (SSE/debug)

- SSE streams mantêm conexões HTTP abertas — estime 1 conexão por sessão ativa de debug
- Worker de limpeça: processo batch, baixo custo (1x/hour, < 5min)
- Dry-run: evita side effects reais, economiza API calls de provedores (OpenAI, Twilio, etc.)

### 15.3 PII e compliance

- **PII em input/output**: workflow inputs podem conter dados pessoais (email, CPF). A plataforma deve oferecer:
  - `POST /executions/:id/redact` — aplica redação de PII a dados já armazenados
  - Configuração de campos PII por workflow (ex: `"input.email"`, `"input.cpf"`)
  - Em planos enterprise: encriptação de campo PII (não apenas redação)
- **LGPD**: retenção mínima de 1 ano para auditoria; direito de exclusão ("direito ao esquecimento") via `DELETE /executions/:id?hard=true`
- **Auditoria**: todas as operações em execuções (view, replay, cancel, delete) são logadas em `AuditLog`

---

## 16. Critérios E2E (critários de aceitação)

### 16.1 Histórico e listagem

- [ ] `GET /api/v1/executions` retorna lista paginada com filtros (status, workflow, date range, trigger, mode, search)
- [ ] Busca textual encontra workflows por nome, erro e input (sampled)
- [ ] Paginação com `cursor` ou `page/limit` (mínimo 1000 exec/executar)
- [ ] Listagem respeita `orgId` (multi-tenant isolation)
- [ ] UI: tabela com colunas (workflow, status, started, duration, mode, trigger), checkboxes, ações em lote
- [ ] UI: sidebar de filtros com checkboxes, date picker, busca

### 16.2 Detalhe e timeline

- [ ] `GET /api/v1/executions/:id` retorna exec com nodes, logs, metrics, binaryRefs, approvals
- [ ] Timeline visual mostra cada nó com duração, status, retry count
- [ ] Clique em nó abre input/output (JSON navegável, tree + raw), binary preview (imagem/PDF/texto)
- [ ] Erro mostra stack trace (admin only), mensagem amigável, causa provável, dicas
- [ ] SSE live tail: `GET /api/v1/executions/:id/logs/stream` envia eventos em tempo real
- [ ] Botão "Ver dados de entrada/saída" em cada nó do timeline

### 16.3 Pin e rerun parcial

- [ ] `PUT /api/v1/workflows/:id/pin` define/remete pinData
- [ ] Worker usa pinData quando disponível (não executa nó, usa dados fixados)
- [ ] `POST /api/v1/executions/:id/rerun-from` com `nodeId` cria subgrafo e rerun
- [ ] Nova execução tem `parentExecutionId` apontando para original
- [ ] UI: botão "Pin" no NodeConfigPanel, botão "Re-executar a partir daqui" no timeline

### 16.4 Replay

- [ ] `POST /api/v1/executions/:id/replay` cria nova execução com `mode="replay"` e `replayOf`
- [ ] `dryRun: true` faz handlers pularem side effects
- [ ] Replay de node único (`replay-node`) funciona isoladamente
- [ ] Replay não clona dados binários (usa referências do storage)
- [ ] UI: botão "Replay" no detalhe da execução

### 16.5 Depuração

- [ ] `POST /api/v1/workflows/:id/debug` inicia sessão debug, retorna `debugSessionId`
- [ ] Worker pausa após cada nó (step mode) ou no breakpoint
- [ ] SSE `/debug/stream` envia eventos `node.started`, `node.completed`, `execution.paused`
- [ ] `POST /debug/resume`, `/debug/step`, `/debug/next`, `/debug/stop` controlam sessão
- [ ] UI: canvas destaca nó atual, painel direito mostra input/output, timeline ao vivo

### 16.6 Erros e error workflow

- [ ] Nó falho popula `errorStructured` com `{ message, code, nodeId, stack, inputAtFailure, suggestions }`
- [ ] `settings.errorWorkflow` é respeitado — falha definitiva dispara error workflow
- [ ] Diagnóstico automático: mapeamento de padrões de erro → causa provável + dicas
- [ ] `continueOnFail` permite workflow prosseguir com erro no nó (item marcado `{{ error: message }}`)

### 16.7 Exportação

- [ ] `GET /api/v1/executions/:id/export/json` retorna JSON completo (workflow snapshot + nodes + logs + metrics)
- [ ] `GET /api/v1/executions/:id/export/csv?nodeId=X` retorna CSV dos dados de saída do nó X
- [ ] `POST /api/v1/executions/export/batch` exporta múltiplas execuções
- [ ] CSV suporta até 100K rows (streaming, não carrega tudo em memória)

### 16.8 Performance

- [ ] Sampling aplicado para nodes com > 1000 items (amostra configurable por plano)
- [ ] Input/output truncado a 64KB (com flag `truncated`)
- [ ] Logs truncados a 10KB por entrada
- [ ] SSE stream funciona com 100+ clientes conectados simultaneamente
- [ ] Particionamento de `ExecutionLog` por mês (PostgreSQL partitioning)

### 16.9 Retenção e limpeza

- [ ] Job `cleanup.worker.ts` roda periodicamente e remove execuções/logs/binários expirados
- [ ] Retenção por plano: Free 7d, Pro 90d, Enterprise personalizável
- [ ] Soft-delete: `DELETE /executions/:id` marca como excluído (não físico)
- [ ] Hard-delete (`?hard=true`) requer role OWNER/ADMIN e confirmação
- [ ] Binários removidos do storage quando execução é deletada (cascade)

### 16.10 Cancelamento

- [ ] `POST /api/v1/executions/:id/cancel` marca como CANCELLED
- [ ] Worker verifica flag de cancelamento periodicamente (polling a cada nó)
- [ ] Execuções em PENDING/RUNNING podem ser canceladas; terminais não
- [ ] Cancelamento propaga para bullmq job (job.remove() / job.moveToDelayed())

### 16.11 Comparação

- [ ] `POST /api/v1/executions/compare` com `{ a: id1, b: id2 }` retorna diff de output por nó
- [ ] Diff usa JSON Patch (RFC 6902) para comparação estruturada
- [ ] Timeline paralela mostra duração lado a lado
- [ ] Métricas comparativas (tokens, custo, duração)

---

## 17. Glossário

| Termo | Definição |
|---|---|
| **execution** | Uma única corrida de um workflow; gera logs, dados de input/output e status. |
| **node execution** | Execução de um nó individual dentro de uma execution; tem input, output, status, logs, duração. |
| **timeline** | Visualização sequencial de eventos de uma execution (início/fim de cada nó, logs, retry). |
| **pin / pinData** | Dados fixados em um nó para testes; o executor usa estes dados ao invés de executar o nó. |
| **rerun parcial** | Executar apenas o subgrafo downstream de um nó específico, com dados atuais. |
| **replay** | Re-executar uma workflow com os MESMOS inputs (ou novos), criando uma nova execution. |
| **dry-run** | Modo de replay que simula execução sem causar side effects reais (HTTP POST, email, etc.). |
| **debug session** | Sessão interativa de execução que pausa após cada nó ou em breakpoints. |
| **breakpoint** | Ponto de parada configurado em um nó específico; a execução pausa ao atingi-lo. |
| **step** | Executar exatamente um nó e pausar novamente. |
| **log estruturado** | Registro de evento com `{ level, message, data }` (JSON), não texto plano. |
| **sampling** | Técnica de armazenar apenas uma amostra de items (não todos) para visualização. |
| **truncamento** | Limite de tamanho em campos (64KB para input/output, 10KB para logs). |
| **SSE** | Server-Sent Events — streaming unidirecional de eventos do servidor para browser. |
| **binário** | Dados não-texto (imagens, PDFs, arquivos) referenciados por storage, não armazenados no banco. |
| **redação** | Processo de mascarar segredos (API keys, tokens, senhas) em logs e dados retornados. |
| **error workflow** | Workflow dedicado que recebe dados de erro de outra execution para tratamento. |
| **continueOnFail** | Flag de nó: workflow prossegue mesmo se este nó falhar (output contém `{ error }`). |
| **retry backoff** | Estratégia de retentativa com delay exponencial entre tentativas. |
| **traceId** | ID de correlacionamento para tracing distribuído (OpenTelemetry). |
| **parentExecutionId** | Referência à execução original quando esta é um replay/rerun. |
| **cold storage** | Storage de baixo custo para dados arquivados (S3 Glacier, GCS Coldline). |
| **multi-tenant** | Isolamento de dados entre organizações; queries filtradas por `orgId`. |
| **POV** | Point of View — em comparação de execuções: qual execução é a referência. |
| **diff** | Comparação estruturada entre dois outputs (JSON Patch, RFC 6902). |
| **runIndex** | Índice da tentativa de um nó (0 = primeira, 1 = primeira retry, etc.). |
| **pairedItem** | Referência ao item de input que originou este item de output (para loops/batches). |
| **idempotencyKey** | Chave para evitar execuções duplicadas de um nó em retries. |
