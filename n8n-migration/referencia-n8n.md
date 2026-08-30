# Referência Completa do Formato JSON de Workflow do n8n

> **Missão**: Recriar n8n no AgentFlow  
> **Work dir**: `n8n-migration/`  
> **Papel**: Pane REFERÊNCIA N8N  
> **Data**: 2025-08-19  
> **Fontes**: [docs.n8n.io - Core Nodes](https://docs.n8n.io/integrations/builtin/core-nodes/), [docs.n8n.io - Hosting](https://docs.n8n.io/hosting/), [GitHub n8n-io/n8n](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base), exemplos reais de workflow exportados

---

## Índice

1. [Estrutura Completa do JSON de Workflow](#1-estrutura-completa-do-json-de-workflow)
2. [Tipos de Node Mais Comuns e Suas Propriedades](#2-tipos-de-node-mais-comuns-e-suas-propriedades)
3. [Como Connections `main` Funcionam](#3-como-connections-main-funcionam)
4. [Credenciais no JSON](#4-credenciais-no-json)
5. [Webhooks](#5-webhooks)
6. [Essencial vs Opcional para Recriar Comportamento](#6-essencial-vs-opcional-para-recriar-comportamento)
7. [cURL da REST API do n8n](#7-curl-da-rest-api-do-n8n)

---

## 1. Estrutura Completa do JSON de Workflow

### 1.1 Visão Geral da Estrutura Raiz

```json
{
  "name": "string",
  "nodes": [],
  "connections": {},
  "settings": {},
  "staticData": null,
  "pinData": {},
  "meta": {},
  "id": "string",
  "tags": [],
  "active": false,
  "versionId": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### 1.2 Campos Detalhados

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ | Nome legível do workflow |
| `nodes` | array | ✅ | Lista de nós (ver seção 2) |
| `connections` | object | ✅ | Mapa de conexões entre nós (ver seção 3) |
| `settings` | object | ❌ | Configurações globais do workflow |
| `staticData` | object/null | ❌ | Dados estáticos persistidos entre execuções |
| `pinData` | object | ❌ | Dados fixados para testes (ver 1.5) |
| `meta` | object | ❌ | Metadados visuais (posição no canvas, etc.) |
| `id` | string | ❌ | UUID do workflow (gerado pelo n8n) |
| `tags` | array | ❌ | Tags para organização |
| `active` | boolean | ❌ | Se o workflow está ativo (escuta triggers) |
| `versionId` | string | ❌ | ID da versão atual |
| `createdAt` | string (ISO8601) | ❌ | Data de criação |
| `updatedAt` | string (ISO8601) | ❌ | Data de atualização |

### 1.3 Estrutura de `settings`

```json
{
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": true,
    "saveExecutionProgress": true,
    "executionTimeout": 3600,
    "errorWorkflow": "workflow-id-or-name",
    "timezone": "America/Sao_Paulo",
    "callerPolicy": "workflowsFromSameOwner"
  }
}
```

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `executionOrder` | string | `"v1"` | Ordem de execução (v1 = legacy, v2 = topological) |
| `saveManualExecutions` | boolean | `true` | Salvar execuções manuais |
| `saveExecutionProgress` | boolean | `true` | Salvar progresso durante execução |
| `executionTimeout` | number | `3600` | Timeout global em segundos |
| `errorWorkflow` | string | `""` | Workflow de erro para notificações |
| `timezone` | string | `"UTC"` | Timezone para agendamentos |
| `callerPolicy` | string | `"workflowsFromSameOwner"` | Quem pode chamar este workflow |

### 1.4 Estrutura de `meta` (Posicionamento Visual)

```json
{
  "meta": {
    "instanceId": "workflow-id",
    "templateCredsSetupCompleted": true,
    "position": { "x": 0, "y": 0 }
  }
}
```

> **Nota**: O campo `position` controla onde o workflow aparece no canvas do editor. Não afeta execução.

### 1.5 Estrutura de `pinData` (Dados Fixados para Testes)

```json
{
  "pinData": {
    "Node Name": [
      {
        "json": { "field": "value" },
        "binary": {}
      }
    ]
  }
}
```

- **Chave**: Nome do nó (string)
- **Valor**: Array de itens de dados (cada item tem `json` e `binary`)
- **Uso**: Permite reexecutar nós downstream sem rodar upstream — essencial para testes e debug

---

## 2. Tipos de Node Mais Comuns e Suas Propriedades

### 2.1 Estrutura Base de Todo Node

```json
{
  "parameters": {},
  "name": "string",
  "type": "string",
  "typeVersion": number,
  "position": [x, y],
  "credentials": {},
  "disabled": false,
  "notesInFlow": "",
  "notes": "",
  "retryOnFail": false,
  "maxTries": 3,
  "waitBetweenTries": 1000,
  "alwaysOutputData": false,
  "executeOnce": false,
  "continueOnFail": false,
  "runOnceForAllItems": false,
  "executeOnce": false
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `parameters` | object | ✅ | Parâmetros específicos do tipo de nó |
| `name` | string | ✅ | Nome único do nó no workflow |
| `type` | string | ✅ | Tipo do nó (ex: `n8n-nodes-base.httpRequest`) |
| `typeVersion` | number | ✅ | Versão do tipo de nó |
| `position` | array[number, number] | ✅ | Posição [x, y] no canvas |
| `credentials` | object | ❌ | Referências a credenciais (ver seção 4) |
| `disabled` | boolean | ❌ | Se o nó está desabilitado |
| `notesInFlow` | string | ❌ | Nota exibida no canvas |
| `notes` | string | ❌ | Nota completa (lado direito) |
| `retryOnFail` | boolean | ❌ | Tentar novamente em falha |
| `maxTries` | number | ❌ | Máximo de tentativas (padrão: 3) |
| `waitBetweenTries` | number | ❌ | Intervalo entre tentativas em ms (padrão: 1000) |
| `alwaysOutputData` | boolean | ❌ | Sempre outputar dados mesmo se vazio |
| `executeOnce` | boolean | ❌ | Executar apenas uma vez para todos os itens |
| `continueOnFail` | boolean | ❌ | Continuar workflow mesmo se falhar |
| `runOnceForAllItems` | boolean | ❌ | Executar uma vez para todos os itens de input |

---

### 2.2 Webhook Node (Trigger)

**Tipo**: `n8n-nodes-base.webhook`  
**Versão**: 1  
**Categoria**: Trigger

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "webhook/meu-webhook",
    "responseMode": "onReceived",
    "responseCode": 200,
    "responseData": "{{ $json }}",
    "options": {
      "rawBody": false,
      "allowUnknownPaths": false
    }
  },
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 1,
  "position": [250, 300],
  "webhookId": "unique-webhook-id"
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `httpMethod` | string | ✅ | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `path` | string | ✅ | Caminho do webhook (ex: `webhook/meu-endpoint`) |
| `responseMode` | string | ❌ | `onReceived` (imediato), `lastNode` (após execução), `responseNode` (via Webhook Response) |
| `responseCode` | number | ❌ | Código HTTP de resposta (padrão: 200) |
| `responseData` | string | ❌ | Dados de resposta (expressão n8n) |
| `options.rawBody` | boolean | ❌ | Receber body raw sem parse |
| `options.allowUnknownPaths` | boolean | ❌ | Permitir paths não registrados |

**Saída**: `{{ $json }}` = body da requisição, `{{ $query }}` = query params, `{{ $header }}` = headers

---

### 2.3 Schedule Trigger (Cron)

**Tipo**: `n8n-nodes-base.cron`  
**Versão**: 1  
**Categoria**: Trigger

```json
{
  "parameters": {
    "triggerTimes": {
      "item": [
        {
          "mode": "cron",
          "cronExpression": "0 9 * * 1-5",
          "timezone": "America/Sao_Paulo"
        }
      ]
    }
  },
  "name": "Cron",
  "type": "n8n-nodes-base.cron",
  "typeVersion": 1,
  "position": [250, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `triggerTimes.item[].mode` | string | ✅ | `cron`, `everyX`, `atSpecificTime` |
| `triggerTimes.item[].cronExpression` | string | ✅ (se mode=cron) | Expressão cron padrão (5 ou 6 campos) |
| `triggerTimes.item[].timezone` | string | ❌ | Timezone (padrão: workflow timezone) |
| `triggerTimes.item[].hour` | number | ✅ (se mode=atSpecificTime) | Hora (0-23) |
| `triggerTimes.item[].minute` | number | ✅ (se mode=atSpecificTime) | Minuto (0-59) |
| `triggerTimes.item[].unit` | string | ✅ (se mode=everyX) | `minutes`, `hours`, `days`, `weeks` |
| `triggerTimes.item[].value` | number | ✅ (se mode=everyX) | Valor do intervalo |

**Expressão Cron**: `minuto hora dia-mês mês dia-semana` (ex: `0 9 * * 1-5` = 9h em dias úteis)

---

### 2.4 HTTP Request Node

**Tipo**: `n8n-nodes-base.httpRequest`  
**Versão**: 4.1 (latest)  
**Categoria**: Action

```json
{
  "parameters": {
    "url": "https://api.exemplo.com/endpoint",
    "method": "POST",
    "authentication": "none",
    "headers": {
      "parameters": [
        { "name": "Content-Type", "value": "application/json" },
        { "name": "Authorization", "value": "Bearer {{ $credentials.apiKey }}" }
      ]
    },
    "queryParameters": {
      "parameters": [
        { "name": "limit", "value": "10" }
      ]
    },
    "bodyContentType": "json",
    "jsonParameters": true,
    "options": {
      "timeout": 30000,
      "followRedirect": true,
      "maxRedirects": 10,
      "rejectUnauthorized": true
    },
    "bodyParametersJson": "{ \"campo\": \"{{ $json.valor }}\" }"
  },
  "name": "HTTP Request",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.1,
  "position": [450, 300],
  "credentials": {
    "httpBasicAuth": "Minha Credencial HTTP"
  }
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `url` | string | ✅ | URL da requisição (suporta expressões) |
| `method` | string | ✅ | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `authentication` | string | ❌ | `none`, `basicAuth`, `headerAuth`, `oAuth1Api`, `oAuth2Api`, `digestAuth` |
| `headers.parameters[]` | array | ❌ | Array de `{name, value}` para headers |
| `queryParameters.parameters[]` | array | ❌ | Query string parameters |
| `bodyContentType` | string | ❌ | `json`, `form`, `raw`, `file`, `none` |
| `jsonParameters` | boolean | ❌ | Se body é JSON (para `json` contentType) |
| `bodyParametersJson` | string | ❌ | Body JSON como string (suporta expressões) |
| `options.timeout` | number | ❌ | Timeout em ms (padrão: 30000) |
| `options.followRedirect` | boolean | ❌ | Seguir redirects (padrão: true) |
| `options.rejectUnauthorized` | boolean | ❌ | Validar certificado SSL (padrão: true) |

---

### 2.5 IF Node (Condicional Binário)

**Tipo**: `n8n-nodes-base.if`  
**Versão**: 1  
**Categoria**: Flow Control

```json
{
  "parameters": {
    "conditions": {
      "string": [
        {
          "value1": "{{ $json.status }}",
          "operation": "equal",
          "value2": "active"
        }
      ],
      "number": [],
      "boolean": [],
      "dateTime": [],
      "binary": []
    },
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "rightValue": ""
    }
  },
  "name": "IF",
  "type": "n8n-nodes-base.if",
  "typeVersion": 1,
  "position": [450, 200]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `conditions.string[]` | array | ❌ | Condições de string |
| `conditions.number[]` | array | ❌ | Condições numéricas |
| `conditions.boolean[]` | array | ❌ | Condições booleanas |
| `conditions.dateTime[]` | array | ❌ | Condições de data/hora |
| `conditions.binary[]` | array | ❌ | Condições de dados binários |
| `conditions[].value1` | string | ✅ | Valor esquerdo (expressão) |
| `conditions[].operation` | string | ✅ | Operador (ver abaixo) |
| `conditions[].value2` | string | ✅ | Valor direito (expressão) |
| `options.caseSensitive` | boolean | ❌ | Case sensitive para strings |

**Operadores String**: `equal`, `notEqual`, `contains`, `notContains`, `startsWith`, `endsWith`, `regex`, `isEmpty`, `isNotEmpty`  
**Operadores Number**: `equal`, `notEqual`, `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`, `isEmpty`, `isNotEmpty`  
**Operadores Boolean**: `true`, `false`  
**Operadores DateTime**: `equal`, `notEqual`, `before`, `after`, `isEmpty`, `isNotEmpty`

**Saídas**: `true` (condição atendida) e `false` (não atendida)

---

### 2.6 Switch Node (Múltiplos Casos)

**Tipo**: `n8n-nodes-base.switch`  
**Versão**: 1  
**Categoria**: Flow Control

```json
{
  "parameters": {
    "mode": "value",
    "value": "{{ $json.tipo }}",
    "rules": {
      "rules": [
        {
          "output": "cliente",
          "operation": "equal",
          "value": "cliente"
        },
        {
          "output": "fornecedor",
          "operation": "equal",
          "value": "fornecedor"
        }
      ]
    },
    "defaultOutput": "outros"
  },
  "name": "Switch",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 1,
  "position": [450, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `value` (comparar valor), `expression` (expressão booleana) |
| `value` | string | ✅ (se mode=value) | Valor a comparar (expressão) |
| `rules.rules[]` | array | ❌ | Regras de caso |
| `rules.rules[].output` | string | ✅ | Nome da saída (label no canvas) |
| `rules.rules[].operation` | string | ✅ | Operador de comparação |
| `rules.rules[].value` | string | ✅ | Valor esperado |
| `defaultOutput` | string | ❌ | Saída padrão (fallback) |

**Saídas**: Uma para cada regra + `defaultOutput` se definido

---

### 2.7 Code Node (JavaScript/TypeScript Customizado)

**Tipo**: `n8n-nodes-base.function` ou `n8n-nodes-base.functionItem`  
**Versão**: 1/2  
**Categoria**: Transform

```json
{
  "parameters": {
    "functionCode": "const items = $input.all();\nreturn items.map(item => ({\n  json: {\n    ...item.json,\n    processed: true,\n    timestamp: new Date().toISOString()\n  }\n}));"
  },
  "name": "Code",
  "type": "n8n-nodes-base.function",
  "typeVersion": 1,
  "position": [450, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `functionCode` | string | ✅ | Código JavaScript/TypeScript |

**Variáveis Disponíveis no Código**:
- `$input` - Input items (`$input.all()`, `$input.first()`, `$input.item`)
- `$parameter` - Parâmetros do nó
- `$json` - JSON do item atual (functionItem)
- `$item` - Item completo atual
- `$node` - Metadados do nó
- `$workflow` - Metadados do workflow
- `$now` - Date atual
- `$credentials` - Credenciais resolvidas
- `$helpers` - Helpers (ex: `$helpers.request()`)

**Retorno**: Array de objetos `{ json: {}, binary: {} }` ou `return items` (function) / `return item` (functionItem)

---

### 2.8 Merge Node (Juntar Branches)

**Tipo**: `n8n-nodes-base.merge`  
**Versão**: 1  
**Categoria**: Flow Control

```json
{
  "parameters": {
    "mode": "wait",
    "combine": "all",
    "options": {
      "includeInputData": true
    }
  },
  "name": "Merge",
  "type": "n8n-nodes-base.merge",
  "typeVersion": 1,
  "position": [650, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `wait` (aguardar todas), `choose` (escolher branch), `multiplex` (um por item) |
| `combine` | string | ✅ (se mode=wait) | `all` (todos inputs), `first` (primeiro), `last` (último) |
| `options.includeInputData` | boolean | ❌ | Incluir dados de input no output |

**Modos**:
- `wait`: Aguarda todas as conexões de entrada chegarem
- `choose`: Usa regra para escolher qual branch prosseguir
- `multiplex`: Processa cada item de cada branch separadamente

---

### 2.9 Split In Batches Node (Processar em Lotes)

**Tipo**: `n8n-nodes-base.splitInBatches`  
**Versão**: 1  
**Categoria**: Flow Control

```json
{
  "parameters": {
    "batchSize": 10,
    "options": {
      "reset": false
    }
  },
  "name": "Split In Batches",
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 1,
  "position": [450, 400]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `batchSize` | number | ✅ | Tamanho do lote |
| `options.reset` | boolean | ❌ | Resetar contador a cada execução |

**Comportamento**: Recebe array de items, outputa `batchSize` items por execução, loopa até acabar

---

### 2.10 Set Node (Definir/Transformar Dados)

**Tipo**: `n8n-nodes-base.set`  
**Versão**: 3.2 (latest)  
**Categoria**: Transform

```json
{
  "parameters": {
    "mode": "manual",
    "values": {
      "string": [
        {
          "name": "novoCampo",
          "value": "valor fixo"
        }
      ],
      "number": [
        {
          "name": "idade",
          "value": "={{ $json.idade * 2 }}"
        }
      ],
      "boolean": [],
      "json": [
        {
          "name": "metadata",
          "value": "={{ { source: 'n8n', processed: true } }}"
        }
      ]
    },
    "options": {
      "keepOnlySet": false
    }
  },
  "name": "Set",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.2,
  "position": [450, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `manual` (definir campos), `autoMap` (mapear automaticamente) |
| `values.string[]` | array | ❌ | Campos string |
| `values.number[]` | array | ❌ | Campos numéricos |
| `values.boolean[]` | array | ❌ | Campos booleanos |
| `values.json[]` | array | ❌ | Campos JSON (objetos complexos) |
| `values[].name` | string | ✅ | Nome do campo |
| `values[].value` | string | ✅ | Valor (suporta expressões `={{ ... }}`) |
| `options.keepOnlySet` | boolean | ❌ | Manter apenas campos definidos (dropar resto) |

---

### 2.11 Form Trigger Node

**Tipo**: `n8n-nodes-base.formTrigger`  
**Versão**: 1  
**Categoria**: Trigger

```json
{
  "parameters": {
    "formTitle": "Meu Formulário",
    "formDescription": "Descrição do formulário",
    "fields": {
      "values": [
        {
          "fieldType": "text",
          "fieldLabel": "Nome",
          "fieldName": "nome",
          "required": true,
          "placeholder": "Digite seu nome"
        },
        {
          "fieldType": "email",
          "fieldLabel": "Email",
          "fieldName": "email",
          "required": true
        },
        {
          "fieldType": "select",
          "fieldLabel": "Categoria",
          "fieldName": "categoria",
          "options": [
            { "label": "Opção 1", "value": "opt1" },
            { "label": "Opção 2", "value": "opt2" }
          ]
        }
      ]
    },
    "options": {
      "successMessage": "Enviado com sucesso!",
      "redirectUrl": "https://exemplo.com/obrigado"
    }
  },
  "name": "Form Trigger",
  "type": "n8n-nodes-base.formTrigger",
  "typeVersion": 1,
  "position": [250, 300],
  "webhookId": "form-webhook-id"
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `formTitle` | string | ✅ | Título do formulário |
| `formDescription` | string | ❌ | Descrição |
| `fields.values[]` | array | ✅ | Campos do formulário |
| `fields.values[].fieldType` | string | ✅ | `text`, `email`, `number`, `textarea`, `select`, `checkbox`, `radio`, `date`, `file` |
| `fields.values[].fieldLabel` | string | ✅ | Label visível |
| `fields.values[].fieldName` | string | ✅ | Nome do campo (chave no JSON) |
| `fields.values[].required` | boolean | ❌ | Campo obrigatório |
| `fields.values[].placeholder` | string | ❌ | Placeholder |
| `fields.values[].options[]` | array | ❌ | Para select/radio/checkbox: `{label, value}` |
| `options.successMessage` | string | ❌ | Mensagem de sucesso |
| `options.redirectUrl` | string | ❌ | URL de redirecionamento após submit |

---

### 2.12 Error Trigger Node

**Tipo**: `n8n-nodes-base.errorTrigger`  
**Versão**: 1  
**Categoria**: Trigger

```json
{
  "parameters": {
    "workflowIds": ["workflow-id-1", "workflow-id-2"],
    "include": "all"
  },
  "name": "Error Trigger",
  "type": "n8n-nodes-base.errorTrigger",
  "typeVersion": 1,
  "position": [250, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowIds` | array[string] | ❌ | IDs dos workflows para monitorar (vazio = todos) |
| `include` | string | ❌ | `all` (todos erros), `production` (só produção) |

**Saída**: `{ json: { error: {...}, workflow: {...}, execution: {...} } }`

---

### 2.13 Wait Node (Aguardar)

**Tipo**: `n8n-nodes-base.wait`  
**Versão**: 1.1 (latest)  
**Categoria**: Flow Control

```json
{
  "parameters": {
    "amount": 5,
    "unit": "minutes",
    "options": {
      "resumeOn": "webhook",
      "webhookUrl": "https://meu-app.com/resume"
    }
  },
  "name": "Wait",
  "type": "n8n-nodes-base.wait",
  "typeVersion": 1.1,
  "position": [450, 300]
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `amount` | number | ✅ | Quantidade de tempo |
| `unit` | string | ✅ | `seconds`, `minutes`, `hours`, `days`, `weeks` |
| `options.resumeOn` | string | ❌ | `time` (tempo), `webhook` (webhook externo) |
| `options.webhookUrl` | string | ✅ (se resumeOn=webhook) | URL para receber resume |

---

### 2.14 LLM / OpenAI Node

**Tipo**: `n8n-nodes-base.openAi` ou `@n8n/n8n-nodes-langchain.openAi`  
**Versão**: 1  
**Categoria**: AI/Transform

```json
{
  "parameters": {
    "model": "gpt-4o-mini",
    "operation": "chat",
    "messages": {
      "values": [
        {
          "role": "system",
          "content": "Você é um assistente útil."
        },
        {
          "role": "user",
          "content": "={{ $json.pergunta }}"
        }
      ]
    },
    "options": {
      "temperature": 0.7,
      "maxTokens": 2000,
      "topP": 1,
      "frequencyPenalty": 0,
      "presencePenalty": 0
    }
  },
  "name": "OpenAI",
  "type": "@n8n/n8n-nodes-langchain.openAi",
  "typeVersion": 1,
  "position": [450, 300],
  "credentials": {
    "openAiApi": "Minha OpenAI API"
  }
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `model` | string | ✅ | Modelo (ex: `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`) |
| `operation` | string | ✅ | `chat`, `completion`, `embeddings`, `image` |
| `messages.values[]` | array | ✅ (chat) | Array de mensagens `{role, content}` |
| `messages.values[].role` | string | ✅ | `system`, `user`, `assistant`, `tool` |
| `messages.values[].content` | string | ✅ | Conteúdo (suporta expressões) |
| `options.temperature` | number | ❌ | 0-2 (padrão: 0.7) |
| `options.maxTokens` | number | ❌ | Max tokens na resposta |
| `options.topP` | number | ❌ | Nucleus sampling |

---

### 2.15 Telegram Node

**Tipo**: `n8n-nodes-base.telegram`  
**Versão**: 1  
**Categoria**: Communication

```json
{
  "parameters": {
    "operation": "sendMessage",
    "chatId": "={{ $json.chatId }}",
    "text": "={{ $json.mensagem }}",
    "options": {
      "parseMode": "Markdown",
      "disableNotification": false
    }
  },
  "name": "Telegram",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1,
  "position": [450, 300],
  "credentials": {
    "telegramApi": "Meu Bot Telegram"
  }
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `sendMessage`, `sendPhoto`, `sendDocument`, `editMessage`, `deleteMessage`, `getUpdates` |
| `chatId` | string | ✅ | Chat ID (suporta expressão) |
| `text` | string | ✅ (sendMessage) | Texto da mensagem |
| `options.parseMode` | string | ❌ | `Markdown`, `HTML`, `None` |
| `options.disableNotification` | boolean | ❌ | Enviar silenciosamente |

---

### 2.16 Gmail Node

**Tipo**: `n8n-nodes-base.gmail`  
**Versão**: 1.2 (latest)  
**Categoria**: Communication

```json
{
  "parameters": {
    "operation": "send",
    "fromEmail": "me@gmail.com",
    "toEmail": "={{ $json.email }}",
    "subject": "={{ $json.assunto }}",
    "text": "={{ $json.corpo }}",
    "options": {
      "cc": "",
      "bcc": "",
      "attachments": []
    }
  },
  "name": "Gmail",
  "type": "n8n-nodes-base.gmail",
  "typeVersion": 1.2,
  "position": [450, 300],
  "credentials": {
    "gmailOAuth2Api": "Minha Conta Gmail"
  }
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `send`, `get`, `getAll`, `delete`, `modifyLabels`, `sendRaw` |
| `fromEmail` | string | ✅ (send) | Email remetente |
| `toEmail` | string | ✅ (send) | Email destinatário |
| `subject` | string | ✅ (send) | Assunto |
| `text` | string | ✅ (send) | Corpo texto |
| `html` | string | ❌ (send) | Corpo HTML |
| `options.attachments[]` | array | ❌ | Anexos (binary data) |

---

### 2.17 Google Sheets Node

**Tipo**: `n8n-nodes-base.googleSheets`  
**Versão**: 4.1 (latest)  
**Categoria**: Data

```json
{
  "parameters": {
    "operation": "append",
    "sheetId": "1ABC...XYZ",
    "range": "A:Z",
    "options": {
      "valueInputMode": "USER_ENTERED",
      "includeHeaders": true
    },
    "columns": {
      "mappingMode": "defineBelow",
      "value": [
        { "columnName": "Nome", "value": "={{ $json.nome }}" },
        { "columnName": "Email", "value": "={{ $json.email }}" },
        { "columnName": "Data", "value": "={{ $now }}" }
      ]
    }
  },
  "name": "Google Sheets",
  "type": "n8n-nodes-base.googleSheets",
  "typeVersion": 4.1,
  "position": [450, 300],
  "credentials": {
    "googleSheetsOAuth2Api": "Minha Conta Google Sheets"
  }
}
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `append`, `get`, `getAll`, `update`, `delete`, `clear` |
| `sheetId` | string | ✅ | ID da planilha (da URL) |
| `range` | string | ✅ | Range A1 notation (ex: `A:Z`, `Sheet1!A1:D10`) |
| `options.valueInputMode` | string | ❌ | `RAW`, `USER_ENTERED` |
| `columns.mappingMode` | string | ✅ | `defineBelow`, `autoMapInputData` |
| `columns.value[]` | array | ✅ (se defineBelow) | Mapeamento coluna → valor |

---

## 3. Como Connections `main` Funcionam

### 3.1 Estrutura Geral

```json
{
  "connections": {
    "Nome do Nó Origem": {
      "main": [
        [
          {
            "node": "Nome do Nó Destino",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 3.2 Explicação da Estrutura Aninhada

```
connections
  └── "Source Node Name"           ← Nó de origem (chave = nome do nó)
      └── "main"                   ← Tipo de conexão (sempre "main" para fluxo principal)
          └── [                    ← Array de OUTPUTS do nó origem (índice = output port)
              [                    ← Array de CONEXÕES para esse output port
                  {                ← Cada conexão individual
                    "node": "Target Node Name",  ← Nome do nó destino
                    "type": "main",              ← Tipo de input no destino ("main")
                    "index": 0                   ← Índice do input port no destino
                  }
              ]
          ]
```

### 3.3 Exemplo Completo: Múltiplas Conexões

```json
{
  "connections": {
    "Webhook": {
      "main": [
        [
          { "node": "IF", "type": "main", "index": 0 }
        ]
      ]
    },
    "IF": {
      "main": [
        [
          { "node": "HTTP Request - Sucesso", "type": "main", "index": 0 }
        ],
        [
          { "node": "Set - Erro", "type": "main", "index": 0 }
        ]
      ]
    },
    "HTTP Request - Sucesso": {
      "main": [
        [
          { "node": "Merge", "type": "main", "index": 0 }
        ]
      ]
    },
    "Set - Erro": {
      "main": [
        [
          { "node": "Merge", "type": "main", "index": 1 }
        ]
      ]
    }
  }
}
```

### 3.4 Regras Importantes

| Regra | Descrição |
|-------|-----------|
| **Output Ports** | Índice do array externo = porta de saída do nó origem (0 = primeira saída, 1 = segunda, etc.) |
| **Múltiplas conexões por porta** | Array interno pode ter múltiplos objetos → fan-out (um output → vários inputs) |
| **Input Ports** | `index` no objeto = porta de entrada no nó destino (0 = main input, 1 = segundo input, etc.) |
| **IF Node** | Output 0 = `true`, Output 1 = `false` |
| **Switch Node** | Output index = ordem das rules + defaultOutput por último |
| **Merge Node** | Input 0 = primeira conexão, Input 1 = segunda, etc. |
| **Nós sem saída** | Nós finais (sem conexões) não aparecem como chaves em `connections` |

---

## 4. Credenciais no JSON

### 4.1 Estrutura de Referência

```json
{
  "credentials": {
    "credentialTypeName": "Credential Name"
  }
}
```

### 4.2 Exemplos por Tipo

**HTTP Basic Auth**:
```json
"credentials": {
  "httpBasicAuth": "Minha API Key"
}
```

**OAuth2 (Google, GitHub, etc.)**:
```json
"credentials": {
  "googleOAuth2Api": "Minha Conta Google",
  "githubOAuth2Api": "Minha Conta GitHub"
}
```

**API Key Header**:
```json
"credentials": {
  "headerAuth": "Minha API Key Header"
}
```

**Telegram Bot**:
```json
"credentials": {
  "telegramApi": "Meu Bot Telegram"
}
```

**OpenAI**:
```json
"credentials": {
  "openAiApi": "Minha OpenAI API"
}
```

### 4.3 Como as Credenciais São Resolvidas em Runtime

1. No JSON do workflow: apenas **referência pelo nome** (`"telegramApi": "Meu Bot"`)
2. Credenciais reais ficam **criptografadas no banco** (tabela `credentials`)
3. Na execução: n8n resolve o nome → descriptografa → injeta no nó via `$credentials`
4. **NUNCA** as credenciais reais vão no JSON exportado

### 4.4 Estrutura Interna de Credencial (Banco de Dados)

```json
{
  "id": "cred-id",
  "name": "Meu Bot Telegram",
  "type": "telegramApi",
  "data": {
    "accessToken": "encrypted:bot-token-here"
  },
  "nodesAccess": [],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

## 5. Webhooks

### 5.1 Configuração no Webhook Node

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "webhook/meu-endpoint",
    "responseMode": "onReceived",
    "responseCode": 200,
    "responseData": "{{ $json }}",
    "options": {}
  },
  "type": "n8n-nodes-base.webhook",
  "webhookId": "abc123-def456-ghi789"
}
```

### 5.2 Campos de Webhook

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `httpMethod` | string | Método HTTP aceito (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) |
| `path` | string | Path relativo (prefixo `/webhook/` é automático) |
| `responseMode` | string | `onReceived` (resposta imediata), `lastNode` (após workflow), `responseNode` (via Webhook Response node) |
| `responseCode` | number | HTTP status code |
| `responseData` | string | Body da resposta (expressão n8n) |
| `webhookId` | string | ID único gerado pelo n8n (usado na URL final) |

### 5.3 URL Final do Webhook

```
Produção: https://seu-dominio.com/webhook/meu-endpoint
Desenvolvimento: https://seu-tunel.ngrok-free.app/webhook/meu-endpoint
```

> **Nota**: O `webhookId` é usado internamente para roteamento. A URL pública usa o `path` definido.

### 5.4 Webhook Response Node (Para responseMode=responseNode)

**Tipo**: `n8n-nodes-base.webhookResponse`  
**Versão**: 1

```json
{
  "parameters": {
    "options": {
      "responseCode": 200,
      "responseData": "{{ $json }}",
      "responseHeaders": {
        "parameters": [
          { "name": "Content-Type", "value": "application/json" }
        ]
      }
    }
  },
  "name": "Webhook Response",
  "type": "n8n-nodes-base.webhookResponse",
  "typeVersion": 1,
  "position": [650, 300]
}
```

---

## 6. Essencial vs Opcional para Recriar Comportamento

### 6.1 Campos ESSENCIAIS (Must Have)

| Componente | Campos Essenciais |
|------------|-------------------|
| **Workflow** | `name`, `nodes[]`, `connections{}`, `active` |
| **Node** | `parameters{}`, `name`, `type`, `typeVersion`, `position[]` |
| **Connection** | Estrutura completa `connections["Source"]["main"][][]` com `node`, `type`, `index` |
| **Trigger Nodes** | `webhookId` (para webhooks), configuração de trigger (cron expression, path, etc.) |
| **Credential Reference** | `credentials: { "credType": "credName" }` |
| **Settings** | `executionTimeout`, `timezone`, `errorWorkflow` |

### 6.2 Campos IMPORTANTES (Should Have)

| Componente | Campos Importantes |
|------------|-------------------|
| **Node** | `retryOnFail`, `maxTries`, `waitBetweenTries`, `continueOnFail`, `disabled` |
| **Workflow** | `settings.executionOrder`, `settings.saveManualExecutions`, `tags[]` |
| **Webhook** | `responseMode`, `responseCode`, `options.rawBody` |
| **HTTP Request** | `options.timeout`, `options.followRedirect`, `authentication` |
| **Code Node** | `functionCode` completo |
| **IF/Switch** | `conditions` ou `rules` completos |

### 6.3 Campos OPCIONAIS (Nice to Have)

| Componente | Campos Opcionais |
|------------|-------------------|
| **Workflow** | `id`, `versionId`, `createdAt`, `updatedAt`, `meta`, `staticData`, `pinData` |
| **Node** | `notes`, `notesInFlow`, `executeOnce`, `runOnceForAllItems`, `alwaysOutputData` |
| **Settings** | `callerPolicy` |
| **Merge** | `options.includeInputData` |
| **SplitInBatches** | `options.reset` |

### 6.4 Comportamentos que Precisam Ser Replicados

| Comportamento | Complexidade | Prioridade |
|---------------|--------------|------------|
| Expression engine (`{{ $json.path }}`) | Alta | 🔴 Crítica |
| Credential resolution (decrypt + inject) | Alta | 🔴 Crítica |
| DAG execution (topological order) | Média | 🔴 Crítica |
| Retry with backoff | Média | 🟡 Alta |
| Continue on fail | Baixa | 🟡 Alta |
| Pin data para testes | Baixa | 🟢 Média |
| Webhook response modes | Média | 🟡 Alta |
| Binary data handling | Alta | 🟢 Média |
| Sandbox para Code node | Alta | 🔴 Crítica |
| Error workflow triggering | Média | 🟡 Alta |

---

## 7. cURL da REST API do n8n

### 7.1 Autenticação

```bash
# Header obrigatório
-H "X-N8N-API-KEY: sua-api-key-aqui"

# Ou via Bearer token (n8n cloud)
-H "Authorization: Bearer seu-token"
```

### 7.2 Listar Workflows

```bash
curl -X GET "https://seu-n8n.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Accept: application/json"
```

**Resposta**:
```json
{
  "data": [
    {
      "id": "workflow-id",
      "name": "Meu Workflow",
      "active": true,
      "tags": [],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "versionId": "version-id"
    }
  ],
  "nextCursor": null
}
```

### 7.3 Obter Workflow Específico

```bash
curl -X GET "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Accept: application/json"
```

**Resposta**: JSON completo do workflow (estrutura da seção 1)

### 7.4 Criar Workflow

```bash
curl -X POST "https://seu-n8n.com/api/v1/workflows" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Novo Workflow",
    "nodes": [...],
    "connections": {...},
    "settings": {},
    "active": false
  }'
```

### 7.5 Atualizar Workflow

```bash
curl -X PUT "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nome Atualizado",
    "nodes": [...],
    "connections": {...},
    "active": true
  }'
```

### 7.6 Importar Workflow (de JSON exportado)

```bash
curl -X POST "https://seu-n8n.com/api/v1/workflows/import" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Content-Type: application/json" \
  -d @workflow-exportado.json
```

> **Nota**: O import aceita o JSON completo exportado (inclui `id`, `versionId`, etc. — o n8n regenera IDs)

### 7.7 Ativar/Desativar Workflow

```bash
# Ativar
curl -X POST "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID/activate" \
  -H "X-N8N-API-KEY: sua-api-key"

# Desativar
curl -X POST "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID/deactivate" \
  -H "X-N8N-API-KEY: sua-api-key"
```

### 7.8 Executar Workflow Manualmente

```bash
curl -X POST "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID/run" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "data": { "campo": "valor" }
  }'
```

### 7.9 Listar Execuções

```bash
curl -X GET "https://seu-n8n.com/api/v1/executions?workflowId=WORKFLOW_ID&limit=50" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Accept: application/json"
```

### 7.10 Obter Execução Específica

```bash
curl -X GET "https://seu-n8n.com/api/v1/executions/EXECUTION_ID" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Accept: application/json"
```

### 7.11 Deletar Workflow

```bash
curl -X DELETE "https://seu-n8n.com/api/v1/workflows/WORKFLOW_ID" \
  -H "X-N8N-API-KEY: sua-api-key"
```

### 7.12 Credenciais - Listar

```bash
curl -X GET "https://seu-n8n.com/api/v1/credentials" \
  -H "X-N8N-API-KEY: sua-api-key" \
  -H "Accept: application/json"
```

### 7.13 Webhook Test (Chamar webhook de desenvolvimento)

```bash
curl -X POST "https://seu-n8n.com/webhook-test/meu-endpoint" \
  -H "Content-Type: application/json" \
  -d '{"teste": "dados"}'
```

> **Nota**: `webhook-test/` é para workflows **inativos** (modo teste). Workflows ativos usam `/webhook/`.

---

## Apêndice: Exemplo Completo de Workflow Exportado

```json
{
  "name": "Exemplo Completo - Webhook → IF → HTTP → Merge → Google Sheets",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "webhook/lead",
        "responseMode": "onReceived",
        "responseCode": 200
      },
      "name": "Webhook Lead",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "lead-webhook-123"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            { "value1": "{{ $json.origem }}", "operation": "equal", "value2": "site" }
          ]
        }
      },
      "name": "IF - Origem Site",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [450, 200]
    },
    {
      "parameters": {
        "url": "https://api.crm.com/leads",
        "method": "POST",
        "bodyContentType": "json",
        "jsonParameters": true,
        "bodyParametersJson": "{ \"nome\": \"{{ $json.nome }}\", \"email\": \"{{ $json.email }}\", \"origem\": \"{{ $json.origem }}\" }"
      },
      "name": "HTTP - Criar Lead CRM",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [650, 100],
      "credentials": { "httpHeaderAuth": "CRM API Key" }
    },
    {
      "parameters": {
        "mode": "manual",
        "values": {
          "string": [
            { "name": "status", "value": "erro_origem" }
          ]
        }
      },
      "name": "Set - Erro Origem",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.2,
      "position": [650, 300]
    },
    {
      "parameters": {
        "mode": "wait",
        "combine": "all"
      },
      "name": "Merge Results",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 1,
      "position": [850, 200]
    },
    {
      "parameters": {
        "operation": "append",
        "sheetId": "1ABC...XYZ",
        "range": "A:D",
        "columns": {
          "mappingMode": "defineBelow",
          "value": [
            { "columnName": "Nome", "value": "={{ $json.nome }}" },
            { "columnName": "Email", "value": "={{ $json.email }}" },
            { "columnName": "Origem", "value": "={{ $json.origem }}" },
            { "columnName": "Status", "value": "={{ $json.status }}" }
          ]
        }
      },
      "name": "Google Sheets - Log",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.1,
      "position": [1050, 200],
      "credentials": { "googleSheetsOAuth2Api": "Google Sheets Account" }
    }
  ],
  "connections": {
    "Webhook Lead": {
      "main": [[{ "node": "IF - Origem Site", "type": "main", "index": 0 }]]
    },
    "IF - Origem Site": {
      "main": [
        [{ "node": "HTTP - Criar Lead CRM", "type": "main", "index": 0 }],
        [{ "node": "Set - Erro Origem", "type": "main", "index": 0 }]
      ]
    },
    "HTTP - Criar Lead CRM": {
      "main": [[{ "node": "Merge Results", "type": "main", "index": 0 }]]
    },
    "Set - Erro Origem": {
      "main": [[{ "node": "Merge Results", "type": "main", "index": 1 }]]
    },
    "Merge Results": {
      "main": [[{ "node": "Google Sheets - Log", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": true,
    "executionTimeout": 3600,
    "timezone": "America/Sao_Paulo"
  },
  "active": false,
  "meta": {
    "instanceId": "workflow-instance-id",
    "templateCredsSetupCompleted": true
  }
}
```

---

## Fontes e Referências

| Fonte | URL | Conteúdo |
|-------|-----|----------|
| **n8n Core Nodes Docs** | https://docs.n8n.io/integrations/builtin/core-nodes/ | Documentação oficial de todos os nodes built-in |
| **n8n Hosting/Architecture** | https://docs.n8n.io/hosting/ | Arquitetura, deployment, configuração |
| **n8n GitHub - nodes-base** | https://github.com/n8n-io/n8n/tree/master/packages/nodes-base | Código fonte dos 400+ nodes built-in |
| **n8n API Reference** | https://docs.n8n.io/api/ | REST API endpoints |
| **n8n Workflow Export Examples** | Exemplos reais exportados da interface | Estrutura JSON real em produção |
| **n8n License (SUL)** | https://github.com/n8n-io/n8n/blob/master/LICENSE.md | Licença Sustainable Use |

---

**Arquivo**: `n8n-migration/referencia-n8n.md`  
**Próximo passo**: Builder pode usar esta referência para implementar o parser/serializer de workflow JSON e o node registry no AgentFlow.