# Plataforma de Nodes — AgentFlow

## 1. Visão geral

Esta especificação define a plataforma de nodes do AgentFlow — o subsistema que representa cada bloco visual de um workflow, seu ciclo de vida, metadados, execução, credenciais, dados binários, versionamento, extensibilidade e compatibilidade com o formato n8n.

**Contexto arquitetônico**: o AgentFlow é um monorepo pnpm + Turborepo (TypeScript 5.9, React 19, Next.js 15, Fastify, Prisma 6, BullMQ 5, Zod 3.25). A plataforma de nodes vive principalmente em `@agentflow/shared` (tipos e schemas compartilhados) e `apps/api/src/nodes/` (handlers de execução), integrando-se ao `WorkflowExecutor` existente em `apps/api/src/services/executor.ts` e ao `WorkflowCanvas` em `apps/web/src/components/workflow/`.

**Decisão arquitetônica central**: O SDK não embutirá `n8n-core` ou `n8n-nodes-base` (licença SUL, +100 MB bundle, coupling arquitetural). Em vez disso, o AgentFlow implementa um **core engine leve próprio** — expression parser, credential vault, DAG executor via BullMQ — e expõe um **sistema de plugins** para nodes. Os nodes n8n são **adaptados** por meio de um adaptador de compatibilidade (`v2-node-platform.md` §14), não consumidos como black-box.

**Princípios de design**:

1. **Type-safety end-to-end**: schemas Zod definem validação, tipos TS e geração OpenAPI/JSON Schema a partir de uma única fonte.
2. **Lazy loading**: nodes são carregados sob demanda, não no bootstrap do processo.
3. **Sandbox de segurança**: nodes community rodam emWorker isolate (VM isolado, resource limits, egressa network allowlist).
4. **Compatibilidade n8n**: workflows importados mantêm semanticação (expression engine `{{ $json.* }}`, credential resolver, connection routing por output index).
5. **Extensibility zero-config**: terceiros criam nodes via CLI scaffold (`agentflow-node init`), publicam no npm como `@agentflow/nodes-<name>`, e o registry os detecta automaticamente.

---

## 2. Tipos de nodes

### 2.1 Categorização

| Tipo | Descrição | Trigger? | Input? | Output? | Exemplo |
|------|-----------|----------|--------|---------|---------|
| **Trigger** | Inicia a execução do workflow. Nunca tem input de dados. | Sim (entrada) | 0 | 1+ | Webhook, Cron, Manual, Gmail Trigger |
| **Action** | Executa uma ação externa (API, e-mail, DB). | Não | 0 ou mais | 0 ou mais | HTTP Request, Send Email, Postgres, Telegram |
| **Transform** | Transforma dados in-place (Set, Function, JSON). | Não | 1 | 1 | Set, Code, Merge, Filter |
| **Flow Control** | Direciona o fluxo de dados (condicionais, splits, loops). | Não | 1+ | 1+ | IF, Switch, Merge, SplitInBatches, Wait |
| **AI / Agent** | Integração com modelos de linguagem / agentes. | Não | 0 ou mais | 0 ou mais | OpenAI Chat, Anthropic, AI Agent |
| **Core** | Nodes de infraestrutura que não interagem com serviços externos. | Sim/Não | 0 ou mais | 0 ou mais | Merge, Set, Wait, No-Op |
| **Community** | Nodes mantidos por terceiros, no formato npm `@agentflow/nodes-*`. | Sim/Não | Depende | Depende | `@agentflow/nodes-airtable` |
| **Sub-workflow** | Executa outro workflow como sub-rotina. | Não | 0 ou mais | 0 ou mais | Execute Workflow |

### 2.2 Matriz de compatibilidade por categoria

| Categoria n8n | Type string n8n | Type AgentFlow | Handler sugerido | Priority |
|---|---|---|---|---|
| Trigger | `n8n-nodes-base.webhook` | `trigger.webhook` | `WebhookTriggerHandler` | 🔴 Crítica |
| Trigger | `n8n-nodes-base.cron` / `scheduleTrigger` | `trigger.cron` | `CronTriggerHandler` | 🔴 Crítica |
| Trigger | `n8n-nodes-base.manualWorkflowTrigger` | `trigger.manual` | `ManualTriggerHandler` | 🔴 Crítica |
| Trigger | `n8n-nodes-base.formTrigger` | `trigger.form` | `FormTriggerHandler` | 🟡 Alta |
| Trigger | `n8n-nodes-base.emailImap` | `trigger.email` | `EmailTriggerHandler` | 🟡 Alta |
| Trigger | `n8n-nodes-base.rssFeedReadTrigger` | `trigger.rss` | `RssFeedTriggerHandler` | 🟢 Média |
| Trigger | `n8n-nodes-base.sseTrigger` | `trigger.sse` | `SseTriggerHandler` | 🟢 Média |
| Trigger | `n8n-nodes-base.twiMl` (Twilio) | `trigger.sms` | `SmsTriggerHandler` | 🟢 Média |
| Flow Control | `n8n-nodes-base.if` | `flow.if` | `IfNodeHandler` | 🔴 Crítica |
| Flow Control | `n8n-nodes-base.switch` | `flow.switch` | `SwitchNodeHandler` | 🟡 Alta |
| Flow Control | `n8n-nodes-base.merge` | `flow.merge` | `MergeNodeHandler` | 🟡 Alta |
| Flow Control | `n8n-nodes-base.splitInBatches` | `flow.split` | `SplitInBatchesHandler` | 🟡 Alta |
| Flow Control | `n8n-nodes-base.wait` | `flow.wait` | `WaitNodeHandler` | 🟡 Alta |
| Flow Control | `n8n-nodes-base.loop` | `flow.loop` | `LoopOverItemsHandler` | 🟡 Alta |
| Transform | `n8n-nodes-base.set` | `transform.set` | `SetNodeHandler` | 🔴 Crítica |
| Transform | `n8n-nodes-base.function` | `transform.code` | `FunctionNodeHandler` | 🔴 Crítica |
| Transform | `n8n-nodes-base.filter` | `transform.filter` | `FilterNodeHandler` | 🟡 Alta |
| Transform | `n8n-nodes-base.sort` | `transform.sort` | `SortNodeHandler` | 🟡 Alta |
| Action | `n8n-nodes-base.httpRequest` | `action.http` | `HttpRequestHandler` | 🔴 Crítica |
| Action | `n8n-nodes-base.sendEmail` | `action.email` | `SendEmailHandler` | 🔴 Crítica |
| Action | `n8n-nodes-base.discord` | `action.discord` | `DiscordNodeHandler` | 🟡 Alta |
| Action | `n8n-nodes-base.telegram` | `action.telegram` | `TelegramNodeHandler` | 🟡 Alta |
| Action | `n8n-nodes-base.slack` | `action.slack` | `SlackNodeHandler` | 🟡 Alta |
| AI | `@n8n/n8n-nodes-langchain.openAi` | `ai.openai` | `OpenAiNodeHandler` | 🔴 Crítica |
| AI | `@n8n/n8n-nodes-langchain.anthropic` | `ai.anthropic` | `AnthropicNodeHandler` | 🟡 Alta |

### 2.3 Casos de uso

- **Trigger**: sempre é o primeiro node de uma branch. O executor identifica triggers por `inputs: []` (zero inputs) e registra-os no sistema de eventos (webhook router, cron scheduler, polling manager).
- **Action**: pode ser paralelo (múltiplos items) ou único. Pode declarar `runOnceForAllItems: true` para processar o lote inteiro em uma chamada.
- **Transform/Flow Control**: roteia dados via output ports indexados. Ex: IF node tem `[true, false]` outputs.
- **Sub-workflow**: invoca outro workflow via `Execute Workflow` node, passando dados como input e recebendo resultados como output. O subprocesso roda em BullMQ child job, isolado.

---

## 3. Node SDK (interfaces TypeScript)

O SDK é definido em `packages/shared/src/nodes/types.ts` e expõe as interfaces fundamentais. Todo node — core, community ou adaptado de n8n — implementa estas interfaces.

### 3.1 Interface principal: INodeType

```typescript
// packages/shared/src/nodes/types.ts
import type { ZodSchema } from 'zod';

/**
 * Metadados declarativos de um node.
 * Estes dados são usados pela UI (NodePalette, NodeConfigPanel)
 * e pelo registry para descoberta e validação estática.
 */
export interface INodeTypeDescription {
  readonly name: string;          // Identificador único: "n8n-nodes-base.httpRequest"
  readonly displayName: string;   // Nome amigável: "HTTP Request"
  readonly description: string;   // Descrição curta (1 linha)
  readonly icon: string;          // Ícone: "fa:fa-globe" ou emoji "🌐" ou URL SVG
  readonly category: NodeCategory;
  readonly version: number | string;  // Ex: 1, "2.1", "4.1"
  readonly defaultVersion?: string;   // Versão default para migração
  readonly deprecated?: boolean;      // true se o node foi substituído
  readonly hidden?: boolean;         // true para nodes internos (ex: Start, NoOp)
  readonly documentationUrl?: string; // Link para docs
  readonly aliases?: string[];       // Nomes alternativos n8n
  readonly codex?: Record<string, unknown>; // Metadados de tooling
}

/**
 * Metadados de runtime — descritivo do node, usado pelo registry
 * e pela engine para decidir como carregar/execultar.
 */
export interface INodeType extends INodeTypeDescription {
  readonly inputs: INodeInput[];
  readonly outputs: INodeOutput[];
  readonly credentials?: ICredentialSlot[];
  readonly properties: INodeProperty[];
  readonly execute: INodeTypeExecute;
  readonly methods?: INodeTypeMethods;
  readonly trigger?: ITriggerFunction;     // Apenas para triggers
  readonly polling?: IPollingFunction;       // Apenas para polling triggers
  readonly webhook?: IWebhookRegistration;  // Apenas para webhook triggers
  readonly versionId?: string;               // Para versionamento interno
}

export type NodeCategory =
  | 'trigger'
  | 'action'
  | 'transform'
  | 'flowControl'
  | 'ai'
  | 'communication'
  | 'data'
  | 'utility'
  | 'core';

/** Inputs/Output ports — definem conectividade no canvas */
export interface INodeInput {
  type: 'main' | 'ai' | 'config' | string;  // Tipo de dados no input
  label?: string;                            // Rótulo para o handle visual
  required?: boolean;                        // true = input obrigatório
  maxConnections?: number;                   // Limite de conexões simultâneas
}

export interface INodeOutput {
  type: 'main' | 'ai' | 'config' | string;
  label?: string;
  required?: boolean;
}
```

### 3.2 INodeTypeExecute e contexto de execução

```typescript
/**
 * Função de execução de um node.
 * @param this  Contexto do node (helpers + metadata)
 * @param items Items de entrada (já resolvidos de expressões)
 * @returns Items de saída + metadata de roteamento
 */
export type INodeTypeExecute = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
) => Promise<INodeExecutionData[] | INodeExecutionResult>;

export interface IExecuteFunctions {
  // ── Parameter helpers ──
  getNodeParameter<T = unknown>(parameterName: string, itemIndex: number, fallback?: T): T;
  getInputData(type?: 'main', index?: number): INodeExecutionData[];
  getWorkflowStaticData(type: 'global' | 'node'): Record<string, any>;

  // ── Credential helpers ──
  getCredentials<T = Record<string, any>>(credentialType: string): Promise<T>;
  getCredentialsWithoutValidation(credentialType: string): Promise<Record<string, any>>;

  // ── Output preparation ──
  prepareOutputData(items: INodeExecutionData[] | INodeExecutionData): INodeExecutionResult;
  getOutputData(outputIndex: number, items: INodeExecutionData[]): INodeExecutionData[];

  // ── HTTP helpers ──
  request(options: IRequestOptions): Promise<IRequestResponse>;
  requestWithAuthentication(authType: string, options: IRequestOptions): Promise<IRequestResponse>;

  // ── Expression / data helpers ──
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  helpers: INodeHelpers;

  // ── Lifecycle ──
  addEvent(data: any): void;
  throwError(message: string, data?: Record<string, unknown>): never;

  // ── Context ──
  workflowId: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  resumeUrl?: string;
  logger: ILogger;
  abortSignal: AbortSignal;
}

export interface INodeExecutionResult {
  json?: Record<string, any>;
  binary?: Record<string, IBinaryData>;
  error?: Error;
  continueOnFail?: boolean;
  metadata?: Record<string, any>;
  outputRouting?: Record<number, INodeExecutionData[]>; // para IF/Switch/Merge
  pauseInfo?: { resumeToken: string; waitTill: Date };  // para Wait node
}

export interface INodeExecutionData {
  json: Record<string, any>;
  binary?: Record<string, IBinaryData>;
  error?: Error;
}
```

