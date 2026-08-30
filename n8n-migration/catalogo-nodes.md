# Catálogo de Nodes n8n → AgentFlow

> **Missão**: Recriar n8n no AgentFlow  
> **Work dir**: `n8n-migration/`  
> **Papel**: Pane CATÁLOGO DE NODES  
> **Data**: 2026-08-19  
> **Fontes**: [docs.n8n.io - Core Nodes](https://docs.n8n.io/integrations/builtin/core-nodes/), [GitHub n8n-io/n8n packages/nodes-base](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes), [referencia-n8n.md](./referencia-n8n.md), fixtures reais

---

## Resumo dos Tipos Cobertos

| # | Node Type n8n | Categoria | Prioridade | Handler TS Sugerido |
|---|---------------|-----------|------------|---------------------|
| 1 | `n8n-nodes-base.webhook` | Trigger | 🔴 Crítica | `WebhookTriggerHandler` |
| 2 | `n8n-nodes-base.cron` | Trigger | 🔴 Crítica | `CronTriggerHandler` |
| 3 | `n8n-nodes-base.httpRequest` | Action | 🔴 Crítica | `HttpRequestHandler` |
| 4 | `n8n-nodes-base.if` | Flow Control | 🔴 Crítica | `IfNodeHandler` |
| 5 | `n8n-nodes-base.switch` | Flow Control | 🟡 Alta | `SwitchNodeHandler` |
| 6 | `n8n-nodes-base.function` | Transform | 🔴 Crítica | `FunctionNodeHandler` |
| 7 | `n8n-nodes-base.merge` | Flow Control | 🟡 Alta | `MergeNodeHandler` |
| 8 | `n8n-nodes-base.splitInBatches` | Flow Control | 🟡 Alta | `SplitInBatchesHandler` |
| 9 | `n8n-nodes-base.set` | Transform | 🔴 Crítica | `SetNodeHandler` |
| 10 | `@n8n/n8n-nodes-langchain.openAi` | AI/Transform | 🔴 Crítica | `OpenAiNodeHandler` |
| 11 | `n8n-nodes-base.telegram` | Communication | 🟡 Alta | `TelegramNodeHandler` |
| 12 | `n8n-nodes-base.gmail` | Communication | 🟡 Alta | `GmailNodeHandler` |
| 13 | `n8n-nodes-base.googleSheets` | Data | 🟡 Alta | `GoogleSheetsNodeHandler` |
| 14 | `n8n-nodes-base.formTrigger` | Trigger | 🟢 Média | `FormTriggerHandler` |
| 15 | `n8n-nodes-base.errorTrigger` | Trigger | 🟢 Média | `ErrorTriggerHandler` |
| 16 | `n8n-nodes-base.wait` | Flow Control | 🟡 Alta | `WaitNodeHandler` |

---

## 1. Webhook Node (Trigger)

**Tipo n8n**: `n8n-nodes-base.webhook`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Webhook Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Webhook)

### O que faz
Recebe requisições HTTP externas e inicia a execução do workflow. Suporta múltiplos métodos HTTP, resposta imediata ou diferida, e validação de assinatura HMAC.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição | Exemplo |
|-----------|------|-------------|-----------|---------|
| `httpMethod` | string | ✅ | Método HTTP aceito | `POST`, `GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `path` | string | ✅ | Caminho do webhook (sem `/webhook/`) | `lead`, `stripe/events`, `github/push` |
| `responseMode` | string | ❌ | Modo de resposta | `onReceived` (padrão), `lastNode`, `responseNode` |
| `responseCode` | number | ❌ | Código HTTP de resposta | `200`, `201`, `204` |
| `responseData` | string | ❌ | Body da resposta (expressão n8n) | `{{ $json }}`, `{ "status": "ok" }` |
| `options.rawBody` | boolean | ❌ | Receber body raw sem parse JSON | `false` (padrão) |
| `options.allowUnknownPaths` | boolean | ❌ | Permitir paths não registrados | `false` (padrão) |

### Dados de Entrada/Saída

**Entrada**: Requisição HTTP externa
- Body: `{{ $json }}` (parsed JSON)
- Query params: `{{ $query }}`
- Headers: `{{ $header }}`
- Raw body: `{{ $binary }}` (se `rawBody=true`)

**Saída**: Item único com estrutura:
```json
{
  "json": { ...body da requisição... },
  "binary": {}
}
```

### Tratamento de Erros/Timeouts
- Timeout global do workflow (`settings.executionTimeout`, padrão 3600s)
- `continueOnFail` no node permite workflow prosseguir mesmo se webhook falhar
- `retryOnFail` + `maxTries` + `waitBetweenTries` para retentativas
- Validação HMAC-SHA256 via header `X-Webhook-Signature` (implementado no AgentFlow)

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/webhook.ts
import { z } from 'zod';

export const WebhookNodeParamsSchema = z.object({
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string().min(1),
  responseMode: z.enum(['onReceived', 'lastNode', 'responseNode']).default('onReceived'),
  responseCode: z.number().int().min(100).max(599).default(200),
  responseData: z.string().default('{{ $json }}'),
  options: z.object({
    rawBody: z.boolean().default(false),
    allowUnknownPaths: z.boolean().default(false),
  }).default({}),
});

export type WebhookNodeParams = z.infer<typeof WebhookNodeParamsSchema>;

// packages/api/src/nodes/handlers/webhook.ts
import { WebhookNodeParams } from '@agentflow/shared/nodes/webhook';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class WebhookTriggerHandler implements NodeHandler<WebhookNodeParams> {
  readonly type = 'n8n-nodes-base.webhook';
  readonly category = 'trigger';

  async execute(
    context: NodeExecutionContext,
    params: WebhookNodeParams
  ): Promise<NodeOutput> {
    // Webhook trigger não executa via workflow executor normal
    // É registrado no router HTTP do Fastify
    // Este handler é chamado quando requisição chega no endpoint
    
    const { request, webhookId } = context.triggerData!;
    
    // Parse body conforme opções
    let jsonData: unknown;
    if (params.options.rawBody) {
      jsonData = request.body; // raw buffer/string
    } else {
      jsonData = request.body; // já parseado pelo Fastify
    }

    // Validação HMAC se secret configurado no webhook
    if (context.webhookSecret) {
      const signature = request.headers['x-webhook-signature'];
      if (!signature || !this.verifyHmac(context.webhookSecret, request.rawBody, signature)) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Preparar dados de saída no formato n8n
    const outputItem = {
      json: jsonData,
      binary: {},
      // Metadata n8n-compat
      _webhook: {
        method: request.method,
        path: request.url,
        query: request.query,
        headers: request.headers,
        webhookId,
      },
    };

    // Resposta imediata se responseMode = onReceived
    if (params.responseMode === 'onReceived') {
      const responseBody = this.evaluateExpression(params.responseData, outputItem);
      context.fastifyReply?.code(params.responseCode).send(responseBody);
    }

    return {
      items: [outputItem],
      // Para responseMode = lastNode, o executor aguarda workflow terminar
      // e usa o output do último node como resposta
      metadata: { responseMode: params.responseMode },
    };
  }

  private verifyHmac(secret: string, body: string | Buffer, signature: string): boolean {
    const crypto = await import('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret)
      .update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  private evaluateExpression(expr: string, item: any): any {
    // Implementar subset do expression engine n8n
    // {{ $json.path }}, {{ $query.param }}, {{ $header.name }}, {{ $now }}
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return item.json?.[prop] ?? '';
      if (obj === 'query') return item._webhook?.query?.[prop] ?? '';
      if (obj === 'header') return item._webhook?.headers?.[prop] ?? '';
      if (obj === 'now') return new Date().toISOString();
      return '';
    });
  }

  // Registrar rota no Fastify
  registerRoute(fastify: FastifyInstance, workflowId: string, webhookId: string): void {
    const path = `/webhook/${params.path}`;
    fastify.route({
      method: params.httpMethod,
      url: path,
      handler: async (request, reply) => {
        // Chamar execute com triggerData
      },
    });
  }
}
```

---

## 2. Schedule Trigger (Cron)

**Tipo n8n**: `n8n-nodes-base.cron`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Cron Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.cron/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Cron)

### O que faz
Dispara workflow periodicamente baseado em expressão cron, intervalo fixo ou horário específico. Suporta timezone.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição | Exemplo |
|-----------|------|-------------|-----------|---------|
| `triggerTimes.item[].mode` | string | ✅ | Modo de agendamento | `cron`, `everyX`, `atSpecificTime` |
| `triggerTimes.item[].cronExpression` | string | ✅ (se cron) | Expressão cron (5 ou 6 campos) | `0 9 * * 1-5` (9h dias úteis) |
| `triggerTimes.item[].timezone` | string | ❌ | Timezone (padrão: workflow) | `America/Sao_Paulo`, `UTC` |
| `triggerTimes.item[].hour` | number | ✅ (se atSpecificTime) | Hora (0-23) | `9` |
| `triggerTimes.item[].minute` | number | ✅ (se atSpecificTime) | Minuto (0-59) | `30` |
| `triggerTimes.item[].unit` | string | ✅ (se everyX) | Unidade de tempo | `minutes`, `hours`, `days`, `weeks` |
| `triggerTimes.item[].value` | number | ✅ (se everyX) | Valor do intervalo | `15` (a cada 15 min) |

### Expressões Cron Suportadas
```
* * * * * *    (6 campos: seg min hora dia mês dia-semana)
* * * * *      (5 campos: min hora dia mês dia-semana)

Exemplos:
0 9 * * 1-5     = 09:00 em dias úteis
0 0 1 * *       = Meia-noite no dia 1 de cada mês
*/15 * * * *    = A cada 15 minutos
0 */2 * * *     = A cada 2 horas
```

### Dados de Entrada/Saída

**Entrada**: Nenhuma (trigger inicia execução)

**Saída**: Item único com metadata de execução:
```json
{
  "json": {
    "executionMode": "cron",
    "triggeredAt": "2026-08-19T09:00:00.000Z",
    "timezone": "America/Sao_Paulo"
  },
  "binary": {}
}
```

### Tratamento de Erros/Timeouts
- Timeout global do workflow
- `retryOnFail` para re-executar workflow em falha
- Overlap policy: n8n não executa instâncias paralelas do mesmo workflow cron por padrão
- Missed executions: n8n não recupera execuções perdidas (se servidor down)

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/cron.ts
import { z } from 'zod';

export const CronTriggerItemSchema = z.object({
  mode: z.enum(['cron', 'everyX', 'atSpecificTime']),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  unit: z.enum(['minutes', 'hours', 'days', 'weeks']).optional(),
  value: z.number().int().positive().optional(),
});

