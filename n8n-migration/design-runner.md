# Design do Motor de Execução de Workflows

## Visão Geral

O motor de execução do AgentFlow é responsável por executar workflows recriados do n8n, processando nós de forma sequérica ou paralela conforme as conexões, gerenciando estado, retentativas, timeouts, filas e logs.

Arquiteto conforme a recomendação do `deps-e-libs.md`: usar **bullmq** (já instalado) com workers dedicados para persistência, escala horizontal e suporte a DAG via parent/child jobs.

---

## Arquitetura

### Componentes Principais

1. **API Endpoint** (`/trigger`): recebe requisição para iniciar um workflow, cria registro de execução e enfileira job no bullmq.
2. **Queue (bullmq)**: fila de jobs do tipo `execute` contendo `executionId`.
3. **Worker**: processa jobs da fila, carregando o workflow e executando nós em ordem topológica.
4. **Executor Service**: contém a lógica de execução de nós, tratamento de erros, retentativas, timeouts e persistência de estado.
5. **Prisma Models**: armazenam execuções (`WorkflowExecution`) e execuções por nó (`NodeExecution`).

### Diagrama ASCII de Fluxo

```
+----------------+       +--------+       +----------+       +------------------+
|  HTTP Request  | --->  |  API   | --->  |  Queue   | --->  |   Worker (bullmq)|
|  (POST /trigger)   |   | (Fastify) |   | (bullmq) |       |   (Node.js)      |
+----------------+       +--------+       +----------+       +------------------+
                                                         |
                                                         v
                                                +------------------+
                                                |  Executor Service|
                                                |  - Carrega workflow|
                                                |  - Topological sort|
                                                |  - Loop de nós    |
                                                |  - Retry/Timeout  |
                                                |  - Persistência   |
                                                +------------------+
                                                         |
                                                         v
                                                +------------------+
                                                |  Prisma DB       |
                                                |  - WorkflowExecution|
                                                |  - NodeExecution   |
                                                +------------------+
```

---

## Modelo de Dados (Prisma)

Os modelos existentes já cobrem a maior parte do necessário. Vamos detalhar e eventualmente estender.

### WorkflowExecution (já existente)

```prisma
model WorkflowExecution {
  id         String   @id @default(cuid())
  status     ExecutionStatus @default(PENDING)
  trigger    String   // webhook, manual, cron, api
  input      Json?
  output     Json?
  error      String?
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  duration   Int?     // ms

  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  userId     String?
  user       User?   @relation("ExecutionUser", fields: [userId], references: [id])

  nodes      NodeExecution[]
  approvals  Approval[]

  @@index([orgId, startedAt])
  @@index([workflowId, startedAt])
  @@index([userId, startedAt])
}
```

### NodeExecution (já existente, com campos adicionais para controle)

```prisma
model NodeExecution {
  id           String   @id @default(cuid())
  status       ExecutionStatus @default(PENDING)
  input        Json?
  output       Json?
  error        String?
  logs         String?    // logs de stdout/stderr do nó
  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  duration     Int?       // ms

  nodeId       String
  node         WorkflowNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  executionId  String
  execution    WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  retryCount   Int @default(0)
  idempotencyKey String? @unique   // para evitar execuções duplicadas em retries

  @@index([executionId, startedAt])
}
```

> **Nota**: O modelo `WorkflowNode` (definição do nó no workflow) já existe no schema através da relação. Não precisamos alterar.

---

## Interface do Executor de Nó (TypeScript)

Cada tipo de nó (HTTP, IF, Code, etc.) implementará esta interface.

```typescript
export interface NodeExecutor<T = any> {
  /**
   * Executa o nó com os dados de entrada, parâmetros e credenciais.
   * @param input  Dados de entrada do nó (output do nó anterior ou trigger)
   * @param params Configuração específica do nó (vientdo do workflow.canvas)
   * @param credentialsRef Função para obter credencial por ID (descriptografada)
   * @returns Promessa que resolve com o output do nó
   */
  execute(
    input: unknown,
    params: Record<string, unknown>,
    credentialsRef: (credentialId: string) => Promise<Record<string, unknown>>
  ): Promise<T>;
}
```

### Exemplo de Implementação (HTTP Node)