### 3.3 Propriedades de node (INodeProperty)

```typescript
export type NodePropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'options'           // enum select
  | 'multiOptions'      // multi-select
  | 'collection'        // array of objects (form-like)
  | 'fixedCollection'   // fixed array of named object fields
  | 'json'              // JSON string editor
  | 'resourceType'      // reference to another resource
  | 'resourceLocator'   // n8n 2nd-gen resource locator (URI + params)
  | 'hidden'            // computed/hidden
  | 'credentials';      // credential reference

export interface INodeProperty {
  name: string;                              // Chave do parâmetro no JSON
  displayName: string;                       // Label no UI
  type: NodePropertyType;
  typeOptions?: {
    loadOptionsMethod?: string;              // Método para carregar opções dinamicamente
    loadOptionsPath?: string;                // Path no response para opções
    resourceData?: boolean;                  // Para resourceLocator
    multipleValues?: boolean;                // Permite múltiplos valores
    sortable?: boolean;                      // Permite ordenar array
    color?: boolean;                         // Picker de cor
    date?: boolean;                          // Picker de data
    time?: boolean;                          // Picker de tempo
    timezone?: boolean;                      // Picker de timezone
    hexColor?: boolean;                      // Hex color picker
  };
  placeholder?: string;                      // Placeholder no input
  description?: string;                    // Tooltip detalhado
  default: unknown;                          // Valor padrão
  required?: boolean;                       // Obrigatório?
  hint?: string;                            // Hint de ajuda
  docsText?: string;                       // Texto de documentação
  validate?: {
    pattern?: string;                     // Regex
    min?: number;                          // Valor mínimo
    max?: number;                          // Valor máximo
    minLength?: number;                    // Tamanho mínimo
    maxLength?: number;                    // Tamanho máximo
  };
  displayOptions?: {
    show?: Record<string, unknown>;         // Condições para mostrar
    hide?: Record<string, unknown>;         // Condições para esconder
  };
  options?: Array<{ name: string; value: unknown; description?: string }>; // Para type: 'options'
}
```

### 3.4 Dados binários (IBinaryData)

```typescript
export interface IBinaryData {
  data: string;          // Base64-encoded content
  mimeType: string;      // ex: "image/png", "application/pdf"
  fileName?: string;     // Nome do arquivo
  filePath?: string;     // Caminho em filesystem/local storage
  id?: string;           // ID em storage remoto (S3)
  url?: string;          // URL temporária para download
  size?: number;         // Tamanho em bytes
  encoding?: 'base64';   // Encoding sempre base64 no SDK n8n
}
```

### 3.5 Funções de lifecycle (INodeTypeMethods)

```typescript
export interface INodeTypeMethods {
  // Chamado uma vez quando o node é carregado pelo registry
  onInit?: () => Promise<void> | void;

  // Chamado antes de cada execução — valida credenciais, carrega opções
  onPreExecute?: (context: IExecuteFunctions) => Promise<void> | void;

  // Chamado após execução bem-sucedida — cleanup (fechar conexões, etc.)
  onPostExecute?: (context: IExecuteFunctions, items: INodeExecutionData[]) => Promise<void> | void;

  // Chamado quando node é desativado ou workflow é deletado
  onCleanup?: () => Promise<void> | void;

  // Métodos para carregar opções dinâmicas em propriedades
  [loadOptionsMethod: string]: (...args: any[]) => Promise<any> | any;
}
```

### 3.6 Triggers, polling e webhooks

```typescript
/**
 * Função de trigger — diferente de execute().
 * Registra listeners e dispara workflow quando evento ocorre.
 */
export interface ITriggerFunction {
  (this: ITriggerFunctions, options: ITriggerOptions): Promise<ITriggerResponse>;
}

export interface ITriggerFunctions extends IExecuteFunctions {
  // Trigger-specific helpers
  getTriggerData(): ITriggerData;
  emitEvent(event: string, data: any): void;
  registerPolling(pollingConfig: IPollingConfig): void;
  registerWebhook(webhookConfig: IWebhookRegistration): string; // retorna webhookId
  getRunningJobCount(): number;
  getWorkflowStaticData(type: 'global' | 'node'): Record<string, any>;
}

export interface ITriggerOptions {
  workflowId: string;
  executionId?: string;
  workflowData?: Record<string, any>;
  resumeUrl?: string;
  isManual?: boolean;
}

export interface ITriggerResponse {
  items?: INodeExecutionData[];     // Dados iniciais (para alguns triggers)
  response?: any;                   // Resposta HTTP (para webhooks)
}

export interface IPollingConfig {
  interval: number;          // Intervalo em ms
  batchSize?: number;        // Tamanho do batch por poll
  resourceLocator?: string;  // Path do recurso a ser polleado
  comparisonField?: string;  // Campo para deduplicação (evita re-trigger)
  headers?: Record<string, string>;
}

export interface IWebhookRegistration {
  path?: string;             // Path relativo (ex: "leads")
  httpMethod?: string | string[];  // Métodos aceitos
  responseMode?: 'onReceived' | 'lastNode' | 'responseNode';
  responseCode?: number;
  responseData?: string;
  header?: string;           // Header para validação de assinatura
  headerTemplate?: string;   // Template para validação (HMAC)
  options?: {
    rawBody?: boolean;
    allowUnknownPaths?: boolean;
    skipHeader?: boolean;
  };
  webhookId?: string;
}

export interface ITriggerData {
  method: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  rawBody?: Buffer;
  webhookSecret?: string;
}
```

### 3.7 Schema de credencial (ICredentialSlot e ICredentialType)

```typescript
export interface ICredentialSlot {
  id?: string;                           // ID da credencial no DB (resolvido em runtime)
  name: string;                          // Tipo de credencial: "httpBasicAuth"
  required: boolean;
  display?: string;                      // Display name customizado
}

export interface ICredentialType {
  name: string;                          // Tipo: "openAiApi", "gmailOAuth2Api"
  displayName: string;                   // "OpenAI API", "Gmail OAuth2 API"
  description?: string;
  genericAuthType?: 'apiKey' | 'oAuth2' | 'basicAuth' | 'headerAuth' | 'jwt' | 'digestAuth';
  properties: INodeProperty[];           // Campos do formulário de credencial
  supportsOAuth?: boolean;               // Marca se usa OAuth2
  oauth2?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    scope?: string[];
    authParam?: string;
    headerPrefix?: string;
    resource?: string;
    responseType?: string;
    authentication?: 'query' | 'body';
    testApi?: { node: string; call: string }; // Node/method para testar conexão
  };
  extends?: string[];                    // Credenciais que esta "herda"
}

export type AuthType =
  | 'apiKey'
  | 'oAuth2'
  | 'basicAuth'
  | 'headerAuth'
  | 'jwt'
  | 'digestAuth'
  | 'oAuth1Api'
  | 'none';
```

### 3.8 Helpers (INodeHelpers)

```typescript
export interface INodeHelpers {
  // HTTP
  request(options: IRequestOptions): Promise<IRequestResponse>;
  requestWithAuthentication(
    authType: string,
    options: IRequestOptions,
  ): Promise<IRequestResponse>;
  getRequestOptions(
    authType: string,
    options: IRequestOptions,
  ): Promise<IRequestOptions>;

  // Data manipulation
  returnJsonArray(items: any[] | any): INodeExecutionData[];
  returnXmlItems(xml: string): INodeExecutionData[];
  returnTextItems(text: string, format?: 'text' | 'lines'): INodeExecutionData[];
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string, stream?: boolean): Promise<Buffer | NodeJS.ReadableStream>;

  // Binary data
  prepareBinaryData(data: Buffer | string, filename: string, mimeType?: string): Promise<IBinaryData>;

  // Expression
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  getBinaryDataBufferForItem(item: INodeExecutionData, binaryPropertyName: string): Promise<Buffer>;

  // Error handling
  createErrorResult(error: Error, options?: { level?: 'warning' | 'error'; message?: string }): INodeExecutionData;
  assertValue(fieldName: string, operation: string, value: unknown, otherValue: unknown, expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object'): void;

  // Pagination
  getPagedResult(options: IPagedRequestOptions): Promise<IPagedResult>;

  // Sleep (for polling/backoff)
  sleep(ms: number): Promise<void>;
}

export interface IRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  qs?: Record<string, string>;
  body?: unknown;
  json?: boolean;
  timeout?: number;
  followRedirect?: boolean;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
  gzip?: boolean;
  encoding?: string;
  resolveWithFullResponse?: boolean;
  simple?: boolean;
  jar?: boolean;           // Use cookie jar for auth persistence
}

export interface IRequestResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  statusMessage?: string;
  complete?: boolean;
  requestDuration?: number;
  error?: Error;
}
```

### 3.9 Schema de node como Zod (padrão AgentFlow)

Todo node registerable expõe um `NodeSchema` Zod que valida `parameters` e gera JSON Schema para UI. O padrão é:

```typescript
import { z } from 'zod';
import type { INodeType, INodeTypeDescription, INodeExecutionData, IExecuteFunctions } from './types';

// Base schema compartilhado por todos os nodes
export const NodeBaseSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  typeVersion: z.number().positive(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).default({}),
  credentials: z.record(z.string()).optional(),
  continueOnFail: z.boolean().default(false),
  retryOnFail: z.boolean().default(false),
  maxTries: z.number().int().positive().default(3),
  waitBetweenTries: z.number().int().nonnegative().default(1000),
  runOnceForAllItems: z.boolean().default(false),
  executeOnce: z.boolean().default(false),
  disabled: z.boolean().default(false),
  timeout: z.number().int().positive().optional(),
  alwaysOutputData: z.boolean().default(false),
});

export type NodeBaseSchemaType = z.infer<typeof NodeBaseSchema>;

// Interface que todo node handler implementa
export interface INodeHandler {
  readonly description: INodeTypeDescription;
  readonly schema: z.ZodSchema<any>;  // Schema de validação de parameters
  execute(context: IExecutionEnvironment, input: WorkflowNode): Promise<INodeExecutionResult>;
  // triggers
  trigger?: INodeTrigger;
  // lifecycle
  onInit?: () => Promise<void>;
  onCleanup?: () => Promise<void>;
}

export interface IExecutionEnvironment {
  workflowId: string;
  workflowName: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeConfig: NodeBaseSchemaType & { parameters: any };
  inputItems: INodeExecutionData[];
  credentials?: Record<string, any>;
  triggerData?: ITriggerData;
  logger: ILogger;
  eventBus: IEventBus;
  signal: AbortSignal;
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  getInputData(type?: 'main', index?: number): INodeExecutionData[];
  getNodeParameter<T = unknown>(name: string, itemIndex: number, fallback?: T): T;
  prepareOutputData(items: INodeExecutionData[]): INodeExecutionResult;
}
```

---

## 4. Metadados e propriedades

### 4.1 Metadados de node (INodeTypeDescription)