export const CronNodeParamsSchema = z.object({
  triggerTimes: z.object({
    item: z.array(CronTriggerItemSchema).min(1),
  }),
});

export type CronNodeParams = z.infer<typeof CronNodeParamsSchema>;

// packages/api/src/nodes/handlers/cron.ts
import { CronNodeParams, CronTriggerItemSchema } from '@agentflow/shared/nodes/cron';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';
import { CronJob } from 'cron';

export class CronTriggerHandler implements NodeHandler<CronNodeParams> {
  readonly type = 'n8n-nodes-base.cron';
  readonly category = 'trigger';
  private jobs: Map<string, CronJob> = new Map();

  async execute(
    context: NodeExecutionContext,
    params: CronNodeParams
  ): Promise<NodeOutput> {
    // Cron trigger não executa via workflow executor normal
    // É agendado via bullmq repeatable jobs ou node-cron
    // Este método é chamado para registrar os agendamentos
    
    for (const [index, trigger] of params.triggerTimes.item.entries()) {
      const jobId = `${context.workflowId}-cron-${index}`;
      await this.scheduleTrigger(jobId, trigger, context);
    }

    return {
      items: [{
        json: {
          scheduled: true,
          triggers: params.triggerTimes.item.length,
        },
        binary: {},
      }],
    };
  }

  private async scheduleTrigger(
    jobId: string,
    trigger: z.infer<typeof CronTriggerItemSchema>,
    context: NodeExecutionContext
  ): Promise<void> {
    const timezone = trigger.timezone || context.workflowSettings?.timezone || 'UTC';
    
    let cronExpression: string;
    switch (trigger.mode) {
      case 'cron':
        cronExpression = trigger.cronExpression!;
        break;
      case 'everyX':
        cronExpression = this.buildIntervalCron(trigger.value!, trigger.unit!);
        break;
      case 'atSpecificTime':
        cronExpression = `${trigger.minute} ${trigger.hour} * * *`;
        break;
    }

    // Usar bullmq repeatable job para persistência e escalabilidade
    await context.queue.add(
      'workflow-trigger',
      { workflowId: context.workflowId, triggerData: { mode: 'cron' } },
      {
        repeat: { pattern: cronExpression, tz: timezone },
        jobId,
        removeOnFail: false,
      }
    );
  }

  private buildIntervalCron(value: number, unit: string): string {
    switch (unit) {
      case 'minutes': return `*/${value} * * * *`;
      case 'hours': return `0 */${value} * * *`;
      case 'days': return `0 0 */${value} * *`;
      case 'weeks': return `0 0 * * */${value}`;
      default: throw new Error(`Unsupported unit: ${unit}`);
    }
  }

  // Cleanup ao desativar workflow
  async unschedule(workflowId: string): Promise<void> {
    const jobIds = Array.from(this.jobs.keys()).filter(id => id.startsWith(workflowId));
    for (const jobId of jobIds) {
      await context.queue.removeRepeatableByKey(jobId);
    }
  }
}
```

---

## 3. HTTP Request Node

**Tipo n8n**: `n8n-nodes-base.httpRequest`  
**Versão**: 4.1  
**Fonte**: [docs.n8n.io - HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/HttpRequest)

### O que faz
Faz requisições HTTP para APIs externas. Suporta autenticação múltipla, headers, query params, body variado, timeout, redirects, SSL.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição | Exemplo |
|-----------|------|-------------|-----------|---------|
| `url` | string | ✅ | URL da requisição (com expressões) | `https://api.exemplo.com/{{ $json.id }}` |
| `method` | string | ✅ | Método HTTP | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `authentication` | string | ❌ | Tipo de autenticação | `none`, `basicAuth`, `headerAuth`, `oAuth1Api`, `oAuth2Api`, `digestAuth` |
| `headers.parameters[]` | array | ❌ | Headers customizados | `[{name: "Content-Type", value: "application/json"}]` |
| `queryParameters.parameters[]` | array | ❌ | Query string params | `[{name: "limit", value: "10"}]` |
| `bodyContentType` | string | ❌ | Tipo de conteúdo do body | `json`, `form`, `raw`, `file`, `none` |
| `jsonParameters` | boolean | ❌ | Body é JSON | `true` |
| `bodyParametersJson` | string | ❌ | Body JSON (string com expressões) | `{ "nome": "{{ $json.nome }}" }` |
| `options.timeout` | number | ❌ | Timeout em ms | `30000` (padrão) |
| `options.followRedirect` | boolean | ❌ | Seguir redirects | `true` (padrão) |
| `options.maxRedirects` | number | ❌ | Max redirects | `10` |
| `options.rejectUnauthorized` | boolean | ❌ | Validar certificado SSL | `true` (padrão) |

### Dados de Entrada/Saída

**Entrada**: Array de items (um por execução, ou batch se `runOnceForAllItems`)
- Cada item tem `json` e `binary`
- Expressões `{{ $json.campo }}` resolvidas por item

**Saída**: Array de items com resposta:
```json
{
  "json": {
    "statusCode": 200,
    "headers": { "content-type": "application/json" },
    "body": { "id": 123, "nome": "João" }
  },
  "binary": {}
}
```
Se erro e `continueOnFail=true`: item com `error` no json.

### Tratamento de Erros/Timeouts
- `options.timeout` (padrão 30s) - aborta requisição
- `retryOnFail` + `maxTries` + `waitBetweenTries` - retentativas automáticas com backoff
- `continueOnFail` - workflow continua, item tem `error` no output
- Códigos 4xx/5xx não lançam exceção por padrão (apenas se `options.throwOnError`)
- Redirects seguidos até `maxRedirects`

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/httpRequest.ts
import { z } from 'zod';

export const HttpRequestNodeParamsSchema = z.object({
  url: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  authentication: z.enum(['none', 'basicAuth', 'headerAuth', 'oAuth1Api', 'oAuth2Api', 'digestAuth']).default('none'),
  headers: z.object({
    parameters: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).default([]),
  }).default({}),
  queryParameters: z.object({
    parameters: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).default([]),
  }).default({}),
  bodyContentType: z.enum(['json', 'form', 'raw', 'file', 'none']).default('json'),
  jsonParameters: z.boolean().default(true),
  bodyParametersJson: z.string().optional(),
  options: z.object({
    timeout: z.number().int().positive().default(30000),
    followRedirect: z.boolean().default(true),
    maxRedirects: z.number().int().positive().default(10),
    rejectUnauthorized: z.boolean().default(true),
    throwOnError: z.boolean().default(false),
  }).default({}),
});

export type HttpRequestNodeParams = z.infer<typeof HttpRequestNodeParamsSchema>;

