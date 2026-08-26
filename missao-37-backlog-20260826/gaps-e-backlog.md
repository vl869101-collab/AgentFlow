# AgentFlow Backend — Gap Analysis & Backlog de Missões (Missão 37)

> **Data:** 2026-08-26  
> **Status:** Análise Completa de 30 Gaps + 22 Missões P0/P1/P2 Estruturadas  
> **Diretório da Missão:** `missao-37-backlog-20260826/`

---

## 1. Inventário dos 30 Gaps Pendentes

### 🔷 Handlers & Executor (Gaps 01–08)
1. **GAP-01 (Handlers DB Reais):** Handlers de PostgreSQL, Redis e MongoDB usam dados simulados/mock; falta pool real de conexões com lifecycle, autenticação via Vault, timeout e queries parametrizadas.
2. **GAP-02 (AI Tool Calling & Structured Outputs):** Nós de IA não possuem suporte a function calling / tool calling com schema Zod e streaming Server-Sent Events (SSE) para execução síncrona.
3. **GAP-03 (IMAP Email Reader & MIME Parsing):** Falta leitor IMAP com TLS obrigatório, suporte a polling periódico/IDLE, parsing de multipart MIME e proteção contra anexos maliciosos/grandes.
4. **GAP-04 (Delay & Wait Assíncrono no BullMQ):** Nó de delay roda via `setTimeout` no worker bloqueando recursos da thread; deve virar delayed job no BullMQ liberando o worker.
5. **GAP-05 (Merge, Split in Batches & Loop Engine):** Falta controle de agregação de ramos paralelos no grafo, iteração por lotes (chunking) e limite de recursão/iterações contra loops infinitos.
6. **GAP-06 (Approval Node & Retomada via Webhook):** Falta suspender a execução em estado `WAITING_APPROVAL` e retomar via callback assinado ou link de aprovação (Magic Link / Slack action).
7. **GAP-07 (Condition Expression Engine Seguro):** Avaliação de condições dinâmicas carece de motor com parser AST ou JsonLogic para evitar injeções ou bugs de parsing.
8. **GAP-08 (Transform & Set Fields com JSONPath):** Falta suporte nativo a JSONPath para extração e mutação de payloads sem sandbox pesada.

### 🔐 Vault & Credenciais (Gaps 09–15)
9. **GAP-09 (OAuth2 Token Auto-Refresh Worker):** Falta background job periódico para renovar tokens OAuth2 prestes a expirar antes que o workflow tente executá-los.
10. **GAP-10 (Test Connection & Dry-run API):** Falta endpoint `POST /api/credentials/:id/test` para verificar se as credenciais cadastradas estão ativas e válidas no provider externo.
11. **GAP-11 (Zod Provider Specific Schemas):** Validação atual se resume aos 8 buckets genéricos; faltam schemas Zod para validar campos obrigatórios específicos dos 510 providers mapeados.
12. **GAP-12 (Master Encryption Key Rotation):** Criptografia AES-256-GCM não possui prefixo de versão de chave (`v1:iv:tag:data`), impedindo rotação de chaves sem indisponibilidade.
13. **GAP-13 (Audit Log de Acesso a Segredos):** Falta persistência de logs de auditoria para visualização, revelação e injeção de credenciais nos nós.
14. **GAP-14 (Fine-grained Credential RBAC & Tagging):** Não há restrição de uso de credenciais por workflow ou papel de usuário (ex: apenas Admin usa chaves de produção).
15. **GAP-15 (Secret Masking em Logs e Traces):** Logs de erro e spans do OpenTelemetry podem vazar strings sensíveis caso nós HTTP/Code loguem payloads brutos.

### ⚙️ Worker & Queue (Gaps 16–23)
16. **GAP-16 (AbortController & Cancellation Propagation):** Cancelar uma execução no banco não aborta requisições HTTP ou processos em andamento no Worker.
17. **GAP-17 (Filas de Prioridade no BullMQ):** Execuções manuais/síncronas competem na mesma fila com webhooks massivos; falta divisão em filas de prioridade (high, default, bulk).
18. **GAP-18 (Redlock Distribuído para Cron Triggers):** Em múltiplos nós de worker, falta lock distribuído no Redis para evitar disparos duplicados de nós de agendamento cron.
19. **GAP-19 (Worker Memory Leak & RSS Guard):** Falta monitoramento de consumo de memória do worker com reciclagem graciosa caso o processo ultrapasse o limite de segurança (>512MB).
20. **GAP-20 (Process Isolation para Execuções de Código):** Nós do tipo `code` executam no mesmo processo da API/Worker; falta pool de processos filhos com isolamento de CPU/RAM.
21. **GAP-21 (Política de Retry Granular por Tipo de Erro):** O worker tenta novamente até 3x de forma cega, mesmo para erros permanentes (ex: 400 Bad Request, 401 Auth Failed).
22. **GAP-22 (DLQ Management & Batch Replay API):** A DLQ recebe falhas mas não oferece rotas para listar com paginação, inspecionar payload de erro ou reprocessar em lote.
23. **GAP-23 (Worker Heartbeat & Kubernetes Readiness Probes):** Faltam endpoints e métricas de saúde específicos do processo worker para orquestradores de contêiner.