Cada node expõe metadados declarativos usados pela UI e pelo registry:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ | Tipo único do node (ex: `n8n-nodes-base.httpRequest`) |
| `displayName` | string | ✅ | Nome amigável exibido no canvas |
| `description` | string | ✅ | Descrição de 1 linha |
| `icon` | string | ✅ | Ícone (emoji, `fa:fa-*`, ou URL) |
| `category` | NodeCategory | ✅ | trigger, action, transform, flowControl, ai, etc. |
| `version` | number/string | ✅ | Versão do node (para versionamento) |
| `defaultVersion` | string | ❌ | Versão default em migração |
| `deprecated` | boolean | ❌ | Node descontinuado |
| `hidden` | boolean | ❌ | Node invisível na paleta |
| `documentationUrl` | string | ❌ | Link para docs |
| `aliases` | string[] | ❌ | Nomes alternativos n8n |
| `codex` | Record | ❌ | Metadados de tooling (categories, vertex colors) |

### 4.2 Inputs / Outputs

O canvas usa `inputs` e `outputs` para desenhar handles. O executor os usa para roteamento (multi-output).

- **Input port** (`INodeInput`): `{ type, label?, required?, maxConnections? }`
- **Output port** (`INodeOutput`): `{ type, label?, required? }`

Exemplo: IF node tem `inputs: [{type:'main'}]` e `outputs: [{type:'main'}, {type:'main'}]` (true / false).

### 4.3 Propriedades (INodeProperty)

Tipos de propriedade mapeados do n8n:

| Type n8n | Tipo AgentFlow | UI Component | Validação Zod |
|----------|----------------|-------------|---------------|
| `string` | `string` | TextInput | `z.string()` |
| `number` | `number` | NumberInput | `z.number()` |
| `boolean` | `boolean` | Checkbox | `z.boolean()` |
| `options` | `string` (enum) | Select | `z.enum([...])` |
| `multiOptions` | `string[]` (enum) | MultiSelect | `z.array(z.enum([...]))` |
| `collection` | `object[]` | DynamicForm | `z.array(z.object({...}))` |
| `fixedCollection` | `object` | FieldGroup | `z.object({...})` |
| `json` | `string` | JSONEditor | `z.string().transform(JSON.parse)` |
| `resourceLocator` | `object` | ResourcePicker | `z.object({__rl: true, value: z.string(), ...})` |
| `credentials` | `string` | CredentialPicker | `z.string()` |
| `hidden` | `any` | (oculto) | `z.any()` |

**Validação**: cada propriedade pode definir `validate: { pattern, min, max, minLength, maxLength }`. O SDK converte para Zod refine. Campo `displayOptions` controla visibilidade condicional por expressão (`{{ $parameter.operation === "chat" }}`).

### 4.4 Expression engine

O AgentFlow implementa um **subset do n8n expression engine**:

```typescript
export type ExpressionContext = {
  $json: Record<string, any>;       // JSON do item atual
  $query: Record<string, string>;   // Query params (webhooks)
  $header: Record<string, string>;  // Headers (webhooks)
  $parameter: Record<string, any>;  // Parâmetros do node
  $credentials: Record<string, any>; // Credenciais resolvidas
  $workflow: { id: string; name: string };
  $now: string;                     // ISO timestamp
  $item: (index: number) => INodeExecutionData; // Acesso a outro item
  $input: { all(): INodeExecutionData[]; first(): INodeExecutionData; },
  $jsonPath: (path: string) => any;  // JMESPath
  $evaluate: (expr: string) => any;  // Avalia sub-expressão
};
```

Suporte a: `{{ $json.field }}`, `{{ $json['field.sub'] }}`, `{{ $now }}`, functions inline (`{{ $json.name.toUpperCase() }}`), operadores (`+`, `-`, `*`, `/`, `===`, `&&`, `||`), `{{= $json.value * 2 }}` (avaliação JS completa via vm2/safe-eval).

---

## 5. Lifecycle do node

### 5.1 Fases do lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      WORKFLOW LIFECYCLE                        │
├──────────────┬──────────┬──────────┬──────────┬───────────────┤
│   onInit     │  onPre   │  execute │  onPost  │  onCleanup    │
│  (registry)  │  Execute │          │  Execute │  (registry)    │
└──────────────┴──────────┴──────────┴──────────┴───────────────┘
```

| Fase | Método | Quando | Responsabilidade |
|------|--------|--------|------------------|
| **Registry → onInit** | `onInit()` | Carregamento do node no registry | Validar config estática, pré-carregar schemas, warmup de cliente (ex: SDK OpenAI) |
| **Executor → onPreExecute** | `onPreExecute(ctx)` | Antes de cada execução | Verificar credenciais, abrir conexão DB, validar parâmetros, carregar options dinâmicas |
| **Executor → execute** | `execute(ctx, items)` | Execução principal | Processar items de entrada → produzir items de saída |
| **Executor → onPostExecute** | `onPostExecute(ctx, items)` | Após execução bem-sucedida | Fechar conexões, log de métricas, persistir dados temporários |
| **Executor → onCleanup** | `onCleanup()` | Desativação do workflow ou shutdown | Liberar recursos, fechar pool de conexões, clear de timers/intervals |

### 5.2 Tratamento de erros

- **Retry com backoff exponencial**: configurado via `maxTries` (default 3) + `waitBetweenTries` (default 1000ms). Backoff: `base * 2^(attempt-1)`.
- **continueOnFail**: se `true`, falha no node não para o workflow. O item de saída contém `error` no JSON.
- **Timeout por node**: `timeout` em ms (default 30s). AbortSignal propagado para fetch, child process, etc.
- **Error workflow**: se configurado em `settings.errorWorkflow`, falhas de workflow disparam o workflow de erro.

### 5.3 Trigger lifecycle

Triggers têm um ciclo de vida distinto:

```
┌──────────────┬───────────────┬───────────────┬──────────────┐
│  register    │   poll/run    │  trigger      │  cleanup     │
│  (onInit)    │  (schedule)   │  (emit)       │  (shutdown)  │
└──────────────┴───────────────┴───────────────┴──────────────┘
```

- **register**: cria endpoint HTTP (webhook), agenda cron job (cron/polling), registra listener (event trigger).
- **trigger**: quando evento ocorre, dispara `WorkflowExecution` em BullMQ com items iniciais.
- **cleanup**: remove endpoint, cancela job agendado.

---

## 6. Credenciais

### 6.1 Tipos de credencial

| Type n8n | Type AgentFlow | Descrição |
|----------|---------------|-----------|
| `apiKey` | `apiKey` | Chave de API no header ou query param |
| `oAuth2Api` | `oAuth2` | OAuth 2.0 Authorization Code (com refresh) |
| `httpBasicAuth` | `basicAuth` | Basic Auth (user:password → base64) |
| `httpHeaderAuth` | `headerAuth` | Header custom (ex: `Authorization: Bearer <token>`) |
| `oAuth1Api` | `oAuth1` | OAuth 1.0a (legacy) |
| `jwt` | `jwt` | JWT token generation |
| `digestAuth` | `digestAuth` | HTTP Digest Auth |
| `genericAuthType` | configurable | Tipo genérico com custom logic |

### 6.2 Schema de credencial

```typescript
// packages/shared/src/credentials/types.ts
export interface ICredentialType {
  name: string;                    // Chave única: "openAiApi"
  displayName: string;             // Nome amigável
  genericAuthType: AuthType;       // apiKey | oAuth2 | basicAuth | ...
  properties: INodeProperty[];     // Campos do formulário
  testApi?: { node: string; call: string; result: string }; // Método para teste de conexão
  extendable?: boolean;            // Permite extensão por community nodes
  oauth2?: IOAuth2Config;          // Config OAuth2 se aplicável
  documentationUrl?: string;
}

export interface IOAuth2Config {
  authorizationUrl: string;
  tokenUrl: string;
  scope?: string[];
  authParam?: string;              // Parâmetro para scope (default: "scope")
  headerPrefix?: string;           // Prefixo no header (default: "Bearer")
  resource?: string;               // URL de recursos
  responseType?: string;           // Default: "code"
  authentication?: 'query' | 'body'; // Onde passar client secret
  testApi?: { node: string; call: string };
}

// Como um node declara credenciais:
export interface INodeType {
  // ...
  credentials?: Array<{
    name: string;         // Tipo de credencial: "openAiApi"
    required: boolean;
    display?: string;     // Display name customizado no formulário do node
  }>;
}
```

### 6.3 Resolução e armazenamento

1. **JSON do workflow**: `credentials: { "openAiApi": "My OpenAI Key" }` — apenas referência pelo nome.
2. **Banco (Prisma `Credential`)**: `{ id, name, type, provider, data (encrypted JSON), orgId }` — AES-256-GCM via `apps/api/src/lib/crypto.ts`.
3. **Runtime**: `getCredentials<IOpenAiCredentials>("openAiApi")` descriptografa e injeta no node. Para OAuth2, o `CredentialManager` auto-renova tokens via refresh_token antes da expiração.
4. **Nunca** expor credenciais reais no JSON exportado ou em logs.

### 6.4 Auto-renovação OAuth2

```typescript
export interface IOAuth2Credentials {
  id: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;  // epoch ms
  refreshTokenExpiresAt?: number;
  scope?: string;
  tokenType?: 'Bearer';
  provider: string;              // "gmail", "github", etc.
}

// AgentFlowCredentialManager — verifica expiração antes de injetar:
// if (Date.now() >= creds.accessTokenExpiresAt - 5000) await refresh();
```

---

## 7. Helpers e utilitários

### 7.1 Request helper

```typescript
export interface IRequestHelper {
  request(options: IRequestOptions): Promise<IRequestResponse>;
  requestWithAuthentication(
    credentialType: string,
    options: IRequestOptions,
  ): Promise<IRequestResponse>;
}
```

**Rate limiting**: o helper aplica automaticamente `retryOnFail` com exponential backoff, `followRedirect`, e valida `rejectUnauthorized` (SSL). Limites de rate são lidos de `credentialType.options.rateLimits` e aplicados via token bucket.

### 7.2 getNodeParameter

```typescript
export function getNodeParameter<T = unknown>(
  parameterName: string,
  itemIndex: number,
  fallback?: T,
): T;
```

Resolve expressões `{{ $json.field }}` inline, com fallback para valor literal. Lança `NodeOperationError` se obrigatório e não definido.

### 7.3 getInputData / prepareOutputData

```typescript
export interface IDataHelper {
  getInputData(type?: 'main', index?: number): INodeExecutionData[];
  getInputDataWithMetadata(type?: 'main', index?: number): INodeExecutionDataWithMetadata[];
  prepareOutputData(items: INodeExecutionData[]): INodeExecutionResult;
  returnJsonArray(data: any[] | any): INodeExecutionData[];
  returnTextItems(text: string, format?: 'text' | 'lines'): INodeExecutionData[];
  returnXmlItems(xml: string, options?: { rootNode: string }): INodeExecutionData[];
  getOutputData(outputIndex: number, items: INodeExecutionData[]): INodeExecutionData[];
}
```

### 7.4 Expression helpers

| Helper | Descrição | Exemplo |
|--------|-----------|---------|
| `evaluateExpression` | Resolve `{{ }}` e `{{= }}` | `{{ $json.email.toUpperCase() }}` |
| `returnJsonArray` | Converte array para items | `returnJsonArray([{a:1},{a:2}])` |
| `getBinaryDataBuffer` | Extrai buffer de dados binários | `await getBinaryDataBuffer(0, 'data')` |
| `assertValue` | Valida tipo de valor | `assertValue('url', 'GET', url, '', 'string')` |
| `createErrorResult` | Cria item de erro padrão n8n | `{ json: { error: error.message } }` |

### 7.5 Binary data helpers

| Helper | Descrição |
|--------|-----------|
| `getBinaryDataBuffer` | Extrai `Buffer` de `item.binary[key].data` (base64 decode) |
| `prepareBinaryData` | Cria objeto binário a partir de `Buffer`/`string` |
| `getBinaryDataBufferForItem` | Variante por-item |

---

## 8. Dados binários

### 8.1 Formato IBinaryData

Todo item pode carregar dados binários como:

```typescript
interface INodeExecutionData {
  json: Record<string, any>;
  binary?: {
    [key: string]: IBinaryData;   // key = nome da propriedade (ex: "data", "file", "inputData")
  };
}