// packages/api/src/nodes/handlers/httpRequest.ts
import { HttpRequestNodeParams } from '@agentflow/shared/nodes/httpRequest';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class HttpRequestHandler implements NodeHandler<HttpRequestNodeParams> {
  readonly type = 'n8n-nodes-base.httpRequest';
  readonly category = 'action';

  async execute(
    context: NodeExecutionContext,
    params: HttpRequestNodeParams
  ): Promise<NodeOutput> {
    const results = [];

    for (const item of context.inputItems) {
      try {
        // Resolver expressões na URL, headers, query, body
        const resolvedUrl = this.resolveExpressions(params.url, item, context);
        const resolvedHeaders = this.resolveHeaders(params.headers.parameters, item, context);
        const resolvedQuery = this.resolveQueryParams(params.queryParameters.parameters, item, context);
        const resolvedBody = this.resolveBody(params, item, context);

        // Preparar autenticação
        const authHeaders = await this.resolveAuthentication(params.authentication, context);
        const finalHeaders = { ...resolvedHeaders, ...authHeaders };

        // Fazer requisição
        const response = await this.makeRequest({
          url: resolvedUrl,
          method: params.method,
          headers: finalHeaders,
          query: resolvedQuery,
          body: resolvedBody,
          timeout: params.options.timeout,
          followRedirect: params.options.followRedirect,
          maxRedirects: params.options.maxRedirects,
          rejectUnauthorized: params.options.rejectUnauthorized,
        });

        const outputItem = {
          json: {
            statusCode: response.status,
            headers: response.headers,
            body: response.data,
          },
          binary: {},
        };
        results.push(outputItem);

      } catch (error) {
        if (params.options.throwOnError && !context.nodeConfig.continueOnFail) {
          throw error;
        }
        // continueOnFail: retorna item com erro
        results.push({
          json: { error: error.message, statusCode: error.statusCode },
          binary: {},
          error: error.message,
        });
      }
    }

    return { items: results };
  }

  private async makeRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
    timeout: number;
    followRedirect: boolean;
    maxRedirects: number;
    rejectUnauthorized: boolean;
  }): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    const url = new URL(options.url);
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.append(k, v));

    const response = await fetch(url.toString(), {
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      redirect: options.followRedirect ? 'follow' : 'manual',
    });

    clearTimeout(timeoutId);

    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    };
  }

  private resolveExpressions(template: string, item: any, context: NodeExecutionContext): string {
    return template.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'query') return String(item._webhook?.query?.[prop] ?? '');
      if (obj === 'header') return String(item._webhook?.headers?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      if (obj === 'parameter') return String(context.nodeConfig.parameters?.[prop] ?? '');
      if (obj === 'credentials') return String(context.credentials?.[prop] ?? '');
      if (obj === 'workflow') return String(context.workflowData?.[prop] ?? '');
      return '';
    });
  }

  private resolveHeaders(headers: Array<{name: string, value: string}>, item: any, context: NodeExecutionContext): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of headers) {
      result[h.name] = this.resolveExpressions(h.value, item, context);
    }
    return result;
  }

  private resolveQueryParams(query: Array<{name: string, value: string}>, item: any, context: NodeExecutionContext): Record<string, string> {
    const result: Record<string, string> = {};
    for (const q of query) {
      result[q.name] = this.resolveExpressions(q.value, item, context);
    }
    return result;
  }

  private resolveBody(params: HttpRequestNodeParams, item: any, context: NodeExecutionContext): unknown {
    if (!params.bodyParametersJson) return undefined;
    
    const resolved = this.resolveExpressions(params.bodyParametersJson, item, context);
    try {
      return JSON.parse(resolved);
    } catch {
      return resolved; // raw string
    }
  }

  private async resolveAuthentication(authType: string, context: NodeExecutionContext): Promise<Record<string, string>> {
    const creds = context.credentials;
    if (!creds) return {};

    switch (authType) {
      case 'basicAuth':
        return { Authorization: `Basic ${Buffer.from(`${creds.user}:${creds.password}`).toString('base64')}` };
      case 'headerAuth':
        return { [creds.name || 'Authorization']: creds.value };
      case 'oAuth2Api':
        // Token já renovado pelo credential system
        return { Authorization: `Bearer ${creds.accessToken}` };
      default:
        return {};
    }
  }
}
```

---

## 4. IF Node (Condicional Binário)

**Tipo n8n**: `n8n-nodes-base.if`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - IF Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/If)

### O que faz
Avalia condições (string, number, boolean, datetime, binary) e direciona fluxo para saída `true` (índice 0) ou `false` (índice 1). Suporta múltiplas condições combinadas com AND.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `conditions.string[]` | array | ❌ | Condições de string |
| `conditions.number[]` | array | ❌ | Condições numéricas |
| `conditions.boolean[]` | array | ❌ | Condições booleanas |
| `conditions.dateTime[]` | array | ❌ | Condições de data/hora |
| `conditions.binary[]` | array | ❌ | Condições de dados binários |
| `conditions[].value1` | string | ✅ | Valor esquerdo (expressão) |
| `conditions[].operation` | string | ✅ | Operador |
| `conditions[].value2` | string | ✅ | Valor direito (expressão) |
| `options.caseSensitive` | boolean | ❌ | Case sensitive para strings | `true` (padrão) |

### Operadores por Tipo

| Tipo | Operadores |
|------|------------|
| String | `equal`, `notEqual`, `contains`, `notContains`, `startsWith`, `endsWith`, `regex`, `isEmpty`, `isNotEmpty` |
| Number | `equal`, `notEqual`, `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`, `isEmpty`, `isNotEmpty` |
| Boolean | `true`, `false` |
| DateTime | `equal`, `notEqual`, `before`, `after`, `isEmpty`, `isNotEmpty` |

### Dados de Entrada/Saída

**Entrada**: Array de items (um por item de input)

**Saída**: Mesmo array de items, mas roteado para:
- Output 0 (`main[0]`): items onde condição = true
- Output 1 (`main[1]`): items onde condição = false

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/if.ts
import { z } from 'zod';

const ConditionSchema = z.object({
  value1: z.string(),
  operation: z.string(),
  value2: z.string(),
});

export const IfNodeParamsSchema = z.object({
  conditions: z.object({
    string: z.array(ConditionSchema).default([]),
    number: z.array(ConditionSchema).default([]),
    boolean: z.array(ConditionSchema).default([]),
    dateTime: z.array(ConditionSchema).default([]),
    binary: z.array(ConditionSchema).default([]),
  }),
  options: z.object({
    caseSensitive: z.boolean().default(true),
    leftValue: z.string().optional(),
    rightValue: z.string().optional(),
  }).default({}),
});

export type IfNodeParams = z.infer<typeof IfNodeParamsSchema>;

// packages/api/src/nodes/handlers/if.ts
import { IfNodeParams } from '@agentflow/shared/nodes/if';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class IfNodeHandler implements NodeHandler<IfNodeParams> {
  readonly type = 'n8n-nodes-base.if';
  readonly category = 'flowControl';

  async execute(
    context: NodeExecutionContext,
    params: IfNodeParams
  ): Promise<NodeOutput> {
    const trueItems = [];
    const falseItems = [];

    for (const item of context.inputItems) {
      const result = this.evaluateConditions(params.conditions, item, context);
      
      if (result) {
        trueItems.push(item);
      } else {
        falseItems.push(item);
      }
    }

    return {
      items: context.inputItems, // todos items passam, mas roteados nas conexões
      outputRouting: {
        0: trueItems,  // saída true
        1: falseItems, // saída false
      },
    };
  }

  private evaluateConditions(conditions: IfNodeParams['conditions'], item: any, context: NodeExecutionContext): boolean {
    const allConditions = [
      ...conditions.string,
      ...conditions.number,
      ...conditions.boolean,
      ...conditions.dateTime,
      ...conditions.binary,
    ];

    if (allConditions.length === 0) return true; // sem condições = true

    // Todas condições devem ser verdadeiras (AND)
    return allConditions.every(cond => this.evaluateCondition(cond, item, context));
  }

  private evaluateCondition(cond: { value1: string; operation: string; value2: string }, item: any, context: NodeExecutionContext): boolean {
    const left = this.resolveValue(cond.value1, item, context);
    const right = this.resolveValue(cond.value2, item, context);
    const op = cond.operation;
    const caseSensitive = context.nodeConfig.parameters?.options?.caseSensitive ?? true;

    const lStr = String(left);
    const rStr = caseSensitive ? String(right) : String(right).toLowerCase();
    const lNum = Number(left);
    const rNum = Number(right);
    const lDate = left instanceof Date ? left : new Date(left);
    const rDate = right instanceof Date ? right : new Date(right);

    switch (op) {
      // String
      case 'equal': return caseSensitive ? lStr === rStr : lStr.toLowerCase() === rStr.toLowerCase();
      case 'notEqual': return caseSensitive ? lStr !== rStr : lStr.toLowerCase() !== rStr.toLowerCase();
      case 'contains': return caseSensitive ? lStr.includes(rStr) : lStr.toLowerCase().includes(rStr.toLowerCase());
      case 'notContains': return caseSensitive ? !lStr.includes(rStr) : !lStr.toLowerCase().includes(rStr.toLowerCase());
      case 'startsWith': return caseSensitive ? lStr.startsWith(rStr) : lStr.toLowerCase().startsWith(rStr.toLowerCase());
      case 'endsWith': return caseSensitive ? lStr.endsWith(rStr) : lStr.toLowerCase().endsWith(rStr.toLowerCase());
      case 'regex': return new RegExp(rStr).test(lStr);
      case 'isEmpty': return lStr === '' || left === null || left === undefined;
      case 'isNotEmpty': return lStr !== '' && left !== null && left !== undefined;

      // Number
      case 'lessThan': return lNum < rNum;
      case 'lessThanOrEqual': return lNum <= rNum;
      case 'greaterThan': return lNum > rNum;
      case 'greaterThanOrEqual': return lNum >= rNum;

      // Boolean
      case 'true': return Boolean(left) === true;
      case 'false': return Boolean(left) === false;

      // DateTime
      case 'before': return lDate < rDate;
      case 'after': return lDate > rDate;

      default: return false;
    }
  }

  private resolveValue(expr: string, item: any, context: NodeExecutionContext): any {
    // Expressões {{ $json.campo }}, {{ $now }}, etc.
    const match = expr.match(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/);
    if (match) {
      const [, obj, prop] = match;
      if (obj === 'json') return item.json?.[prop];
      if (obj === 'now') return new Date();
      if (obj === 'parameter') return context.nodeConfig.parameters?.[prop];
    }
    // Valor literal (número, string, boolean)
    try { return JSON.parse(expr); } catch { return expr; }
  }
}
```

---

## 5. Switch Node (Múltiplos Casos)

**Tipo n8n**: `n8n-nodes-base.switch`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Switch Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Switch)

### O que faz
Compara um valor contra múltiplas regras e direciona para saída correspondente. Suporta modo `value` (comparação direta) ou `expression` (expressão booleana por regra). Tem saída default/fallback.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `value` (comparar valor) ou `expression` (expressão booleana) |
| `value` | string | ✅ (se value) | Valor a comparar (expressão n8n) |
| `rules.rules[]` | array | ❌ | Regras de caso |
| `rules.rules[].output` | string | ✅ | Nome da saída (label no canvas) |
| `rules.rules[].operation` | string | ✅ | Operador (equal, notEqual, contains, regex, etc.) |
| `rules.rules[].value` | string | ✅ | Valor esperado |
| `defaultOutput` | string | ❌ | Saída padrão (fallback) |

### Dados de Entrada/Saída

**Entrada**: Array de items

**Saída**: Items roteados para outputs baseados na regra que casou
- Output index = ordem das rules (0, 1, 2...)
- Default output = último índice se definido

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/switch.ts
import { z } from 'zod';

export const SwitchRuleSchema = z.object({
  output: z.string(),
  operation: z.string(),
  value: z.string(),
});

export const SwitchNodeParamsSchema = z.object({
  mode: z.enum(['value', 'expression']),
  value: z.string().optional(),
  rules: z.object({
    rules: z.array(SwitchRuleSchema).default([]),
  }),
  defaultOutput: z.string().optional(),
});

export type SwitchNodeParams = z.infer<typeof SwitchNodeParamsSchema>;