### 🌐 Webhooks & Ingestão (Gaps 24–30)
24. **GAP-24 (Validação Multi-Vendor de Assinatura HMAC):** Falta suporte a padrões de verificação de fornecedores populares (GitHub, Stripe, Shopify, Svix) e drift temporal.
25. **GAP-25 (Nó de Resposta Síncrona `respond_webhook`):** O workflow não consegue enviar uma resposta HTTP customizada imediata para quem chamou o webhook.
26. **GAP-26 (Replay Attack Window Protection):** Falta rejeitar requisições de webhook cujo cabeçalho de timestamp tenha divergência superior a 300 segundos.
27. **GAP-27 (Pre-filtering & Routing no Gateway Fastify):** Webhooks inválidos geram registros no banco antes de serem descartados; falta descarte prévio no gateway Fastify.
28. **GAP-28 (Webhook Delivery History & Request Inspector):** Falta histórico consultável das últimas requisições recebidas pelo webhook para debug do desenvolvedor.
29. **GAP-29 (Custom Domains & Subcaminhos Dinâmicos):** Rotas de webhook estão fixadas no prefixo padrão sem suporte a domínios personalizados por cliente Enterprise.
30. **GAP-30 (Webhook Fanout para Múltiplos Workflows):** Um mesmo endpoint de webhook não suporta roteamento baseado em filtros para disparar múltiplos fluxos simultâneos.

---

## 2. Mapa das 22 Missões de Melhoria (Backlog P0 / P1 / P2)

| ID | Prioridade | Domínio | Título da Missão | Arquivo |
| :--- | :---: | :--- | :--- | :--- |
| **TASK-01** | **P0** | Vault | OAuth2 Token Auto-Refresh Engine & Background Worker | `TASK/items/TASK-01.md` |
| **TASK-02** | **P0** | Vault | Credential Test Connection & Health Verification API | `TASK/items/TASK-02.md` |
| **TASK-03** | **P0** | Worker | Execution Abort & Cancellation Propagation via Redis Pub/Sub | `TASK/items/TASK-03.md` |
| **TASK-04** | **P0** | Webhooks | Multi-Vendor Webhook Signature Verification & Drift Protection | `TASK/items/TASK-04.md` |
| **TASK-05** | **P0** | Handlers | Real PostgreSQL, Redis & MongoDB Database Node Handlers | `TASK/items/TASK-05.md` |
| **TASK-06** | **P0** | Webhooks | Synchronous Webhook Response (`respond_webhook`) Handler | `TASK/items/TASK-06.md` |
| **TASK-07** | **P0** | Worker | Resilient BullMQ Delayed Job Engine for Delay & Schedule Nodes | `TASK/items/TASK-07.md` |
| **TASK-08** | **P1** | Worker | Priority Queue Hierarchy & Weighted Worker Concurrency | `TASK/items/TASK-08.md` |
| **TASK-09** | **P1** | Worker | Granular Retry Policy (Transient Network vs Fatal Business Errors) | `TASK/items/TASK-09.md` |
| **TASK-10** | **P1** | Handlers | Approval Node State Machine & Magic-Link Webhook Resume | `TASK/items/TASK-10.md` |
| **TASK-11** | **P1** | Vault | Secret Redaction & Masking Filter for Execution Logs and Traces | `TASK/items/TASK-11.md` |
| **TASK-12** | **P1** | Vault | Master Encryption Key Versioning & Zero-Downtime Rotation | `TASK/items/TASK-12.md` |
| **TASK-13** | **P1** | Handlers | Sandboxed Node Execution Process Pool with Memory/CPU Limits | `TASK/items/TASK-13.md` |
| **TASK-14** | **P1** | Webhooks | Webhook Ingestion DLQ, Replay API & Delivery Log Explorer | `TASK/items/TASK-14.md` |
| **TASK-15** | **P1** | Worker | Redlock Distributed Locking for Cron & Periodic Triggers | `TASK/items/TASK-15.md` |
| **TASK-16** | **P1** | Handlers | Advanced Flow Control: Merge, Batch Chunking & Loop Bounds | `TASK/items/TASK-16.md` |
| **TASK-17** | **P2** | Handlers | Secure Expression Evaluator (JsonLogic / AST Engine) | `TASK/items/TASK-17.md` |
| **TASK-18** | **P2** | Vault | Credential Granular RBAC & Workflow Scope Binding | `TASK/items/TASK-18.md` |
| **TASK-19** | **P2** | Webhooks | Webhook Fastify Gateway Ingestion Pre-Filter & Schema Guard | `TASK/items/TASK-19.md` |
| **TASK-20** | **P2** | Worker | Worker Telemetry Metrics, Heartbeat & Kubernetes Readiness Probes | `TASK/items/TASK-20.md` |
| **TASK-21** | **P2** | Handlers | Email Read / IMAP Node with Secure MIME Parser & Attachment Limits | `TASK/items/TASK-21.md` |
| **TASK-22** | **P2** | Handlers | AI Node Streaming & Structured Function Calling Toolset | `TASK/items/TASK-22.md` |
