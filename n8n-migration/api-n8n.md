# n8n REST API v1 Documentation

Documentação completa da REST API do n8n (v1) para replicação no AgentFlow e importação de workflows.

---

## Autenticação

A API do n8n suporta três métodos de autenticação:

| Método | Header | Descrição |
|--------|--------|-----------|
| **API Key** | `X-N8N-API-KEY` | Chave de API pessoal (recomendado para scripts/automação) |
| **Bearer Token** | `Authorization: Bearer <token>` | JWT token de sessão |
| **Cookie** | `Cookie: n8n-auth=<token>` | Cookie de sessão do navegador |

**Exemplo com API Key:**
```bash
curl -H "X-N8N-API-KEY: your-api-key-here" \
     https://your-n8n-instance.com/api/v1/workflows
```

---

## Formato Base de Resposta

Todas as respostas seguem o padrão:

```json
{
  "data": <object|array>,
  "nextCursor": "string|null"
}
```

Códigos de erro padrão:
- `400` — Bad Request
- `401` — Unauthorized
- `403` — Forbidden
- `404` — Not Found
- `409` — Conflict (ex: publicação bloqueada)

---

## Endpoints de Workflows

### 1. Listar Workflows
**GET** `/api/v1/workflows`

**Parâmetros de Query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `limit` | integer | Não | Número máximo de resultados (padrão: 100) |
| `cursor` | string | Não | Cursor de paginação |
| `offset` | integer | Não | Offset para paginação (legacy) |
| `active` | boolean | Não | Filtrar por workflows ativos (`true`/`false`) |
| `tags` | string | Não | Filtrar por tags (separadas por vírgula) |
| `name` | string | Não | Filtrar por nome (busca parcial) |
| `projectId` | string | Não | Filtrar por projeto |
| `excludePinnedData` | boolean | Não | Excluir dados fixados (padrão: `false`) |

**Exemplo curl:**
```bash
curl -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/workflows?limit=50&active=true"
```

**Resposta (200):**
```json
{
  "data": [
    {
      "id": "2tUt1wbLX592XDdX",
      "name": "Workflow 1",
      "active": true,
      "activeVersionId": "abc123",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:45:00.000Z",
      "isArchived": false,
      "versionId": "def456",
      "triggerCount": 2,
      "nodes": [...],
      "connections": {},
      "settings": {},
      "staticData": {},
      "pinData": {},
      "projectId": "VmwOO9HeTEj20kxM",
      "parentFolderId": "X8ovzm8lTQjcXRZQ",
      "meta": {
        "templateId": "template-123",
        "onboardingId": "onboarding-456"
      }
    }
  ],
  "nextCursor": "MTIzZTQ1NjctZTg5Yi0xMmQzLWE0NTYtNDI2NjE0MTc0MDA"
}
```

**Equivalente AgentFlow (proposto):**
```
GET /api/v1/workflows
Query: limit, cursor, active, tags, name, projectId, excludePinnedData
Response: { data: Workflow[], nextCursor: string }
```

---

### 2. Obter Workflow por ID
**GET** `/api/v1/workflows/{workflowId}`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Parâmetros de Query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `excludePinnedData` | boolean | Não | Excluir dados fixados (padrão: `false`) |

**Exemplo curl:**
```bash
curl -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX"
```

**Resposta (200):**
```json
{
  "id": "2tUt1wbLX592XDdX",
  "name": "Workflow 1",
  "description": "My workflow description",
  "active": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-20T14:45:00.000Z",
  "isArchived": false,
  "versionId": "def456",
  "triggerCount": 2,
  "nodes": [
    {
      "id": "1",
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "url": "https://api.example.com/data",
        "method": "GET"
      },
      "credentials": {
        "httpBasicAuth": "my-credentials"
      }
    }
  ],
  "connections": {
    "HTTP Request": {
      "main": [[{ "node": "Start", "type": "main", "index": 0 }]]
    }
  },
  "nodeGroups": [],
  "settings": {
    "executionOrder": "v1"
  },
  "staticData": {},
  "pinData": {},
  "projectId": "VmwOO9HeTEj20kxM",
  "parentFolderId": "X8ovzm8lTQjcXRZQ",
  "meta": {
    "templateId": "template-123",
    "instanceId": "instance-789"
  }
}
```

**Equivalente AgentFlow (proposto):**
```
GET /api/v1/workflows/{workflowId}
Query: excludePinnedData
Response: Workflow
```

---

### 3. Criar Workflow
**POST** `/api/v1/workflows`

**Corpo da Requisição (application/json):**