// packages/api/src/nodes/handlers/switch.ts
import { SwitchNodeParams } from '@agentflow/shared/nodes/switch';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class SwitchNodeHandler implements NodeHandler<SwitchNodeParams> {
  readonly type = 'n8n-nodes-base.switch';
  readonly category = 'flowControl';

  async execute(
    context: NodeExecutionContext,
    params: SwitchNodeParams
  ): Promise<NodeOutput> {
    const outputRouting: Record<number, any[]> = {};
    const rules = params.rules.rules;

    for (const item of context.inputItems) {
      let matched = false;

      if (params.mode === 'value') {
        const compareValue = this.resolveValue(params.value!, item, context);
        
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          const ruleValue = this.resolveValue(rule.value, item, context);
          
          if (this.compareValues(compareValue, ruleValue, rule.operation)) {
            (outputRouting[i] ||= []).push(item);
            matched = true;
            break;
          }
        }
      } else {
        // mode === 'expression': cada rule tem expressão booleana
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          const result = this.evaluateExpression(rule.value, item, context);
          if (result) {
            (outputRouting[i] ||= []).push(item);
            matched = true;
            break;
          }
        }
      }

      if (!matched && params.defaultOutput) {
        const defaultIndex = rules.length;
        (outputRouting[defaultIndex] ||= []).push(item);
      }
    }

    return {
      items: context.inputItems,
      outputRouting,
    };
  }

  private compareValues(left: any, right: any, operation: string): boolean {
    const lStr = String(left);
    const rStr = String(right);
    const lNum = Number(left);
    const rNum = Number(right);

    switch (operation) {
      case 'equal': return lStr === rStr;
      case 'notEqual': return lStr !== rStr;
      case 'contains': return lStr.includes(rStr);
      case 'notContains': return !lStr.includes(rStr);
      case 'regex': return new RegExp(rStr).test(lStr);
      case 'lessThan': return lNum < rNum;
      case 'greaterThan': return lNum > rNum;
      default: return false;
    }
  }

  private evaluateExpression(expr: string, item: any, context: NodeExecutionContext): boolean {
    // Implementar avaliação de expressão booleana n8n
    // Ex: "{{ $json.status === 'active' && $json.value > 100 }}"
    const resolved = this.resolveExpressions(expr, item, context);
    try {
      // Safe evaluation - usar vm2 ou similar em produção
      return new Function('item', 'context', `return ${resolved}`)(item, context);
    } catch {
      return false;
    }
  }

  private resolveValue(expr: string, item: any, context: NodeExecutionContext): any {
    const match = expr.match(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/);
    if (match) {
      const [, obj, prop] = match;
      if (obj === 'json') return item.json?.[prop];
      if (obj === 'now') return new Date();
      if (obj === 'parameter') return context.nodeConfig.parameters?.[prop];
    }
    try { return JSON.parse(expr); } catch { return expr; }
  }

  private resolveExpressions(template: string, item: any, context: NodeExecutionContext): string {
    return template.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return JSON.stringify(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      if (obj === 'parameter') return JSON.stringify(context.nodeConfig.parameters?.[prop] ?? '');
      return '';
    });
  }
}
```

---

## 6. Code Node (Function/FunctionItem)

**Tipo n8n**: `n8n-nodes-base.function` (processa todos items) ou `n8n-nodes-base.functionItem` (um por item)  
**Versão**: 1/2  
**Fonte**: [docs.n8n.io - Function Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.function/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Function)

### O que faz
Executa código JavaScript/TypeScript customizado para transformar dados. Tem acesso a variáveis n8n (`$input`, `$json`, `$parameter`, `$credentials`, `$helpers`, etc.). Roda em sandbox (VM2 no n8n).

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `functionCode` | string | ✅ | Código JavaScript/TypeScript |

### Variáveis Disponíveis no Código

| Variável | Descrição |
|----------|-----------|
| `$input` | Input items: `$input.all()`, `$input.first()`, `$input.item(index)` |
| `$parameter` | Parâmetros do nó |
| `$json` | JSON do item atual (functionItem) |
| `$item` | Item completo atual `{json, binary}` |
| `$node` | Metadados do nó |
| `$workflow` | Metadados do workflow |
| `$now` | Date atual |
| `$credentials` | Credenciais resolvidas |
| `$helpers` | Helpers: `$helpers.request()`, `$helpers.returnJsonArray()` |

### Dados de Entrada/Saída

**Entrada**: Array de items (function) ou item único (functionItem)

**Saída (function)**: Array de `{ json: {}, binary: {} }`  
**Saída (functionItem)**: `{ json: {}, binary: {} }` (retornado por item)

### Tratamento de Erros/Timeouts
- Timeout configurável (padrão 30s no n8n)
- Sandbox isola execução (VM2)
- Erros no código param execução do node
- `continueOnFail` permite workflow prosseguir

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/function.ts
import { z } from 'zod';

export const FunctionNodeParamsSchema = z.object({
  functionCode: z.string().min(1),
  // functionItem usa mesmo schema, diferença está no typeVersion
});

export type FunctionNodeParams = z.infer<typeof FunctionNodeParamsSchema>;

// packages/api/src/nodes/handlers/function.ts
import { FunctionNodeParams } from '@agentflow/shared/nodes/function';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';
import { VM } from 'vm2'; // ou isolated-vm para melhor isolamento

export class FunctionNodeHandler implements NodeHandler<FunctionNodeParams> {
  readonly type = 'n8n-nodes-base.function';
  readonly category = 'transform';

  async execute(
    context: NodeExecutionContext,
    params: FunctionNodeParams
  ): Promise<NodeOutput> {
    const isFunctionItem = context.nodeConfig.typeVersion === 2; // functionItem
    const results = [];

    // Preparar sandbox
    const vm = new VM({
      timeout: context.nodeConfig.parameters?.options?.timeout || 30000,
      sandbox: this.createSandbox(context, isFunctionItem),
    });

    try {
      if (isFunctionItem) {
        // functionItem: executa código para cada item
        for (const item of context.inputItems) {
          const sandbox = this.createItemSandbox(context, item);
          const vmItem = new VM({ timeout: 30000, sandbox });
          
          const result = await vmItem.run(params.functionCode);
          results.push(this.normalizeResult(result));
        }
      } else {
        // function: executa uma vez com todos items
        const result = await vm.run(params.functionCode);
        const items = this.normalizeResult(result);
        results.push(...(Array.isArray(items) ? items : [items]));
      }

    } catch (error) {
      if (context.nodeConfig.continueOnFail) {
        // Retornar items com erro
        return {
          items: context.inputItems.map(item => ({
            json: { error: error.message },
            binary: {},
            error: error.message,
          })),
        };
      }
      throw error;
    }

    return { items: results };
  }

  private createSandbox(context: NodeExecutionContext, isFunctionItem: boolean): Record<string, any> {
    const helpers = {
      request: async (options: any) => {
        // Wrapper para fetch com credenciais
        return fetch(options.url, options);
      },
      returnJsonArray: (items: any[]) => items,
    };

    return {
      $input: {
        all: () => context.inputItems,
        first: () => context.inputItems[0],
        item: (index: number) => context.inputItems[index],
      },
      $parameter: context.nodeConfig.parameters,
      $node: { name: context.nodeConfig.name, type: context.nodeConfig.type },
      $workflow: { id: context.workflowId, name: context.workflowName },
      $now: new Date(),
      $credentials: context.credentials,
      $helpers: helpers,
      console: {
        log: (...args: any[]) => context.logger?.info(args.join(' ')),
        error: (...args: any[]) => context.logger?.error(args.join(' ')),
        warn: (...args: any[]) => context.logger?.warn(args.join(' ')),
      },
    };
  }

  private createItemSandbox(context: NodeExecutionContext, item: any): Record<string, any> {
    const base = this.createSandbox(context, true);
    return {
      ...base,
      $json: item.json,
      $item: item,
    };
  }

  private normalizeResult(result: any): any[] {
    if (!result) return [{ json: {}, binary: {} }];
    if (Array.isArray(result)) {
      return result.map(r => ({
        json: r?.json ?? r,
        binary: r?.binary ?? {},
      }));
    }
    return [{
      json: result?.json ?? result,
      binary: result?.binary ?? {},
    }];
  }
}
```

---

## 7. Merge Node (Juntar Branches)

**Tipo n8n**: `n8n-nodes-base.merge`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Merge Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Merge)

### O que faz
Combina dados de múltiplas branches/inputs. Três modos: `wait` (aguarda todas), `choose` (escolhe uma), `multiplex` (um por item).

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `wait`, `choose`, `multiplex` |
| `combine` | string | ✅ (se wait) | `all`, `first`, `last` |
| `options.includeInputData` | boolean | ❌ | Incluir dados de input no output | `true` |

### Modos

| Modo | Comportamento |
|------|---------------|
| `wait` | Aguarda todas as conexões de entrada chegarem, depois combina |
| `choose` | Usa regra para escolher qual branch prosseguir (como IF) |
| `multiplex` | Processa cada item de cada branch separadamente (zip) |

### Dados de Entrada/Saída

**Entrada**: Múltiplos inputs (conexões diferentes no mesmo node)
- Input 0, Input 1, Input 2... (índice = ordem das conexões)

**Saída (mode=wait, combine=all)**: Array combinado de todos inputs
```json
{
  "json": {
    "input_0": [...items do input 0...],
    "input_1": [...items do input 1...],
  },
  "binary": {}
}
```

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/merge.ts
import { z } from 'zod';

export const MergeNodeParamsSchema = z.object({
  mode: z.enum(['wait', 'choose', 'multiplex']),
  combine: z.enum(['all', 'first', 'last']).default('all'),
  options: z.object({
    includeInputData: z.boolean().default(true),
  }).default({}),
});

export type MergeNodeParams = z.infer<typeof MergeNodeParamsSchema>;

// packages/api/src/nodes/handlers/merge.ts
import { MergeNodeParams } from '@agentflow/shared/nodes/merge';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class MergeNodeHandler implements NodeHandler<MergeNodeParams> {
  readonly type = 'n8n-nodes-base.merge';
  readonly category = 'flowControl';

  async execute(
    context: NodeExecutionContext,
    params: MergeNodeParams
  ): Promise<NodeOutput> {
    // context.multiInputItems: Map<inputIndex, Item[]>
    const inputs = context.multiInputItems || new Map();
    const inputCount = inputs.size;

    switch (params.mode) {
      case 'wait':
        return this.executeWait(inputs, params, context);
      case 'choose':
        return this.executeChoose(inputs, params, context);
      case 'multiplex':
        return this.executeMultiplex(inputs, params, context);
      default:
        throw new Error(`Unknown merge mode: ${params.mode}`);
    }
  }

  private executeWait(inputs: Map<number, any[]>, params: MergeNodeParams, context: NodeExecutionContext): NodeOutput {
    const allItems: any[] = [];
    
    for (let i = 0; i < inputCount; i++) {
      const items = inputs.get(i) || [];
      if (params.combine === 'all') {
        allItems.push(...items);
      } else if (params.combine === 'first' && items.length > 0) {
        allItems.push(items[0]);
        break;
      } else if (params.combine === 'last' && items.length > 0) {
        allItems.push(items[items.length - 1]);
      }
    }

    if (params.options.includeInputData) {
      // Estrutura n8n: { input_0: [...], input_1: [...] }
      const combined: Record<string, any> = {};
      for (let i = 0; i < inputCount; i++) {
        combined[`input_${i}`] = inputs.get(i) || [];
      }
      return {
        items: [{ json: combined, binary: {} }],
      };
    }

    return { items: allItems.map(item => ({ json: item.json, binary: item.binary })) };
  }

  private executeChoose(inputs: Map<number, any[]>, params: MergeNodeParams, context: NodeExecutionContext): NodeOutput {
    // Similar ao IF - escolhe qual input prosseguir baseado em regra
    // Por simplicidade, usa primeiro input não vazio
    for (let i = 0; i < inputCount; i++) {
      const items = inputs.get(i) || [];
      if (items.length > 0) {
        return { items };
      }
    }
    return { items: [] };
  }

  private executeMultiplex(inputs: Map<number, any[]>, params: MergeNodeParams, context: NodeExecutionContext): NodeOutput {
    // Zip: combina item 0 de cada input, item 1 de cada input, etc.
    const maxLength = Math.max(...Array.from(inputs.values()).map(arr => arr.length));
    const results = [];

    for (let i = 0; i < maxLength; i++) {
      const combined: Record<string, any> = {};
      for (let inputIdx = 0; inputIdx < inputCount; inputIdx++) {
        const items = inputs.get(inputIdx) || [];
        combined[`input_${inputIdx}`] = items[i]?.json ?? null;
      }
      results.push({ json: combined, binary: {} });
    }

    return { items: results };
  }
}
```

---

## 8. Split In Batches Node

**Tipo n8n**: `n8n-nodes-base.splitInBatches`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Split In Batches](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/SplitInBatches)

### O que faz
Divide array de items em lotes (batches) de tamanho fixo. Executa workflow downstream uma vez por lote, em loop até processar todos.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `batchSize` | number | ✅ | Tamanho do lote |
| `options.reset` | boolean | ❌ | Resetar contador a cada execução | `false` |

### Dados de Entrada/Saída

**Entrada**: Array de items (ex: 100 items)

**Saída**: Por execução, `batchSize` items (ex: 10 items por vez)
- Loop interno no executor até consumir todos
- Metadata: `_batchIndex`, `_batchCount`, `_isLastBatch`

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/splitInBatches.ts
import { z } from 'zod';

export const SplitInBatchesNodeParamsSchema = z.object({
  batchSize: z.number().int().positive(),
  options: z.object({
    reset: z.boolean().default(false),
  }).default({}),
});

export type SplitInBatchesNodeParams = z.infer<typeof SplitInBatchesNodeParamsSchema>;

// packages/api/src/nodes/handlers/splitInBatches.ts
import { SplitInBatchesNodeParams } from '@agentflow/shared/nodes/splitInBatches';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class SplitInBatchesHandler implements NodeHandler<SplitInBatchesNodeParams> {
  readonly type = 'n8n-nodes-base.splitInBatches';
  readonly category = 'flowControl';

  async execute(
    context: NodeExecutionContext,
    params: SplitInBatchesNodeParams
  ): Promise<NodeOutput> {
    const allItems = context.inputItems.flatMap(item => 
      Array.isArray(item.json) ? item.json : [item]
    );

    const batchSize = params.batchSize;
    const batches = [];
    
    for (let i = 0; i < allItems.length; i += batchSize) {
      batches.push(allItems.slice(i, i + batchSize));
    }

    // O executor do AgentFlow deve chamar este node múltiplas vezes
    // Uma por batch, mantendo estado do batch atual
    const currentBatchIndex = context.executionState?.splitInBatches?.currentBatch ?? 0;
    
    if (currentBatchIndex >= batches.length) {
      // Todos batches processados
      return { items: [], isComplete: true };
    }

    const currentBatch = batches[currentBatchIndex];
    const isLastBatch = currentBatchIndex === batches.length - 1;

    const outputItems = currentBatch.map((item, index) => ({
      json: {
        ...item.json,
        _batchIndex: currentBatchIndex,
        _batchSize: currentBatch.length,
        _totalBatches: batches.length,
        _isLastBatch: isLastBatch,
        _itemIndexInBatch: index,
      },
      binary: item.binary,
    }));

    return {
      items: outputItems,
      executionState: {
        splitInBatches: {
          currentBatch: currentBatchIndex + 1,
          totalBatches: batches.length,
          isComplete: isLastBatch,
        },
      },
    };
  }
}
```

