# Engine de Execução — AgentFlow

> **Missão**: Especificar o engine de execução completo do AgentFlow, compatível com o modelo de dados do n8n (nodes, connections, expressões, dados binários, execuções).  
> **Work dir**: `n8n-migration/`  
> **Data**: 2026-08-20  
> **Status**: DESIGN — não implementar, não commitar  
> **Base**: `design-runner.md`, `design-recriacao.md`, `catalogo-nodes.md`, `referencia-n8n.md`, `v2-security-spec.md`, `design-testes.md`, `deps-e-libs.md`, `design-seguranca.md`, `apps/api/src/services/executor.ts`, `packages/database/prisma/schema.prisma`

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Modelo de dados (workflow/node/connection/execution)](#2-modelo-de-dados-workflow-nodeconnection-execution)
3. [Validação de grafo (DAG)](#3-validação-de-grafo-dag)
4. [Ciclo de vida da execução](#4-ciclo-de-vida-da-execução)
5. [Contexto de execução e expressões](#5-contexto-de-execução-e-expressões)
6. [Fluxo de dados entre nodes](#6-fluxo-de-dados-entre-nodes)
7. [Loops e batches](#7-loops-e-batches)
8. [Subworkflows](#8-subworkflows)
9. [Dados binários](#9-dados-binários)
10. [Máquina de estados](#10-máquina-de-estados)
11. [Wait, resume e aprovações](#11-wait-resume-e-aprovações)
12. [Checkpoints e retomada](#12-checkpoints-e-retomada)
13. [Retry e timeouts](#13-retry-e-timeouts)
14. [Cancelamento](#14-cancelamento)
15. [Idempotência e deduplicação](#15-idempotência-e-deduplicação)
16. [Tratamento de erros](#16-tratamento-de-erros)
17. [Execução distribuída](#17-execução-distribuída)
18. [Performance](#18-performance)
19. [Compatibilidade n8n](#19-compatibilidade-n8n)
20. [Decisões de design (ADR)](#20-decisões-de-design-adr)

---

## 1. Visão geral

### 1.1 Objetivo

O **engine de execução** do AgentFlow é o componente que interpreta o grafo direcionado acíclico (DAG) de um workflow e executa seus nós em ordem topológica, gerenciando estado, dados, erros, retries, timeouts, cancelamento, e persistência. Ele é compatível com workflows exportados do n8n no formato JSON, preservando semântica de fluxo (branching, merge, loops, subworkflows) enquanto substitui a infraestrutura do n8n por stack própria: **BullMQ + Redis + Prisma + PostgreSQL + Fastify**.

### 1.2 Princípios de projeto

| Princípio | Descrição |
|-----------|-----------|
| **Determinismo** | A mesma entrada + workflow sempre produz a mesma saída e ordem de execução. Topological sort é determinístico (ordem estável de inserção + nodeId). |
| **Durabilidade** | Estado de execução é persistido após cada node concluído. Crash → retomada a partir do último checkpoint. |
| **Isolamento** | Cada execução roda em worker isolado (processo separado via BullMQ). Dados de tenants não compartilham memória. |
| **Observabilidade** | Cada node produz logs estruturados, métricas de duração, e SSE em tempo real para a UI. |
| **Segurança** | Code nodes executam em sandbox (isolate-vm, zero rede/fs). Credenciais são descriptografadas apenas no momento do uso e nunca logadas. |
| **Compatibilidade n8n** | Workflows importados do n8n devem executar com semântica equivalente (paridade comportamental). |
| **Sem vendor lock-in** | Não embute `n8n-core` (licença SUL). Engine reimplementada sobre stack já existente. |

### 1.3 Arquitetura de alto nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            API LAYER (Fastify)                            │
│  POST /webhook/:org/:path  →  POST /workflows/:id/execute                │
│                              POST /executions/:id/cancel                 │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            QUEUE LAYER (BullMQ + Redis)                    │
│  Queue "workflow:execution"  ←  Job { executionId, orgId, trigger }      │
│  Priority: webhook > manual > cron                                        │
│  Retry config (global + por workflow)                                   │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKER LAYER (Node.js, process)                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  WorkflowExecutor (DAG runner, topological sort, state machine)   │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ NodeHandler │  │ Expression   │  │ BinaryDataManager      │  │  │
│  │  │ Registry    │  │ Engine       │  │ (storage abstraction)   │  │  │
│  │  │ (HTTP, IF,  │  │ ({{ $json }}\|  │                        │  │  │
│  │  │  Code, ...) │  │              │  │                        │  │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                              │
│                           ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  CredentialService (AES-256-GCM, HKDF, audit trail)               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER (Prisma + PostgreSQL)                    │
│  WorkflowExecution, NodeExecution, WorkflowNode, WorkflowEdge,           │
│  Credential, Approval, AuditLog                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Convenções deste documento

- **Tipo n8n**: prefixo `n8n-nodes-base.*` ou `@n8n/n8n-nodes-langchain.*`
- **Tipo AgentFlow**: nomes curtos como `webhook`, `http`, `condition`, `ai_agent` (mapeio definido em `n8n-import.ts`)
- **Expressões**: sintaxe n8n `{{ $json.field }}`, `{{= JS expression }}`, `{{ $node["Name"].json }}`
- **Items**: unidades de dados entre nós; cada item tem `{ json, binary, error?, ...metadata }`
- **NodeItem**: tipo TypeScript definido na seção 2

---

## 2. Modelo de dados (workflow/node/connection/execution)

### 2.1 Definições TypeScript — nível de domínio

```typescript
// packages/shared/src/workflow/types.ts

/** Identificador único de node dentro de um workflow */
export type NodeID = string;

/** Um item de dado fluindo entre nodes — equivalente a "item" no n8n */
export interface NodeItem {
  json: Record<string, unknown>;
  binary: Record<string, BinaryDataRef>;
  error?: string;
  // Metadados n8n-compatíveis (não são dados do usuário, são controle de fluxo)
  _batchIndex?: number;
  _batchSize?: number;
  _totalBatches?: number;
  _isLastBatch?: boolean;
  _webhook?: {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    webhookId: string;
  };
  _metadata?: Record<string, unknown>;
}

/** Referência a dados binários — conteúdo não é inline, é um ID de storage */
export interface BinaryDataRef {
  id: string;          // ID no BinaryDataManager (ex: S3 key, DB row id)
  mimeType: string;   // ex: "image/png", "application/pdf"
  fileName?: string;
  dataSize?: number;   // bytes (para validação de limite)
  // NO: conteúdo base64 nunca em memória por mais que item fluir
}

/** Edge (conexão) entre dois nodes */
export interface WorkflowEdge {
  id: string;
  sourceNodeId: NodeID;
  targetNodeId: NodeID;
  sourceHandle?: string;  // nome da saída (ex: "main", "true", "false", ou label do Switch)
  targetHandle?: string;  // nome da entrada (ex: "main", ou índice do Merge input)
  label?: string;         // índice numérico como string (ex: "0", "1") — usado pelo n8n para input port
  condition?: unknown;    // JSON com regra condicional (usado por edges condicionais)
}

/** Um node no workflow (definição, não execução) */
export interface WorkflowNodeDef {
  id: NodeID;
  type: string;            // tipo AgentFlow (ex: "http", "condition", "webhook")
  originalType: string;    // tipo n8n original (ex: "n8n-nodes-base.httpRequest") — preservado no import
  typeVersion: number;
  label: string;           // nome exibido no canvas
  config: JsonObject;      // parameters + credentials + retryOnFail + continueOnFail + disabled + etc.
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

/** Workflow completo — definição estática (imutável quando ativado) */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  meta?: Record<string, unknown>;
  orgId: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  activeVersionId: string;  // aponta para WorkflowVersion snapshot
}

/** Settings globais do workflow (compatível com n8n settings) */
export interface WorkflowSettings {
  executionOrder: "v1" | "v2";    // v1 = legacy (n8n padrão), v2 = topological
  saveManualExecutions: boolean;   // salvar execuções manuais no DB
  saveExecutionProgress: boolean;  // checkpointar por node
  executionTimeout: number;        // segundos (padrão: 3600)
  timezone: string;                // para agendamentos (padrão: "UTC")
  errorWorkflow?: string;          // workflowId para tratamento de erros
  callerPolicy: "workflowsFromSameOwner" | "workflowsFromSameOrg" | "any";
  executionTimeoutMs?: number;     // conversão para ms no engine
  concurrency?: {
    maxParallelNodes?: number;     // paralelismo dentro do workflow
  };
}

/** Tipo de trigger */
export type TriggerType = "webhook" | "cron" | "manual" | "api" | "form" | "error";

/** Execução de workflow — instância única de uma corrida */
export interface WorkflowExecution {
  id: string;              // executionId (deduplicação de idempotência)
  workflowId: string;
  orgId: string;
  userId?: string;
  trigger: TriggerType;
  status: ExecutionStatus;
  input: unknown;          // payload original que iniciou a execução
  output?: unknown;        // output final (do nó "output" ou último nó)
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  duration?: number;       // ms
  nodeExecutions: NodeExecutionRecord[];
  stoppedAt?: Date;        // quando cancelamento foi solicitado
  pausedAt?: Date;         // quando wait/approval pausou
  resumeToken?: string;    // para wait/resume via webhook
}

/** Status de execução — fonte de verdade da máquina de estados */
export type ExecutionStatus =
  | "PENDING"          // na fila, aguardando worker
  | "RUNNING"          // worker ativo
  | "SUCCESS"          // concluído sem erro
  | "FAILED"           // erro fatal (node falhou após todos retries)
  | "CANCELLED"        // cancelado pelo usuário/API
  | "PAUSED"           // pausado em wait/approval (aguarda resume)
  | "ERROR"            // erro global do engine (bug, crash, etc.)
  | "WAITING_APPROVAL"; // pausado aguardando aprovação humana

/** Registro de execução de um nó específico */
export interface NodeExecutionRecord {
  id: string;
  executionId: string;
  nodeId: NodeID;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "SKIPPED";
  input?: unknown;
  output?: unknown;
  error?: string;
  logs?: string;
  startedAt: Date;
  finishedAt?: Date;
  duration?: number;
  retryCount: number;
  idempotencyKey?: string;  // para dedup de retries
  checkpointed: boolean;    // se este nó foi checkpointado
}

/** Contrato do output de um node handler */
export interface NodeExecutionResult {
  items: NodeItem[];
  outputRouting?: Record<number, NodeItem[]>;   // para IF, Switch, Merge — índice da saída → items
  executionState?: Record<string, unknown>;      // estado persistido (p/ SplitInBatches, Loop)
  paused?: boolean;                               // para Wait (modo webhook)
  pauseMetadata?: {
    resumeToken: string;
    resumeUrl?: string;
    resumeDataSchema?: Record<string, unknown>;
  };
  isComplete?: boolean;                           // para SplitInBatches (loop interno)
  continueOnFail?: boolean;                       // override dinâmico
}
```

### 2.2 Definições TypeScript — contexto de execução e handler

```typescript
// packages/shared/src/workflow/node-handler.ts

/** Contexto passado a cada NodeHandler.execute() */
export interface NodeExecutionContext {
  executionId: string;
  workflowId: string;
  workflowName: string;
  orgId: string;
  nodeConfig: {
    name: string;
    type: string;           // tipo AgentFlow
    originalType?: string;  // tipo n8n original
    typeVersion: number;
    parameters: Record<string, any>;
    credentials?: Record<string, any>;  // já descriptografadas (respeita v2-security-spec)
    retryOnFail: boolean;
    continueOnFail: boolean;
    maxTries: number;
    waitBetweenTries: number;
  };
  inputItems: NodeItem[];
  multiInputItems?: Map<number, NodeItem[]>;  // para Merge (input port index → items)
  workflowInput: unknown;                     // input original do workflow
  nodeExecutions: NodeExecutionRecord[];      // histórico de nodes já executados
  credentials: Map<string, CredentialValue>;  // credenciais resolvidas pelo CredentialService
  workflowSettings: WorkflowSettings;
  triggerData?: {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
    rawBody: Buffer;
  };
  helpers: {
    http: HttpClient;
    crypto: CryptoHelper;
    date: DateHelpers;
    json: JsonHelpers;
    binary: BinaryDataResolver;
  };
  logger: Logger;
  queue: Queue;                 // BullMQ (para agendar jobs futuros / retry)
  executionRepository: ExecutionRepository;  // persiste estado, checkpoints
  eventBus: EventBus;
  workflowEngine: WorkflowEngine;  // para subworkflows e error workflows
  signal: AbortSignal;             // para cancelamento cooperativo
}

/** Interface que cada tipo de node implementa */
export interface NodeHandler<TParams = any> {
  readonly type: string;        // tipo AgentFlow (ex: "http")
  readonly originalType?: string; // tipo n8n (ex: "n8n-nodes-base.httpRequest")
  readonly category: "trigger" | "action" | "logic" | "transform" | "ai" | "communication" | "data" | "flowControl";
  validate?(config: Record<string, any>): ValidationResult;
  execute(context: NodeExecutionContext, params: TParams): Promise<NodeExecutionResult>;
  estimateDuration?(config: TPhyParams): number;
}

/** Resultado de validação de config de node */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Tipo de credencial resolvida */
export interface CredentialValue {
  id: string;
  name: string;
  type: string;
  provider: string;
  data: Record<string, unknown>;  // já descriptografado
}

/** Tipos auxiliares */
export type JsonObject = Record<string, unknown>;
export type BinaryDataRef = { id: string; mimeType: string; fileName?: string; dataSize?: number };
```

### 2.3 Mapeamento Prisma → definições TypeScript

O schema Prisma (lê-se em `packages/database/prisma/schema.prisma`) já possui a maior parte dos modelos. A tabela abaixo mapeia os campos Prisma relevantes para as definições acima:

| Modelo Prisma | Campo | Uso no engine |
|--------------|-------|--------------|
| `Workflow` | `id, name, status, nodes[], edges[]` | definição estática |
| `WorkflowVersion` | `snapshot (Json)` | snapshot imutável usado na execução |
| `WorkflowNode` | `id, type, config (Json), position (Json)` | node definition; `config.parameters`, `config.credentials`, `config.retryOnFail` etc. |
| `WorkflowEdge` | `sourceNodeId, targetNodeId, sourceHandle, targetHandle, label, condition` | conexões; `label` = input port index |
| `WorkflowExecution` | `id, status, trigger, input, output, error` | instância de execução |
| `NodeExecution` | `id, status, input, output, error, retryCount, idempotencyKey` | registro por node |
| `Credential` | `data (encrypted), type, provider` | resolvido pelo CredentialService |
| `Approval` | `status, message, context (Json)` | para human-in-the-loop |

> **Observação**: O Prisma schema usa `ExecutionStatus { PENDING, RUNNING, SUCCESS, FAILED, CANCELLED, WAITING_APPROVAL }`. A especificação v2 adiciona `PAUSED` e `ERROR` como estados internos do engine (não persistidos no Prisma, mas rastreados em memória + checkpoints). O status final persistido no `WorkflowExecution.status` é sempre um dos valores acima.

---

## 3. Validação de grafo (DAG)

### 3.1 Regras de validação (executadas antes de enfileirar)

O engine valida o grafo do workflow na fase de **ativação** (publish) e também na fase de **execução** (como defesa em profundidade). As regras são:

1. **É um DAG**: não contém ciclos. Detectado via Kahn's algorithm (topological sort). Se houver ciclo, a validação falha com erro específico.
2. **Nó único de trigger**: exatamente um nó de tipo `trigger`/`webhook`/`cron`/`manual` é o ponto de entrada. Se zero → erro "Workflow must have exactly one trigger". Se mais de um → os extras são ignorados ou erro (configurável via `settings`).
3. **Nós órfãos**: nós sem nenhuma aresta de entrada **e** sem saída (isolados) geram warning mas não falham (podem ser utilitários). Nós sem entrada e sem ser trigger geram erro.
4. **Referências válidas**: toda aresta referencia nodes que existem. Arestas para nodes inexistentes → erro.
5. **Handles válidos**: `sourceHandle`/`targetHandle` devem corresponder a saídas/entradas declaradas pelo tipo do node.
6. **Sem auto-loop**: aresta de um node para si mesmo → erro.
7. **Credenciais válidas**: referências de credenciais resolvem para credenciais da mesma org. Credencial inexistente → erro no load (não em tempo de execução).

### 3.2 Algoritmo de topological sort (Kahn)

```typescript
// Algoritmo usado pelo WorkflowExecutor
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  // 1. Build adjacency list + in-degree count
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>(); // source → [targets]

  for (const node of nodes) inDegree.set(node.id, 0);
  for (const edge of edges) {
    adj.set(edge.sourceNodeId, [...(adj.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  // 2. Kahn: enqueue all 0-in-degree (start from trigger)
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // 3. Process: output order is topological
  const result: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    result.push(current);
    for (const next of adj.get(current) ?? []) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  // 4. Cycle detection
  if (result.length !== nodes.length) {
    throw new CycleError("Workflow contains a cycle; topological sort incomplete");
  }

  // Return nodes in topological order (deterministic: stable by insertion order)
  return result.map(id => nodes.find(n => n.id === id)!);
}
```

### 3.3 Ordem de execução na prática

- **n8n `executionOrder: "v1"`** (legacy): executa nodes na ordem em que aparecem no array `nodes` do JSON, ignorando topological sort. O engine do AgentFlow **não reproduz** esse comportamento por padrão; em vez disso, sempre usa topological sort (`v2`). Se `settings.executionOrder === "v1"`, o engine **converte** para v2 ordenando pelo índice no array + topological, com warning.
- **n8n `executionOrder: "v2"`** (topological): idêntico ao algoritmo acima. AgentFlow adota este como padrão.

### 3.4 Exemplo: validação de um workflow IF → Merge

```
Nodes: [Webhook, IF, Set-A (true), Set-B (false), Merge, Output]
Edges: Webhook→IF, IF→Set-A (handle "0"), IF→Set-B (handle "1"), Set-A→Merge (handle "0"), Set-B→Merge (handle "1"), Merge→Output

In-degrees: Webhook=0, IF=1, Set-A=1, Set-B=1, Merge=2, Output=1
Topological order: Webhook → IF → Set-A → Set-B → Merge → Output  (ou Set-B antes de Set-A — ambos válidos)

Cycle check: 6 nodes, all processed → OK
```

**Invariante testável**: Dado um workflow DAG sem ciclos, `topologicalSort` sempre retorna todos os nodes e, para toda aresta `A→B`, `A` aparece antes de `B` na lista resultante.

---

## 4. Ciclo de vida da execução

### 4.1 Estados e transições (visão macro)

```
[API/webhook/cron]
    │
    ▼
  PENDING  ──(worker pega job)──► RUNNING
    │                                │
    │                          ┌─────┴─────┐
    │                          │           │
    │                   [todos nodes OK]  [node falha após retries]
    │                          │           │
    ▼                          ▼           ▼
 CANCELLED              SUCCESS      FAILED  ──(errorWorkflow?)──► RUNNING (error wf)
                                                      │
                                                      ▼
                                               [dead-letter queue]
```

### 4.2 Fluxo detalhado de execução

```
1. TRIGGER
   ┌─ Webhook: POST /webhook/:path → valida HMAC → cria WorkflowExecution(status=PENDING, trigger="webhook", input=requestBody)
   ├─ Cron: scheduler.worker detecta schedule → cria WorkflowExecution(status=PENDING, trigger="cron", input={})
   ├─ Manual: POST /workflows/:id/execute → cria WorkflowExecution(status=PENDING, trigger="manual", input=body)
   └─ API: POST /workflows/:id/execute (trigger="api")

2. ENQUEUE
   ┌─ bullmq.add("workflow:execution", {
   │   executionId, orgId, workflowId, trigger, input,
   │   priority: trigger === "webhook" ? 3 : trigger === "manual" ? 2 : 1,
   │   jobId: executionId,              // deduplica por executionId
   │   removeOnComplete: 100,
   │   removeOnFail: 500,
   │   attempts: workflowSettings.maxRetries ?? 1,
   │   backoff: { type: "exponential", delay: 1000 },
   │ })

3. WORKER (processo isolado)
   ┌─ worker.process("workflow:execution", async (job) => {
   │   const execution = await prisma.workflowExecution.findUnique({ where: { id: job.data.executionId } });
   │   if (execution.status === "SUCCESS" || execution.status === "FAILED") return; // idempotency
   │   await executor.runExecution(execution);
   │ })

4. EXECUTOR.runExecution(executionId)
   ├─ Carrega workflow + active version snapshot
   ├─ Valida DAG (ciclos, triggers, referências)  ← se falhar: status=FAILED
   ├─ Atualiza execution.status = RUNNING
   ├─ topoSort = topologicalSort(nodes, edges)
   ├─ Para cada node em topoSort:
   │   ├─ Verifica cancellation signal (abort)
   │   ├─ Persiste NodeExecution(status=RUNNING)  ← checkpoint
   │   ├─ Resolve input do node (ver seção 6)
   │   ├─ Resolve credenciais (CredentialService.decryptForExecution)
   │   ├─ Evalua expressões nos parâmetros
   │   ├─ nodeOutput = await withRetry(nodeHandler.execute(ctx, params), retryPolicy)
   │   │   └─ withTimeout(nodeOutput, nodeTimeoutMs)  ← timeout
   │   └─ Persiste NodeExecution(status=SUCCESS/FAILED, output, error, duration)
   ├─ Se algum node crítico falhar (continueOnFail=false):
   │   ├─ Se errorWorkflow configurado: dispara workflow de erro (async)
   │   ├─ Status = FAILED
   │   └─ move job para Dead Letter Queue
   ├─ Se todos OK:
   │   ├─ Status = SUCCESS
   │   └─ output = output do node "output" (ou último nó)
   └─ Persiste execution.status + finishedAt + duration
```

### 4.3 Lifecycle por node (máquina de estados individual)

```
PENDING ──► RUNNING ──(sucesso)──► SUCCESS
              │
              ├──(timeout)──► FAILED (retry se retryOnFail)
              ├──(error)──► FAILED (retry se retryOnFail)
              ├──(cancellation)──► CANCELLED
              └──(skip condicional)──► SKIPPED
```

### 4.4 Persistência de estado

| Evento | Persistido em | Motivo |
|--------|--------------|--------|
| Execution criada | `WorkflowExecution.status = PENDING` | Idempotência |
| Worker inicia | `WorkflowExecution.status = RUNNING, startedAt` | Observabilidade |
| Node inicia | `NodeExecution(status=RUNNING, input, startedAt)` | Checkpoint |
| Node sucesso | `NodeExecution(status=SUCCESS, output, finishedAt, duration)` | Reexecução parcial |
| Node falha | `NodeExecution(status=FAILED, error, retryCount)` | Retry / debug |
| Execution conclui | `WorkflowExecution.status=duration, finishedAt, output` | Resultado final |
| Cancelamento | `WorkflowExecution.stoppedAt` | Graceful shutdown |

**Invariante testável**: Após qualquer checkpoint, se o worker morrer, a retomada (resume) não re-executa nodes já marados como `SUCCESS` — verifica `NodeExecution.status` antes de executar.

---

## 5. Contexto de execução e expressões

### 5.1 Contexto $ (variáveis especiais disponíveis em expressões)

O engine disponibiliza um contexto de expressão compatível com n8n. As variáveis seguem o padrão `{{ $var.campo }}`:

| Variável | Origem | Exemplo |
|----------|--------|---------|
| `$json` | JSON do item atual | `{{ $json.name }}`, `{{ $json.user.email }}` |
| `$input` | Items de entrada do node | `{{ $input.all() }}`, `{{ $input.first() }}` |
| `$node` | Output de node anterior (por nome) | `{{ $node["HTTP Request"].json.status }}` |
| `$workflow` | Metadados do workflow | `{{ $workflow.id }}`, `{{ $workflow.name }}` |
| `$execution` | Metadados da execução | `{{ $execution.id }}`, `{{ $execution.mode }}` |
| `$now` | Timestamp atual | `{{ $now }}`, `{{ $now.format("YYYY-MM-DD") }}` |
| `$env` | Variáveis de ambiente | `{{ $env.HOST }}` |
| `$credentials` | Credencial resolvida | `{{ $credentials.apiKey }}` |
| `$parameter` | Parâmetros do node atual | `{{ $parameter.url }}` |
| `$item` | Item completo `{json, binary}` | `{{ $item.json }}`, `{{ $item.binary.data }}` |
| `$query` | Query params (webhook) | `{{ $query.source }}` |
| `$header` | Headers (webhook) | `{{ $header["x-webhook-signature"] }}` |

### 5.2 Expression Engine — linguagem suportada

O motor de expressões suporta dois modos:

1. **Substituição de referência**: `{{ $json.field }}` — resolve um caminho no contexto. Suporta notação ponto e colchetes.
2. **Expressão JS (sandbox)**: `{{= $json.status === "active" && $json.value > 100 }}` — avalia JavaScript dentro de sandbox isolate-vm.

**Operadores suportados**:

```text
Comparação: ==, !=, ===, !==, >, >=, <, <=
Lógicos:    &&, ||, !
Aritméticos: +, -, *, /, %, **
Ternário:   cond ? val1 : val2
Chaining:   $json.user?.name ?? "anon"
Member:     $json.items[0].name
Call:       $json.name.toUpperCase(), $json.tags.join(", ")
```

**Funções helper (built-in)**:

```typescript
// Disponíveis no contexto de expressão
$now          → Date (com métodos .format(), .toISO(), .plus(), .minus())
$today        → Date (início do dia)
$items         → acesso a todos os items do node (legacy)
$emptyString   → ""  (n8n-compat)
$ifEmpty(value, replacement) → coalesce
$jsonParse(str)  → JSON.parse
$jsonStringify(obj) → JSON.stringify
$encodeBase64(str), $decodeBase64(b64)
$coalesce(a, b, c) → primeiro não-nulo
```

### 5.3 Exemplos de expressões

```text
# Set node — valor fixo
{{ "processed" }}

# Set node — expressão JS
{{= $json.price * $json.quantity * 0.9 }}

# HTTP Request — URL com parâmetro do item
https://api.example.com/users/{{ $json.userId }}

# HTTP Request — header dinâmico
{{ $credentials.apiKey }}

# IF — condição string
{{ $json.status }} equal "active"

# IF — condição número
{{ $json.amount }} greaterThan 100

# IF — condição boolean (JS)
{{= $json.tags && $json.tags.length > 0 }}

# Switch — valor a comparar
{{ $json.category }}

# Webhook response data
{{ $json }}

# Cron — timezone
{{ $workflow.settings.timezone }}
```

### 5.4 Sandbox de expressões

- As expressões `{{= ... }}` são avaliadas via `isolated-vm` (mesmo sandbox do Code node, ver v2-security-spec §6).
- **Permitido**: acesso a `$json`, `$parameter`, `$now`, `$credentials`, `$workflow`, `$execution`, funções built-in.
- **Proibido**: `require`, `process`, `global`, `eval`, `Function`, acesso a `fetch` direto (deve usar `$helpers.request()`).
- Timeout: 5s por expressão complexa.

**Invariante testável**: Uma expressão `{{= $json.x === 42 }}` sempre avalia para `true` quando `$json.x = 42` e `false` caso contrário, independente de quantas vezes é executada (determinismo).

---

## 6. Fluxo de dados entre nodes

### 6.1 Modelo de item (n8n-compatível)

O engine trabalha com o conceito de **items** — unidades individuais de dado. Cada node recebe e produz arrays de items. Cada item tem a forma `{ json, binary }`.

```typescript
// Exemplo de item fluindo entre nodes
{
  json: {
    userId: 123,
    name: "João",
    status: "active",
    orders: [{ id: 1, total: 50 }, { id: 2, total: 30 }]
  },
  binary: {
    document: {
      id: "bin_abc123",
      mimeType: "application/pdf",
      fileName: "contrato.pdf",
      dataSize: 204857
    }
  },
  _webhook: { method: "POST", path: "/webhook/leads", headers: {...} }
}
```

### 6.2 Resolução de input entre nodes

O engine resolve o input de cada node baseado nas conexões (`WorkflowEdge`):

- **Conexão `main`**: output do node anterior se torna input do node seguinte.
- **Conexão com `sourceHandle` (IF/Switch/Router)**: apenas o branch cujo handle corresponde à condição avaliada é seguido. O node `IF` produz `outputRouting: { 0: [trueItems], 1: [falseItems] }`. O engine encaminha apenas o índice correspondente.
- **Múltiplas conexões de entrada (Merge)**: o node `Merge` recebe `multiInputItems = Map<number, NodeItem[]>` — um array por input port.
- **Fan-out**: uma saída conectada a múltiplos destinos — output é replicado para todos os destinos.
- **Fan-in**: múltiplas saídas convergindo no mesmo destino — o engine aguarda todos os predecessores (modo `wait` no Merge) antes de prosseguir.

### 6.3 Merge modes (compatível com n8n)

| Mode | Comportamento | Quando usar |
|------|--------------|-------------|
| `wait` + `combine: "all"` | Aguarda todas as entradas, combina em array | Reunir resultados de branches paralelas |
| `wait` + `combine: "first"` | Usa apenas a primeira entrada que chega | Early exit — qualquer branch basta |
| `wait` + `combine: "last"` | Usa a última entrada que chega | Último processo vence |
| `choose` | Seleciona entrada com base em regra | Router dinâmico |
| `multiplex` | Zip: item 0 de cada entrada combinado | Processamento paralelo de pares |

### 6.4 Exemplo: branch IF → Merge

```
Workflow: Webhook → IF → [Set-True] ─┐
                            ↓        │
                            Merge ←──┘
                   [Set-False] ───────┘
```

1. Webhook produz `[{ json: { value: 150 } }]`
2. IF avalia `{{ $json.value }} > 100` → true
3. IF produz `outputRouting: { 0: [{json:{value:150}}]}` (output 0 = true)
4. Engine segue aresta `IF→Set-True` (handle "0"); Set-False é **skipado** (status=SKIPPED)
5. Set-True produz `[{ json: { result: "high" } }]`
6. Merge recebe `multiInputItems = Map { 0 → [{result:"high"}], 1 → [] }`
7. Merge `wait`/`all` combina: `[{ json: { input_0: [{result:"high"}], input_1: [] } }]`

**Invariante testável**: Em um workflow com IF + Merge, se a condição for `true`, o node "Set-False" nunca é executado (status=SKIPPED) e seu output não chega ao Merge.

---

## 7. Loops e batches

### 7.1 Split In Batches (`n8n-nodes-base.splitInBatches`)

Divide um array de items em lotes de tamanho `batchSize`. O engine executa o resto do workflow uma vez por lote, mantendo estado entre iterações.

**Parâmetros**: `batchSize` (int, positivo), `options.reset` (boolean, default false).

**Mecânica de loop**:
1. O node `SplitInBatches` recebe todos os items de entrada.
2. Calcula `totalBatches = ceil(items.length / batchSize)`.
3. Na primeira execução: produz `batchSize` items + `executionState: { currentBatch: 1, totalBatches, isComplete: false }`.
4. O engine detecta `executionState.isComplete = false` e reexecuta o **mesmo node** com `executionState` atualizado.
5. Na última iteração: `isComplete: true` → engine avança para próximo node.

```typescript
// Exemplo: 250 items, batchSize=50
// Iteração 1: items[0..49],   batch=1/5, isComplete=false
// Iteração 2: items[50..99],  batch=2/5, isComplete=false
// Iteração 3: items[100..149], batch=3/5, isComplete=false
// Iteração 4: items[150..199], batch=4/5, isComplete=false
// Iteração 5: items[200..249], batch=5/5, isComplete=true → avança
```

**Persistência do estado de loop**: `executionState` é salvo em `NodeExecution.executionState` (JSON). Em caso de crash, a retomada carrega o estado e continua do batch correto.

### 7.2 Loop Over Items

No n8n, "Loop Over Items" não existe como node built-in — é um padrão onde um node `Function` ou `Code` itera sobre items manualmente. No AgentFlow, isso é tratado pelo próprio node (via expressões ou código). **Não há um node Loop dedicado no escopo atual.**

### 7.3 Loop Until / Loop com condição

Não há um node `Loop Until` built-in no n8n. Se necessário, implementa-se como node `Code` com `while` + `break` dentro do sandbox, ou como um subworkflow que se chama recursivamente. O engine **não suporta loop infinito sem breakpoint** — todo loop deve ter limite explícito (`maxIterations`, padrão: 1000).

### 7.4 Limites e proteções

| Proteção | Valor padrão | Onde configurável |
|----------|-------------|-------------------|
| Max batches (SplitInBatches) | 10.000 | `settings.maxBatches` |
| Max items por batch | 1.000 | `settings.maxBatchSize` |
| Max loops totais (Code node) | 1.000.000 | env `MAX_CODE_LOOP_ITERATIONS` |
| Timeout total do loop | `executionTimeout` | workflow settings |

**Invariante testável**: SplitInBatches com 250 items e batchSize=50 sempre produz exatamente 5 iterações, e na 5ª o `isComplete=true`.

---

## 8. Subworkflows

### 8.1 Conceito

Um subworkflow é um workflow que é **chamado** por outro workflow via node "Execute Workflow" (`n8n-nodes-base.executeWorkflow`). O engine trata isso como uma **execução aninhada**: o subworkflow roda como `WorkflowExecution` filho, com seu próprio DAG, e seu output é injetado como input do node que o chamou.

### 8.2 Mapeamento n8n → AgentFlow

| Campo n8n | AgentFlow |
|-----------|-----------|
| `n8n-nodes-base.executeWorkflow` | node type `executeWorkflow` |
| `parameters.workflowId` | `config.parameters.workflowId` (ou nome resolvido) |
| `parameters.mode` | `config.parameters.runMode` (`runOnceForChildren`, `each`) |
| `parameters.options.callerPolicy` | `config.parameters.callerPolicy` |

### 8.3 Mecânica de execução

```
Workflow Pai (exec-123)
  ├─ Node: "Call Sub WF" (executeWorkflow)
  │    ├─ Engine cria WorkflowExecution filha (status=PENDING)
  │    ├─ Enfileira job "workflow:execution" com parentJobId=exec-123
  │    └─ Worker de subworkflow roda (processo/worker dedicado)
  │         ├─ Carrega subworkflow
  │         ├─ Executa DAG
  │         └─ Persiste output → NodeExecution.output do pai
  └─ Engine avança no pai com output = output do subworkflow
```

### 8.4 Isolamento

- **Processo**: subworkflows podem rodar no mesmo worker ou em worker dedicado (configurável).
- **Dados**: subworkflow não compartilha `nodeExecutions` do pai. Cada um tem seu próprio escopo.
- **Credenciais**: subworkflow resolve suas próprias credenciais (mesma org).
- **Timeout**: subworkflow herda `executionTimeout` do pai, mas pode ter seu próprio. Timeout do subworkflow ≤ timeout restante do pai.

### 8.5 Propagação de dados

O input do subworkflow vem do output do node `executeWorkflow`:
- **Modo `runOnceForEach`**: cada item de entrada gera uma execução separada do subworkflow; outputs são agregados.
- **Modo `runOnceForAll`**: todos os items são passados de uma vez; output é um único item.

### 8.6 Timeout de subworkflow

```typescript
// O engine calcula o timeout restante do pai
const parentRemaining = parentStartedAt + parentTimeoutMs - Date.now();
const childTimeout = Math.min(subworkflow.timeout ?? parentRemaining, parentRemaining);
```

Se o subworkflow exceder `childTimeout` → `FAILED` com erro "Subworkflow timeout exceeded".

**Invariante testável**: Um subworkflow que falha não deixa o workflow pai em estado inconsistente — o node `executeWorkflow` recebe `status: FAILED` e o pai segue seu fluxo de erro normal.

---

## 9. Dados binários

### 9.1 Modelo de dados binário

```typescript
// Representação interna (nunca exposta ao usuário)
interface BinaryDataRef {
  id: string;           // chave no storage (ex: "bin_a1b2c3_d4e5f6")
  mimeType: string;     // "image/png", "application/pdf", etc.
  fileName?: string;    // nome original do arquivo
  dataSize?: number;    // tamanho em bytes
  createdAt?: Date;
}
```

### 9.2 Storage backend

O engine abstrai o storage binário através do `BinaryDataManager`:

| Backend | Configuração | Uso |
|---------|-------------|-----|
| **Database (PostgreSQL BYTEA)** | `BINARY_STORAGE=database` (default dev) | Pequenos arquivos (< 1 MB); simples, transacional |
| **S3 / MinIO** | `BINARY_STORAGE=s3`, `S3_BUCKET`, `S3_ENDPOINT` | Produção; streaming, versionamento, lifecycle |
| **Filesystem local** | `BINARY_STORAGE=filesystem`, `BINARY_STORAGE_PATH` | Dev/local; não para produção multi-instance |
| **Memory (ephemeral)** | `BINARY_STORAGE=memory` | Testes unitários; limpa no restart |

### 9.3 Tipos de dados binários (compatível n8n)

| Tipo n8n | Representação AgentFlow | Tamanho máximo |
|----------|------------------------|----------------|
| `data` (base64 string) | `BinaryDataRef` (decoded no storage) | 10 MB default |
| URL | Fetch no storage, armazena como `BinaryDataRef` | 10 MB |
| Arquivo upload | Stream direto para storage | 50 MB (limite HTTP) |
| HTTP Response body (binário) | Stream do `http` helper | 10 MB |

### 9.4 Streaming

- Para downloads grandes (> 1 MB), o `http` helper usa streaming direto para o storage binário (não carrega em memória).
- O `BinaryDataManager` expõe `writeStream()` e `readStream()` (Node.js `Readable`/`Writable`).
- Limite de resposta HTTP: 10 MB (configurável via `MAX_HTTP_RESPONSE_BYTES`).

### 9.5 Acesso de nodes a dados binários

```typescript
// No NodeExecutionContext
interface BinaryDataResolver {
  get(id: string): Promise<{ stream: Readable; mimeType: string; fileName?: string }>;
  save(mimeType: string, fileName?: string, data?: Buffer): Promise<BinaryDataRef>;
  delete(id: string): Promise<void>;
  metadata(id: string): Promise<BinaryDataRef>;
}
```

### 9.6 Segurança

- Dados binários são associados a `orgId` — query sempre scoped.
- IDs de binário são UUIDs (não previsíveis) — evita enumeration.
- Streaming de saída para HTTP node: conteúdo não é logado, apenas metadados.

**Invariante testável**: Dados binários de um tenant A nunca são acessíveis por um node de um workflow do tenant B — todas as queries de storage incluem `orgId`.

---

## 10. Máquina de estados

### 10.1 Estados da execução (WorkflowExecution)

```text
┌─────────────────────────────────────────────────────────────────┐
│                     WORKFLOW EXECUTION FSM                      │
│                                                                 │
│  ┌────────┐     ┌────────┐     ┌────────┐     ┌─────────┐      │
│  │PENDING │────▶│ RUNNING│     │PAUSED  │     │CANCELLED│      │
│  └────────┘     └────────┘     └────────┘     └─────────┘      │
│      │            │            │  ▲            (terminal)       │
│      │ enqueue    │ worker    │  └── resume / approve           │
│      ▼            │ takes    ▼  │                              │
│  ┌────────┐    ┌──────────┐  ┌────────────┐                     │
│  │PENDING │    │ RUNNING  │  │ PAUSED     │                     │
│  └────────┘    │  ┌───────┴──▶  (wait)   │                     │
│                │  │                    │                     │
│                │  │      ┌─────────────┴───┐   ┌───────────┐  │
│                │  │      │ SUCCESS         │   │ FAILED    │  │
│                │  │      └─────────────────┘   └───────────┘  │
│                │  │           (terminal)        (terminal)     │
│                │  │                                    ▲        │
│                │  │                                    │        │
│                │  │      ┌─────────────┐               │        │
│                │  └─────▶│ ERROR       │◀── bug/crash  │        │
│                │         │ (terminal)  │                │        │
│                │         └───────────┘                │        │
│                │                                        │        │
│                │      errorWorkflow ────────┐         │        │
│                │                           │         │        │
│                │                           ▼         │        │
│                │                    ┌────────────┐   │        │
│                │                    │ FAILED     │───┘        │
│                │                    └────────────┘            │
│                │                       (terminal)             │
│                └──────────────────────────────────────────────│
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 10.2 Transições válidas

| De | Para | Gatilho | Persistido? |
|----|------|---------|-------------|
| (nenhum) | PENDING | Trigger dispara | Sim |
| PENDING | RUNNING | Worker pega job | Sim |
| RUNNING | SUCCESS | Todos nodes OK | Sim |
| RUNNING | FAILED | Node falha crítico | Sim |
| RUNNING | PAUSED | Wait node (modo webhook) / Approval | Sim (pausedAt) |
| RUNNING | CANCELLED | API cancelamento / sinal abort | Sim (stoppedAt) |
| RUNNING | ERROR | Bug do engine / crash não tratado | Sim |
| PAUSED | RUNNING | Resume via webhook/approval | Sim |
| PAUSED | CANCELLED | Cancelado enquanto pausado | Sim |
| FAILED | (errorWorkflow) | errorWorkflow configurado | Async (nova exec) |
| CANCELLED | (none) | Terminal | — |

### 10.3 Estado por node (NodeExecution)

```text
                ┌─────────┐
                │ PENDING │
                └────┬────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   ┌──────────┐           ┌─────────┐
   │ RUNNING  │           │ SKIPPED │  (branch não tomada no IF/Switch)
   └────┬─────┘           └─────────┘
        │
   ┌────┴────┐
   │ SUCCESS │ (ou FAILED → retry loop)
   └─────────┘
```

### 10.4 Estado de aprovação (Approval)

```text
┌────────┐   approve/reject   ┌────────┐
│ PENDING│ ─────────────────▶ │APPROVED│
└────────┘                    └────────┘
     │                               │
     │ reject                        │
     ▼                               │
┌─────────┐                          │
│REJECTED │                          │
└─────────┘                          │
     │                               │ resume execution
     ▼                               ▼
┌──────────┐   timeout         ┌──────────┐
│ EXPIRED  │ ────────────────▶ │ RUNNING  │
└──────────┘                   └──────────┘
```

**Invariante testável**: A FSM nunca permite transição inválida (ex: `SUCCESS → RUNNING`). A máquina rejeita `UPDATE status='SUCCESS' WHERE id=...` se o status atual não for `RUNNING`.

---

## 11. Wait, resume e aprovações

### 11.1 Wait node (`n8n-nodes-base.wait`)

O node `Wait` pausa a execução por um intervalo de tempo ou até receber um evento externo (webhook).

**Parâmetros**:
- `amount` (number, positivo): quantidade
- `unit` (`seconds` | `minutes` | `hours` | `days` | `weeks`)
- `options.resumeOn` (`time` | `webhook`, default: `time`)
- `options.webhookUrl` (string URL, obrigatório se `resumeOn=webhook`)

### 11.2 Mecanismo de pausa (modo `time`)

No modo `time`, o engine **não** faz `setTimeout` no worker (isso bloquearía o processo). Em vez disso:

1. O node `Wait` calcula `resumeAt = now + duration`.
2. Persiste `NodeExecution` com `status: SKIPPED` (placeholder) e `executionState: { waitUntil: resumeAt }`.
3. Persiste `WorkflowExecution.status = PAUSED, pausedAt = now, resumeToken = uuid`.
4. **Desiste do job** (bullmq job completa com sucesso, mas marca a execução como PAUSED).
5. Um **scheduler** (cron worker) verifica periodicamente (`WorkflowExecution.status=PAUSED AND resumeAt <= now`) e **re-enfileira** o job.
6. Worker retoma: carrega `NodeExecution` existente, skipa o Wait, continua no próximo node.

### 11.3 Mecanismo de pausa (modo `webhook`)

No modo `webhook`, o engine pausa e aguarda um callback HTTP externo:

1. Gera `resumeToken = uuid()`.
2. Persiste `WorkflowExecution.status = PAUSED, resumeToken`.
3. Persiste `NodeExecution` com `executionState: { waitingFor: "resume", resumeToken }`.
4. O node `Webhook Response` (se conectado) responde ao chamador original com 202 + `{ executionId, resumeToken }`.
5. Externo chama `POST /executions/:id/resume?token=:resumeToken` com dados de retomada.
6. Engine valida o token, atualiza status para `RUNNING`, re-enfileira.

```text
# Endpoint de resume
POST /api/v1/executions/:executionId/resume
Authorization: Bearer <webhook-secret or internal token>
Query: token=<resumeToken>
Body: { json: {...} }  # dados de retomada (opcional)

Response: 200 { status: "resumed", executionId }
```

### 11.4 Approvals (human-in-the-loop)

O node `Approval` pausa a execução e cria um record de aprovação:

```typescript
interface Approval {
  id: string;
  executionId: string;
  userId: string;      // destinatário
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  message?: string;    // mensagem do node
  context: JsonObject; // dados do item no momento da pausa
  createdAt: Date;
  decidedAt?: Date;
  expiresAt: Date;     // TTL (default: 7 dias)
}
```

1. Node `Approval` cria `Approval` record + persiste `WorkflowExecution.status = WAITING_APPROVAL, pausedAt`.
2. UI mostra aprovação na lista de "Aprovações pendentes".
3. Usuário aprova/rejeita via `POST /approvals/:id/approve` ou `/reject`.
4. Engine retoma execução com base na decisão:
   - APROVADO → contina no próximo node
   - REJEITADO → execution falha com "Approval rejected"

**Timeout de approval**: se não decidido em `expiresAt`, scheduler marca como `EXPIRED` e falha a execução.

**Invariante testável**: Após `POST /executions/:id/resume` com token válido, a execução transita de `PAUSED` para `RUNNING` e o próximo node é executado. Token inválido → 403.

---

## 12. Checkpoints e retomada

### 12.1 Quando checkpointar

O engine checkpointa em **dois níveis**:

| Nível | Quando | Onde persiste | Custo |
|-------|--------|--------------|-------|
| **Node-level** | Após cada node concluído (SUCCESS) | `NodeExecution` com `status=SUCCESS, output` | 1 DB write ~1ms |
| **Workflow-level** | Após cada node (status do WF atualizado) | `WorkflowExecution` (status, progress) | 1 DB write ~1ms |

**Política de checkpoint** (configurável via `settings.saveExecutionProgress`):
- `true` (default n8n): checkpointa após **cada** node — permite retomar de qualquer ponto.
- `false`: checkpointa apenas no início e fim — menor overhead, mas reexecuta tudo em caso de crash.

### 12.2 Mecânica de checkpoint

```typescript
// Dentro do loop de execução de nodes
async function executeNodeWithCheckpoint(node, executionId) {
  const nodeExec = await prisma.nodeExecution.create({
    data: {
      nodeId: node.id,
      executionId,
      status: "RUNNING",
      input: nodeInput,
      startedAt: new Date(),
      checkpointed: false,
    }
  });

  try {
    const output = await withRetryAndTimeout(() => handler.execute(ctx, params), {
      maxTries: node.config.maxTries ?? 3,
      timeoutMs: node.config.timeout ?? NODE_TIMEOUT_MS,
    });

    await prisma.nodeExecution.update({
      where: { id: nodeExec.id },
      data: {
        status: "SUCCESS",
        output,
        finishedAt: new Date(),
        duration: Date.now() - startedAt,
        checkpointed: true,  // ← checkpoint efetivo
      }
    });
    // Salva output no cache de nodeOutputs para próximos nodes
    nodeOutputs.set(node.id, output);
  } catch (err) {
    await prisma.nodeExecution.update({
      where: { id: nodeExec.id },
      data: { status: "FAILED", error: err.message, finishedAt: new Date() }
    });
    throw err;
  }
}
```

### 12.3 Retomão após crash

Em caso de crash do worker:

1. O job do bullmq é re-enfileirado (bullmq garante entrega pelo menos uma vez).
2. Worker retoma: carrega `WorkflowExecution` + todos `NodeExecution` da execução.
3. **Pula** nodes já `SUCCESS` (usa `nodeOutputs` do DB).
4. **Reexecuta** nodes `FAILED` (se dentro do retry budget) ou `RUNNING` (se crash no meio).
5. **SKIPPED** nodes (branch não tomada) são reavaliados com base no fluxo atual.

```typescript
// Pseudo-código de retomão
async function resumeExecution(execution) {
  const completed = new Set(
    execution.nodeExecutions.filter(n => n.status === "SUCCESS").map(n => n.nodeId)
  );
  const nodeOutputs = new Map(
    execution.nodeExecutions.filter(n => n.status === "SUCCESS")
      .map(n => [n.nodeId, n.output])
  );

  for (const node of topoSort) {
    if (completed.has(node.id)) continue;  // skip checkpointed
    // ... reexecuta
  }
}
```

### 12.4 Custo de checkpoint

| Operação | Latência típica | Overhead |
|----------|----------------|----------|
| 1 DB write (NodeExecution) | ~0.5-2ms | ~1-5% do tempo total |
| 1 DB write (WorkflowExecution update) | ~0.3-1ms | ~0.5-2% |
| Checkpoint completo (node + workflow) | ~1-3ms | ~2-7% |

**Trade-off**: checkpointar após cada node adiciona ~2-7% de overhead, mas permite retomar de qualquer ponto. Para workflows com nodes rápidos (ms), o overhead pode ser significativo — recomenda-se `saveExecutionProgress: false` para workflows de alta frequência.

**Invariante testável**: Após crash e retomão, workflow com 5 nodes já concluídos retoma no node 6 — os 5 primeiros não são reexecutados, e o output final é idêntico à execução original (idempotência).

---

## 13. Retry e timeouts

### 13.1 Configuração de retry

Retry é configurável em **três níveis** (prioridade: node > workflow > default):

| Nível | Campo n8n | Campo AgentFlow | Default |
|-------|-----------|-----------------|---------|
| **Node** | `retryOnFail`, `maxTries`, `waitBetweenTries` | `config.retryOnFail`, `config.maxTries`, `config.waitBetweenTries` | 0 retries |
| **Workflow** | `settings.execution.maxTries` | `settings.maxRetries` | 1 (job-level) |
| **Global/env** | — | `MAX_RETRIES` env | 3 |

### 13.2 Backoff

- **Linear**: `delay = waitBetweenTries * attempt`
- **Exponencial**: `delay = waitBetweenTries * 2^(attempt-1)` (n8n padrão)
- **Jitter**: adicionado para evitar thundering herd (random ±10%)

```typescript
function calculateBackoff(attempt: number, baseDelay: number, strategy: "linear" | "exponential"): number {
  const base = strategy === "exponential"
    ? baseDelay * Math.pow(2, attempt - 1)
    : baseDelay * attempt;
  const jitter = base * 0.1 * (Math.random() * 2 - 1);  // ±10%
  return Math.min(base + jitter, 60_000);  // cap 60s
}
```

### 13.3 Retry por tipo de erro

O retry só é disparado para erros **recuperáveis**:

| Tipo de erro | Retry? | Motivo |
|--------------|--------|--------|
| Network timeout (HTTP 5xx, ECONNRESET) | ✅ | Pode ser transitório |
| Network 4xx (404, 401, 403) | ❌ | Erro de configuração — retry não ajuda |
| Credencial expirada (OAuth2) | ✅ (especial) | Tenta refresh token antes de retry |
| Erro de expressão (syntax) | ❌ | Sempre falha igual |
| Erro de execução de Code node (exceção JS) | ❌ (por padrão) | Determinístico — mas `retryOnFail=true` pode habilitar |
| Timeout de node | ✅ | Pode ser load transitório |
| ValidationError (config do node) | ❌ | Erro de workflow, não de execução |

### 13.4 Timeouts

| Tipo | Configuração | Default | Comportamento no timeout |
|------|-------------|---------|--------------------------|
| **Node** | `config.timeout` ou `NODE_TIMEOUT_MS` | 30s | Node marca FAILED, retry (se configurado) |
| **Workflow** | `settings.executionTimeout` | 3600s (1h) | Workflow marca FAILED, nodes em andamento são abortados |
| **Job (BullMQ)** | `jobTimeout` no worker | 5min | Job rejeitado, re-enfileirado |
| **HTTP Request** | `options.timeout` | 30s (por nó) | HTTP node falha, retry se configurado |
| **Code node** | `options.timeout` | 30s | Sandbox abort, node FAILED |
| **Subworkflow** | Herda do pai | pai - elapsed | Subworkflow FAILED, pai recebe erro |

### 13.5 Exemplo: retry com backoff exponencial

```text
Node: HTTP Request (maxTries=3, waitBetweenTries=1000, retryOnFail=true)

Attempt 1: FAILED (503 Service Unavailable)
  → wait 1000ms * 2^0 = 1000ms
Attempt 2: FAILED (503)
  → wait 1000ms * 2^1 = 2000ms
Attempt 3: FAILED (503)
  → retry budget esgotado → NodeExecution.status=FAILED → workflow FAILED
```

**Invariante testável**: Um node com `retryOnFail=true` e `maxTries=3` executa exatamente 3 vezes em caso de falha transitória, com delays exponenciais entre tentativas. Após 3 falhas, o node marca FAILED e o workflow pai falha.

---

## 14. Cancelamento

### 14.1 Gatilhos de cancelamento

| Origem | Endpoint | Descrição |
|--------|----------|-----------|
| API usuario | `POST /executions/:id/cancel` | Cancelamento manual |
| Timeout workflow | Interno | Workflow excedeu `executionTimeout` |
| Webhook duplicado | Interno | Evento idempotent — nova execução cancela a anterior |
| Deletar workflow | Interno | Workflow deletado durante execução |
| Shutdown do worker | Interno | Processo/Node.js está parando |

### 14.2 Mecanismo de cancelamento

O engine usa **AbortSignal** para cancelamento cooperativo:

```typescript
// No início da execução
const controller = new AbortController();
execution.cancelSignal = controller.signal;

// Verificação em cada node
if (controller.signal.aborted) {
  await prisma.nodeExecution.update({ where: { id: nodeExec.id }, data: { status: "CANCELLED" } });
  continue; // skip remaining nodes
}

// Node async (HTTP, AI) passa signal para fetch:
fetch(url, { signal: controller.signal });
```

### 14.3 Cancelamento de nodes em execução

| Tipo de node | Como cancela |
|--------------|-------------|
| **HTTP Request** | `AbortController.abort()` → `fetch` rejeita com `AbortError` |
| **Code node** | Timeout da sandbox (isolate-vm) é abortado; processo kill se necessário |
| **AI/LLM** | Stream SSE é interrompido; request `fetch` abortado |
| **Wait (time)** | Job bullmq é removido da queue; scheduler não re-enfileira |
| **Subworkflow** | `controller.abort()` propagado para execução filha |

### 14.4 Persistência do cancelamento

```typescript
// Ao receber cancelamento
await prisma.workflowExecution.update({
  where: { id: executionId },
  data: {
    status: "CANCELLED",
    stoppedAt: new Date(),
    finishedAt: new Date(),
    duration: Date.now() - execution.startedAt,
  }
});

// Marca todos nodes RUNNING como CANCELLED
await prisma.nodeExecution.updateMany({
  where: { executionId, status: "RUNNING" },
  data: { status: "CANCELLED", finishedAt: new Date() },
});
```

### 14.5 Cleanup de recursos

Após cancelamento:
- Streams de HTTP são fechados.
- Sandbox do Code node é destruído.
- Conexões de banco de dados (nodes DB) são fechadas.
- Jobs filhos (subworkflows) são cancelados via `job.removeChildValues` ou `job.removeChildren()`.

**Invariante testável**: Após `POST /executions/:id/cancel`, a execução transita para `CANCELLED` em ≤ 2 segundos, todos os nodes `RUNNING` tornam-se `CANCELLED`, e nenhum node novo é iniciado.

---

## 15. Idempotência e deduplicação

### 15.1 Deduplicação de webhooks

Webhooks podem ser reenviados (retry do provedor, redelivery). O engine deduplica:

1. **Idempotency key**: gerada a partir do payload + webhook path:
   ```typescript
   const idempotencyKey = crypto
     .createHash("sha256")
     .update(`${webhook.path}:${JSON.stringify(body)}:${headers["x-signature"] ?? ""}`)
     .digest("hex");
   ```
2. Verifica se `WorkflowExecution` com mesma key já existe (índice único).
3. Se existe → retorna execução anterior (200 OK com mesmo `executionId`).

### 15.2 Idempotency key por node

Cada `NodeExecution` tem `idempotencyKey` (único por DB). Um node retry usa a mesma key — reexecuta apenas o que é necessário.

### 15.3 Deduplicação de jobs BullMQ

- `jobId: executionId` — BullMQ rejeita jobs duplicados com mesmo ID.
- Para retries: `attempts` + `backoff` configurados no job.

### 15.4 Eventos idempotentes (webhook retry)

| Evento | Idempotency Strategy |
|--------|---------------------|
| Webhook POST (retry do provedor) | Hash do body + signature |
| Cron schedule (execução duplicada) | Deduplication por `workflowId + cron expression + timestamp` |
| Manual execute (CLI) | Sempre nova execução (intencional) |
| Subworkflow chamado | `parentExecutionId + subworkflowId` como key |

### 15.5 Dead Letter Queue (DLQ)

Após esgotar todos os retries do job BullMQ:

1. Job é movido para queue `workflow:dlq`.
2. `WorkflowExecution.status = FAILED` com `error` populado.
3. Evento `execution.failed` é emitido no EventBus.
4. Se `errorWorkflow` configurado → dispara workflow de erro (ver seção 16.4).
5. Alertas enviados (email/slack) se `settings.alertOnFailure=true`.

**Invariante testável**: Reenviar o mesmo webhook 3x produz apenas 1 WorkflowExecution. O `executionId` da primeira chamada é retornado em todas as subsequentes.

---

## 16. Tratamento de erros

### 16.1 Tipos de erro

| Tipo | Origem | Recuperável? | Exemplo |
|------|--------|-------------|---------|
| **Node error** | Handler lança exceção | Condicional (retryOnFail) | HTTP 500, credencial expirada |
| **Expression error** | Motor de expressão falha | ❌ (sempre falha) | `{{ $json.invalid.path }}` |
| **Config error** | Schema de node inválido | ❌ (deploy-time) | Parâmetro obrigatório faltando |
| **Timeout** | Limite excedido | ✅ (retryOnFail) | HTTP node demorou > 30s |
| **Cancel error** | Cancelamento | ❌ | `AbortError` |
| **Engine error** | Bug do engine | ❌ | Crash do worker, OOM |
| **Credential error** | Falha de decrypt | ❌ (até refresh) | Chave mestra incorreta |

### 16.2 continueOnFail (por node)

Quando `continueOnFail=true` no node:

```text
1. Node falha (ex: HTTP 404)
2. Engine NÃO falha o workflow
3. Node produz item com { json: { error: "...", statusCode: 404 }, error: "HTTP 404" }
4. Próximo node recebe o item com campo `error` — pode tratar via expressão:
   {{ $json.error ? "skip" : $json.data }}
5. Workflow continua normalmente
```

### 16.3 Try/Catch no grafo (Error Trigger)

O node `Error Trigger` (`n8n-nodes-base.errorTrigger`) é um **trigger reativo** — ele monitora falhas em workflows especificados:

```typescript
// Workflow de erro configurado via settings.errorWorkflow
interface ErrorTriggerContext {
  error: {
    message: string;
    stack?: string;
    nodeId?: string;
    retryCount?: number;
    timestamp: Date;
  };
  workflow: { id: string; name: string };
  execution: { id: string; mode: string; startedAt: Date };
  input: unknown;  // o input que causou a falha
}
```

1. Quando um workflow falha (todos retries esgotados) e `settings.errorWorkflow` está configurado:
2. Engine cria uma **nova execução** do workflow de erro com `input = ErrorTriggerContext`.
3. A execução de erro roda assíncrona (priority baixa).
4. O workflow de erro recebe `{{ $json.error.message }}`, pode notificar Slack, gravar no DB, etc.

### 16.4 Error workflow (n8n `settings.errorWorkflow`)

Configurável no workflow settings. O engine valida:

1. O workflow referenciado existe e está `ACTIVE`.
2. Pertence à mesma org.
3. Não é o mesmo workflow (evita loop infinito).

### 16.5 Mensagens de erro amigáveis

O engine traduz erros técnicos para mensagens amigáveis para a UI:

| Técnico | Amigável |
|--------|----------|
| `HTTP 503: Service Unavailable` | "Serviço externo temporariamente indisponível. Tentativa {n} de {max}." |
| `AbortError: The operation was aborted` | "Execução cancelada pelo usuário." |
| `Connection refused` | "Não foi possível conectar ao serviço. Verifique a URL e tente novamente." |
| `Invalid JSON in workflow definition` | "O workflow contém configuração inválida. Verifique os parâmetros do node." |
| `Credential not found` | "Credencial configurada não encontrada. Verifique se foi compartilhada com sua equia." |

**Invariante testável**: Um node com `continueOnFail=false` que falha 3x (maxTries) causa o workflow a ficar com `status=FAILED` e `error` populado. Se `errorWorkflow` configurado, uma nova execução do workflow de erro é criada com os detalhes do erro.

---

## 17. Execução distribuída

### 17.1 Arquitetura worker

```
┌─────────────┐    enqueue    ┌──────────────┐
│ API Layer   │ ────────────▶ │ BullMQ Queue │ (Redis)
│ (Fastify)   │               │              │
└─────────────┘               └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │   Worker 1   │ │   Worker 2   │ │   Worker N   │
            │ (execution)  │ │ (execution)  │ │ (execution)  │
            └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                   │                │                │
                   ▼                ▼                ▼
            ┌──────────────────────────────────────────────┐
            │     Prisma PostgreSQL (shared state)        │
            │  - WorkflowExecution, NodeExecution           │
            │  - Credential (read during decrypt)           │
            └──────────────────────────────────────────────┘
```

### 17.2 Parent/child jobs (DAG dentro de um workflow)

Usando BullMQ parent/child jobs para paralelismo dentro de um workflow:

```typescript
// Quando IF diverge em 2 branches paralelas:
const parentJob = await queue.add("execute-node", { executionId, nodeId, input }, { jobId: `${executionId}:${nodeId}` });

// Cada branch é um child job:
await Promise.all([
  parentJob.addChildJob("execute-node", { executionId, nodeId: "set-true", input }),
  parentJob.addChildJob("execute-node", { executionId, nodeId: "set-false", input }),
]);

// Merge espera ambos:
await Promise.all(childJobs.map(j => j.finished()));
```

### 17.3 Prioridades

BullMQ suporta priority queues. O engine usa:

| Trigger | Priority | Motivo |
|---------|----------|--------|
| Webhook | 3 (highest) | Real-time, user esperando resposta |
| Manual | 2 | Usuário clicou "Execute" |
| Cron | 1 (lowest) | Background, tolera latência |
| Error workflow | 0 | Depuração, não urgente |

### 17.4 Isolamento entre tenants

| Recurso | Estratégia de isolamento |
|---------|--------------------------|
| **Worker process** | Cada job carrega `orgId` — queries Prisma sempre scoped. Nenhum tenant vê dados do outro. |
| **Redis** | Keys prefixadas por org: `bull:${orgId}:workflow:execution` |
| **HTTP egress** | Guard de IPs privados + allowlist por org (ver v2-security-spec §8) |
| **Code node sandbox** | isolate-vm com zero acesso a `require`, `process`, `fs`, `net`. Cada execução tem sandbox novo. |
| **Memory** | Worker isola memória entre jobs (process per job ou memory limit via isolate-vm) |

### 17.5 Concurrency

| Nível | Configuração | Default |
|-------|-------------|---------|
| Worker process | `concurrency` no `new Worker()` | 10 jobs simultâneos |
| Node dentro de workflow | `settings.concurrency.maxParallelNodes` | 1 (sequencial) — paralelismo só para branches IF/Switch explícitas |
| HTTP requests | `options.maxConcurrent` (pool) | 5 por worker |
| BullMQ | `limiter` (rate limiting) | 100 jobs/s por worker |

### 17.6 Leader election (cron scheduler)

```typescript
// Apenas 1 scheduler ativo em cluster
const lock = await redis.set(`scheduler:lock:${workflowId}`, processId, {
  NX: true,  // only set if not exists
  PX: 30_000, // 30s TTL — auto-refresh via keep-alive
});
if (!lock) return; // other instance is leader
```

**Invariante testável**: Em cluster com 3 workers, apenas 1 scheduler executa cron jobs para um workflow. Em caso de crash do líder, outro assuming a liderança dentro de 30s.

---

## 18. Performance

### 18.1 Escalar para 10k+ items

| Técnica | Descrição | Implementação |
|---------|-----------|---------------|
| **Streaming entre nodes** | Items fluem como generator/stream, não array completo em memória | `AsyncIterable<NodeItem>` em vez de `NodeItem[]` |
| **Batch DB writes** | NodeExecutions persistidos em batch (100 nodes por write) | `prisma.$transaction` com `createMany` |
| **Checkpoint lazy** | Checkpointa a cada N nodes (não a cada 1) | Config: `checkpointInterval: 50` |
| **Memory GC** | Items são descartados após consumo pelo próximo node | `nodeOutputs` é `WeakMap` ou limpa após uso |
| **Pool de conexões HTTP** | Reutiliza TCP connections para HTTP nodes | `undici`/`http.Agent` com keepAlive |

### 18.2 Métricas de performance

| Métrica | Target | Como medir |
|---------|--------|-----------|
| **Throughput** | 1.000 execuções/s (webhook simples) | BullMQ metrics + Prometheus |
| **Latência p99** | < 5s (workflow 3-5 nodes) | `NodeExecution.duration` aggregations |
| **Latência p99** | < 30s (workflow com HTTP/AI) | Idem |
| **Memory por exec** | < 50 MB | isolate-vm limit + worker RSS monitor |
| **Startup time** | < 200ms (worker → first node) | Worker boot time |
| **Recovery time** | < 5s (crash → resume) | Time from crash to first re-executed node |

### 18.3 Garbage collection

```typescript
// Periodicamente (a cada 100 nodes executados)
if (process.memoryUsage().heapUsed > 500 * 1024 * 1024) {  // 500 MB
  global.gc?.();  // forçado apenas se --expose-gc
  await evictOldNodeOutputs();  // limpa cache de outputs antigos
}
```

### 18.4 Otimizações de checkpoint

| Modo | Checkpoint a cada | Overhead | Recovery granularity |
|------|-------------------|----------|---------------------|
| `progress: true` | 1 node | ~3% | Qualquer node |
| `progress: "batched"` | 50 nodes | ~1% | Último batch checkpointed |
| `progress: false` | 1 workflow (start/finish) | ~0.5% | Reexecuta tudo |

### 18.5 Streaming de dados binários

Para downloads de arquivos grandes:

```typescript
// HTTP node com streaming direto para storage
const writeStream = binaryManager.writeStream(mimeType, fileName);
const response = await fetch(url, { signal: abortSignal });

if (response.body instanceof ReadableStream) {
  const readable = new NodeReadable(response.body);
  await new Promise((resolve, reject) => {
    readable.pipe(writeStream)
      .on("finish", resolve)
      .on("error", reject);
  });
}
```

**Invariante testável**: Workflow com 10.000 items executa em ≤ 60s com memory < 100MB. Node HTTP com resposta de 5 MB é streamed para storage sem loaded na heap.

---

## 19. Compatibilidade n8n

### 19.1 Import de workflow n8n

O engine aceita workflows exportados do n8n (JSON v1/v2) através do `importN8nWorkflow` em `packages/shared/src/n8n-import.ts`. O mapeamento:

| Campo n8n | Campo AgentFlow | Transformação |
|-----------|-----------------|---------------|
| `nodes[].name` | `WorkflowNode.label` | Direto |
| `nodes[].type` | `WorkflowNode.type` + `config.originalType` | `n8n-nodes-base.httpRequest` → `type: "http"`, `originalType: "n8n-nodes-base.httpRequest"` |
| `nodes[].parameters` | `WorkflowNode.config.parameters` | Preservar |
| `nodes[].credentials` | `WorkflowNode.config.credentials` | Referência por nome → resolve para Credential.id na importação |
| `nodes[].position` | `WorkflowNode.position` | `[x, y]` → `{ x, y }` |
| `connections` | `WorkflowEdge[]` | Estrutura aninhada n8n → flat list (ver `n8n-import.ts`) |
| `settings.executionOrder` | `WorkflowSettings.executionOrder` | `"v1"` ou `"v2"` |
| `settings.executionTimeout` | `WorkflowSettings.executionTimeout` | Segundos → armazenado como segundos |
| `settings.timezone` | `WorkflowSettings.timezone` | String IANA timezone |
| `settings.errorWorkflow` | `WorkflowSettings.errorWorkflow` | workflowId (pode ser nome — resolve na importação) |
| `pinData` | `WorkflowPinData` (separação) | Para testes/debug |
| `active` | `Workflow.status` | `true` → `ACTIVE`, `false` → `DRAFT` |
| `staticData` | `WorkflowVersion.snapshot.staticData` | Persistido no snapshot |

### 19.2 Node type mapping

Mapeamento completo (extendido de `n8n-import.ts`):

| Tipo n8n | Tipo AgentFlow | Categoria | Handler |
|----------|----------------|-----------|---------|
| `n8n-nodes-base.webhook` | `webhook` | trigger | `WebhookTriggerHandler` |
| `n8n-nodes-base.cron` | `cron` | trigger | `CronTriggerHandler` |
| `n8n-nodes-base.httpRequest` | `http` | action | `HttpRequestHandler` |
| `n8n-nodes-base.if` | `condition` | logic | `IfNodeHandler` |
| `n8n-nodes-base.switch` | `condition` | logic | `SwitchNodeHandler` |
| `n8n-nodes-base.merge` | `merge` | flowControl | `MergeNodeHandler` |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | flowControl | `SplitInBatchesHandler` |
| `n8n-nodes-base.set` | `set_fields` | transform | `SetNodeHandler` |
| `n8n-nodes-base.function` | `code` | transform | `FunctionNodeHandler` |
| `n8n-nodes-base.functionItem` | `code` | transform | `FunctionNodeHandler` (modo item) |
| `n8n-nodes-base.code` | `code` | transform | `FunctionNodeHandler` (n8n v2) |
| `n8n-nodes-base.wait` | `delay` | flowControl | `WaitNodeHandler` |
| `n8n-nodes-base.delay` | `delay` | flowControl | `DelayNodeHandler` |
| `n8n-nodes-base.formTrigger` | `webhook` | trigger | `FormTriggerHandler` |
| `n8n-nodes-base.errorTrigger` | `errorTrigger` | trigger | `ErrorTriggerHandler` |
| `@n8n/n8n-nodes-langchain.openAi` | `ai_agent` | ai | `OpenAiNodeHandler` |
| `n8n-nodes-base.telegram` | `telegram` | communication | `TelegramNodeHandler` |
| `n8n-nodes-base.gmail` | `gmail` | communication | `GmailNodeHandler` |
| `n8n-nodes-base.googleSheets` | `sheets` | data | `GoogleSheetsNodeHandler` |
| `n8n-nodes-base.emailSend` | `email` | communication | `EmailSendHandler` |
| `n8n-nodes-base.executeWorkflow` | `executeWorkflow` | flowControl | `ExecuteWorkflowHandler` |
| `n8n-nodes-base.respondToWebhook` | `respond_webhook` | flowControl | `RespondWebhookHandler` |
| `n8n-nodes-base.noOp` | `no_op` | transform | `NoOpHandler` |

### 19.3 Diferenças de comportamento conhecidas

| Recurso | n8n | AgentFlow | Impacto |
|---------|-----|-----------|---------|
| **Execution order** | `v1` (legacy, ordem do array) ou `v2` (topological) | Sempre topological (`v2`) | Workflows dependendo de ordem do array podem se comportar diferente. Mitigação: converter `v1` → topological antes de executar. |
| **Expression engine** | n8n-native (nós de AST) | Subset reimplemetado (isolated-vm + regex) | Expressões complexas (`$item(2).json.campo`, `$flow`) podem não funcionar. |
| **Code node sandbox** | VM2 (frágil, alguns métodos bloqueados) | isolate-vm (process isolation, zero rede) | Código usando `require('fs')` ou `fetch` direto falha no AgentFlow. |
| **Binary data** | Inline no JSON (base64) até 100MB | Reference (ID no storage) | Workflows esperando base64 inline no output do node precisam adaptar. |
| **Webhook URL** | `https://domain.com/webhook/path` | `https://domain.com/webhook/:org/:path` | URL diferente — webhook registrations precisam usar o novo formato. |
| **Credential resolution** | Encriptado no nó, decrypt no runner | Enviado no vault, decrypt no worker | Sem diferença observável para usuário, mas audit trail mais robusto. |
| **Retry backoff** | `waitBetweenTries` fixo ou exponential | Exponential + jitter | Retry timing pode variar ~10% em relação ao n8n. |
| **Static data** | Chave-valor persistente entre execuções | `WorkflowVersion.snapshot.staticData` | Sem diferença observável. |
| **Pin data** | Override de node output para testes | Separado em `WorkflowPinData` | Testes no editor usam pin data; execução de produção ignora. |
| **Node `runOnceForAllItems`** | Executa node uma vez para todos items | Suportado (ícone `☰` no node config) | Sem diferença. |
| **Node `executeOnce`** | Executa apenas na primeira vez | Suportado como flag | Sem diferença. |
| **Webhook responseMode** | `onReceived`, `lastNode`, `responseNode` | Todos suportados | `lastNode`/`responseNode` requerem SSE/streaming de resposta — implementado via bullmq job completion + polling. |
| **Subworkflows (`executeWorkflow`)** | Chamada síncrona ou assíncrona | Parent/child BullMQ jobs | Execução paralela de items via `mode: "each"` — pode ter latência adicional. |

### 19.4 Diferenças de versão JSON

| Versão n8n | Compatibilidade |
|------------|----------------|
| `1.x` (legacy) | ✅ Parseado, mapeado. `executionOrder` padrão `v1` — convertido para topological. |
| `2.x` | ✅ Total compatibilidade. `executionOrder` pode ser `v2`. |
| Workflow com `meta.useExecutionProfile` | ⚠️ Ignorado (feature cloud-only). |
| Workflow com `pins` (n8n v1.2+) | ✅ Importado como `pinData`. |
| Nodes `@n8n/n8n-nodes-langchain.*` (v2) | ⚠️ Parcial — apenas OpenAI suportado no MVP (ver catalogo-nodes). |

### 19.5 Testes de paridade

```typescript
// apps/api/tests/regression/n8n-parity.test.ts (conforme design-testes.md)
describe("n8n → AgentFlow Behavioral Parity", () => {
  const fixtures = loadFixtures("tests/fixtures/parity/");
  for (const fixture of fixtures) {
    it(`matches n8n output for: ${fixture.name}`, async () => {
      const wf = convertN8nToAgentFlow(fixture.workflow);
      const result = await executeWorkflow(wf, fixture.input, { mode: "test" });
      expect(normalizeForComparison(result.output)).toEqual(
        normalizeForComparison(fixture.expectedOutput)
      );
      expect(result.nodeExecutionOrder).toEqual(fixture.expectedNodeOrder);
    });
  }
});
```

**Invariante testável**: Workflow n8n export `"if-switch-branch.json"` importado e executado no AgentFlow produce o same `output` e `nodeExecutionOrder` que o n8n original (após normalização de timestamps/IDs não-determinísticos).

---

## 20. Decisões de design (ADR)

### ADR-1: Usar BullMQ + Redis como backbone de execução

**Contexto**: O engine precisa de fila, retry, scheduling, e escalabilidade horizontal.
**Decisão**: Usar BullMQ v5 (já no repo) + Redis (já configurado).
**Consequências**:
- ✅ Jobs são duráveis (Redis persistence)
- ✅ Retry/com backof nativo
- ✅ Parent/child jobs para DAG paralelo
- ✅ Workers escaláveis horizontalmente
- ❌ Requer Redis como dependência infra

### ADR-2: Topological sort como padrão (ignorar n8n `v1`)

**Contexto**: n8n `executionOrder: "v1"` executa nodes na ordem do array, não topológica.
**Decisão**: AgentFlow **sempre** usa topological sort (Kahn's algorithm), convertendo `v1` workflows antes da execução.
**Consequências**:
- ✅ Execução determinística e correta em DAGs
- ❌ Workflows maliciosos ou mal-estruturados que dependem de ordem de array quebram
- ✅ Paridade com `v2` n8n (que já usa topological)

### ADR-3: Isolamento de processo por worker (BullMQ)

**Contexto**: Workers podem ser comprometidos (Code node malicioso).
**Decisão**: Cada job roda em worker processo isolado. Code nodes usam `isolate-vm` com limites de memória/CPU.
**Consequências**:
- ✅ Isolamento de falla: um node malicioso não trava o worker inteiro
- ✅ Security: Code node não tem acesso a `fs`, `net`, `process`
- ❌ Overhead de process spawn (~50ms por job) — mitigado por worker pool

### ADR-4: Checkpoint por node (persistência de progresso)

**Contexto**: Crashes devem permitir retomar de qualquer ponto.
**Decisão**: Checkpointar `NodeExecution` após cada node concluído. Configurável via `settings.saveExecutionProgress`.
**Consequências**:
- ✅ Recovery granular (retoma no node seguinte)
- ❌ Overhead de 1 DB write por node (~2-3ms) — ~2-7% do tempo total
- ✅ Trade-off configurável

### ADR-5: Binary data como reference (não inline)

**Contexto**: n8n armazena binary data inline (base64) no JSON — ineficiente para arquivos grandes.
**Decisão**: AgentFlow usa referências (IDs) no storage (PostgreSQL/S3/filesystem).
**Consequências**:
- ✅ Memory eficiente (não carrega 10MB na heap)
- ✅ Streaming entre nodes
- ❌ Output de node não contém base64 inline — workflows n8n que esperam base64 precisam adaptar
- ✅ Storage é multipartável (upload direto do browser → S3)

### ADR-6: Expression engine reimplementado (não embutir n8n-core)

**Contexto**: n8n-core tem expression engine maduro, mas licença SUL.
**Decisão**: Reimplementar subset (`{{ $json.field }}`, `{{= JS }}`, helpers built-in) usando `isolated-vm` (já usado para Code node).
**Consequências**:
- ✅ Zero licença SUL
- ✅ Type-safe + validado por Zod
- ❌ Expressões avançadas (`$flow.getNodes`, `$item`) podem não funcionar
- ✅ 80% das expressões n8n comuns são suportadas

### ADR-7: Idempotency key derivada de payload

**Contexto**: Webhooks podem ser reenviados pelo provedor.
**Decisão**: Key = `SHA256(webhook.path + JSON.stringify(body) + signature)`.
**Consequências**:
- ✅ Deduplication automática sem header específico do provedor
- ❌ Body deve ser normalizado (ordenar keys) — implementado via `JSON.stringify` determinístico

### ADR-8: Cancelamento via AbortSignal (não polling)

**Contexto**: Execuções podem ser canceladas a qualquer momento.
**Decisão**: Cada execução tem `AbortController`; nodes verificam `signal.aborted` e passam `signal` para `fetch`/sandbox.
**Consequências**:
- ✅ Cancelamento imediato (< 100ms)
- ✅ Nodes HTTP/AI cancelam gracefulmente (fetch `AbortError`)
- ❌ Nodes bloqueantes (CPU-bound Code node) precisam de timeout hard do sandbox

### ADR-9: Dead Letter Queue para falhas permanentes

**Contexto**: Workflows que falham consistentemente não devem bloquear a queue.
**Decisão**: Após esgotar retries do job BullMQ, mover para DLQ (`workflow:dlq`).
**Consequências**:
- ✅ Inspecionar falhas sem bloquear workers
- ✅ Trigger de workflow de erro (se configurado)
- ✅ Dashboard de DLQ (via bull-board)

### ADR-10: Subworkflows como jobs parent/child

**Contexto**: `Execute Workflow` node precisa isolar execução.
**Decisão**: Cada subworkflow é `WorkflowExecution` filha, enfileirada como BullMQ child job do pai.
**Consequências**:
- ✅ Isolamento completo (timeout, credentials, retry)
- ✅ Escalabilidade (subworkflow pode rodar em worker diferente)
- ✅ Retomada granular (se subworkflow falha, pai retoma sem reexecutar nodes anteriores)

---

## Apêndice A: Exemplos de execução

### Exemplo A.1: Workflow simples (Webhook → HTTP → Set → Respond)

```text
Input (webhook):
  { json: { userId: 123, action: "signup" }, binary: {} }

Execution trace:
  [Webhook]        input={json:{userId:123,...}} → output={json:{userId:123,action:"signup"}}  ✓ (2ms)
  [HTTP Request]   input={json:{userId:123,...}} → calls POST https://api.crm.com/users → output={json:{statusCode:200, body:{id:456}}}  ✓ (245ms)
  [Set]            input={json:{statusCode:200,...}} → output={json:{userId:123, crmId:456, timestamp:"2026-08-20T..."}}  ✓ (1ms)
  [Respond]        input={json:{...}} → output={json:"OK", statusCode:200}  ✓ (0ms)

Final output: { json: "OK", statusCode: 200 }
Status: SUCCESS
Duration: 251ms
Node executions: 4 (all SUCCESS)
```

### Exemplo A.2: Workflow com retry e falha

```text
Workflow: Webhook → HTTP (retryOnFail=true, maxTries=3) → IF (success?) → Set-Success / Set-Fail

Execution #1:
  [Webhook]       ✓
  [HTTP Request]  FAILED (503) → retry 1/3 (wait 1000ms)
  [HTTP Request]  FAILED (503) → retry 2/3 (wait 2000ms)
  [HTTP Request]  FAILED (503) → retry 3/3 (wait 4000ms)
  [HTTP Request]  FINAL FAILED → errorWorkflow triggered
  Status: FAILED
  Error: "HTTP Request failed after 3 attempts: 503 Service Unavailable"
  errorWorkflow execution created: exec_err_abc
```

### Exemplo A.3: Workflow com SplitInBatches (100 items, batchSize=20)

```text
Execution:
  [Webhook]            ✓ (1 item: { json: { records: [...100 items] } })
  [SplitInBatches]     ✓ (output: 20 items, state: batch 1/5, isComplete=false)
  [HTTP Request]       ✓ (processa 20 items → output 20 items)
  ...                     (backend reexecuta SplitInBatches)
  [SplitInBatches]     ✓ (output: 20 items, state: batch 2/5, isComplete=false)
  [HTTP Request]       ✓
  ...
  [SplitInBatches]     ✓ (output: 20 items, state: batch 5/5, isComplete=true)
  [HTTP Request]       ✓
  [Merge]              ✓ (aguarda todos batches → 100 items)
  [Output]             ✓
  Status: SUCCESS
  Node executions: 1 (Webhook) + 5×(SplitInBatches+HTTP) + Merge + Output = 13
```

### Exemplo A.4: Workflow com subworkflow

```text
Parent Workflow (exec_parent_001):
  [Webhook] → [Set] → [Execute Workflow: "Format Data"] → [Respond]

Subworkflow "Format Data" (exec_child_001):
  [Format Trigger] → [Code] → [Output]

Execution trace:
  [Webhook]              ✓ (parent)
  [Set]                  ✓ (parent)
  [Execute Workflow]     ──▶ creates child exec_child_001 (BullMQ child job)
                            ├─ [Format Trigger] ✓ (child)
                            ├─ [Code]          ✓ (child)
                            └─ [Output]        ✓ (child)
  [Execute Workflow]     ✓ (parent) — output = { json: { formatted: true } }
  [Respond]              ✓ (parent)
  Status: SUCCESS
  Parent duration: 320ms (child: 45ms)
```

---

## Apêndice B: Invariantes testáveis (sumário)

| # | Invariante | Onde testar |
|---|-----------|-------------|
| 1 | `topologicalSort(DAG)` sempre retorna todos os nodes em ordem válida | Unit: `workflow/sort.test.ts` |
| 2 | Ciclo no grafo → `CycleError` lançado | Unit: `workflow/sort.test.ts` |
| 3 | Node `SKIP` se branch não tomada (IF/Switch) | Integration: `fixtures/if-switch.json` |
| 4 | Merge `wait`/`all` aguarda todos os inputs antes de prosseguir | Integration: `fixtures/merge.json` |
| 5 | SplitInBatches 250 items / batchSize=50 → 5 iter, `isComplete` na 5ª | Integration: `fixtures/batch.json` |
| 6 | Retry: maxTries=3 + falha → 3 tentativas + delays exponenciais | Integration: `fixtures/retry.json` |
| 7 | Timeout: node > timeout → FAILED + retry | Integration: `fixtures/timeout.json` |
| 8 | Cancelamento: abort dentro de 2s, todos RUNNING→CANCELLED | Integration: `fixtures/cancel.json` |
| 9 | Idempotência: webhook reenviado 3x → 1 execution | Integration: `fixtures/webhook-dedup.json` |
| 10 | Crash + resume: nodes SUCCESS não reexecutados | Integration: `fixtures/recovery.json` |
| 11 | Subworkflow falha → pai não trava em estado inconsistente | Integration: `fixtures/subworkflow.json` |
| 12 | Code node sandbox: `require('fs')` lança erro | Unit: `nodes/code.test.ts` |
| 13 | Expression `{{ $json.x }}` determinística | Unit: `expressions/engine.test.ts` |
| 14 | Binary data: tenant B não acessa dados de tenant A | Integration: `fixtures/tenant-isolation.json` |
| 15 | n8n parity: import n8n JSON → output idêntico ao n8n | Regression: `fixtures/parity/*.json` |

---

## Apêndice C: Configuração (env vars)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `EXECUTION_TIMEOUT_MS` | `300000` (5 min) | Timeout global por workflow |
| `NODE_TIMEOUT_MS` | `30000` (30s) | Timeout por node |
| `MAX_RETRIES` | `3` | Retries globais por job BullMQ |
| `QUEUE_CONCURRENCY` | `10` | Jobs simultâneos por worker |
| `MAX_PAYLOAD_SIZE` | `10MB` | Limite body HTTP + binary data |
| `EXEC_CODE_DISABLED` | `false` | Se true, desabilita Code nodes (fail fast) |
| `EGRESS_ALLOWED_HOSTS` | `*` (all) | Allowlist de hosts HTTP (SSRF) |
| `BINARY_STORAGE` | `database` | `database` \| `s3` \| `filesystem` \| `memory` |
| `BINARY_MAX_SIZE_BYTES` | `10485760` (10MB) | Limite de binary data por item |
| `CHECKPOINT_INTERVAL` | `1` | Checkpoint a cada N nodes (1 = todos) |
| `WORKFLOW_RECOVERY_TTL_MS` | `30000` (30s) | TTL para re-enfileir execPaused |
| `APPROVAL_TTL_HOURS` | `168` (7 dias) | TTL de approvals pendentes |
| `DLQ_MAX_RETRIES` | `10` | Max retries antes de ir para DLQ |

---

_Fim da especificação v2 do Engine de Execução — AgentFlow_