```json
{
  "name": "New Workflow",
  "nodes": [
    {
      "id": "1",
      "name": "Start",
      "type": "n8n-nodes-base.start",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {}
    }
  ],
  "connections": {},
  "settings": {
    "executionOrder": "v1"
  },
  "projectId": "VmwOO9HeTEj20kxM",
  "parentFolderId": "X8ovzm8lTQjcXRZQ"
}
```

**Campos obrigatórios:** `name`, `nodes`, `connections`, `settings`

**Exemplo curl:**
```bash
curl -X POST \
     -H "X-N8N-API-KEY: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "New Workflow",
       "nodes": [{"id": "1", "name": "Start", "type": "n8n-nodes-base.start", "typeVersion": 1, "position": [250, 300], "parameters": {}}],
       "connections": {},
       "settings": {"executionOrder": "v1"}
     }' \
     "https://your-n8n-instance.com/api/v1/workflows"
```

**Resposta (200):**
```json
{
  "id": "new-workflow-id",
  "name": "New Workflow",
  "active": false,
  "createdAt": "2024-01-25T10:00:00.000Z",
  "updatedAt": "2024-01-25T10:00:00.000Z",
  "isArchived": false,
  "versionId": "version-123",
  "triggerCount": 0,
  "nodes": [...],
  "connections": {},
  "settings": {"executionOrder": "v1"},
  "staticData": {},
  "pinData": {},
  "projectId": "VmwOO9HeTEj20kxM",
  "parentFolderId": "X8ovzm8lTQjcXRZQ"
}
```

**Equivalente AgentFlow (proposto):**
```
POST /api/v1/workflows
Body: WorkflowCreate
Response: Workflow
```

---

### 4. Atualizar Workflow
**PUT** `/api/v1/workflows/{workflowId}`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Parâmetros de Query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `publishIfActive` | boolean | Não | Publicar atualização se workflow ativo (padrão: `true`) |

**Corpo da Requisição (application/json):** Mesmo esquema do workflow completo

**Exemplo curl:**
```bash
curl -X PUT \
     -H "X-N8N-API-KEY: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Updated Workflow",
       "nodes": [...],
       "connections": {...},
       "settings": {"executionOrder": "v1"}
     }' \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX?publishIfActive=false"
```

**Resposta (200):** Workflow atualizado (mesmo formato do GET)

**Equivalente AgentFlow (proposto):**
```
PUT /api/v1/workflows/{workflowId}
Query: publishIfActive
Body: Workflow
Response: Workflow
```

---

### 5. Publicar (Ativar) Workflow
**POST** `/api/v1/workflows/{workflowId}/publish`

*Substitui o endpoint depreciado `POST /workflows/{id}/activate`*

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Corpo da Requisição (opcional):**
```json
{
  "versionId": "specific-version-id",
  "name": "Version name",
  "description": "Version description"
}
```

**Exemplo curl:**
```bash
curl -X POST \
     -H "X-N8N-API-KEY: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"versionId": "abc123"}' \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX/publish"
```

**Resposta (200):** Workflow publicado (active: true)

**Erro (409):** Conflito (ex: revisão aberta, conflito de webhook)
```json
{
  "reason": "workflowReview",
  "workflowReviewRequestId": "review-123"
}
```

**Equivalente AgentFlow (proposto):**
```
POST /api/v1/workflows/{workflowId}/publish
Body: { versionId?, name?, description? }
Response: Workflow
```

---

### 6. Despublicar (Desativar) Workflow
**POST** `/api/v1/workflows/{workflowId}/unpublish`

*Substitui o endpoint depreciado `POST /workflows/{id}/deactivate`*

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Exemplo curl:**
```bash
curl -X POST \
     -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX/unpublish"
```

**Resposta (200):** Workflow despublicado (active: false)

**Equivalente AgentFlow (proposto):**
```
POST /api/v1/workflows/{workflowId}/unpublish
Response: Workflow
```

---

### 7. Executar Workflow
**POST** `/api/v1/workflows/{workflowId}/run`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Corpo da Requisição (opcional):**
```json
{
  "data": {},
  "startNodes": ["node-id-1"],
  "runOptions": {}
}
```

**Exemplo curl:**
```bash
curl -X POST \
     -H "X-N8N-API-KEY: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"data": {"input": "value"}, "startNodes": ["1"]}' \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX/run"
```

