const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.cwd(), 'missao-37-backlog-20260826', 'TASK', 'items');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const tasks = {
  'TASK-01-handlers-switch-split-merge.md': `# TASK-01: Handlers de Controle de Fluxo — Switch, SplitInBatches, Merge Avançado, Contrato de Items {json, binary} & Motor de Expressões $json

- **Prioridade:** P0 (Core Engine / Bloqueador)
- **Domínio:** Core Executor / Flow Control / Expression Engine
- **Alvo:** \`apps/api/src/services/nodes/\`, \`apps/api/src/services/executor.ts\` & \`apps/api/src/services/expressions.ts\`

## 1. Contexto & Problema
Workflows no AgentFlow precisam de controle de fluxo determinístico de multi-caminhos, iteração em coleções/lotes, junção flexível de branches e conformidade universal com o contrato de dados baseado em itens \`{ json, binary }\` e resolução dinâmica de expressões \`$json\`.

## 2. Objetivos & Especificação
1. **Nó Switch (Roteamento n-vias):**
   - Suporte a múltiplas saídas nomeadas baseadas em regras encadeadas (\`equals\`, \`notEquals\`, \`contains\`, \`regex\`, \`greaterThan\`, \`lessThan\`, \`isEmpty\`, \`isNotEmpty\`, \`default\`).
   - Roteamento condicional direcionando cada item para a porta/saída correta (\`sourceHandle\`).
2. **Nó SplitInBatches (Batching & Loops):**
   - Quebra de arrays de itens em lotes com tamanho fixo ou dinâmico configurável.
   - Contexto de iteração injetado: \`batchIndex\`, \`totalBatches\`, \`isLastBatch\`, \`batchSize\`.
   - Compatibilidade com loops de retroalimentação no grafo do workflow.
3. **Nó Merge (Fusão Avançada):**
   - Modos de fusão: \`append\` (concatenação), \`combineByPosition\` (zip de itens), \`multiplex\` (produto cartesiano), \`waitAll\` (sincronização de branches paralelas).
4. **Contrato Universal de Items \`{ json, binary }\`:**
   - Todo nó recebe e emite um array tipado \`NodeItem[] = Array<{ json: Record<string, any>, binary?: Record<string, BinaryData> }>\`.
   - Garantia de isolamento e imutabilidade entre nós executados.
5. **Motor de Expressões \`$json\`:**
   - Resolução dinâmica de referências em tempo de execução: \`{{ $json.foo }}\`, \`{{ $json['bar'].baz }}\`, \`{{ $item("NodeName").json.field }}\`, \`{{ $executionId }}\`, \`{{ $now }}\`.
   - Tratamento de safe-navigation sem crash por undefined/null.

## 3. Critérios de Aceite
- [ ] O nó \`switch\` avalia regras e roteia itens com precisão para os outputs \`sourceHandle\` correspondentes.
- [ ] O nó \`splitInBatches\` divide itens em lotes mantendo estado e flags de iteração (\`isLastBatch\`).
- [ ] O nó \`merge\` suporta com perfeição os modos \`append\`, \`combineByPosition\` e \`waitAll\`.
- [ ] Todos os dados que trafegam entre nós respeitam estritamente a estrutura \`Array<{ json, binary }>\`.
- [ ] Expressões contendo \`$json\` e \`$item()\` são avaliadas com interpolação segura e sanitizada.
- [ ] 100% de testes unitários cobrindo nós de controle de fluxo e motor de expressões.
`,

  'TASK-02-handlers-wait-form-resume.md': `# TASK-02: Handlers Assíncronos & HITL — Wait, Form (Aprovação Humana) & Chat Trigger com Streaming SSE

- **Prioridade:** P0 (Core Engine / Bloqueador)
- **Domínio:** Async Execution / Human-in-the-Loop / Chat Streaming
- **Alvo:** \`apps/api/src/services/nodes/\`, \`apps/api/src/routes/approvals.ts\`, \`apps/api/src/routes/chat.ts\` & \`apps/api/src/services/executor.ts\`

## 1. Contexto & Problema
Workflows complexos exigem pausas no tempo (Wait), intervenção humana para aprovações com formulários (Form/HITL) e interações conversacionais em tempo real com streaming de tokens (Chat Trigger com Server-Sent Events).

## 2. Objetivos & Especificação
1. **Nó Wait:**
   - Modo temporal: pausa por duração (\`duration\` ex: 10m, 1h) ou data fixa (\`fixedDate\`) via BullMQ delayed jobs.
   - Modo callback: suspensão com registro de webhook token de retração externa.
2. **Nó Form (Human-in-the-Loop):**
   - Geração dinâmica de schema de campos Zod.
   - Emissão de link assinado com token JWT efêmero para formulário de aprovação/rejeição.
   - Estado de execução persistido como \`WAITING_APPROVAL\` sem prender recursos de memória.
   - Endpoint de submissão \`POST /api/approvals/:token/submit\` que valida payload e retoma o workflow.
3. **Chat Trigger com Streaming SSE (Server-Sent Events):**
   - Nó gatilho \`chatTrigger\` especializado para assistentes conversacionais e interfaces de chat.
   - Endpoint \`POST /api/chat/stream\` e \`GET /api/workflows/:id/chat/stream\` com protocolo \`text/event-stream\`.
   - Streaming em tempo real de: tokens da LLM (\`event: token\`), status de nós intermediários (\`event: node_status\`), logs e conclusão (\`event: done\`).
   - Persistência e injeção do histórico de mensagens da sessão/thread no contexto de itens do workflow.

## 3. Critérios de Aceite
- [ ] Execuções com nó \`wait\` entram em estado suspenso e retomam pontualmente via timer BullMQ.
- [ ] Formulários HITL geram URL segura, aceitam preenchimento com validação Zod e retomam o fluxo downstream.
- [ ] Nó \`chatTrigger\` transmite eventos e tokens via SSE para o cliente sem bufferização indevida.
- [ ] Clientes desconectados durante o SSE têm cancelamento gracioso da subscrição de eventos.
- [ ] Testes unitários e de integração validando suspensão/retomada e streaming SSE.
`,

  'TASK-03-handler-error-catch-subflow.md': `# TASK-03: Resiliência de Grafo — Nó ErrorTrigger & Subfluxos de Fallback

- **Prioridade:** P0 (Resiliência)
- **Domínio:** Error Handling / Graph Resilience
- **Alvo:** \`apps/api/src/services/nodes/\` & \`apps/api/src/services/executor.ts\`

## 1. Contexto & Problema
Falhas em nós de integração (ex: APIs instáveis, rate limits) não devem quebrar o pipeline silenciosamente. É necessário captura estruturada, retentativa configurável por nó e acionamento de subfluxos de erro.

## 2. Objetivos & Especificação
1. **Nó ErrorTrigger:**
   - Gatilho global ativado quando qualquer nó não-tratado falha no workflow.
   - Injeta contexto padronizado: \`{ errorMessage, errorCode, failedNodeId, failedNodeType, timestamp, executionId, retryCount, inputData }\`.
2. **Políticas onError por Nó:**
   - Opções configuráveis: \`stop\` (interrompe fluxo), \`continueRegularOutput\` (ignora erro e segue com payload nulo), \`routeToErrorBranch\` (desvia para porta de erro dedicada).
3. **Subfluxos de Notificação & Contingência:**
   - Roteamento garantido para canais de contingência (Slack, Teams, Webhook de alerta, Sentry) antes de finalizar o registro de execução.

## 3. Critérios de Aceite
- [ ] Erro em nó com \`onError: routeToErrorBranch\` desvia o fluxo sem falhar a execução geral.
- [ ] Falha fatal em workflow com \`errorTrigger\` aciona o subfluxo de recuperação e gera trace auditável.
- [ ] Testes unitários cobrindo todos os modos de tratamento de exceções em nós.
`,

  'TASK-04-cron-scheduler-daemon.md': `# TASK-04: Cron Scheduler Daemon Distribuído com Quartz & Redis Locks

- **Prioridade:** P0 (Agendamento & Automação)
- **Domínio:** Scheduler / Background Workers
- **Alvo:** \`apps/api/src/services/cron-scheduler.ts\` & \`apps/api/src/worker.ts\`

## 1. Contexto & Problema
Nós de agendamento temporal (\`cronTrigger\`) necessitam de um daemon autônomo e distribuído que gerencie agendamentos sem duplicação entre múltiplos nós de worker da API.

## 2. Objetivos & Especificação
1. **CronSchedulerService:**
   - Inicialização no boot da aplicação, carregando workflows ativos com nó \`cronTrigger\`.
   - Registro de jobs repetitivos no BullMQ com suporte a expressões cron padrão Quartz (5 ou 6 campos) e timezones (IANA).
2. **Sincronização Dinâmica em Tempo Real:**
   - Listeners de eventos de ativação, desativação e atualização de workflows no banco/Redis.
   - Remoção ou reagendamento atômico de jobs do BullMQ ao alterar o cron.
3. **Proteção Anti-Overlap & Concorrência:**
   - Distributed Lock via Redis (Redlock pattern) impedindo execução simultânea do mesmo job cron se o anterior ainda estiver ativo (\`preventOverlap: true\`).

## 3. Critérios de Aceite
- [ ] Workflows ativos com cron são registrados no Redis e disparados no minuto exato.
- [ ] Alteração de workflow reflete imediatamente no agendamento BullMQ sem restart manual do worker.
- [ ] Execuções concorrentes são bloqueadas pelo lock distribuído com aviso nos logs de auditoria.
- [ ] Testes unitários e de integração cobrindo parsing de cron, fuso horário e sincronização.
`,

  'TASK-05-vault-510-oauth2-refresh-engine.md': `# TASK-05: Vault 510 Providers — Motor Autônomo de Refresh de Tokens OAuth2

- **Prioridade:** P0 (Vault / Credenciais / Confiabilidade)
- **Domínio:** Security / Vault / OAuth2 Engine
- **Alvo:** \`apps/api/src/services/vault/oauth-refresh.ts\`, \`apps/api/src/services/vault/crypto.ts\` & \`apps/api/src/worker.ts\`

## 1. Contexto & Problema
O AgentFlow possui catálogo de 510 provedores. Credenciais OAuth2 expiram frequentemente (ex: 1h). Sem renovação automática preditiva e on-demand, os nós falham com \`401 Unauthorized\`.

## 2. Objetivos & Especificação
1. **On-Demand Token Refresh (Interception):**
   - Validador síncrono antes da execução de qualquer nó com credencial OAuth2.
   - Se \`expiresAt - now() < 5min\`, aciona refresh imediato via endpoint OAuth2 do provider e atualiza o banco de dados com AES-256-GCM.
2. **Background Scheduled Refresh Worker:**
   - Job agendado no BullMQ a cada 10 minutos para escanear credenciais ativas expirando em menos de 30 minutos e renovar proativamente.
3. **Tratamento de Rotação de Refresh Tokens:**
   - Suporte a provedores que invalidam o \`refreshToken\` antigo e fornecem um novo par no corpo da resposta.
   - Marcação de credencial como \`EXPIRED\` ou \`REVOKED\` caso o refresh falhe, notificando administradores da organização.

## 3. Critérios de Aceite
- [ ] Execução com token expirado renova com sucesso sem repassar erro 401 para o nó.
- [ ] Worker periódico renova credenciais prestes a expirar.
- [ ] Credenciais atualizadas são re-encriptadas com chave e tag de autenticação válidas no Vault.
- [ ] Cobertura de testes unitários com mocks de provedores OAuth2 (Google, Microsoft, Slack, GitHub, Salesforce).
`,

  'TASK-06-billing-tier-limits-sync.md': `# TASK-06: Sincronização Stripe Bidirecional, Ciclo de Vida de Planos & Quota Middleware

- **Prioridade:** P0 (Monetização & Governança)
- **Domínio:** Billing / Subscriptions / Quotas
- **Alvo:** \`apps/api/src/routes/stripe-webhook.ts\`, \`apps/api/src/services/billing.ts\` & \`apps/api/src/middlewares/quota.ts\`

## 1. Contexto & Problema
É crítico sincronizar em tempo real eventos de assinatura Stripe (criação, upgrade, downgrade, cancelamento, inadimplência) e aplicar bloqueios automáticos de execução quando cotas do plano (Free, Pro, Enterprise) forem ultrapassadas.

## 2. Objetivos & Especificação
1. **Webhook Handler Stripe Idempotente:**
   - Trata eventos: \`checkout.session.completed\`, \`customer.subscription.updated\`, \`customer.subscription.deleted\`, \`invoice.payment_succeeded\`, \`invoice.payment_failed\`.
   - Atualização atômica de plano e status da organização (\`active\`, \`past_due\`, \`canceled\`).
2. **Quota Enforcement Middleware:**
   - Intercepta gatilhos e execuções verificando limites do plano atual (número de execuções mensais, nós de IA, conexões simultâneas).
   - Retorna \`402 Payment Required / Quota Exceeded\` com cabeçalhos claros de limite.
3. **Degradação Graciosa:**
   - Em caso de cancelamento/inadimplência, suspende execução de workflows não-críticos e alerta no painel de administração.

## 3. Critérios de Aceite
- [ ] Eventos do Stripe alteram status de plano e limites da organização no banco em tempo real.
- [ ] Organizações sem cota disponível recebem 402 e têm execuções bloqueadas antes da fila do BullMQ.
- [ ] Testes unitários com simulação de webhooks Stripe assinados e cenários de limite de cota.
`,

  'TASK-07-worker-dlq-replay-ops.md': `# TASK-07: Worker Dead Letter Queue (DLQ), Reprocessamento em Lote & Alertas

- **Prioridade:** P1 (Operações & Resiliência)
- **Domínio:** Queue Ops / DLQ / Incident Management
- **Alvo:** \`apps/api/src/services/queue.ts\`, \`apps/api/src/routes/dlq.ts\` & \`apps/api/src/worker.ts\`

## 1. Contexto & Problema
Jobs do BullMQ que falham após esgotar tentativas (max retries) precisam de quarentena estruturada (DLQ), auditoria de causa raiz e endpoints para reprocessamento unitário ou em lote por operadores.

## 2. Objetivos & Especificação
1. **Isolamento na DLQ:**
   - Encaminhamento automático de jobs falhos para fila \`dead-letter-queue\` com payload completo, stack trace e metadados de contexto.
2. **API Administrativa de DLQ:**
   - \`GET /api/admin/dlq\`: listagem paginada de jobs falhos com filtros por workflow, organização e data.
   - \`POST /api/admin/dlq/replay\`: re-enfileiramento de jobs selecionados ou em lote de volta para a fila de execução.
   - \`DELETE /api/admin/dlq/purge\`: expurgo controlado de jobs antigos.
3. **Alertas de Incidentes:**
   - Emissão de notificação e métricas quando a taxa de mensagens na DLQ ultrapassar o limiar de anomalia.

## 3. Critérios de Aceite
- [ ] Jobs com erro fatal são persistidos na DLQ sem perda de payload de entrada.
- [ ] Rota de replay reinjeta o job na fila principal mantendo rastreabilidade do ID de execução.
- [ ] Testes de integração validando ciclo completo de falha -> quarentena -> replay com sucesso.
`,

  'TASK-08-mcp-rbac-scopes-enforcement.md': `# TASK-08: Arquitetura Completa MCP Server & Client com RBAC Granular por Ferramenta

- **Prioridade:** P1 (Protocolo Model Context Protocol & Segurança)
- **Domínio:** MCP Protocol / Agents / Security
- **Alvo:** \`apps/api/src/mcp/\`, \`apps/api/src/routes/mcp.ts\` & \`apps/api/src/services/nodes/mcp-client.ts\`

## 1. Contexto & Problema
O AgentFlow opera como hub central para agentes de IA. Ele precisa atuar tanto como **MCP Server** (expondo workflows, credenciais e ferramentas para LLMs via JSON-RPC 2.0 e SSE) quanto como **MCP Client** (permitindo que workflows consumam servidores MCP remotos com RBAC fino e validação de escopos).

## 2. Objetivos & Especificação
1. **Servidor MCP Completo (JSON-RPC 2.0 & SSE):**
   - Endpoints \`POST /api/mcp\` e streaming \`GET /api/mcp/sse\`.
   - Handlers canônicos: \`initialize\` (capabilities, protocolVersion 2024-11-05), \`tools/list\`, \`tools/call\`, \`resources/list\`, \`resources/read\`, \`prompts/list\`, \`prompts/get\`.
   - Suporte a 125+ ferramentas prontas mapeadas para ações de nós do AgentFlow.
2. **Nó MCP Client (Consumo Remoto):**
   - Handler \`mcpClient\` que se conecta a servidores MCP remotos via HTTP/SSE ou STDIO.
   - Descoberta dinâmica de ferramentas remotas e invocação parametrizada com tipagem Zod.
3. **RBAC Fino & Validação de Escopos:**
   - Definição estrita de escopos por ferramenta: \`workflow:read\`, \`workflow:execute\`, \`vault:decrypt\`, \`tools:call\`, \`admin:queues\`.
   - Validação em tempo de execução das permissões do token (JWT/API Key).
   - Retorno padronizado de erro JSON-RPC \`-32003 (Forbidden / Insufficient Scopes)\` em caso de falta de permissão.

## 3. Critérios de Aceite
- [ ] Handshake MCP retorna capacidades e versão do protocolo 2024-11-05 conforme especificação.
- [ ] Invocação de ferramentas valida escopos e rejeita requisições não autorizadas com código -32003.
- [ ] Nó MCP Client conecta a servidores externos e executa chamadas de ferramentas repassando dados estruturados.
- [ ] Suporte a transporte SSE bidirecional e requisições HTTP stateless.
- [ ] Cobertura de testes unitários e de integração cobrindo MCP Server, Client e RBAC.
`,

  'TASK-09-hmac-multi-provider-webhooks.md': `# TASK-09: Verificação Criptográfica de Webhooks HMAC Multi-Provedor

- **Prioridade:** P1 (Segurança de Ingestão & Integridade)
- **Domínio:** Webhooks / Security / Ingestion
- **Alvo:** \`apps/api/src/routes/webhooks.ts\` & \`apps/api/src/services/webhook-verifier.ts\`

## 1. Contexto & Problema
Endpoints de webhook expostos publicamente sofrem riscos de falsificação e repetição. É indispensável verificar a assinatura criptográfica HMAC fornecida pelos provedores antes de processar o payload.

## 2. Objetivos & Especificação
1. **Verificação Especializada Multi-Provedor:**
   - **GitHub:** cabeçalho \`X-Hub-Signature-256\` (HMAC-SHA256).
   - **Shopify:** cabeçalho \`X-Shopify-Hmac-SHA256\` (Base64 HMAC-SHA256).
   - **Stripe:** cabeçalho \`Stripe-Signature\` (timestamp \`t\` + assinatura \`v1\` com tolerância temporal de 5min contra replay attacks).
   - **Slack:** cabeçalho \`X-Slack-Signature\` com versão \`v0\` e timestamp \`X-Slack-Request-Timestamp\`.
   - **Genérico:** suporte a HMAC-SHA256, HMAC-SHA512 e HMAC-SHA1 com segredo configurável.
2. **Comparação Timing-Safe:**
   - Uso obrigatório de \`crypto.timingSafeEqual\` para prevenir vulnerabilidades de timing attack.
3. **Preservação de Raw Body:**
   - Interceptor Fastify mantendo o buffer raw exato para cálculo fiel do digest criptográfico.

## 3. Critérios de Aceite
- [ ] Webhooks com assinaturas válidas de GitHub, Shopify, Stripe e Slack são aceitos e disparados no workflow.
- [ ] Assinaturas forjadas ou payloads alterados são sumariamente rejeitados com \`401/403\`.
- [ ] Replay attacks com timestamps antigos são bloqueados.
- [ ] Testes unitários com vetores de teste oficiais de cada provedor.
`,

  'TASK-10-otel-distributed-tracing.md': `# TASK-10: Rastreamento Distribuído OpenTelemetry em Grafo e Filas

- **Prioridade:** P1 (Observabilidade & APM)
- **Domínio:** Observability / Tracing / OpenTelemetry
- **Alvo:** \`apps/api/src/lib/otel.ts\`, \`apps/api/src/services/executor.ts\` & \`apps/api/src/worker.ts\`

## 1. Contexto & Problema
Execuções de workflows distribuídos entre API, BullMQ e Workers exigem visibilidade ponta a ponta para identificar gargalos, latências de terceiros e falhas em cada nó individual.

## 2. Objetivos & Especificação
1. **Spans OpenTelemetry por Nó de Execução:**
   - Criação de span hierárquico para cada nó: \`agentflow.node.<nodeType>\`.
   - Atributos padronizados: \`workflow.id\`, \`execution.id\`, \`node.id\`, \`node.type\`, \`org.id\`, \`items.count\`.
2. **Propagação de Contexto W3C Trace Context:**
   - Injeção e extração de cabeçalhos \`traceparent\` / \`tracestate\` nos jobs do BullMQ e chamadas HTTP de saída.
3. **Exportador OTel:**
   - Suporte a exportação via OTLP (gRPC / HTTP) para Jaeger, Tempo, Honeycomb ou Datadog.

## 3. Critérios de Aceite
- [ ] Cada execução gera árvore completa de traces com spans individuais por nó.
- [ ] Erros em nós são gravados com status de span \`ERROR\` e registro de exceção.
- [ ] Contexto de trace é preservado através de enfileiramento no BullMQ.
- [ ] Testes unitários validando criação de spans e propagação de contexto.
`,

  'TASK-11-http-circuit-breaker.md': `# TASK-11: Nó HTTP Avançado — Suíte Completa de Autenticação & Circuit Breaker Resiliente

- **Prioridade:** P1 (Resiliência Egress & Integração HTTP)
- **Domínio:** HTTP Egress / Security / Circuit Breaker / Authentication
- **Alvo:** \`apps/api/src/services/executor.ts\`, \`apps/api/src/lib/circuit-breaker.ts\` & \`apps/api/src/lib/ssrf.ts\`

## 1. Contexto & Problema
O nó \`http\` é a espinha dorsal de integrações com APIs externas. Ele precisa suportar todos os esquemas modernos de autenticação com injeção automática e proteger o sistema contra travamentos em cascata quando serviços externos estiverem fora do ar.

## 2. Objetivos & Especificação
1. **Suíte Completa de Autenticação HTTP:**
   - **Basic Auth:** Injeção automática de header \`Authorization: Basic <base64>\`.
   - **Bearer Token:** Header \`Authorization: Bearer <token>\`.
   - **API Key:** Injeção em Header (ex: \`X-API-Key\`, \`api-key\`) ou Query Parameter dinâmico.
   - **OAuth2 Auto-Injection:** Descriptografia de credencial do Vault e injeção transparente do \`accessToken\` atualizado.
   - **Digest Auth:** Negociação de desafio digest HTTP RFC 7616.
   - **Client Certificate / mTLS:** Suporte a certificados TLS de cliente (PFX / PEM) para APIs financeiras e corporativas.
2. **Circuit Breaker para Egress:**
   - Estados de operação:
     - \`CLOSED\`: tráfego normal.
     - \`OPEN\`: interrompe requisições para o host após 5 falhas consecutivas ou timeout de 10s, retornando erro imediato sem prender conexões.
     - \`HALF-OPEN\`: permite requisição de teste após período de cooldown (ex: 30s) para reavaliar a saúde do host.
3. **SSRF Guard & Segurança de Rede:**
   - Bloqueio estrito de IPs privados (RFC 1918), link-local (RFC 3927) e endpoints de metadados de nuvem (AWS/GCP/Azure).

## 3. Critérios de Aceite
- [ ] Nó HTTP realiza requisições utilizando com sucesso todos os 6 esquemas de autenticação.
- [ ] Host em colapso aciona abertura do Circuit Breaker e protege os workers de esgotamento de conexões.
- [ ] Tentativas de requisição para endereços de rede privada são rejeitadas pelo SSRF guard.
- [ ] Testes automatizados cobrindo todos os modos de autenticação e transições de estado do Circuit Breaker.
`,

  'TASK-12-metering-usage-ledger-aggregation.md': `# TASK-12: Ledger Contábil de Medição & Agregação de Uso por Organização

- **Prioridade:** P1 (Contabilidade de Recursos & Billing)
- **Domínio:** Usage Metering / Billing Ledger / Accounting
- **Alvo:** \`apps/api/src/services/metering.ts\` & \`apps/api/src/routes/usage.ts\`

## 1. Contexto & Problema
Para faturamento de precisão e governança multi-tenant, é obrigatório registrar cada evento de consumo (tempo de CPU, execuções de nós, tokens de LLM e transferência de dados) em um ledger imutável agregado mensalmente.

## 2. Objetivos & Especificação
1. **Registro Atômico de Uso:**
   - Gravação de eventos na tabela \`UsageEvent\`: \`orgId\`, \`workflowId\`, \`executionId\`, \`metricType\` (\`execution_count\`, \`execution_duration_ms\`, \`llm_prompt_tokens\`, \`llm_completion_tokens\`, \`storage_bytes\`), \`value\`, \`timestamp\`.
2. **Agregação em Tempo Real & Histórica:**
   - Agrupamento mensal e diário com caching em Redis e consolidação em banco.
   - Endpoint \`GET /api/organizations/:id/usage\` com detalhamento por workflow e período.
3. **Garantia de Não-Falsificação:**
   - Registros do ledger assinados ou inseridos estritamente em transações isoladas.

## 3. Critérios de Aceite
- [ ] Execução de workflows grava eventos precisos de medição no ledger.
- [ ] Relatórios agregados de consumo calculam métricas mensais sem inconsistências.
- [ ] Testes unitários cobrindo agregação de tokens LLM e duração de execução.
`,

  'TASK-13-dynamic-rate-limiting-per-tier.md': `# TASK-13: Rate Limiting Dinâmico em Janela Deslizante por Plano

- **Prioridade:** P1 (Proteção de Infraestrutura & SLA)
- **Domínio:** Traffic Management / Rate Limiting / Redis
- **Alvo:** \`apps/api/src/middlewares/rate-limit.ts\` & \`apps/api/src/lib/redis.ts\`

## 1. Contexto & Problema
Diferentes planos contratuais possuem diferentes limites de vazão de requisições e execuções de webhook. É necessário aplicar rate limiting em janela deslizante (Sliding Window Log) no Redis, adaptado ao tier da organização.

## 2. Objetivos & Especificação
1. **Sliding Window Rate Limiter com Redis:**
   - Algoritmo baseado em sorted sets Redis (\`ZADD\`, \`ZREMRANGEBYSCORE\`, \`ZCARD\`) garantindo contagem precisa sem picos de fronteira de janela.
2. **Limites Dinâmicos por Tier:**
   - Free: 60 req/min, Pro: 600 req/min, Enterprise: 6000 req/min (ou customizável).
   - Cabeçalhos de resposta HTTP padrão: \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`.
3. **Resposta \`429 Too Many Requests\`:**
   - Retorno estruturado informando o tempo restante de espera (\`Retry-After\`).

## 3. Critérios de Aceite
- [ ] Requisições que excederem o limite do tier são barradas com código HTTP 429.
- [ ] Cabeçalhos de rate limit refletem a janela deslizante de forma acurada.
- [ ] Testes de concorrência com simulação de rajada (burst) respeitando o limite configurado.
`,

  'TASK-14-e2e-load-and-chaos-testing.md': `# TASK-14: Suíte de Testes E2E de Carga a 100 RPS & Testes de Caos

- **Prioridade:** P1 (Qualidade & Resiliência de Carga)
- **Domínio:** QA / Performance / Chaos Engineering
- **Alvo:** \`apps/api/test/load/\`, \`apps/api/test/chaos/\` & scripts de teste

## 1. Contexto & Problema
O backend precisa suportar carga contínua de 100 RPS com latência p95 < 300ms e demonstrar resiliência diante de quedas de conexão do Redis, interrupções no banco ou reinícios abruptos de workers.

## 2. Objetivos & Especificação
1. **Suíte de Carga a 100 RPS:**
   - Cenários simulando disparos simultâneos de webhooks, invocações MCP e execuções de grafos complexos.
   - Validação de SLA de performance: p95 < 300ms, taxa de erro < 0.1%.
2. **Testes de Caos & Injeção de Falhas:**
   - Simulação de desconexão momentânea do Redis durante enfileiramento.
   - Simulação de timeout em chamadas de banco e recuperação automática do pool.
   - Simulação de término forçado de processos worker e retomada correta de jobs travados.

## 3. Critérios de Aceite
- [ ] Teste de carga de 100 RPS atinge meta de latência p95 < 300ms.
- [ ] Falhas transitórias de infraestrutura são tratadas sem corrupção de estado ou travamento definitivo.
- [ ] Relatório consolidado gerado automaticamente na suíte de testes.
`,

  'TASK-15-workflow-semantic-diff-versioning.md': `# TASK-15: Versionamento Semântico e Diff Visual de Workflows

- **Prioridade:** P2 (Developer Experience & Versioning)
- **Domínio:** Workflow Engine / Version Control / Diffing
- **Alvo:** \`apps/api/src/services/workflow-diff.ts\` & \`apps/api/src/routes/workflows.ts\`

## 1. Contexto & Problema
Equipes colaborativas precisam visualizar alterações estruturais entre versões de um mesmo workflow antes de publicar em produção (nós adicionados, removidos, alterados, conexões modificadas).

## 2. Objetivos & Especificação
1. **Algoritmo de Diff Semântico:**
   - Comparação profunda entre duas versões de workflow (JSON do grafo).
   - Identificação de entidades:
     - \`nodesAdded\`, \`nodesRemoved\`, \`nodesModified\` (mudanças de parâmetros/credenciais).
     - \`edgesAdded\`, \`edgesRemoved\`, \`edgesModified\`.
2. **Endpoint de Diff:**
   - \`GET /api/workflows/:id/diff?fromVersion=v1&toVersion=v2\` retornando payload estruturado para renderização no canvas.
3. **Rollback Seguro de Versão:**
   - Rota para restauração instantânea de versão anterior mantendo snapshot histórico.

## 3. Critérios de Aceite
- [ ] Diff semântico aponta precisamente nós alterados, conexões refeitas e parâmetros editados.
- [ ] Rollback restaura o estado exato da versão desejada.
- [ ] Testes unitários com grafos divergentes validando o cálculo do diff.
`,

  'TASK-16-comms-nodes-teams-whatsapp.md': `# TASK-16: Nós Corporativos de Comunicação — Microsoft Teams & WhatsApp Cloud API

- **Prioridade:** P2 (Nós & Integrações Corporativas)
- **Domínio:** Integrations / Communications / Enterprise
- **Alvo:** \`apps/api/src/services/nodes/teams.ts\` & \`apps/api/src/services/nodes/whatsapp.ts\`

## 1. Contexto & Problema
Empresas utilizam Microsoft Teams e WhatsApp como canais centrais de mensageria corporativa e engajamento de clientes. O AgentFlow necessita de nós nativos completos para essas plataformas.

## 2. Objetivos & Especificação
1. **Nó Microsoft Teams:**
   - Envio de mensagens de texto, menções e cartões interativos ricos (**Adaptive Cards 1.5**).
   - Suporte a envio via Incoming Webhook ou Graph API OAuth2.
2. **Nó WhatsApp Cloud API (Meta):**
   - Envio de mensagens de texto, botões de ação rápida, mídia (imagens, PDFs, áudio) e templates pré-aprovados.
   - Suporte a autenticação via System User Token do Meta Business Manager.

## 3. Critérios de Aceite
- [ ] Nó Teams constrói e despacha Adaptive Cards estruturados com sucesso.
- [ ] Nó WhatsApp envia mensagens de template e mídia respeitando a API da Meta.
- [ ] Cobertura de testes unitários com mocks de payloads para ambas as plataformas.
`,

  'TASK-17-google-workspace-calendar-docs.md': `# TASK-17: Nós Google Workspace — Google Calendar & Google Docs

- **Prioridade:** P2 (Nós & Produtividade)
- **Domínio:** Integrations / Google Workspace / Productivity
- **Alvo:** \`apps/api/src/services/nodes/google-calendar.ts\` & \`apps/api/src/services/nodes/google-docs.ts\`

## 1. Contexto & Problema
Completando a suíte de produtividade (Google Sheets, Drive e Gmail já existentes), são necessários nós para gerenciar compromissos no Google Calendar e manipular documentos no Google Docs.

## 2. Objetivos & Especificação
1. **Nó Google Calendar:**
   - Operações: \`createEvent\`, \`listEvents\`, \`updateEvent\`, \`deleteEvent\`, \`getEvent\`.
   - Suporte a fusos horários, participantes, links de Google Meet automáticos e lembretes.
2. **Nó Google Docs:**
   - Operações: \`createDocument\`, \`getText\`, \`insertText\`, \`replaceText\`, \`appendParagraph\`.
   - Suporte a templates de documentos e substituição de variáveis dinâmicas.
3. **Injeção de Credenciais:**
   - Uso transparente do gerenciador OAuth2 do Google com renovação automática de tokens.

## 3. Critérios de Aceite
- [ ] Operações de CRUD de eventos no Calendar executam com formatação ISO de data correta.
- [ ] Manipulação de texto em documentos do Docs aplica modificações estruturadas.
- [ ] Testes unitários com mocks das APIs Google Calendar v3 e Google Docs v1.
`,

  'TASK-18-openapi-client-sdk-generation.md': `# TASK-18: Contrato OpenAPI 3.1 & Geração Automatizada de SDK TypeScript/Zod

- **Prioridade:** P2 (Developer Experience & SDK)
- **Domínio:** API Architecture / SDK / Developer Tooling
- **Alvo:** \`apps/api/src/docs/openapi.ts\`, \`packages/sdk/\` & scripts de build

## 1. Contexto & Problema
Para consumo externo e integração com clientes frontend e agentes autônomos, o AgentFlow precisa de um contrato OpenAPI 3.1 estritamente tipado e um SDK cliente em TypeScript gerado automaticamente.

## 2. Objetivos & Especificação
1. **Contrato OpenAPI 3.1 Unificado:**
   - Geração dinâmica a partir dos schemas Zod de rotas e nós.
   - Especificação de todos os parâmetros, payloads de request, respostas de sucesso e respostas de erro estruturado.
2. **SDK TypeScript / Zod:**
   - Pacote \`@agentflow/sdk\` gerado com tipagem ponta a ponta e clientes HTTP baseados em fetch/ky.
   - Métodos fluentes para: autenticação, execução de workflows, listagem de execuções, gerenciamento de credenciais e cliente MCP.

## 3. Critérios de Aceite
- [ ] Endpoint \`/api/docs/json\` exporta especificação válida OpenAPI 3.1.
- [ ] Pacote \`@agentflow/sdk\` compila sem erros TypeScript e fornece autocompletion completo de métodos e tipos.
- [ ] Testes unitários validando chamadas de API via SDK gerado.
`,

  'TASK-19-secrets-dynamic-kms-rotation.md': `# TASK-19: Rotação Dinâmica de Master Keys AES-256-GCM / KMS sem Downtime

- **Prioridade:** P2 (Segurança & Criptografia Avançada)
- **Domínio:** Security / KMS / Vault Key Management
- **Alvo:** \`apps/api/src/services/vault/crypto.ts\`, \`apps/api/src/services/vault/kms.ts\` & scripts de migração

## 1. Contexto & Problema
Segredos corporativos exigem rotação periódica de chaves de criptografia (master keys) para conformidade com normas SOC2/ISO 27001. A troca de chave deve ocorrer sem indisponibilidade e re-encriptando segredos em background.

## 2. Objetivos & Especificação
1. **Versionamento de Chaves de Criptografia:**
   - Armazenamento de metadados de versão da chave em cada registro (\`keyVersion\`, \`algorithm\`, \`iv\`, \`tag\`).
   - Suporte a múltiplas chaves ativas para descriptografia (chave corrente + chaves anteriores arquivadas).
2. **Motor de Re-encriptação em Lote:**
   - Script/worker que varre todas as credenciais do Vault encriptadas com versões legadas e as re-encripta utilizando a chave mais recente.
3. **Integração com Provedores KMS:**
   - Suporte a chaves locais (env) e provedores KMS em nuvem (AWS KMS, Google Cloud KMS, HashiCorp Vault).

## 3. Critérios de Aceite
- [ ] O Vault consegue descriptografar dados cifrados com chaves antigas válidas.
- [ ] Processo de rotação re-encripta registros para a nova chave sem falhas em execuções ativas.
- [ ] Testes unitários com rotação de chaves e validação de integridade dos dados re-encriptados.
`,

  'TASK-20-audit-trail-tamper-proof-ledger.md': `# TASK-20: Trilha de Auditoria Criptográfica Imutável com Hash Chain (SHA-256)

- **Prioridade:** P2 (Compliance & Auditoria de Segurança)
- **Domínio:** Security / Compliance / Cryptographic Ledger
- **Alvo:** \`apps/api/src/services/audit-ledger.ts\` & \`apps/api/src/routes/audit.ts\`

## 1. Contexto & Problema
Para auditoria de segurança rigorosa e conformidade regulatória, registros de eventos sensíveis (login, criação de credenciais, revelação de senhas, execução de código dinâmico) devem ser à prova de adulteração.

## 2. Objetivos & Especificação
1. **Hash Chain Criptográfica SHA-256:**
   - Cada registro de auditoria armazena o hash do registro anterior: \`currentHash = SHA256(previousHash + eventPayload + timestamp + orgId)\`.
   - Qualquer alteração manual ou exclusão quebra a cadeia de hashes detectável na validação.
2. **Validador de Integridade do Ledger:**
   - Função de verificação contínua \`verifyAuditLedgerIntegrity(orgId)\` que percorre a sequência de blocos garantindo validade de ponta a ponta.
3. **Exportação Assinada de Relatórios:**
   - Endpoint para exportar trilha de auditoria assinada para auditorias externas de conformidade.

## 3. Critérios de Aceite
- [ ] Todo evento sensível é gravado com cálculo de encadeamento criptográfico SHA-256.
- [ ] Tentativa de adulteração em registro histórico é imediatamente detectada pela verificação de integridade.
- [ ] Testes unitários validando cadeia de blocos, integridade e detecção de fraude.
`
};

for (const [filename, content] of Object.entries(tasks)) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  console.log('Successfully written:', filename);
}

console.log('All 20 canonical tasks successfully generated.');