```typescript
export class HttpNodeExecutor implements NodeExecutor<{ statusCode: number; body: string; headers: Record<string, string> }> {
  async execute(
    input: unknown,
    params: { method: string; url: string; headers?: Record<string, string>; query?: Record<string, string>; body?: unknown },
    credentialsRef: (credentialId: string) => Promise<Record<string, unknown>>
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
    // 1. Resolve credencial se houver
    // 2. Constrói request com timeout e retries internos (ou delega ao executor)
    // 3. Faz a chamada HTTP
    // 4. Retorna { statusCode, body, headers }
  }
}
```

---

## Pseudocódigo do Loop de Execução

O worker processa um job `execute` com `executionId`. O fluxo é:

```typescript
async function runExecution(executionId: string) {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: { include: { nodes: true } } }
  });

  if (!execution) throw new Error('Execution not found');

  // 1. Atualiza status para RUNNING
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { status: 'RUNNING' }
  });

  try {
    // 2. Carrega definição do workflow (nodes e edges)
    const workflow = execution.workflow;
    const nodes = workflow.nodes; // array de { id, type, data: { type, config, ... } }
    const edges = workflow.edges; // array de { source, target, sourceHandle?, label?, condition? }

    // 3. Ordena nós em ordem topológica (considerando apenas conexões main)
    const sortedNodes = topologicalSort(nodes, edges.filter(e => !e.label)); // Ignora labels para conexões main? Ajustar conforme necessidade

    // 4. Mapa para armazenar output de cada nó por ID
    const nodeOutputs: Record<string, unknown> = {};

    // 5. Processa cada nó em ordem
    for (const nodeDef of sortedNodes) {
      const nodeId = nodeDef.id;
      const nodeType = nodeDef.data.type; // ou nodeDef.type dependendo da estrutura
      const nodeConfig = nodeDef.data.config ?? {};

      // 5.1. Determina input do nó baseado nas conexões de entrada
      const input = getNodeInput(nodeId, edges, nodeOutputs, execution.input);

      // 5.2. Obtém executor adequado para o tipo de nó
      const executor = getNodeExecutor(nodeType); // factory ou mapa

      // 5.3. Executa com retry, timeout e captura de erro
      let attempt = 0;
      let lastError: unknown;
      const maxRetries = nodeConfig.retry?.count ?? 0;
      const retryDelayMs = nodeConfig.retry?.delay ?? 1000; // backoff exponencial pode ser implementado
      const timeoutMs = nodeConfig.timeout ?? 30000; // padrão 30s

      while (attempt <= maxRetries) {
        try {
          const output = await Promise.race([
            executor.execute(input, nodeConfig, getCredential),
            timeout(timeoutMs) // função que rejeita após timeoutMs
          ]);
          // Sucesso
          await prisma.nodeExecution.create({
            data: {
              id: cuid(),
              status: 'SUCCESS',
              input,
              output,
              startedAt: new Date(),
              finishedAt: new Date(),
              duration: Date.now() - startTime,
              nodeId,
              executionId: execution.id,
              retryCount: attempt
            }
          });
          nodeOutputs[nodeId] = output;
          break; // sai do loop de retry
        } catch (err) {
          lastError = err;
          attempt++;
          if (attempt > maxRetries) {
            // Falha definitiva
            await prisma.nodeExecution.create({
              data: {
                id: cuid(),
                status: 'ERROR',
                input,
                error: String(err),
                startedAt: new Date(),
                finishedAt: new Date(),
                duration: Date.now() - startTime,
                nodeId,
                executionId: execution.id,
                retryCount: attempt
              }
            });
            throw err; // será capturado pelo bloco externo
          }
          // Espera antes do retry (com backoff opcional)
          await delay(retryDelayMs * Math.pow(2, attempt - 1));
        }
      }
    }

    // 6. Se chegou aqui, todas as execuções de nós foram bem-sucedidas
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUCCESS',
        output: nodeOutputs[outputNodeId] ?? null, // ou definir nó de saída
        finishedAt: new Date(),
        duration: Date.now() - executionStartedAt
      }
    });
  } catch (err) {
    // 7. Tratamento de erro geral
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'ERROR',
        error: String(err),
        finishedAt: new Date(),
        duration: Date.now() - executionStartedAt
      }
    });
    throw err; // opcional, dependendo se o worker deve rejeitar o job
  }
}
```

### Funções Auxiliares

- `topologicalSort(nodes, edges)`: ordena nós de forma que predecessores sejam processados antes.
- `getNodeInput(nodeId, edges, nodeOutputs, executionInput)`: coleta output dos nós predecessores via conexões main.
- `getNodeExecutor(type)`: retorna uma instância do executor adequado (HTTP, IF, Code, etc.).
- `getCredential(credentialId)`: busca e descriptografa credencial do Prisma.
- `timeout(ms)`: retorna uma promise que rejeita após `ms`.
- `delay(ms)`: retorna uma promise que resolve após `ms`.