---

## 9. Set Node (Definir/Transformar Dados)

**Tipo n8n**: `n8n-nodes-base.set`  
**Versão**: 3.2  
**Fonte**: [docs.n8n.io - Set Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Set)

### O que faz
Define, renomeia, transforma ou remove campos dos items. Suporta expressões nos valores. Modo `manual` (campos definidos) ou `autoMap` (mapear automaticamente).

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `mode` | string | ✅ | `manual`, `autoMap` |
| `values.string[]` | array | ❌ | Campos string: `{name, value}` |
| `values.number[]` | array | ❌ | Campos numéricos: `{name, value}` |
| `values.boolean[]` | array | ❌ | Campos booleanos: `{name, value}` |
| `values.json[]` | array | ❌ | Campos JSON complexos: `{name, value}` |
| `values[].name` | string | ✅ | Nome do campo de saída |
| `values[].value` | string | ✅ | Valor (suporta expressões `={{ ... }}`) |
| `options.keepOnlySet` | boolean | ❌ | Manter apenas campos definidos | `false` |

### Dados de Entrada/Saída

**Entrada**: Array de items

**Saída**: Mesmo array com campos modificados/adicionados
- Se `keepOnlySet=true`: apenas campos definidos no node
- Expressões `={{ $json.campo * 2 }}` avaliadas por item

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/set.ts
import { z } from 'zod';

const SetValueSchema = z.object({
  name: z.string(),
  value: z.string(), // expressão n8n
});

export const SetNodeParamsSchema = z.object({
  mode: z.enum(['manual', 'autoMap']).default('manual'),
  values: z.object({
    string: z.array(SetValueSchema).default([]),
    number: z.array(SetValueSchema).default([]),
    boolean: z.array(SetValueSchema).default([]),
    json: z.array(SetValueSchema).default([]),
  }),
  options: z.object({
    keepOnlySet: z.boolean().default(false),
  }).default({}),
});

export type SetNodeParams = z.infer<typeof SetNodeParamsSchema>;

// packages/api/src/nodes/handlers/set.ts
import { SetNodeParams } from '@agentflow/shared/nodes/set';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class SetNodeHandler implements NodeHandler<SetNodeParams> {
  readonly type = 'n8n-nodes-base.set';
  readonly category = 'transform';

  async execute(
    context: NodeExecutionContext,
    params: SetNodeParams
  ): Promise<NodeOutput> {
    const results = [];

    for (const item of context.inputItems) {
      let outputJson: Record<string, any>;

      if (params.options.keepOnlySet) {
        outputJson = {};
      } else {
        outputJson = { ...item.json };
      }

      // Processar cada tipo de valor
      const allValues = [
        ...params.values.string.map(v => ({ ...v, type: 'string' as const })),
        ...params.values.number.map(v => ({ ...v, type: 'number' as const })),
        ...params.values.boolean.map(v => ({ ...v, type: 'boolean' as const })),
        ...params.values.json.map(v => ({ ...v, type: 'json' as const })),
      ];

      for (const field of allValues) {
        const resolvedValue = this.evaluateExpression(field.value, item, context);
        outputJson[field.name] = this.coerceType(resolvedValue, field.type);
      }

      results.push({
        json: outputJson,
        binary: item.binary,
      });
    }

    return { items: results };
  }

  private evaluateExpression(expr: string, item: any, context: NodeExecutionContext): any {
    // Expressões n8n: {{= ... }} ou {{ ... }}
    // {{= ... }} = avalia expressão JavaScript
    // {{ ... }} = substituição simples
    
    if (expr.startsWith('={{') && expr.endsWith('}}')) {
      const code = expr.slice(3, -2).trim();
      // Safe eval - em produção usar vm2 ou similar
      try {
        return new Function('$json', '$parameter', '$now', '$credentials', 'return ' + code)(
          item.json,
          context.nodeConfig.parameters,
          new Date(),
          context.credentials
        );
      } catch (e) {
        context.logger?.warn(`Expression error: ${code}`, e);
        return null;
      }
    }

    // Substituição simples {{ $json.campo }}
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      if (obj === 'parameter') return String(context.nodeConfig.parameters?.[prop] ?? '');
      return '';
    });
  }

  private coerceType(value: any, type: string): any {
    switch (type) {
      case 'number': return Number(value);
      case 'boolean': return Boolean(value);
      case 'json': 
        try { return typeof value === 'string' ? JSON.parse(value) : value; } 
        catch { return value; }
      default: return String(value);
    }
  }
}
```

---

## 10. OpenAI / LLM Node

**Tipo n8n**: `@n8n/n8n-nodes-langchain.openAi` (LangChain) ou `n8n-nodes-base.openAi` (legacy)  
**Versão**: 1  
**Fonte**: [docs.n8n.io - OpenAI Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.openai/), [GitHub LangChain](https://github.com/n8n-io/n8n/tree/master/packages/nodes-langchain/nodes/openAi)

### O que faz
Chama API da OpenAI (chat, completion, embeddings, images). Integra com LangChain para memory, tools, agents.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `model` | string | ✅ | Modelo OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo` |
| `operation` | string | ✅ | Operação | `chat`, `completion`, `embeddings`, `image` |
| `messages.values[]` | array | ✅ (chat) | Mensagens: `{role, content}` | `[{role: "user", content: "{{ $json.pergunta }}"}]` |
| `options.temperature` | number | ❌ | Temperatura 0-2 | `0.7` |
| `options.maxTokens` | number | ❌ | Max tokens resposta | `2000` |
| `options.topP` | number | ❌ | Nucleus sampling | `1` |

### Dados de Entrada/Saída

**Entrada**: Items com dados para popular mensagens (expressões)

**Saída (chat)**: 
```json
{
  "json": {
    "choices": [{ "message": { "role": "assistant", "content": "Resposta..." } }],
    "usage": { "promptTokens": 10, "completionTokens": 50, "totalTokens": 60 }
  }
}
```

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/openai.ts
import { z } from 'zod';

export const OpenAiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});

export const OpenAiNodeParamsSchema = z.object({
  model: z.string().default('gpt-4o-mini'),
  operation: z.enum(['chat', 'completion', 'embeddings', 'image']).default('chat'),
  messages: z.object({
    values: z.array(OpenAiMessageSchema).default([]),
  }),
  options: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).default(1),
    frequencyPenalty: z.number().min(-2).max(2).default(0),
    presencePenalty: z.number().min(-2).max(2).default(0),
  }).default({}),
});

export type OpenAiNodeParams = z.infer<typeof OpenAiNodeParamsSchema>;

// packages/api/src/nodes/handlers/openai.ts
import { OpenAiNodeParams } from '@agentflow/shared/nodes/openai';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';
import OpenAI from 'openai';

export class OpenAiNodeHandler implements NodeHandler<OpenAiNodeParams> {
  readonly type = '@n8n/n8n-nodes-langchain.openAi';
  readonly category = 'ai';

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async execute(
    context: NodeExecutionContext,
    params: OpenAiNodeParams
  ): Promise<NodeOutput> {
    const results = [];

    for (const item of context.inputItems) {
      // Resolver mensagens com expressões
      const messages = params.messages.values.map(msg => ({
        role: msg.role,
        content: this.resolveExpression(msg.content, item, context),
      }));

      try {
        let response;
        
        switch (params.operation) {
          case 'chat':
            response = await this.client.chat.completions.create({
              model: params.model,
              messages,
              temperature: params.options.temperature,
              max_tokens: params.options.maxTokens,
              top_p: params.options.topP,
              frequency_penalty: params.options.frequencyPenalty,
              presence_penalty: params.options.presencePenalty,
            });
            results.push({
              json: {
                choices: response.choices.map(c => ({
                  message: { role: c.message.role, content: c.message.content },
                })),
                usage: response.usage,
              },
              binary: {},
            });
            break;

          case 'embeddings':
            response = await this.client.embeddings.create({
              model: params.model,
              input: messages.map(m => m.content).join('\n'),
            });
            results.push({
              json: { embeddings: response.data.map(d => d.embedding) },
              binary: {},
            });
            break;

          case 'image':
            // DALL-E
            response = await this.client.images.generate({
              model: 'dall-e-3',
              prompt: messages[0]?.content || '',
              n: 1,
              size: '1024x1024',
            });
            results.push({
              json: { url: response.data[0].url },
              binary: {},
            });
            break;
        }
      } catch (error) {
        if (context.nodeConfig.continueOnFail) {
          results.push({
            json: { error: error.message },
            binary: {},
            error: error.message,
          });
        } else {
          throw error;
        }
      }
    }

    return { items: results };
  }