**Resposta (200):**
```json
{
  "executionId": 1000,
  "workflowId": "2tUt1wbLX592XDdX",
  "data": {
    "resultData": {
      "runData": {
        "Start": [{"data": {}}]
      }
    }
  },
  "finished": true,
  "mode": "manual",
  "startedAt": "2024-01-25T10:00:00.000Z",
  "stoppedAt": "2024-01-25T10:00:05.000Z",
  "status": "success"
}
```

**Equivalente AgentFlow (proposto):**
```
POST /api/v1/workflows/{workflowId}/run
Body: { data?, startNodes?, runOptions? }
Response: Execution
```

---

### 8. Deletar Workflow
**DELETE** `/api/v1/workflows/{workflowId}`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowId` | string | Sim | ID do workflow |

**Exemplo curl:**
```bash
curl -X DELETE \
     -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/workflows/2tUt1wbLX592XDdX"
```

**Resposta (200):** Workflow deletado

**Equivalente AgentFlow (proposto):**
```
DELETE /api/v1/workflows/{workflowId}
Response: Workflow
```

---

## Endpoints de Execuções

### 9. Listar Execuções
**GET** `/api/v1/executions`

**Parâmetros de Query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `limit` | integer | Não | Máximo de resultados (padrão: 100) |
| `cursor` | string | Não | Cursor de paginação |
| `includeData` | boolean | Não | Incluir dados completos da execução |
| `ignoreDataSizeLimit` | boolean | Não | Ignorar limite de tamanho dos dados |
| `redactExecutionData` | boolean | Não | Ofuscar dados sensíveis |
| `status` | string | Não | Filtrar por status: `canceled`, `crashed`, `error`, `new`, `running`, `success`, `unknown`, `waiting` |
| `workflowId` | string | Não | Filtrar por workflow ID |
| `projectId` | string | Não | Filtrar por projeto |

**Exemplo curl:**
```bash
curl -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/executions?limit=20&status=success&workflowId=2tUt1wbLX592XDdX"
```

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 1000,
      "data": {
        "redactionInfo": {
          "isRedacted": false,
          "reason": null,
          "canReveal": true
        }
      },
      "finished": true,
      "mode": "manual",
      "retryOf": null,
      "retrySuccessId": null,
      "startedAt": "2024-01-25T10:00:00.000Z",
      "stoppedAt": "2024-01-25T10:00:05.000Z",
      "workflowId": "2tUt1wbLX592XDdX",
      "waitTill": null,
      "customData": {},
      "status": "success"
    }
  ],
  "nextCursor": "MTIzZTQ1NjctZTg5Yi0xMmQzLWE0NTYtNDI2NjE0MTc0MDA"
}
```

**Equivalente AgentFlow (proposto):**
```
GET /api/v1/executions
Query: limit, cursor, includeData, ignoreDataSizeLimit, redactExecutionData, status, workflowId, projectId
Response: { data: Execution[], nextCursor: string }
```

---

### 10. Obter Execução por ID
**GET** `/api/v1/executions/{executionId}`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `executionId` | string/number | Sim | ID da execução |

**Parâmetros de Query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `includeData` | boolean | Não | Incluir dados completos |
| `ignoreDataSizeLimit` | boolean | Não | Ignorar limite de tamanho |
| `redactExecutionData` | boolean | Não | Ofuscar dados sensíveis |

**Exemplo curl:**
```bash
curl -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/executions/1000?includeData=true"
```

**Resposta (200):**
```json
{
  "id": 1000,
  "data": {
    "resultData": {
      "runData": {
        "Start": [{"data": {"input": "value"}}],
        "HTTP Request": [{"data": {"response": "ok"}}]
      }
    },
    "redactionInfo": {
      "isRedacted": false,
      "reason": null,
      "canReveal": true
    }
  },
  "finished": true,
  "mode": "manual",
  "retryOf": null,
  "retrySuccessId": null,
  "startedAt": "2024-01-25T10:00:00.000Z",
  "stoppedAt": "2024-01-25T10:00:05.000Z",
  "workflowId": "2tUt1wbLX592XDdX",
  "waitTill": null,
  "customData": {},
  "status": "success"
}
```

**Equivalente AgentFlow (proposto):**
```
GET /api/v1/executions/{executionId}
Query: includeData, ignoreDataSizeLimit, redactExecutionData
Response: Execution
```

---

### 11. Deletar Execução
**DELETE** `/api/v1/executions/{executionId}`

**Parâmetros de Path:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `executionId` | string/number | Sim | ID da execução |

**Exemplo curl:**
```bash
curl -X DELETE \
     -H "X-N8N-API-KEY: your-api-key" \
     "https://your-n8n-instance.com/api/v1/executions/1000"
```

**Resposta (200):** Execução deletada