---

## Controle de Concorrência e Fila

- **bullmq**: cada job é processado por um worker. workers podem ser escalados horizontalmente.
- **Isolamento**: cada job roda em um processo separado (worker), evitando vazamento de memória e travamentos.
- **Persistência**: estado salvo em Prisma a cada nó e no final da execução.
- **Monitoramento**: opcionalmente integrar `bull-board` para dashboard de filas.

---

## Tratamento de Especificidades

### Split/Branch (IF/Switch)

- Nós de tipo `IF` ou `Switch` avaliam uma condição e determinam quais nós filhos devem ser executados.
- Na ordem topológica, esses nós são tratados como qualquer outro, mas seu output determina quais nós seguintes são ativados (via conexões com label).
- A função `getNodeInput` deve considerar apenas conexões que são ativadas com base na condição.

### Merge

- Nó de tipo `Merge` aguarda que todas as branches de entrada sejam concluídas antes de prosseguir.
- Implementado como um nó que depende de múltiplos predecessores; seu input é um array ou objeto combinando os outputs.

### Wait (Delay)

- Nó de tipo `Delay` simplesmente aguarda um tempo determinado antes de produzir output (pode repassar input ou gerar output baseado em config).

### Cancelamento

- Se o workflow for cancelado (via API), marcar execução como `CANCELLED` e parar o processamento de nós.
- O worker deve verificar periodicamente por sinais de cancelamento (ex.: campo `cancelledAt` na tabela de execuções).

---

## Segurança

- **Isolamento de nós**: nós de tipo `Code` (JavaScript/TypeScript arbitrário) devem rodar em sandbox (ex.: VM2, ou restringir acesso ao contexto global).
- **Sem eval**: evitar uso direto de `eval` ou `new Function` com entrada não confiável.
- **Credenciais**: armazenadas criptografadas no Prisma; descriptografadas apenas no momento do uso e nunca expostas em logs.
- **Validação de entrada**: validar e sanitizar inputs de nós externos (webhooks, HTTP) antes de passar para nós internos.
- **Limites de recursos**: limitar memória, tempo de execução e tamanho de payload por nó e por workflow.

---

## Riscos e Mitigações

| Risco | Descrição | Mitigação |
|-------|-----------|-----------|
| **Vazamento de memória em workers** | Acúmulo de estado entre jobs | Workers são processos separados; reiniciar periodicamente ou usar worker isolation do bullmq. |
| **Deadlock em workflows com ciclos** | Conexões criando loops infinitos | Detectar ciclos na fase de validação do workflow (antes de enfileirar). |
| **Retries infinitos** | Nó falhando continuamente | Limitar número de retries configurável por nó; alertas após threshold. |
| **Timeouts inadequados** | Workflow travando por timeout muito alto ou muito baixo | Configurar timeouts padrões e permitir sobrescrita por nó; monitorar durações. |
| **Inconsistência de estado** | Falha parcial deixando execução em estado intermediário | Transações Prisma ou compensatórias; usar idempotency keys para operações externas. |
| **Escala de fila** | Pico de tráfego sobrecarregando fila | Escalar workers horizontalmente; monitorar tamanho da fila e lag. |
| **Segurança de nós customizados** | Execução de código malicioso em nós Code | Sandboxing rigoroso; lista de permissões de módulos acessíveis. |

---

## Conformidade com deps-e-libs.md

Conforme a seção **3.1 bullmq** do `deps-e-libs.md`:

> **Recomendação**: **SIM — USAR bullmq v5 (já instalado) + workers dedicados**
> Para "recriar n8n", bullmq é o match natural: já no repo, suporta DAG via parent/child jobs, workers independentes escaláveis, e integra com Redis/ioredis existente. Adicionar `bull-board` para dashboard de monitoramento.

Este design segue exatamente essa recomendação, utilizando bullmq para enfileiramento e workers dedicados para execução, com persistência em Prisma (PostgreSQL) e monitoramento opcional via bull-board.

---

## Próximos Passos

1. Implementar factory de executores de nós (HTTP, IF, Code, etc.).
2. Adicionar API endpoint para cancelamento de execuções.
3. Integrar bull-board para monitoramento de filas.
4. Criar testes unitários e de integração para o executor.
5. Validar com workflows de exemplo (webhook → HTTP → email).