  private resolveExpression(expr: string, item: any, context: NodeExecutionContext): string {
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      if (obj === 'parameter') return String(context.nodeConfig.parameters?.[prop] ?? '');
      return '';
    });
  }
}
```

---

## 11. Telegram Node

**Tipo n8n**: `n8n-nodes-base.telegram`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Telegram](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.telegram/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Telegram)

### O que faz
Envia mensagens, fotos, documentos via Bot API do Telegram. Requer credencial `telegramApi` (bot token).

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `sendMessage`, `sendPhoto`, `sendDocument`, `editMessage`, `deleteMessage`, `getUpdates` |
| `chatId` | string | ✅ | Chat ID (expressão) |
| `text` | string | ✅ (sendMessage) | Texto da mensagem |
| `options.parseMode` | string | ❌ | `Markdown`, `HTML`, `None` |
| `options.disableNotification` | boolean | ❌ | Enviar silenciosamente |

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/telegram.ts
import { z } from 'zod';

export const TelegramNodeParamsSchema = z.object({
  operation: z.enum(['sendMessage', 'sendPhoto', 'sendDocument', 'editMessage', 'deleteMessage', 'getUpdates']),
  chatId: z.string(),
  text: z.string().optional(),
  caption: z.string().optional(),
  options: z.object({
    parseMode: z.enum(['Markdown', 'HTML', 'None']).default('Markdown'),
    disableNotification: z.boolean().default(false),
    replyToMessageId: z.number().optional(),
  }).default({}),
});

export type TelegramNodeParams = z.infer<typeof TelegramNodeParamsSchema>;

// packages/api/src/nodes/handlers/telegram.ts
import { TelegramNodeParams } from '@agentflow/shared/nodes/telegram';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class TelegramNodeHandler implements NodeHandler<TelegramNodeParams> {
  readonly type = 'n8n-nodes-base.telegram';
  readonly category = 'communication';

  async execute(
    context: NodeExecutionContext,
    params: TelegramNodeParams
  ): Promise<NodeOutput> {
    const botToken = context.credentials?.accessToken;
    if (!botToken) throw new Error('Telegram bot token not configured');

    const results = [];

    for (const item of context.inputItems) {
      const chatId = this.resolveExpression(params.chatId, item, context);
      
      try {
        let response;
        const baseUrl = `https://api.telegram.org/bot${botToken}`;

        switch (params.operation) {
          case 'sendMessage': {
            const text = this.resolveExpression(params.text!, item, context);
            response = await fetch(`${baseUrl}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: params.options.parseMode,
                disable_notification: params.options.disableNotification,
                reply_to_message_id: params.options.replyToMessageId,
              }),
            });
            break;
          }
          case 'sendPhoto': {
            // Requer binary data no item
            const photo = item.binary?.photo || item.binary?.file;
            if (!photo) throw new Error('No photo binary data found');
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', Buffer.from(photo.data), photo.fileName || 'photo.jpg');
            if (params.caption) formData.append('caption', this.resolveExpression(params.caption, item, context));
            
            response = await fetch(`${baseUrl}/sendPhoto`, {
              method: 'POST',
              body: formData,
            });
            break;
          }
          // ... outras operações similares
        }

        const data = await response.json();
        results.push({
          json: data,
          binary: {},
        });
      } catch (error) {
        if (context.nodeConfig.continueOnFail) {
          results.push({ json: { error: error.message }, binary: {}, error: error.message });
        } else {
          throw error;
        }
      }
    }

    return { items: results };
  }

  private resolveExpression(expr: string, item: any, context: NodeExecutionContext): string {
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      return '';
    });
  }
}
```

---

## 12. Gmail Node

**Tipo n8n**: `n8n-nodes-base.gmail`  
**Versão**: 1.2  
**Fonte**: [docs.n8n.io - Gmail](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.gmail/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Gmail)

### O que faz
Envia, lê, gerencia emails via Gmail API (OAuth2). Requer credencial `gmailOAuth2Api`.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `send`, `get`, `getAll`, `delete`, `modifyLabels`, `sendRaw` |
| `fromEmail` | string | ✅ (send) | Email remetente |
| `toEmail` | string | ✅ (send) | Email destinatário |
| `subject` | string | ✅ (send) | Assunto |
| `text` | string | ✅ (send) | Corpo texto |
| `html` | string | ❌ (send) | Corpo HTML |
| `options.attachments[]` | array | ❌ | Anexos (binary data) |

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/gmail.ts
import { z } from 'zod';

export const GmailNodeParamsSchema = z.object({
  operation: z.enum(['send', 'get', 'getAll', 'delete', 'modifyLabels', 'sendRaw']),
  fromEmail: z.string().optional(),
  toEmail: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  options: z.object({
    cc: z.string().optional(),
    bcc: z.string().optional(),
    attachments: z.array(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      data: z.string(), // base64
    })).optional(),
  }).default({}),
});

export type GmailNodeParams = z.infer<typeof GmailNodeParamsSchema>;

// packages/api/src/nodes/handlers/gmail.ts
import { GmailNodeParams } from '@agentflow/shared/nodes/gmail';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';
import { google } from 'googleapis';

export class GmailNodeHandler implements NodeHandler<GmailNodeParams> {
  readonly type = 'n8n-nodes-base.gmail';
  readonly category = 'communication';

  async execute(
    context: NodeExecutionContext,
    params: GmailNodeParams
  ): Promise<NodeOutput> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: context.credentials?.accessToken,
      refresh_token: context.credentials?.refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const results = [];

    for (const item of context.inputItems) {
      try {
        let response;
        
        switch (params.operation) {
          case 'send': {
            const to = this.resolveExpression(params.toEmail!, item, context);
            const subject = this.resolveExpression(params.subject!, item, context);
            const text = this.resolveExpression(params.text!, item, context);
            const html = params.html ? this.resolveExpression(params.html, item, context) : undefined;

            // Construir email MIME
            const email = this.buildMimeMessage({
              from: params.fromEmail,
              to,
              subject,
              text,
              html,
              attachments: params.options.attachments?.map(a => ({
                filename: a.fileName,
                content: Buffer.from(a.data, 'base64'),
                contentType: a.mimeType,
              })),
            });

            const encoded = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
            
            response = await gmail.users.messages.send({
              userId: 'me',
              requestBody: { raw: encoded },
            });
            break;
          }
          case 'getAll': {
            response = await gmail.users.messages.list({
              userId: 'me',
              maxResults: 10,
              q: 'is:unread',
            });
            break;
          }
          // ... outras operações
        }

        results.push({
          json: response.data,
          binary: {},
        });
      } catch (error) {
        if (context.nodeConfig.continueOnFail) {
          results.push({ json: { error: error.message }, binary: {}, error: error.message });
        } else {
          throw error;
        }
      }
    }

    return { items: results };
  }

  private buildMimeMessage(opts: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{filename: string, content: Buffer, contentType: string}>;
  }): string {
    // Implementação simplificada - usar nodemailer ou similar em produção
    let message = `From: ${opts.from}\nTo: ${opts.to}\nSubject: ${opts.subject}\n`;
    message += `MIME-Version: 1.0\n`;
    
    if (opts.attachments?.length) {
      message += `Content-Type: multipart/mixed; boundary="boundary"\n\n`;
      message += `--boundary\n`;
      message += `Content-Type: text/plain; charset="UTF-8"\n\n`;
      message += `${opts.text}\n`;
      
      for (const att of opts.attachments) {
        message += `--boundary\n`;
        message += `Content-Type: ${att.contentType}; name="${att.filename}"\n`;
        message += `Content-Transfer-Encoding: base64\n`;
        message += `Content-Disposition: attachment; filename="${att.filename}"\n\n`;
        message += `${att.content.toString('base64')}\n`;
      }
      message += `--boundary--`;
    } else {
      message += `Content-Type: text/plain; charset="UTF-8"\n\n`;
      message += `${opts.text}`;
    }
    
    return message;
  }

  private resolveExpression(expr: string, item: any, context: NodeExecutionContext): string {
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      return '';
    });
  }
}
```

---

## 13. Google Sheets Node

**Tipo n8n**: `n8n-nodes-base.googleSheets`  
**Versão**: 4.1  
**Fonte**: [docs.n8n.io - Google Sheets](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.googlesheets/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/GoogleSheets)

### O que faz
Lê, escreve, atualiza, apaga dados no Google Sheets via API. Requer credencial `googleSheetsOAuth2Api`.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `operation` | string | ✅ | `append`, `get`, `getAll`, `update`, `delete`, `clear` |
| `sheetId` | string | ✅ | ID da planilha (da URL) |
| `range` | string | ✅ | Range A1 notation | `A:Z`, `Sheet1!A1:D10` |
| `options.valueInputMode` | string | ❌ | `RAW`, `USER_ENTERED` |
| `columns.mappingMode` | string | ✅ | `defineBelow`, `autoMapInputData` |
| `columns.value[]` | array | ✅ (defineBelow) | Mapeamento: `{columnName, value}` |

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/googleSheets.ts
import { z } from 'zod';

export const GoogleSheetsColumnSchema = z.object({
  columnName: z.string(),
  value: z.string(), // expressão n8n
});

export const GoogleSheetsNodeParamsSchema = z.object({
  operation: z.enum(['append', 'get', 'getAll', 'update', 'delete', 'clear']),
  sheetId: z.string(),
  range: z.string(),
  options: z.object({
    valueInputMode: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED'),
    includeHeaders: z.boolean().default(true),
  }).default({}),
  columns: z.object({
    mappingMode: z.enum(['defineBelow', 'autoMapInputData']),
    value: z.array(GoogleSheetsColumnSchema).default([]),
  }),
});

export type GoogleSheetsNodeParams = z.infer<typeof GoogleSheetsNodeParamsSchema>;

// packages/api/src/nodes/handlers/googleSheets.ts
import { GoogleSheetsNodeParams } from '@agentflow/shared/nodes/googleSheets';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';
import { google } from 'googleapis';

export class GoogleSheetsNodeHandler implements NodeHandler<GoogleSheetsNodeParams> {
  readonly type = 'n8n-nodes-base.googleSheets';
  readonly category = 'data';

  async execute(
    context: NodeExecutionContext,
    params: GoogleSheetsNodeParams
  ): Promise<NodeOutput> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: context.credentials?.accessToken,
      refresh_token: context.credentials?.refreshToken,
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const results = [];

    for (const item of context.inputItems) {
      try {
        let response;
        const sheetId = this.resolveExpression(params.sheetId, item, context);
        const range = this.resolveExpression(params.range, item, context);

        switch (params.operation) {
          case 'append': {
            const values = params.columns.value.map(col => 
              this.resolveExpression(col.value, item, context)
            );
            
            response = await sheets.spreadsheets.values.append({
              spreadsheetId: sheetId,
              range,
              valueInputOption: params.options.valueInputMode,
              requestBody: { values: [values] },
            });
            break;
          }
          case 'get':
          case 'getAll': {
            response = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range,
            });
            break;
          }
          case 'update': {
            const values = params.columns.value.map(col => 
              this.resolveExpression(col.value, item, context)
            );
            response = await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range,
              valueInputOption: params.options.valueInputMode,
              requestBody: { values: [values] },
            });
            break;
          }
          case 'clear': {
            response = await sheets.spreadsheets.values.clear({
              spreadsheetId: sheetId,
              range,
            });
            break;
          }
        }

        results.push({
          json: response.data,
          binary: {},
        });
      } catch (error) {
        if (context.nodeConfig.continueOnFail) {
          results.push({ json: { error: error.message }, binary: {}, error: error.message });
        } else {
          throw error;
        }
      }
    }

    return { items: results };
  }

  private resolveExpression(expr: string, item: any, context: NodeExecutionContext): string {
    return expr.replace(/\{\{\s*\$(\w+)\.(\w+)\s*\}\}/g, (_, obj, prop) => {
      if (obj === 'json') return String(item.json?.[prop] ?? '');
      if (obj === 'now') return new Date().toISOString();
      return '';
    });
  }
}
```