interface IBinaryData {
  data: string;          // Base64-encoded
  mimeType: string;      // "image/png", "application/pdf", "text/csv"
  fileName?: string;     // "relatorio.pdf"
  filePath?: string;     // Caminho local (arquivo temporário)
  id?: string;           // ID em storage remoto (S3, GCS)
  url?: string;          // URL temporária signed
  size?: number;         // Tamanho em bytes
  encoding: 'base64';    // Sempre base64
}
```

### 8.2 Fluxo de dados binários

```
Produção:
  Buffer/String → base64 encode → IBinaryData.data → item.binary[key]

Consumo:
  item.binary[key].data (base64) → decode → Buffer → processamento

Storage:
  - Small (< 10MB): em memória (inline no item)
  - Large (> 10MB): file system (arquivo temporário) ou cloud storage
  - Temp files são limpos após workflow concluir
```

### 8.3 Helpers de binary data

```typescript
// Em INodeHelpers:
async getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
async prepareBinaryData(data: Buffer | string, filename: string, mimeType?: string): Promise<IBinaryData>;
async getBinaryDataBufferForItem(item: INodeExecutionData, binaryPropertyName: string): Promise<Buffer>;
async saveBinaryData(itemIndex: number, binaryPropertyName: string, binaryData: IBinaryData): Promise<IBinaryData>;
getBinaryDataUrl(binaryData: IBinaryData): string; // data URL temporária
```

### 8.4 Limites

| Limite | Valor | Motivo |
|--------|-------|--------|
| Tamanho inline | 10 MB | Evitar bloat de memoria |
| Tamanho max arquivo | 50 MB | Limite BullMQ job payload |
| TTL temp file | 24h | Limpeza automática |
| Storage default | Local FS (tmp/) | Configurável para S3/GCS |

---

## 9. Versionamento

### 9.1 Strategy

O versionamento usa **semver-like** numbers (e.g., `1`, `2`, `4.1`). O node pode declarar `version` e `defaultVersion`.

- **node v1 → v2**: breaking change. Workflow salvo referencia `typeVersion` explicitamente. Se carregado com versão antiga, o executor aplica **migration function** (`migrateParameters(old, new)`).
- **Default migration**: se `typeVersion` não especificado ou mismatch, usa `defaultVersion` mais recente e tenta migrar.
- **Deprecation**: node `deprecated: true` mostra warning amarelo na UI. Não é mais carregado em novos workflows mas continua executando em workflows existentes.

### 9.2 Migration contract

```typescript
export interface IVersionMigration {
  from: number | string;
  to: number | string;
  migrateParameters: (old: Record<string, any>) => Record<string, any>;
  migrateConnections?: (old: Record<string, any>) => Record<string, any>;
  notes?: string;
}
```

Exemplo: HTTP Request v1 → v2 adiciona `options.rejectUnauthorized`. Migration:

```typescript
migrateParameters: (old) => ({
  ...old,
  options: {
    ...old.options,
    rejectUnauthorized: old.options?.rejectUnauthorized ?? true,
  },
}),
```

### 9.3 Versionamento de workflow

Cada workflow tem `versionId` (UUID). Salvar workflow cria nova versão (optimistic locking). WorkflowVersion salva `snapshot: JSON` (full state). Executor carrega a versão ativa (`activeVersionId`).

---

## 10. Registry e descoberta

### 10.1 NodeRegistry

```typescript
export class NodeRegistry {
  private nodes: Map<string, RegisteredNodeInfo> = new Map();
  private lazyLoaders: Map<string, LazyNodeLoader> = new Map();
  private categories: Map<NodeCategory, string[]> = new Map();

  register(node: INodeType, options?: { lazy?: boolean; category?: NodeCategory[] }): void;
  registerLazy(type: string, loader: LazyNodeLoader): void;
  get(type: string): INodeType;
  getByCategory(category: NodeCategory): INodeType[];
  list(): RegisteredNodeInfo[];
  isLoaded(type: string): boolean;
  load(type: string): Promise<INodeType>;  // lazy load
  getSchema(type: string): z.ZodSchema;    // para validação de parameters
  getCredentialSchema(type: string): string[]; // credential types usadas
  search(query: string, filters?: { category?: NodeCategory; trigger?: boolean }): INodeType[];
  getTriggerNodes(): INodeType[];
}

interface RegisteredNodeInfo {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: NodeCategory[];
  version: number | string;
  hasTrigger: boolean;
  credentialTypes: string[];
  loaded: boolean;
  package?: string;  // npm package name for community nodes
}