**Equivalente AgentFlow (proposto):**
```
DELETE /api/v1/executions/{executionId}
Response: Execution
```

---

## Tabela Resumo: Mapeamento n8n → AgentFlow

| # | n8n v1 Endpoint | Método | AgentFlow Proposto | Descrição |
|---|-----------------|--------|-------------------|-----------|
| 1 | `/api/v1/workflows` | GET | `GET /api/v1/workflows` | Listar workflows |
| 2 | `/api/v1/workflows/{id}` | GET | `GET /api/v1/workflows/{id}` | Obter workflow |
| 3 | `/api/v1/workflows` | POST | `POST /api/v1/workflows` | Criar workflow |
| 4 | `/api/v1/workflows/{id}` | PUT | `PUT /api/v1/workflows/{id}` | Atualizar workflow |
| 5 | `/api/v1/workflows/{id}/publish` | POST | `POST /api/v1/workflows/{id}/publish` | Publicar (ativar) workflow |
| 6 | `/api/v1/workflows/{id}/unpublish` | POST | `POST /api/v1/workflows/{id}/unpublish` | Despublicar (desativar) workflow |
| 7 | `/api/v1/workflows/{id}/run` | POST | `POST /api/v1/workflows/{id}/run` | Executar workflow |
| 8 | `/api/v1/workflows/{id}` | DELETE | `DELETE /api/v1/workflows/{id}` | Deletar workflow |
| 9 | `/api/v1/executions` | GET | `GET /api/v1/executions` | Listar execuções |
| 10 | `/api/v1/executions/{id}` | GET | `GET /api/v1/executions/{id}` | Obter execução |
| 11 | `/api/v1/executions/{id}` | DELETE | `DELETE /api/v1/executions/{id}` | Deletar execução |

**Total: 11 endpoints principais documentados**

---

## Esquemas de Dados Principais

### Workflow (Resumo)
```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isArchived: boolean;
  versionId: string;
  triggerCount: number;
  nodes: Node[];
  connections: Record<string, Connection>;
  nodeGroups: NodeGroup[];
  settings: WorkflowSettings;
  staticData: Record<string, any> | string | null;
  pinData: Record<string, any> | null;
  projectId: string;
  parentFolderId: string | null;
  meta: WorkflowMeta | null;
}
```

### WorkflowCreate (Para POST)
```typescript
interface WorkflowCreate {
  name: string;
  nodes: Node[];
  connections: Record<string, Connection>;
  settings: WorkflowSettings;
  projectId?: string;
  parentFolderId?: string | null;
}
```

### Execution
```typescript
interface Execution {
  id: number;
  data?: {
    resultData?: {
      runData: Record<string, NodeRunData[]>;
    };
    redactionInfo?: {
      isRedacted: boolean;
      reason: string | null;
      canReveal: boolean;
    };
  };
  finished: boolean;
  mode: 'cli' | 'error' | 'integrated' | 'internal' | 'manual' | 'retry' | 'trigger' | 'webhook' | 'evaluation' | 'chat';
  retryOf: number | null;
  retrySuccessId: number | null;
  startedAt: string; // ISO 8601
  stoppedAt: string | null; // ISO 8601
  workflowId: string;
  waitTill: string | null; // ISO 8601
  customData: Record<string, any>;
  status: 'canceled' | 'crashed' | 'error' | 'new' | 'running' | 'success' | 'unknown' | 'waiting';
}
```

---

## Notas para Implementação no AgentFlow

1. **IDs**: n8n usa strings para workflow IDs e números para execution IDs
2. **Versionamento**: Workflows têm `versionId` para optimistic locking
3. **Projetos**: Suporte a `projectId` e `parentFolderId` para organização
4. **Paginação**: Baseada em cursor (`nextCursor`) e também suporta `limit`/`offset`
5. **Filtros**: Query params para status, workflow, projeto, tags, nome
6. **Dados sensíveis**: Parâmetro `redactExecutionData` para ofuscar credenciais
7. **Publicação**: Separação entre salvar (PUT) e publicar (POST /publish)
8. **Execução síncrona**: POST /run retorna a execução completa quando termina

---

## Referências

- [n8n API Documentation](https://docs.n8n.io/api/)
- [n8n GitHub - Public API v1](https://github.com/n8n-io/n8n/tree/master/packages/cli/src/public-api/v1)
- [OpenAPI Spec](https://raw.githubusercontent.com/n8n-io/n8n/master/packages/cli/src/public-api/v1/openapi.yml)

---

*Documento gerado para a missão "Recriar n8n no AgentFlow" - Pane API N8N*