---

## 14. Form Trigger Node

**Tipo n8n**: `n8n-nodes-base.formTrigger`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Form Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/FormTrigger)

### O que faz
Cria formulário web hospedado pelo n8n. Quando submetido, dispara workflow com dados do formulário. Gera página HTML automática.

### Parâmetros Principais

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
| `fields.values[].options[]` | array | ❌ | Para select/radio: `{label, value}` |
| `options.successMessage` | string | ❌ | Mensagem de sucesso |
| `options.redirectUrl` | string | ❌ | URL de redirecionamento após submit |

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/formTrigger.ts
import { z } from 'zod';

export const FormFieldSchema = z.object({
  fieldType: z.enum(['text', 'email', 'number', 'textarea', 'select', 'checkbox', 'radio', 'date', 'file']),
  fieldLabel: z.string(),
  fieldName: z.string(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});

export const FormTriggerNodeParamsSchema = z.object({
  formTitle: z.string(),
  formDescription: z.string().optional(),
  fields: z.object({
    values: z.array(FormFieldSchema).min(1),
  }),
  options: z.object({
    successMessage: z.string().default('Enviado com sucesso!'),
    redirectUrl: z.string().optional(),
  }).default({}),
});

export type FormTriggerNodeParams = z.infer<typeof FormTriggerNodeParamsSchema>;

// packages/api/src/nodes/handlers/formTrigger.ts
import { FormTriggerNodeParams } from '@agentflow/shared/nodes/formTrigger';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class FormTriggerHandler implements NodeHandler<FormTriggerNodeParams> {
  readonly type = 'n8n-nodes-base.formTrigger';
  readonly category = 'trigger';

  async execute(
    context: NodeExecutionContext,
    params: FormTriggerNodeParams
  ): Promise<NodeOutput> {
    // Form trigger é registrado como rota GET (exibir formulário) e POST (processar submit)
    // No AgentFlow, geramos HTML do formulário dinamicamente
    
    if (context.triggerData?.method === 'GET') {
      // Retornar HTML do formulário
      const html = this.generateFormHtml(params);
      context.fastifyReply?.type('text/html').send(html);
      return { items: [] };
    }

    // POST - processar submissão
    const formData = context.triggerData?.body || {};
    const validated = this.validateForm(formData, params.fields.values);

    return {
      items: [{
        json: validated,
        binary: {},
        _form: {
          formId: context.webhookId,
          submittedAt: new Date().toISOString(),
        },
      }],
    };
  }

  private generateFormHtml(params: FormTriggerNodeParams): string {
    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>${this.escapeHtml(params.formTitle)}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    .field { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
    input, select, textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    input[type="checkbox"], input[type="radio"] { width: auto; }
    .required::after { content: " *"; color: red; }
    button { background: #007bff; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(params.formTitle)}</h1>
  ${params.formDescription ? `<p>${this.escapeHtml(params.formDescription)}</p>` : ''}
  <form method="POST" enctype="multipart/form-data">
`;

    for (const field of params.fields.values) {
      html += this.generateFieldHtml(field);
    }

    html += `
    <button type="submit">Enviar</button>
  </form>
</body>
</html>`;

    return html;
  }

  private generateFieldHtml(field: z.infer<typeof FormFieldSchema>): string {
    const required = field.required ? ' required' : '';
    const requiredMark = field.required ? '<span class="required"></span>' : '';
    const placeholder = field.placeholder ? ` placeholder="${this.escapeHtml(field.placeholder)}"` : '';
    
    let inputHtml = '';
    switch (field.fieldType) {
      case 'textarea':
        inputHtml = `<textarea name="${field.fieldName}"${required}${placeholder}></textarea>`;
        break;
      case 'select':
        inputHtml = `<select name="${field.fieldName}"${required}>`;
        for (const opt of field.options || []) {
          inputHtml += `<option value="${this.escapeHtml(opt.value)}">${this.escapeHtml(opt.label)}</option>`;
        }
        inputHtml += '</select>';
        break;
      case 'checkbox':
      case 'radio':
        inputHtml = '';
        for (const opt of field.options || []) {
          inputHtml += `<label><input type="${field.fieldType}" name="${field.fieldName}" value="${this.escapeHtml(opt.value)}"${required}> ${this.escapeHtml(opt.label)}</label> `;
        }
        break;
      default:
        inputHtml = `<input type="${field.fieldType}" name="${field.fieldName}"${required}${placeholder}>`;
    }

    return `
    <div class="field">
      <label for="${field.fieldName}">${this.escapeHtml(field.fieldLabel)}${requiredMark}</label>
      ${inputHtml}
    </div>`;
  }

  private validateForm(formData: Record<string, any>, fields: z.infer<typeof FormFieldSchema>[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const field of fields) {
      const value = formData[field.fieldName];
      if (field.required && (!value || value === '')) {
        throw new Error(`Campo obrigatório: ${field.fieldLabel}`);
      }
      result[field.fieldName] = value;
    }
    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }
}
```

---

## 15. Error Trigger Node

**Tipo n8n**: `n8n-nodes-base.errorTrigger`  
**Versão**: 1  
**Fonte**: [docs.n8n.io - Error Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/ErrorTrigger)

### O que faz
Monitora erros em workflows especificados (ou todos) e dispara workflow de erro quando ocorre falha. Útil para alertas, logging, recuperação.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `workflowIds` | array[string] | ❌ | IDs dos workflows para monitorar (vazio = todos) |
| `include` | string | ❌ | `all` (todos erros), `production` (só produção) |

### Dados de Entrada/Saída

**Entrada**: Nenhuma (trigger reativo a erros)

**Saída**: Item com detalhes do erro:
```json
{
  "json": {
    "error": { "message": "...", "stack": "...", "code": "..." },
    "workflow": { "id": "...", "name": "..." },
    "execution": { "id": "...", "mode": "manual", "startedAt": "..." }
  },
  "binary": {}
}
```

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/errorTrigger.ts
import { z } from 'zod';

export const ErrorTriggerNodeParamsSchema = z.object({
  workflowIds: z.array(z.string()).default([]),
  include: z.enum(['all', 'production']).default('all'),
});

export type ErrorTriggerNodeParams = z.infer<typeof ErrorTriggerNodeParamsSchema>;

// packages/api/src/nodes/handlers/errorTrigger.ts
import { ErrorTriggerNodeParams } from '@agentflow/shared/nodes/errorTrigger';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class ErrorTriggerHandler implements NodeHandler<ErrorTriggerNodeParams> {
  readonly type = 'n8n-nodes-base.errorTrigger';
  readonly category = 'trigger';

  // Este node não executa no fluxo normal
  // É registrado no sistema de eventos de erro do executor
  
  async execute(
    context: NodeExecutionContext,
    params: ErrorTriggerNodeParams
  ): Promise<NodeOutput> {
    // Registrar listener de erros
    context.eventBus?.on('workflow:error', (errorEvent: any) => {
      // Filtrar por workflowIds se especificado
      if (params.workflowIds.length > 0 && !params.workflowIds.includes(errorEvent.workflowId)) {
        return;
      }
      // Filtrar por include (production only)
      if (params.include === 'production' && errorEvent.mode !== 'production') {
        return;
      }

      // Disparar este workflow com dados do erro
      context.workflowEngine?.triggerWorkflow(context.workflowId, {
        json: {
          error: errorEvent.error,
          workflow: errorEvent.workflow,
          execution: errorEvent.execution,
        },
        binary: {},
      });
    });

    return { items: [{ json: { registered: true }, binary: {} }] };
  }
}
```

---

## 16. Wait Node (Aguardar)

**Tipo n8n**: `n8n-nodes-base.wait`  
**Versão**: 1.1  
**Fonte**: [docs.n8n.io - Wait Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/), [GitHub](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/Wait)

### O que faz
Pausa execução do workflow por tempo determinado ou até receber webhook de retomada. Útil para delays, rate limiting, aguardar eventos externos.

### Parâmetros Principais

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `amount` | number | ✅ | Quantidade de tempo |
| `unit` | string | ✅ | `seconds`, `minutes`, `hours`, `days`, `weeks` |
| `options.resumeOn` | string | ❌ | `time` (padrão), `webhook` |
| `options.webhookUrl` | string | ✅ (se webhook) | URL para receber resume |

### Dados de Entrada/Saída

**Entrada**: Items a serem processados após espera

**Saída**: Mesmos items (pass-through) após delay
- Metadata: `_waitedMs`, `_resumedAt`

### Handler TypeScript Sugerido (AgentFlow)

```typescript
// packages/shared/src/nodes/wait.ts
import { z } from 'zod';

export const WaitNodeParamsSchema = z.object({
  amount: z.number().positive(),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days', 'weeks']),
  options: z.object({
    resumeOn: z.enum(['time', 'webhook']).default('time'),
    webhookUrl: z.string().url().optional(),
  }).default({}),
});

export type WaitNodeParams = z.infer<typeof WaitNodeParamsSchema>;

// packages/api/src/nodes/handlers/wait.ts
import { WaitNodeParams } from '@agentflow/shared/nodes/wait';
import { NodeExecutionContext, NodeHandler, NodeOutput } from '@agentflow/shared/nodes/types';

export class WaitNodeHandler implements NodeHandler<WaitNodeParams> {
  readonly type = 'n8n-nodes-base.wait';
  readonly category = 'flowControl';

  async execute(
    context: NodeExecutionContext,
    params: WaitNodeParams
  ): Promise<NodeOutput> {
    if (params.options.resumeOn === 'webhook') {
      // Modo webhook: pausa execução e aguarda chamada externa
      // Registrar callback de resume
      const resumeToken = crypto.randomUUID();
      context.executionState = {
        ...context.executionState,
        wait: { resumeToken, waitingSince: new Date().toISOString() },
      };
      
      // Salvar estado e pausar (bullmq job fica waiting)
      await context.executionRepository.saveExecutionState(context.executionId, context.executionState);
      
      // Retornar sinal de pausa para executor
      return {
        items: [],
        paused: true,
        pauseMetadata: { resumeToken, resumeUrl: params.options.webhookUrl },
      };
    }

    // Modo tempo: aguardar e continuar
    const ms = this.convertToMs(params.amount, params.unit);
    await this.sleep(ms);

    return {
      items: context.inputItems.map(item => ({
        ...item,
        json: {
          ...item.json,
          _waitedMs: ms,
          _resumedAt: new Date().toISOString(),
        },
      })),
    };
  }

  private convertToMs(amount: number, unit: string): number {
    const multipliers = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
    };
    return amount * (multipliers[unit as keyof typeof multipliers] || 1000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Endpoint para resume via webhook
  static async handleResume(
    context: NodeExecutionContext,
    resumeToken: string,
    resumeData?: any
  ): Promise<NodeOutput> {
    // Verificar token, restaurar estado, continuar execução
    const executionState = await context.executionRepository.getExecutionState(context.executionId);
    if (executionState?.wait?.resumeToken !== resumeToken) {
      throw new Error('Invalid resume token');
    }

    // Continuar com dados do resume se fornecidos
    const inputItems = resumeData 
      ? [{ json: resumeData, binary: {} }]
      : context.inputItems;

    return {
      items: inputItems.map(item => ({
        ...item,
        json: {
          ...item.json,
          _resumedAt: new Date().toISOString(),
          _resumeData: resumeData,
        },
      })),
    };
  }
}
```

---

## Tabela Consolidada: Node Types → Handler TS

| Node Type n8n | Handler Class | Arquivo Sugerido | Prioridade | Dependências Externas |
|---------------|---------------|------------------|------------|----------------------|
| `n8n-nodes-base.webhook` | `WebhookTriggerHandler` | `api/src/nodes/handlers/webhook.ts` | 🔴 Crítica | Fastify, HMAC crypto |
| `n8n-nodes-base.cron` | `CronTriggerHandler` | `api/src/nodes/handlers/cron.ts` | 🔴 Crítica | bullmq repeatable jobs |
| `n8n-nodes-base.httpRequest` | `HttpRequestHandler` | `api/src/nodes/handlers/httpRequest.ts` | 🔴 Crítica | fetch, credentials |
| `n8n-nodes-base.if` | `IfNodeHandler` | `api/src/nodes/handlers/if.ts` | 🟡 Alta | Expression engine |
| `n8n-nodes-base.switch` | `SwitchNodeHandler` | `api/src/nodes/handlers/switch.ts` | 🟡 Alta | Expression engine |
| `n8n-nodes-base.function` | `FunctionNodeHandler` | `api/src/nodes/handlers/function.ts` | 🔴 Crítica | vm2/isolated-vm sandbox |
| `n8n-nodes-base.merge` | `MergeNodeHandler` | `api/src/nodes/handlers/merge.ts` | 🟡 Alta | Multi-input support |
| `n8n-nodes-base.splitInBatches` | `SplitInBatchesHandler` | `api/src/nodes/handlers/splitInBatches.ts` | 🟡 Alta | Execution state persistence |
| `n8n-nodes-base.set` | `SetNodeHandler` | `api/src/nodes/handlers/set.ts` | 🔴 Crítica | Expression engine |
| `@n8n/n8n-nodes-langchain.openAi` | `OpenAiNodeHandler` | `api/src/nodes/handlers/openai.ts` | 🔴 Crítica | openai SDK |
| `n8n-nodes-base.telegram` | `TelegramNodeHandler` | `api/src/nodes/handlers/telegram.ts` | 🟡 Alta | Telegram Bot API |
| `n8n-nodes-base.gmail` | `GmailNodeHandler` | `api/src/nodes/handlers/gmail.ts` | 🟡 Alta | googleapis, OAuth2 |
| `n8n-nodes-base.googleSheets` | `GoogleSheetsNodeHandler` | `api/src/nodes/handlers/googleSheets.ts` | 🟡 Alta | googleapis, OAuth2 |
| `n8n-nodes-base.formTrigger` | `FormTriggerHandler` | `api/src/nodes/handlers/formTrigger.ts` | 🟢 Média | HTML generation |
| `n8n-nodes-base.errorTrigger` | `ErrorTriggerHandler` | `api/src/nodes/handlers/errorTrigger.ts` | 🟢 Média | Event bus |
| `n8n-nodes-base.wait` | `WaitNodeHandler` | `api/src/nodes/handlers/wait.ts` | 🟡 Alta | Execution persistence |

---

## Arquitetura Comum: Node Handler Interface

```typescript
// packages/shared/src/nodes/types.ts
export interface NodeExecutionContext {
  workflowId: string;
  workflowName: string;
  executionId: string;
  nodeConfig: {
    name: string;
    type: string;
    typeVersion: number;
    parameters: any;
    position: [number, number];
    continueOnFail: boolean;
    retryOnFail: boolean;
    maxTries: number;
    waitBetweenTries: number;
  };
  inputItems: NodeItem[];
  multiInputItems?: Map<number, NodeItem[]>; // para Merge
  credentials?: Record<string, any>; // resolvidas do vault
  triggerData?: {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: any;
    rawBody: Buffer;
  };
  webhookSecret?: string;
  workflowSettings?: {
    executionTimeout: number;
    timezone: string;
    errorWorkflow?: string;
  };
  workflowData?: Record<string, any>;
  logger?: Logger;
  queue: Queue; // bullmq
  executionRepository: ExecutionRepository;
  eventBus: EventBus;
  workflowEngine: WorkflowEngine;
  fastifyReply?: FastifyReply;
}

export interface NodeItem {
  json: Record<string, any>;
  binary: Record<string, BinaryData>;
  error?: string;
  _webhook?: any;
  _batchIndex?: number;
  _isLastBatch?: boolean;
}

export interface BinaryData {
  data: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface NodeOutput {
  items: NodeItem[];
  outputRouting?: Record<number, NodeItem[]>; // para IF, Switch, Merge
  executionState?: Record<string, any>; // estado persistido entre execuções
  paused?: boolean; // para Wait webhook
  pauseMetadata?: { resumeToken: string; resumeUrl?: string };
  isComplete?: boolean; // para SplitInBatches
}

export interface NodeHandler<TParams = any> {
  readonly type: string;
  readonly category: 'trigger' | 'action' | 'transform' | 'flowControl' | 'ai' | 'communication' | 'data';
  execute(context: NodeExecutionContext, params: TParams): Promise<NodeOutput>;
}
```

---

## Expression Engine (Subset n8n)

O expression engine n8n `{{ $json.campo }}` deve ser implementado como parser leve:

```typescript
// packages/shared/src/expressions/engine.ts
export class ExpressionEngine {
  // Suporta:
  // {{ $json.path.to.value }}
  // {{ $query.param }}
  // {{ $header.name }}
  // {{ $now }}
  // {{ $parameter.name }}
  // {{ $credentials.name }}
  // {{ $workflow.id }}
  // {{= expressão JS }}  (avaliação completa)
  // Funções: $json.campo.toUpperCase(), $json.array.length, etc.
  
  evaluate(expression: string, context: ExpressionContext): any;
  parse(expression: string): ExpressionAST;
}

// packages/shared/src/expressions/context.ts
export interface ExpressionContext {
  json: Record<string, any>;
  query: Record<string, string>;
  header: Record<string, string>;
  now: Date;
  parameter: Record<string, any>;
  credentials: Record<string, any>;
  workflow: Record<string, any>;
  item: NodeItem;
  input: { all: () => NodeItem[]; first: () => NodeItem; item: (i: number) => NodeItem };
}
```

---

## Próximos Passos para Builder

1. **Criar package `@agentflow/nodes`** com schemas zod + types base
2. **Implementar `ExpressionEngine`** (subset n8n compatível)
3. **Implementar `WorkflowExecutor`** usando bullmq parent/child jobs para DAG
4. **Criar handlers prioridade 🔴 Crítica** (Webhook, Cron, HTTP Request, IF, Function, Set, OpenAI)
5. **Criar handlers prioridade 🟡 Alta** (Switch, Merge, SplitInBatches, Wait, Telegram, Gmail, Google Sheets)
6. **Criar handlers prioridade 🟢 Média** (Form Trigger, Error Trigger)
7. **Registrar nodes no NodeRegistry** para descoberta dinâmica
8. **Testar com fixtures** em `n8n-migration/fixtures/`

---

## Fontes e Referências

| Node | Docs n8n | GitHub n8n-io/n8n |
|------|----------|-------------------|
| Webhook | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/ | packages/nodes-base/nodes/Webhook |
| Cron | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.cron/ | packages/nodes-base/nodes/Cron |
| HTTP Request | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/ | packages/nodes-base/nodes/HttpRequest |
| IF | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/ | packages/nodes-base/nodes/If |
| Switch | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch/ | packages/nodes-base/nodes/Switch |
| Function | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.function/ | packages/nodes-base/nodes/Function |
| Merge | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/ | packages/nodes-base/nodes/Merge |
| SplitInBatches | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/ | packages/nodes-base/nodes/SplitInBatches |
| Set | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/ | packages/nodes-base/nodes/Set |
| OpenAI | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.openai/ | packages/nodes-langchain/nodes/openAi |
| Telegram | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.telegram/ | packages/nodes-base/nodes/Telegram |
| Gmail | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.gmail/ | packages/nodes-base/nodes/Gmail |
| Google Sheets | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.googlesheets/ | packages/nodes-base/nodes/GoogleSheets |
| Form Trigger | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/ | packages/nodes-base/nodes/FormTrigger |
| Error Trigger | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/ | packages/nodes-base/nodes/ErrorTrigger |
| Wait | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/ | packages/nodes-base/nodes/Wait |

---

**Arquivo**: `n8n-migration/catalogo-nodes.md`  
**Status**: ✅ Completo - 16 node types documentados com handlers TS sugeridos  
**Próximo**: Builder implementa handlers prioridade 🔴 Crítica primeiro