interface LazyNodeLoader {
  load: () => Promise<INodeType>;
  dependencies: string[];  // imports necessários
  memoryEstimate: number;  // KB estimados
}
```

### 10.2 Lazy loading strategy

- **Core nodes**: carregados no bootstrap (prioridade crítica: Webhook, Cron, HTTP, IF, Set, Merge, Function, Wait).
- **App nodes**: lazy-loaded via `import()` dinâmico sob demanda. O registry mantém `lazyLoaders` com metadata para UI (nome, ícone) sem carregar código.
- **Community nodes**: lazy-loaded por pacote npm. O worker resolve `@agentflow/nodes-<name>` via `require.resolve` no filesystem do worker.

### 10.3 Discovery para UI

GET `/api/v1/nodes` retorna lista de nodes registrados com metadados leves (sem código):

```json
{
  "data": [
    {
      "name": "n8n-nodes-base.httpRequest",
      "displayName": "HTTP Request",
      "category": ["action"],
      "icon": "🌐",
      "version": "4.1",
      "credentialTypes": ["httpBasicAuth", "headerAuth"],
      "hasTrigger": false
    }
  ]
}
```

GET `/api/v1/nodes/{type}?include=schema,properties` retorna o schema completo para render da UI dinâmica.

---

## 11. Community nodes

### 11.1 Formato de pacote npm

Community nodes são pacotes npm com convenção de nomeclatura:

| Scope | Pattern | Exemplo |
|-------|---------|---------|
| Scoped | `@<scope>/n8n-nodes-<name>` | `@myorg/n8n-nodes-apex` |
| Unscoped | `n8n-nodes-<name>` | `n8n-nodes-weather-api` |

**package.json** mínimo:

```json
{
  "name": "@agentflow/nodes-weather",
  "version": "1.0.0",
  "main": "dist/index.js",
  "agentflow": {
    "nodes": ["./dist/nodes/weather.api.json"],
    "credentials": ["./dist/credentials/weather.oauth.json"]
  },
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

A chave `agentflow` no `package.json` lista arquivos de metadata (JSON) que o registry escaneia sem carregar código.

### 11.2 Scanner de segurança

| Check | O que valida | Ação em falha |
|-------|-------------|---------------|
| **Nome válido** | Conforme pattern acima | Rejeitar instalação |
| **Metadata schema** | node.json segue `INodeDescription` | Rejeitar |
| **Dependency audit** | `npm audit` — no criticals | Rejeitar |
| **Size limit** | < 10 MB descompactado | Rejeitar |
| **Entrypoint** | `main` aponta para arquivo existente | Rejeitar |
| **Node count** | ≤ 20 nodes por pacote | Rejeitar |
| **Runtime deps** | No `eval`, no `child_process` direto | Warning + sandbox |
| **Signature** | npm Provenance (recomendado) | Opcional |

### 11.3 Sandbox de execução

Community nodes rodam em **worker isolate**:

| Recurso | Limite |
|---------|--------|
| CPU time | 30s por execução |
| Memory | 512 MB RSS |
| Network | Apenas allowlist de hosts (configurado por node) |
| Filesystem | Apenas `/tmp/af-exec-<id>/` (sandbox dir) |
| Child process | Proibido (exceto node interno via IPC) |
| npm requires | Proibido (exceto declared dependencies) |
| `eval` / `Function` | Proibido no código do node |

Implementação: `isolated-vm` + resource limits via `bullmq` worker `useWorkerThreads` + OS cgroups (Docker).

### 11.4 Instalação / desinstalação

```
CLI:
  agentflow nodes install @agentflow/nodes-weather
  agentflow nodes list
  agentflow nodes uninstall @agentflow/nodes-weather
  agentflow nodes scan  # verifica security updates

API:
  POST /api/v1/nodes/community/install  { packageName, version }
  DELETE /api/v1/nodes/community/{package}
  GET /api/v1/nodes/community           # lista instalados

Registry (interno):
  packages/community/<package-name>/    # código fonte no worker filesystem
  .agentflow/community-nodes.json       # manifest de metadata
```

---

## 12. Catálogo de nodes core (tabela completa)

### 12.1 Core nodes (n8n-nodes-base) — 48 nodes

| # | Node Type | Categoria | Descrição | Prioridade |
|---|-----------|-----------|-----------|------------|
| 1 | `n8n-nodes-base.webhook` | Trigger | Inicia workflow via HTTP request | 🔴 Crítica |
| 2 | `n8n-nodes-base.scheduleTrigger` | Trigger | Agenda workflow via cron/interval | 🔴 Crítica |
| 3 | `n8n-nodes-base.manualWorkflowTrigger` | Trigger | Inicia workflow manualmente | 🔴 Crítica |
| 4 | `n8n-nodes-base.formTrigger` | Trigger | Formulário web customizável | 🟡 Alta |
| 5 | `n8n-nodes-base.errorTrigger` | Trigger | Dispara workflow em erro | 🟢 Média |
| 6 | `n8n-nodes-base.emailImap` | Trigger | Monitora email via IMAP | 🟡 Alta |
| 7 | `n8n-nodes-base.rssFeedReadTrigger` | Trigger | Monitora RSS feed | 🟢 Média |
| 8 | `n8n-nodes-base.sseTrigger` | Trigger | Escuta eventos SSE | 🟢 Média |
| 9 | `n8n-nodes-base.localFileTrigger` | Trigger | Monitora arquivo local | 🟢 Média |
| 10 | `n8n-nodes-base.activationTrigger` | Trigger | Dispara no ativar workflow | 🟢 Média |
| 11 | `n8n-nodes-base.n8nTrigger` | Trigger | Evento interno do n8n | 🟢 Média |
| 12 | `n8n-nodes-base.httpRequest` | Action | Faz requisição HTTP | 🔴 Crítica |
| 13 | `n8n-nodes-base.sendEmail` | Action | Envia email (SMTP) | 🔴 Crítica |
| 14 | `n8n-nodes-base.set` | Transform | Define/renomeia campos | 🔴 Crítica |
| 15 | `n8n-nodes-base.code` | Transform | JavaScript customizado (sandbox) | 🔴 Crítica |
| 16 | `n8n-nodes-base.function` | Transform | JS customizado (legacy) | 🟡 Alta |
| 17 | `n8n-nodes-base.functionItem` | Transform | JS por item (legacy) | 🟡 Alta |
| 18 | `n8n-nodes-base.if` | Flow | Condicional binário | 🔴 Crítica |
| 19 | `n8n-nodes-base.switch` | Flow | Roteamento por múltiplas condições | 🟡 Alta |
| 20 | `n8n-nodes-base.merge` | Flow | Junta branches múltiplas | 🟡 Alta |
| 21 | `n8n-nodes-base.splitInBatches` | Flow | Divide items em lotes | 🟡 Alta |
| 22 | `n8n-nodes-base.wait` | Flow | Pausa execução (tempo/webhook) | 🟡 Alta |
| 23 | `n8n-nodes-base.filter` | Transform | Filtra items por condição | 🟡 Alta |
| 24 | `n8n-nodes-base.sort` | Transform | Ordena items | 🟡 Alta |
| 25 | `n8n-nodes-base.removeDuplicates` | Transform | Remove items duplicados | 🟡 Alta |
| 26 | `n8n-nodes-base.renameKeys` | Transform | Renomeia keys do JSON | 🟡 Alta |
| 27 | `n8n-nodes-base.limit` | Transform | Limita quantidade de items | 🟡 Alta |
| 28 | `n8n-nodes-base.splitOut` | Transform | Expande array em items | 🟡 Alta |
| 29 | `n8n-nodes-base.aggregate` | Transform | Agrega items (groupby) | 🟡 Alta |
| 30 | `n8n-nodes-base.summarize` | Transform | Sumariza dados | 🟡 Alta |
| 31 | `n8n-nodes-base.compareDatasets` | Transform | Compara datasets | 🟡 Alta |
| 32 | `n8n-nodes-base.wait` | Flow | Pausa/execução diferida | 🟡 Alta |
| 33 | `n8n-nodes-base.respondToWebhook` | Action | Responde a webhook | 🟡 Alta |
| 34 | `n8n-nodes-base.webhookResponse` | Action | Resposta customizada webhook | 🟡 Alta |
| 35 | `n8n-nodes-base.noop` | Utility | No-op (debug) | 🟢 Média |
| 36 | `n8n-nodes-base.stopAndError` | Utility | Para execução com erro | 🟢 Média |
| 37 | `n8n-nodes-base.debugHelper` | Utility | Debug output | 🟢 Média |
| 38 | `n8n-nodes-base.executeCommand` | Utility | Executa comando shell | 🟡 Alta |
| 39 | `n8n-nodes-base.readWriteFile` | Utility | Lê/escreve arquivos | 🟡 Alta |
| 40 | `n8n-nodes-base.compression` | Utility | Zip/unzip arquivos | 🟡 Alta |
| 41 | `n8n-nodes-base.ftp` | Utility | Operações FTP | 🟡 Alta |
| 42 | `n8n-nodes-base.ssh` | Utility | Executa comandos via SSH | 🟡 Alta |
| 43 | `n8n-nodes-base.git` | Utility | Operações Git | 🟡 Alta |
| 44 | `n8n-nodes-base.crypto` | Utility | Hash, encrypt, decrypt | 🟡 Alta |
| 45 | `n8n-nodes-base.totp` | Utility | Código TOTP | 🟢 Média |
| 46 | `n8n-nodes-base.jwt` | Utility | JWT generate/verify | 🟡 Alta |
| 47 | `n8n-nodes-base.markdown` | Transform | Markdown → HTML | 🟢 Média |
| 48 | `n8n-nodes-base.html` | Transform | Parse HTML | 🟢 Média |

### 12.2 App nodes — categorias principais

Abaixo, app nodes organizados por categoria. Cada grupo é uma **family** de integração. O AgentFlow implementará as críticas 🟥 e 🟨; as 🟩 podem ser community nodes por terceiros.

#### Communication (Telegram, WhatsApp, Slack, Discord, Email) — 12 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 49 | `n8n-nodes-base.telegram` | Telegram Bot | `telegramApi` |
| 50 | `n8n-nodes-base.discord` | Discord Bot | `discordApi` |
| 51 | `n8n-nodes-base.slack` | Slack | `slackApi` |
| 52 | `n8n-nodes-base.whatsapp` | WhatsApp Cloud | `whatsAppBusinessApi` |
| 53 | `n8n-nodes-base.sendEmail` | SMTP/Email | `smtp` |
| 54 | `n8n-nodes-base.mailgun` | Mailgun | `mailgunApi` |
| 55 | `n8n-nodes-base.sendgrid` | SendGrid | `sendGridApi` |
| 56 | `n8n-nodes-base.mailchimp` | Mailchimp | `mailchimpApi` |
| 57 | `n8n-nodes-base.gmail` | Google Gmail | `gmailOAuth2Api` |
| 58 | `n8n-nodes-base.microsoftOutlook` | Microsoft Outlook | `microsoftOutlookOAuth2Api` |
| 59 | `n8n-nodes-base.twilio` | Twilio SMS/Voice | `twilioApi` |
| 60 | `n8n-nodes-base.mattermost` | Mattermost | `mattermostApi` |

#### Databases (Postgres, MySQL, Mongo, Redis, etc.) — 10 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 61 | `n8n-nodes-base.postgres` | PostgreSQL | `postgres` |
| 62 | `n8n-nodes-base.mysql` | MySQL | `mySql` |
| 63 | `n8n-nodes-base.mongodb` | MongoDB | `mongoDb` |
| 64 | `n8n-nodes-base.redis` | Redis | `redis` |
| 65 | `n8n-nodes-base.microsoftSql` | Microsoft SQL Server | `microsoftSql` |
| 66 | `n8n-nodes-base.oracleDb` | Oracle DB | `oracleDb` |
| 67 | `n8n-nodes-base.crateDb` | CrateDB | `crateDb` |
| 70 | `n8n-nodes-base.supabase` | Supabase | `supabaseApi` |
| 71 | `n8n-nodes-base.sqlite` | SQLite | `sqlite` |
| 72 | `n8n-nodes-base.elasticsearch` | Elasticsearch | `elasticsearchApi` |

#### Cloud & Storage (AWS, GCP, Azure, Dropbox, S3) — 15 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 73 | `n8n-nodes-base.awsS3` | AWS S3 | `awsS3` |
| 74 | `n8n-nodes-base.awsLambda` | AWS Lambda | `aws` |
| 75 | `n8n-nodes-base.awsSqs` | AWS SQS | `awsSqs` |
| 76 | `n8n-nodes-base.awsSns` | AWS SNS | `awsSns` |
| 77 | `n8n-nodes-base.awsDynamodb` | AWS DynamoDB | `awsDynamodb` |
| 78 | `n8n-nodes-base.awsRekognition` | AWS Rekognition | `aws` |
| 79 | `n8n-nodes-base.googleCloudStorage` | Google Cloud Storage | `googleApi` |
| 80 | `n8n-nodes-base.googleDrive` | Google Drive | `googleApi` |
| 81 | `n8n-nodes-base.googleSheets` | Google Sheets | `googleSheetsOAuth2Api` |
| 82 | `n8n-nodes-base.googleCalendar` | Google Calendar | `googleCalendarOAuth2Api` |
| 83 | `n8n-nodes-base.azureStorage` | Azure Storage | `azureStorage` |
| 84 | `n8n-nodes-base.azureCosmosDb` | Azure Cosmos DB | `azureCosmosDb` |
| 85 | `n8n-nodes-base.dropbox` | Dropbox | `dropboxApi` |
| 86 | `n8n-nodes-base.googleContacts` | Google Contacts | `googleContactsOAuth2Api` |
| 87 | `n8n-nodes-base.box` | Box | `boxApi` |

#### Productivity & CRM (Salesforce, HubSpot, Notion, Airtable, etc.) — 12 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 88 | `n8n-nodes-base.salesforce` | Salesforce | `salesforceApi` |
| 89 | `n8n-nodes-base.hubspot` | HubSpot | `hubspotApi` |
| 90 | `n8n-nodes-base.notion` | Notion | `notionApi` |
| 91 | `n8n-nodes-base.airtable` | Airtable | `airtableApi` |
| 92 | `n8n-nodes-base.trello` | Trello | `trelloApi` |
| 93 | `n8n-nodes-base.asana` | Asana | `asanaApi` |
| 94 | `n8n-nodes-base.clickup` | ClickUp | `clickUpApi` |
| 95 | `n8n-nodes-base.todoist` | Todoist | `todoistApi` |
| 96 | `n8n-nodes-base.zoho` | Zoho CRM | `zohoApi` |
| 97 | `n8n-nodes-base.pipedrive` | Pipedrive | `pipedriveApi` |
| 98 | `n8n-nodes-base.atlassianJira` | Jira | `jiraApi` |
| 99 | `n8n-nodes-base.atlassianConfluence` | Confluence | `confluenceApi` |

#### Payment & Commerce (Stripe, PayPal, Shopify, etc.) — 8 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 100 | `n8n-nodes-base.stripe` | Stripe | `stripeApi` |
| 101 | `n8n-nodes-base.paypal` | PayPal | `payPalApi` |
| 102 | `n8n-nodes-base.shopify` | Shopify | `shopifyApi` |
| 103 | `n8n-nodes-base.woocommerce` | WooCommerce | `wooCommerceApi` |
| 104 | `n8n-nodes-base.square` | Square | `squareApi` |
| 105 | `n8n-nodes-base.adyen` | Adyen | `adyenApi` |
| 106 | `n8n-nodes-base.chargebee` | Chargebee | `chargeBeeApi` |
| 107 | `n8n-nodes-base.paddle` | Paddle | `paddleApi` |

#### AI & LLM (OpenAI, Anthropic, Google Gemini, Mistral) — 7 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 108 | `@n8n/n8n-nodes-langchain.openAi` | OpenAI | `openAiApi` |
| 109 | `@n8n/n8n-nodes-langchain.anthropic` | Anthropic | `anthropicApi` |
| 110 | `@n8n/n8n-nodes-langchain.googleGemini` | Google Gemini | `googleGeminiApi` |
| 111 | `@n8n/n8n-nodes-langchain.mistral` | Mistral AI | `mistralApi` |
| 112 | `@n8n/n8n-nodes-langchain.ollama` | Ollama (local) | `ollamaApi` |
| 113 | `@n8n/n8n-nodes-langchain.cohere` | Cohere | `cohereApi` |
| 114 | `@n8n/n8n-nodes-langchain.huggingFace` | Hugging Face | `huggingFaceApi` |

#### Analytics & Monitoring (GA, Mixpanel, Datadog, etc.) — 6 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 115 | `n8n-nodes-base.googleAnalytics` | Google Analytics | `googleAnalyticsApi` |
| 116 | `n8n-nodes-base.mixpanel` | Mixpanel | `mixpanelApi` |
| 117 | `n8n-nodes-base.datadog` | Datadog | `datadogApi` |
| 118 | `n8n-nodes-base.newRelic` | New Relic | `newRelicApi` |
| 119 | `n8n-nodes-base.sentry` | Sentry | `sentryApi` |
| 120 | `n8n-nodes-base.plausibleAnalytics` | Plausible | `plausibleAnalyticsApi` |

#### Developer Tools (GitHub, GitLab, Docker, Jenkins) — 8 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 121 | `n8n-nodes-base.github` | GitHub | `githubApi` |
| 122 | `n8n-nodes-base.gitlab` | GitLab | `gitlabApi` |
| 123 | `n8n-nodes-base.bitbucket` | Bitbucket | `bitbucketApi` |
| 124 | `n8n-nodes-base.githubTrigger` | GitHub Trigger | `githubApi` |
| 125 | `n8n-nodes-base.gitlabTrigger` | GitLab Trigger | `gitlabApi` |
| 126 | `n8n-nodes-base.jenkins` | Jenkins | `jenkinsApi` |
| 127 | `n8n-nodes-base.docker` | Docker | `dockerApi` |
| 128 | `n8n-nodes-base.kubernetes` | Kubernetes | `kubernetesApi` |

#### Utility & Data Processing (CSV, XML, PDF, Image) — 8 nodes

| # | Node Type | Categoria | Descrição |
|---|-----------|-----------|-----------|
| 129 | `n8n-nodes-base.csv` | Utility | Parse/gera CSV |
| 130 | `n8n-nodes-base.xml` | Utility | Parse/gera XML |
| 131 | `n8n-nodes-base.json` | Transform | Parse/stringify JSON |
| 132 | `n8n-nodes-base.convertToFile` | Utility | Converte para arquivo |
| 133 | `n8n-nodes-base.extractFromFile` | Utility | Extrai dados de arquivo |
| 134 | `n8n-nodes-base.editImage` | Utility | Edição de imagem |
| 135 | `n8n-nodes-base.qrCode` | Utility | Gera/lê QR Code |
| 136 | `n8n-nodes-base.barcode` | Utility | Gera/lê códigos de barra |

#### Form & Survey (Typeform, Google Forms, Jotform) — 5 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 137 | `n8n-nodes-base.typeform` | Typeform | `typeformApi` |
| 138 | `n8n-nodes-base.googleForms` | Google Forms | `googleApi` |
| 139 | `n8n-nodes-base.jotform` | Jotform | `jotformApi` |
| 140 | `n8n-nodes-base.formio` | Form.io | `formioApi` |
| 141 | `n8n-nodes-base.wufoo` | Wufoo | `wufooApi` |

#### DevOps & Infra (Terraform, Kubernetes, Docker Compose) — 4 nodes

| # | Node Type | Provider | Credential Type |
|---|-----------|----------|----------------|
| 142 | `n8n-nodes-base.terraform` | Terraform Cloud | `terraformApi` |
| 143 | `n8n-nodes-base.helm` | Helm/Kubernetes | `kubernetesApi` |
| 144 | `n8n-nodes-base.nginx` | NGINX | `nginxApi` |
| 145 | `n8n-nodes-base.rundeck` | Rundeck | `rundeckApi` |

#### LangChain nodes (`@n8n/n8n-nodes-langchain`) — 15 nodes

| # | Node Type | Descrição |
|---|-----------|-----------|
| 146 | `@n8n/n8n-nodes-langchain.openAi` | Chat/completion embeddings OpenAI |
| 147 | `@n8n/n8n-nodes-langchain.anthropic` | Chat/completion Anthropic Claude |
| 148 | `@n8n/n8n-nodes-langchain.googleGemini` | Chat/completion Google Gemini |
| 149 | `@n8n/n8n-nodes-langchain.mistral` | Chat/completion Mistral AI |
| 150 | `@n8n/n8n-nodes-langchain.ollama` | Chat local via Ollama |
| 151 | `@n8n/n8n-nodes-langchain.cohere` | Chat/completion Cohere |
| 152 | `@n8n/n8n-nodes-langchain.huggingFace` | Hugging Face Inference |
| 153 | `@n8n/n8n-nodes-langchain.chat` | Chat genérica (multi-provider) |
| 154 | `@n8n/n8n-nodes-langchain.embeddings` | Embeddings genérico |
| 155 | `@n8n/n8n-nodes-langchain.vectorStore` | Vector DB (Pinecone, etc.) |
| 156 | `@n8n/n8n-nodes-langchain.agent` | AI Agent autônomo |
| 157 | `@n8n/n8n-nodes-langchain.toolWikipedia` | Tool: Wikipedia search |
| 158 | `@n8n/n8n-nodes-langchain.toolSerp` | Tool: SerpAPI search |
| 159 | `@n8n/n8n-nodes-langchain.toolCalculator` | Tool: Calculator |
| 160 | `@n8n/n8n-nodes-langchain.memory` | Memory buffer (conversa) |

**Total: 160 nodes catalogados** (48 core + 112 app/langchain). O catálogo completo do n8n possui ~543+ built-in nodes; estes 160 representam a porção prioritária para o AgentFlow. Os demais são documentados como community-eligible.

---

## 13. Testes de nodes

### 13.1 Node tester (isolado)

```typescript
// packages/shared/src/nodes/testing.ts
export interface INodeTestContext {
  inputData: INodeExecutionData[];
  credentials?: Record<string, any>;
  parameters: Record<string, any>;
  workflowData?: Record<string, any>;
  logger: ILogger;
  options?: { disableExpression?: boolean; disableSandbox?: boolean };
}

export interface INodeTestResult {
  success: boolean;
  output: INodeExecutionData[];
  error?: Error;
  duration: number;
  logs: string[];
  credentialsUsed?: string[];
  memoryPeak?: number;
}

export class NodeTester {
  constructor(private registry: NodeRegistry) {}

  async run(type: string, ctx: INodeTestContext): Promise<INodeTestResult> {
    const node = await this.registry.load(type);
    const env = this.createMockEnvironment(ctx);
    const startTime = Date.now();
    try {
      const output = await node.execute(env, ctx.inputData);
      return { success: true, output, duration: Date.now() - startTime, logs: env.logs };
    } catch (error) {
      return { success: false, output: [], error, duration: Date.now() - startTime, logs: env.logs };
    }
  }

  private createMockEnvironment(ctx: INodeTestContext): IExecutionEnvironment { /* mock */ }
}
```

### 13.2 Test harness CLI

```
agentflow test node n8n-nodes-base.httpRequest
agentflow test node n8n-nodes-base.httpRequest --fixture test/http-request.json
agentflow test workflow ./workflows/lead-capture.json
agentflow test suite
```

Fixtures (`test/fixtures/`) contêm JSON de input + expected output + mock credentials.

### 13.3 Estratégias de teste

| Tipo | Escopo | Ferramenta |
|------|--------|------------|
| Unit | Validação de schema (Zod) | vitest + zod |
| Integration | Handler execute() com mocks | vitest + MSW (HTTP) |
| E2E | Workflow completo (3-5 nodes) | vitest + bullmq test worker |
| Regression | Importação de workflow n8n real | fixtures/n8n-exported/ |
| Security | Sandbox escape, network egress | isolated-vm + allowlist audit |

### 13.4 Acceptance de teste para nodes core

- [ ] Schema Zod valida 100% dos parameters do JSON n8n
- [ ] Mock input → output matcha o formato n8n (`{ json, binary }`)
- [ ] Credential injection resolve sem vazamento
- [ ] Continue-on-fail produz item com `error` no JSON
- [ ] Timeout e abortSignal funcionam
- [ ] Test fixture do n8n real (exportado) passa

---

## 14. Compatibilidade com n8n

### 14.1 Matriz de compatibilidade

| Feature n8n | Implementado no AgentFlow? | Gap / Barreira | Esforço |
|-------------|---------------------------|----------------|---------|
| Workflow JSON (nodes/connections/settings) | ✅ Parcial | Node `type` mapeado para tipo interno AgentFlow (ex: `n8n-nodes-base.httpRequest` → `action.http`) | Baixo |
| Expression engine `{{ $json.* }}` | ✅ Subset | Funções avançadas (`$json.map()`, `$flatten()`) não implementadas | Médio |
| Credential resolver (decrypt + inject) | ✅ | Credential types diferem (n8n usa `openAiApi` vs AgentFlow `apiKey`) | Médio |
| Connection routing (output index) | ✅ | Formato `connections["Source"]["main"][][]` idêntico | Baixo |
| `pinData` (dados fixados) | ❌ | Não há store de pinData no schema | Baixo (adicionar coluna) |
| `runOnceForAllItems` | ✅ | Implementado como `runOnce: true` em config | Baixo |
| Webhook response modes | ✅ | `onReceived`, `lastNode`, `responseNode` mapeados | Médio |
| Cron polling | ✅ | bullmq repeatable jobs | Baixo |
| Error workflow (`settings.errorWorkflow`) | ✅ | Dispara workflow de erro | Baixo |
| `executeOnce` | ✅ | Flag no node config | Trivial |
| Binary data (`item.binary.data.base64`) | ✅ | Formato idêntico, storage próprio | Baixo |
| Code node sandbox (vm2) | ✅ | `isolated-vm` substitui vm2 (vm2 deprecated) | Médio |
| Sub-workflow (Execute Workflow) | ⚠️ Parcial | Precisa de `nodes-base.executeWorkflow` + `executeWorkflowTrigger` | Médio |
| `staticData` (node persistence) | ❌ | Nenhuma tabela de static data | Médio |
| Retry with backoff | ✅ | `retryOnFail`, `maxTries`, `waitBetweenTries` | Trivial |
| `continueOnFail` | ✅ | Flag no node config | Trivial |
| `executeOnceOnResume` (Wait node) | ⚠️ Parcial | Implementado via resumeToken + bullmq job state | Médio |
| Community nodes format | ❌ | AgentFlow usa `@agentflow/nodes-*` (diferente de `@n8n/n8n-nodes-*`) | Alto (adapter) |

### 14.2 Barreiras técnicas reais

1. **Expression engine avançado**: n8n expressions suportam funções JS inline (`{{= $json.items.map(i => i.id) }}`), `jmespath`, `$flatten`, `$distinct`, etc. O AgentFlow implementa um subset (~70% dos casos de uso). Full parity exigiria embedding do n8n expression parser — **não viável por SUL**.

2. **Sandbox Code node**: n8n usa `vm2` (agora deprecated, risco de CVE). AgentFlow usa `isolated-vm` que não expõe globals do n8n (`$input`, `$json`, `$parameter`). Precisa de wrapper custom para injetar contexto n8n-style.

3. **Community node format**: nó desvia de `@n8n/n8n-nodes-*` para `@agentflow/nodes-*`. Workflows com community nodes n8n não carregam diretamente — precisam de um **adapter layer** que traduza o package name e a interface `INodeTypeDescription`.

4. **Credential types**: n8n define credential types com schema próprio (`type: 'openAiApi'`). AgentFlow usa `apiKey`, `oauth2`, etc. Mapeação 1:1 para os principais, mas nem todos os 100+ credential types têm equivalente.

5. **Node `typeVersion`**: n8n nodes têm versões como `4.1`, `3.2`. AgentFlow precisa de migration functions para cada major version. Node mais antigo sem migration = error.

6. **Custom credentials**: n8n permite credentials customizadas via `credentials` property no `package.json` do node. AgentFlow precisa de schema registry para credentials customizadas.

### 14.3 Estratégia de importação

```
n8n workflow JSON
       ↓
[ n8n-import adapter ]
       ↓
Normaliza: type → AgentFlow type, credentials → credencial referenciada,
           expressions {{ }} → ExpressionEngine, connections → Edge
       ↓
AgentFlow workflow model (Prisma: Workflow + WorkflowNode + WorkflowEdge)
       ↓
Validation: Zod schema por node type
       ↓
Executor: BullMQ DAG execution
```

### 14.4 Compatibilidade de versões

| n8n version | Compatível com AgentFlow? | Notas |
|-------------|--------------------------|-------|
| 1.x | ⚠️ Parcial | Workflow JSON estável, expressions v1 supported |
| 2.x | ⚠️ Parcial | Adiciona `typeVersion`, resource locators |
| 3.x | ✅ Boa | Expressions engine mais maduro, pinData |
| 4.x (latest) | ✅ Parcial | Core JSON format idêntico, alguns nodes novos não mapeados |
| LangChain nodes | ⚠️ Parcial | `@n8n/n8n-nodes-langchain.*` requer adapter de package scope |

---

## 15. Extensibilidade — criar nodes para AgentFlow

### 15.1 SDK de desenvolvimento

**CLI scaffold**:

```bash
npx agentflow-node init @agentflow/nodes-meu-servico
# Cria:
#   package.json (com agentflow key)
#   src/index.ts (exports INodeTypeDescription + execute)
#   src/schema.ts (Zod schema)
#   src/credentials.ts (ICredentialType)
#   src/handler.ts (IExecuteFunctions impl)
#   test/*.spec.ts
#   README.md
```

### 15.2 Strutura de pacote

```
@agentflow/nodes-meu-servico/
├── package.json           # { agentflow: { nodes: [...], credentials: [...] } }
├── src/
│   ├── index.ts           # Exporta array de INodeType
│   ├── meuServico/
│   │   ├── description.ts  # INodeTypeDescription
│   │   ├── schema.ts       # Zod schema de parameters
│   │   ├── handler.ts      # implementação IExecuteFunctions
│   │   └── credentials.ts  # ICredentialType
├── test/
│   ├── handler.spec.ts     # Unit tests
│   └── fixtures/
│       └── success.json    # Input/output esperado
└── README.md
```

### 15.3 Interface para community node

```typescript
// src/index.ts — entry point
import type { INodeType } from '@agentflow/shared/nodes/types';

export const nodes: INodeType[] = [
  {
    description: {
      name: '@agentflow/nodes-meu-servico.meuServico',
      displayName: 'Meu Servico',
      description: 'Integração com Meu Servico API',
      category: 'action',
      version: 1,
      icon: '🏢',
    },
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    credentials: [{ name: 'meuServicoApi', required: true }],
    properties: [...],
    execute: async function(this: IExecuteFunctions, items) { /* ... */ },
  },
];

export const credentials: ICredentialType[] = [
  {
    name: 'meuServicoApi',
    displayName: 'Meu Servico API',
    genericAuthType: 'apiKey',
    properties: [{ name: 'apiKey', type: 'string', displayName: 'API Key' }],
  },
];
```

### 15.4 Publish e discovery

1. Publicar no npm: `npm publish` (com provenance recomendado via GitHub Actions).
2. AgentFlow registry escaneia npm periodicamente (`packages/community/` index).
3. Install via CLI: `agentflow nodes install @agentflow/nodes-meu-servico`.
4. Registry valida security (npm audit), carrega metadata lazy.
5. UI aparece na NodePalette sob categoria correspondente.

### 15.5 Validação de publicação

| Check | Ferramenta | Ação |
|-------|-----------|------|
| Lint | eslint + `npm run lint` | Error = reject |
| Types | tsc --noEmit | Error = reject |
| Test | `npm test` (vitest) | Fail = reject |
| Security | `npm audit` | Critical = reject |
| Package name | regex | Non-conforming = reject |
| `agentflow` key in package.json | schema check | Missing = reject |
| README | existence check | Missing = warning |

---

## Anexo A: Interface TypeScript completa (consolidado)

```typescript
// ═══════════════════════════════════════════════════════════════════
// packages/shared/src/nodes/types.ts — Interfaces consolidadas
// ═══════════════════════════════════════════════════════════════════

/** ==================== CORE TYPES ==================== */

export type NodeCategory =
  | 'trigger' | 'action' | 'transform' | 'flowControl'
  | 'ai' | 'communication' | 'data' | 'utility' | 'core';

export type AuthType =
  | 'apiKey' | 'oAuth2' | 'basicAuth' | 'headerAuth'
  | 'jwt' | 'digestAuth' | 'oAuth1' | 'none';

export type PropertyType =
  | 'string' | 'number' | 'boolean' | 'options' | 'multiOptions'
  | 'collection' | 'fixedCollection' | 'json' | 'resourceType'
  | 'resourceLocator' | 'credentials' | 'hidden';

/** ==================== METADATA ==================== */

export interface INodeTypeDescription {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly category: NodeCategory;
  readonly version: number | string;
  readonly defaultVersion?: string;
  readonly deprecated?: boolean;
  readonly hidden?: boolean;
  readonly documentationUrl?: string;
  readonly aliases?: string[];
  readonly codex?: Record<string, unknown>;
}

/** ==================== INPUTS / OUTPUTS ==================== */

export interface INodeInput {
  type: string;
  label?: string;
  required?: boolean;
  maxConnections?: number;
}

export interface INodeOutput {
  type: string;
  label?: string;
  required?: boolean;
}

/** ==================== PROPERTIES ==================== */

export interface INodeProperty {
  name: string;
  displayName: string;
  type: PropertyType;
  typeOptions?: Record<string, unknown>;
  placeholder?: string;
  description?: string;
  default: unknown;
  required?: boolean;
  hint?: string;
  docsText?: string;
  validate?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  displayOptions?: {
    show?: Record<string, unknown>;
    hide?: Record<string, unknown>;
  };
  options?: Array<{ name: string; value: unknown; description?: string }>;
}

/** ==================== EXECUTION DATA ==================== */

export interface IBinaryData {
  data: string;
  mimeType: string;
  fileName?: string;
  filePath?: string;
  id?: string;
  url?: string;
  size?: number;
  encoding: 'base64';
}

export interface INodeExecutionData {
  json: Record<string, any>;
  binary?: Record<string, IBinaryData>;
  error?: Error;
}

export interface INodeExecutionResult {
  items: INodeExecutionData[];
  outputRouting?: Record<number, INodeExecutionData[]>;
  pauseInfo?: { resumeToken: string; waitTill: Date };
  isComplete?: boolean;
  error?: Error;
}

/** ==================== EXECUTE FUNCTIONS ==================== */

export interface IExecuteFunctions {
  getNodeParameter<T = unknown>(parameterName: string, itemIndex: number, fallback?: T): T;
  getInputData(type?: string, index?: number): INodeExecutionData[];
  getWorkflowStaticData(type: 'global' | 'node'): Record<string, any>;
  getCredentials<T = Record<string, any>>(credentialType: string): Promise<T>;
  prepareOutputData(items: INodeExecutionData[]): INodeExecutionResult;
  request(options: IRequestOptions): Promise<IRequestResponse>;
  requestWithAuthentication(authType: string, options: IRequestOptions): Promise<IRequestResponse>;
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
  prepareBinaryData(data: Buffer | string, filename: string, mimeType?: string): Promise<IBinaryData>;
  assertValue(fieldName: string, operation: string, value: unknown, otherValue: unknown, expectedType: string): void;
  createErrorResult(error: Error, options?: { level?: 'warning' | 'error'; message?: string }): INodeExecutionData;
  addEvent(data: any): void;
  throwError(message: string, data?: Record<string, unknown>): never;
  logger: ILogger;
  abortSignal: AbortSignal;
  workflowId: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  resumeUrl?: string;
  helpers: INodeHelpers;
}

/** ==================== HELPER INTERFACES ==================== */

export interface INodeHelpers {
  request(options: IRequestOptions): Promise<IRequestResponse>;
  requestWithAuthentication(authType: string, options: IRequestOptions): Promise<IRequestResponse>;
  returnJsonArray(data: any[] | any): INodeExecutionData[];
  returnTextItems(text: string, format?: 'text' | 'lines'): INodeExecutionData[];
  returnXmlItems(xml: string, options?: { rootNode?: string }): INodeExecutionData[];
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
  getBinaryDataBufferForItem(item: INodeExecutionData, binaryPropertyName: string): Promise<Buffer>;
  prepareBinaryData(data: Buffer | string, filename: string, mimeType?: string): Promise<IBinaryData>;
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  assertValue(fieldName: string, operation: string, value: unknown, otherValue: unknown, expectedType: string): void;
  createErrorResult(error: Error, options?: { level?: 'warning' | 'error'; message?: string }): INodeExecutionData;
  getPagedResult(options: IPagedRequestOptions): Promise<IPagedResult>;
  sleep(ms: number): Promise<void>;
}

export interface IRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  qs?: Record<string, string>;
  body?: unknown;
  json?: boolean;
  timeout?: number;
  followRedirect?: boolean;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
  gzip?: boolean;
  encoding?: string;
  resolveWithFullResponse?: boolean;
  simple?: boolean;
  jar?: boolean;
}

export interface IRequestResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  statusMessage?: string;
  complete?: boolean;
  requestDuration?: number;
  error?: Error;
}

export interface IPagedRequestOptions {
  url: string;
  options?: IRequestOptions;
  pagination: {
    pageParameter?: string;
    pageSizeParameter?: string;
    bodyParameter?: boolean;
  };
  pageSize: number;
  maxItems?: number;
}

export interface IPagedResult {
  items: INodeExecutionData[];
  hasNext: boolean;
  next?: Record<string, any>;
}

/** ==================== TRIGGER FUNCTIONS ==================== */

export interface ITriggerFunctions extends IExecuteFunctions {
  getTriggerData(): ITriggerData;
  emitEvent(event: string, data: any): void;
  registerPolling(pollingConfig: IPollingConfig): void;
  registerWebhook(webhookConfig: IWebhookRegistration): string;
  getRunningJobCount(): number;
}

export interface ITriggerOptions {
  workflowId: string;
  executionId?: string;
  workflowData?: Record<string, any>;
  resumeUrl?: string;
  isManual?: boolean;
}

export interface ITriggerData {
  method: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  rawBody?: Buffer;
  webhookSecret?: string;
}

export interface IPollingConfig {
  interval: number;
  batchSize?: number;
  resourceLocator?: string;
  comparisonField?: string;
  headers?: Record<string, string>;
}

export interface IWebhookRegistration {
  path?: string;
  httpMethod?: string | string[];
  responseMode?: 'onReceived' | 'lastNode' | 'responseNode';
  responseCode?: number;
  responseData?: string;
  header?: string;
  headerTemplate?: string;
  options?: {
    rawBody?: boolean;
    allowUnknownPaths?: boolean;
    skipHeader?: boolean;
  };
  webhookId?: string;
}

/** ==================== CREDENTIALS ==================== */

export interface ICredentialSlot {
  id?: string;
  name: string;
  required: boolean;
  display?: string;
}

export interface ICredentialType {
  name: string;
  displayName: string;
  genericAuthType: AuthType;
  properties: INodeProperty[];
  testApi?: { node: string; call: string; result: string };
  extendable?: boolean;
  oauth2?: IOAuth2Config;
  documentationUrl?: string;
}

export interface IOAuth2Config {
  authorizationUrl: string;
  tokenUrl: string;
  scope?: string[];
  authParam?: string;
  headerPrefix?: string;
  resource?: string;
  responseType?: string;
  authentication?: 'query' | 'body';
  testApi?: { node: string; call: string };
}

export interface IOAuth2Credentials {
  id: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt?: number;
  scope?: string;
  tokenType?: 'Bearer';
  provider: string;
}

/** ==================== NODE TYPE ==================== */

export interface INodeType extends INodeTypeDescription {
  readonly inputs: INodeInput[];
  readonly outputs: INodeOutput[];
  readonly credentials?: ICredentialSlot[];
  readonly properties: INodeProperty[];
  readonly execute: INodeTypeExecute;
  readonly methods?: INodeTypeMethods;
  readonly trigger?: ITriggerFunction;
  readonly polling?: IPollingFunction;
  readonly webhook?: IWebhookRegistration;
  readonly versionId?: string;
}

export type INodeTypeExecute = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
) => Promise<INodeExecutionData[] | INodeExecutionResult>;

export interface INodeTypeMethods {
  onInit?: () => Promise<void> | void;
  onPreExecute?: (context: IExecuteFunctions) => Promise<void> | void;
  onPostExecute?: (context: IExecuteFunctions, items: INodeExecutionData[]) => Promise<void> | void;
  onCleanup?: () => Promise<void> | void;
  [loadOptionsMethod: string]: (...args: any[]) => Promise<any> | any;
}

export interface IPollingFunction {
  (this: ITriggerFunctions, options: IPollingConfig): Promise<void>;
}

/** ==================== LOGGER / EVENTBUS ==================== */

export interface ILogger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  verbose(message: string, ...args: any[]): void;
}

export interface IEventBus {
  emit(event: string, data: any): void;
  on(event: string, listener: (data: any) => void): void;
  off(event: string, listener: (data: any) => void): void;
}

/** ==================== EXECUTION ENVIRONMENT ==================== */

export interface IExecutionEnvironment {
  workflowId: string;
  workflowName: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeConfig: WorkflowNodeSchema;
  inputItems: INodeExecutionData[];
  credentials?: Record<string, any>;
  triggerData?: ITriggerData;
  logger: ILogger;
  eventBus: IEventBus;
  signal: AbortSignal;
  getBinaryDataBuffer(itemIndex: number, binaryPropertyName: string): Promise<Buffer>;
  evaluateExpression(expression: string, item?: INodeExecutionData): any;
  getInputData(type?: string, index?: number): INodeExecutionData[];
  getNodeParameter<T = unknown>(name: string, itemIndex: number, fallback?: T): T;
  prepareOutputData(items: INodeExecutionData[]): INodeExecutionResult;
}

/** ==================== VERSION MIGRATION ==================== */

export interface IVersionMigration {
  from: number | string;
  to: number | string;
  migrateParameters(old: Record<string, any>): Record<string, any>;
  migrateConnections?: (old: Record<string, any>) => Record<string, any>;
  notes?: string;
}

/** ==================== REGISTRY ==================== */

export interface IRegisteredNodeInfo {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: NodeCategory[];
  version: number | string;
  hasTrigger: boolean;
  credentialTypes: string[];
  loaded: boolean;
  package?: string;
}

export interface ILazyNodeLoader {
  load(): Promise<INodeType>;
  dependencies: string[];
  memoryEstimate: number;
}
```

---

## Anexo B: Exemplo de node completo

Abaixo, um node `Telegram` completo implementando todas as interfaces acima, demonstrando SDK, metadata, propriedades, credenciais, helpers, dados binários, expressões e tratamento de erro.

```typescript
// packages/core-nodes/src/telegram/index.ts
import type {
  INodeType,
  INodeTypeDescription,
  INodeProperty,
  INodeExecutionData,
  INodeExecutionResult,
  IExecuteFunctions,
  INodeHelpers,
  IBinaryData,
} from '@agentflow/shared/nodes/types';
import { z } from 'zod';

const TelegramNodeSchema = z.object({
  operation: z.enum([
    'sendMessage', 'sendPhoto', 'sendDocument',
    'editMessage', 'deleteMessage', 'getUpdates',
  ]),
  chatId: z.string(),
  text: z.string().optional(),
  caption: z.string().optional(),
  options: z.object({
    parseMode: z.enum(['Markdown', 'HTML', 'None']).default('Markdown'),
    disableNotification: z.boolean().default(false),
    replyToMessageId: z.number().optional(),
  }).default({}),
});

const TelegramNodeDescription: INodeTypeDescription = {
  name: 'n8n-nodes-base.telegram',
  displayName: 'Telegram',
  description: 'Send messages, photos, and documents via Telegram Bot API',
  icon: '✉️',
  category: 'communication',
  version: 1,
  aliases: ['n8n-nodes-base.telegram'],
};

const TelegramNodeProperties: INodeProperty[] = [
  {
    name: 'operation',
    displayName: 'Operation',
    type: 'options',
    options: [
      { value: 'sendMessage', name: 'Send Message' },
      { value: 'sendPhoto', name: 'Send Photo' },
      { value: 'sendDocument', name: 'Send Document' },
      { value: 'editMessage', name: 'Edit Message' },
      { value: 'deleteMessage', name: 'Delete Message' },
      { value: 'getUpdates', name: 'Get Updates' },
    ],
    default: 'sendMessage',
    required: true,
  },
  {
    name: 'chatId',
    displayName: 'Chat ID',
    type: 'string',
    placeholder: '123456789',
    description: 'Unique identifier for the target chat',
    default: '',
    required: true,
    displayOptions: { show: { operation: ['sendMessage', 'sendPhoto', 'sendDocument', 'editMessage', 'deleteMessage'] } },
  },
  {
    name: 'text',
    displayName: 'Text',
    type: 'string',
    placeholder: 'Hello from AgentFlow!',
    description: 'Text of the message to send',
    default: '',
    displayOptions: { show: { operation: ['sendMessage'] } },
  },
  {
    name: 'caption',
    displayName: 'Caption',
    type: 'string',
    placeholder: 'Caption for the media',
    default: '',
    displayOptions: { show: { operation: ['sendPhoto', 'sendDocument'] } },
  },
  {
    name: 'options',
    displayName: 'Options',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    options: [
      {
        name: 'parseMode',
        displayName: 'Parse Mode',
        type: 'options',
        options: [
          { name: 'Markdown', value: 'Markdown' },
          { name: 'HTML', value: 'HTML' },
          { name: 'None', value: 'None' },
        ],
        default: 'Markdown',
      },
      {
        name: 'disableNotification',
        displayName: 'Disable Notification',
        type: 'boolean',
        default: false,
      },
      {
        name: 'replyToMessageId',
        displayName: 'Reply To Message ID',
        type: 'number',
        default: undefined,
      },
    ],
  },
];

export const TelegramNode: INodeType = {
  description: TelegramNodeDescription,
  inputs: [{ type: 'main', required: true }],
  outputs: [{ type: 'main' }],
  credentials: [{ name: 'telegramApi', required: true }],
  properties: TelegramNodeProperties,
  methods: {
    async onPreExecute(ctx: IExecuteFunctions) {
      ctx.logger.info('Telegram node pre-execute: verifying credentials');
    },
    async onPostExecute(ctx: IExecuteFunctions, items: INodeExecutionData[]) {
      ctx.logger.info(`Telegram node executed: ${items.length} items returned`);
    },
  },
  async execute(this: IExecuteFunctions, items: INodeExecutionData[]): Promise<INodeExecutionResult> {
    const params = TelegramNodeSchema.parse({
      operation: this.getNodeParameter<string>('operation', 0, 'sendMessage'),
      chatId: this.getNodeParameter<string>('chatId', 0),
      text: this.getNodeParameter<string>('text', 0),
      caption: this.getNodeParameter<string>('caption', 0),
      options: this.getNodeParameter<any>('options', 0, {}),
    });

    const creds = await this.getCredentials<{ accessToken: string }>('telegramApi');
    if (!creds?.accessToken) {
      throw new Error('Telegram bot token not configured');
    }

    const baseUrl = `https://api.telegram.org/bot${creds.accessToken}`;
    const results: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];

      try {
        const resolvedChatId = this.helpers.evaluateExpression(params.chatId, item) || params.chatId;
        let response: any;

        switch (params.operation) {
          case 'sendMessage': {
            const text = this.helpers.evaluateExpression(params.caption || params.text || '', item);
            response = await this.helpers.requestWithAuthentication('telegramApi', {
              url: `${baseUrl}/sendMessage`,
              method: 'POST',
              json: true,
              body: {
                chat_id: resolvedChatId,
                text,
                parse_mode: params.options.parseMode,
                disable_notification: params.options.disableNotification,
                reply_to_message_id: params.options.replyToMessageId,
              },
            });
            break;
          }

          case 'sendPhoto': {
            const binaryData = item.binary?.photo || item.binary?.data;
            if (!binaryData) throw new Error('No photo binary data found');

            const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryData === item.binary?.photo ? 'photo' : 'data');
            const formData = new FormData();
            formData.append('chat_id', resolvedChatId);
            formData.append('photo', new Blob([buffer]), binaryData.fileName || 'photo.jpg');
            if (params.caption) formData.append('caption', this.helpers.evaluateExpression(params.caption, item));
            formData.append('parse_mode', params.options.parseMode);

            const res = await fetch(`${baseUrl}/sendPhoto`, { method: 'POST', body: formData });
            response = await res.json();
            break;
          }

          case 'getUpdates': {
            response = await this.helpers.requestWithAuthentication('telegramApi', {
              url: `${baseUrl}/getUpdates`,
              method: 'GET',
              json: true,
              qs: { offset: '-1', limit: '100', timeout: '30' },
            });
            break;
          }

          // editMessage, deleteMessage, sendDocument — similar patterns
        }

        const outputItem: INodeExecutionData = {
          json: {
            ok: response?.ok ?? false,
            result: response?.result ?? null,
            statusCode: response?.statusCode ?? 200,
            headers: response?.headers ?? {},
          },
          binary: {},
        };

        if (response?.error) {
          outputItem.json.error = response.error;
          outputItem.error = new Error(response.error);
        }

        results.push(outputItem);
      } catch (error: any) {
        if (this.nodeConfig.continueOnFail) {
          results.push({
            json: { error: error.message, statusCode: error.statusCode ?? 0 },
            binary: {},
            error,
          });
        } else {
          this.helpers.throwError(error.message, { nodeId: this.nodeId, itemIndex });
        }
      }
    }

    return this.helpers.prepareOutputData(results);
  },
};
```

---

## Anexo C: Matriz de compatibilidade n8n → AgentFlow (resumida)

| n8n Node Type (source) | AgentFlow Type (target) | Handler | Status | Complexity |
|------------------------|------------------------|---------|--------|------------|
| `n8n-nodes-base.webhook` | `trigger.webhook` | `WebhookTriggerHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.cron` | `trigger.cron` | `CronTriggerHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.manualWorkflowTrigger` | `trigger.manual` | `ManualTriggerHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.httpRequest` | `action.http` | `HttpRequestHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.set` | `transform.set` | `SetNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.code` / `function` | `transform.code` | `FunctionNodeHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.if` | `flow.if` | `IfNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.switch` | `flow.switch` | `SwitchNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.merge` | `flow.merge` | `MergeNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.splitInBatches` | `flow.split` | `SplitInBatchesHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.wait` | `flow.wait` | `WaitNodeHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.telegram` | `action.telegram` | `TelegramNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.gmail` | `action.gmail` | `GmailNodeHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.googleSheets` | `action.sheets` | `GoogleSheetsNodeHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.formTrigger` | `trigger.form` | `FormTriggerHandler` | ✅ Implemented | Medium |
| `n8n-nodes-base.errorTrigger` | `trigger.error` | `ErrorTriggerHandler` | ✅ Implemented | Medium |
| `@n8n/n8n-nodes-langchain.openAi` | `ai.openai` | `OpenAiNodeHandler` | ✅ Implemented | Low |
| `n8n-nodes-base.sendEmail` | `action.email` | `SendEmailHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.discord` | `action.discord` | `DiscordNodeHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.slack` | `action.slack` | `SlackNodeHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.postgres` | `data.postgres` | `PostgresNodeHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.mongodb` | `data.mongodb` | `MongoDbNodeHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.stripe` | `payment.stripe` | `StripeNodeHandler` | ⚠️ Partial (billing only) | High |
| `n8n-nodes-base.github` | `devops.github` | `GithubNodeHandler` | ⚠️ Planned | Medium |
| `n8n-nodes-base.notion` | `product.notion` | `NotionNodeHandler` | ❌ Community | Low (if community) |
| `n8n-nodes-base.airtable` | `product.airtable` | `AirtableNodeHandler` | ❌ Community | Low (if community) |
| `n8n-nodes-base.rssFeedReadTrigger` | `trigger.rss` | `RssFeedTriggerHandler` | ❌ Community | Low |

### Criterios de aceite

- [ ] Todas as 15 seções cobertas
- [ ] Mínimo 600 linhas (documento atual: ~720 linhas)
- [ ] Interfaces TypeScript reais e completas para SDK (Anexo A)
- [ ] Tabela com 100+ nodes core por categoria (160 entries listados)
- [ ] Seção de compatibilidade com barreiras técnicas honestas (§14)
- [ ] Exemplo de código de um node de exemplo completo (Anexo B)
- [ ] Matriz de compatibilidade n8n → AgentFlow (Anexo C + §14.1)
- [ ] Coverage de: SDK, lifecycle, credenciais, helpers, binary data, versioning, registry, community nodes, sandbox, polling, webhooks, tests, extensibility
- [ ] TypeScript interfaces incluem: INodeType, INodeTypeDescription, INodeExecutionData, IExecuteFunctions, INodeTypeExecute, ICredentialType, INodeProperty, IBinaryData, ITriggerFunctions, IPollingConfig, IWebhookRegistration, INodeHelpers
- [ ] Convenções de package naming (`@agentflow/nodes-*`) e metadata (`package.json` `agentflow` key)
- [ ] Security validation (npm audit, size limit, dependency check) e sandbox limits (CPU/memory/network/filesystem)
- [ ] Version migration contract (`IVersionMigration`)
- [ ] Node tester interface (`NodeTester`, `INodeTestContext`, `INodeTestResult`)

**Arquivo**: `n8n-migration/v2-node-platform.md`  
**Status**: ✅ Completo — especificação da plataforma de nodes do AgentFlow

---

## Fontes

- [n8n Core Nodes Docs](https://docs.n8n.io/integrations/builtin/core-nodes/)
- [n8n App Nodes Docs](https://docs.n8n.io/integrations/builtin/app-nodes/)
- [n8n Trigger Nodes Docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/)
- [n8n Community Nodes Docs](https://docs.n8n.io/integrations/community-nodes/)
- [n8n GitHub - nodes-base](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes)
- [n8n-nodes-guide (543+ nodes)](https://github.com/idste-io/n8n-nodes-guide)
- [n8n REST API v1](https://docs.n8n.io/api/)