import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BRIEFS_DIR = path.resolve(process.cwd(), '.overclock-app', 'briefs');
const INDEX_FILE = path.join(BRIEFS_DIR, '.index.json');
const SEQ_FILE = path.join(BRIEFS_DIR, '.seq.json');

const briefs = [
  {
    id: 'BK01-dlq-1',
    missionId: 'BK01DLQ00001',
    seqKey: 'BK01DLQ',
    filename: 'BK01-dlq-resilience.md',
    titulo: 'BullMQ Dead Letter Queue (DLQ) + Resilient Worker + Backoff Exponencial + Alerting',
    squad: 'executor/queue (w-api, w-code-review)',
    targetFiles: ['apps/api/src/services/queue.ts', 'apps/api/src/worker.ts'],
    description: `Implementar Dead Letter Queue (DLQ) completa no BullMQ para isolar execuções de workflows que falharem após N retries exponenciais (default 3 retries com backoff 2^n * 1000ms). Adicionar handlers de falha definitiva que registram status 'FAILED' no Prisma com stack sanitizada, emitem evento para métricas e notificam BullBoard/admin. Garantir graceful shutdown com SIGTERM/SIGINT drenando jobs ativos em até 10s.`
  },
  {
    id: 'BK02-hmac-1',
    missionId: 'BK02HMAC0001',
    seqKey: 'BK02HMAC',
    filename: 'BK02-webhook-hmac-idempotency.md',
    titulo: 'Webhook HMAC Verification + Redis SET NX 24h Idempotency + Replay Attack Test Suite',
    squad: 'auth/vault (w-security, w-architect)',
    targetFiles: ['apps/api/src/routes/webhooks.ts', 'apps/api/src/lib/hmac.ts', 'apps/api/test/webhook-hmac.test.ts'],
    description: `Implementar validação estrita de assinatura HMAC-SHA256 em headers de webhooks inbound (ex: x-agentflow-signature / x-hub-signature). Adicionar camada de idempotência no Redis usando 'SET idempotency:webhook:{id}:{key} 1 NX EX 86400' (24 horas). Criar suíte de testes com cenários de replay attack, timestamps expirados (+- 5m) e chaves duplicadas retornando 409 Conflict ou 200 Cached Response.`
  },
  {
    id: 'BK03-cron-1',
    missionId: 'BK03CRON0001',
    seqKey: 'BK03CRON',
    filename: 'BK03-cron-daemon-redlock.md',
    titulo: 'Cron Daemon com BullMQ Repeatable Jobs + Redlock Leader Election',
    squad: 'executor/queue (w-architect, w-api)',
    targetFiles: ['apps/api/src/services/cron.ts', 'apps/api/src/lib/redis.ts', 'apps/api/src/worker.ts'],
    description: `Implementar daemon de agendamento cron para workflows usando Repeatable Jobs do BullMQ sincronizados com a tabela Workflow no Prisma. Implementar Redlock (distlock) via Redis para garantir leader election segura em clusters multi-instância, prevenindo disparos duplicados em deploys horizontais. Adicionar sincronização automática ao criar/atualizar/desativar nós cronTrigger.`
  },
  {
    id: 'BK04-vault-1',
    missionId: 'BK04VAULT001',
    seqKey: 'BK04VAULT',
    filename: 'BK04-vault-ui-universal-modal.md',
    titulo: 'Credentials Vault UI: Modal Dinâmico Universal por Bucket de Auth (510 Providers)',
    squad: 'auth/vault (w-architect, w-api)',
    targetFiles: ['apps/web/src/components/credentials/CredentialModal.tsx', 'apps/api/src/routes/credentials.ts'],
    description: `Generalizar o modal de credenciais do frontend (hoje focado em ActiveCampaign) para renderizar dinamicamente os formulários dos 8 buckets de autenticação mapeados (apiKey, bearerToken, basicAuth, oauth2Managed, oauth2Custom, customHeader, queryParam, mcpOAuth2). Mapear catálogo de 510 providers com seus respectivos schemas Zod e campos necessários no cofre seguro.`
  },
  {
    id: 'BK05-mcp-scopes-1',
    missionId: 'BK05MCPS0001',
    seqKey: 'BK05MCPS',
    filename: 'BK05-mcp-tool-scopes-rbac.md',
    titulo: 'MCP Granular Scopes per Tool + Dynamic Tool RBAC Permission Guard',
    squad: 'mcp/nodes (w-security, w-api)',
    targetFiles: ['apps/api/src/mcp/protocol.ts', 'apps/api/src/mcp/tools.ts', 'apps/api/src/middleware/mcp-auth.ts'],
    description: `Implementar sistema de permissões granulares por escopo para as 120+ ferramentas do servidor MCP (ex: workflows:read, workflows:write, executions:run, credentials:read, db:execute). Validar escopos presentes no JWT / API Key antes de despachar a chamada da ferramenta em 'tools/call'. Retornar erro JSON-RPC 403 Forbidden para chaves sem escopo adequado.`
  },
  {
    id: 'BK06-mcp-rate-1',
    missionId: 'BK06MCPR0001',
    seqKey: 'BK06MCPR',
    filename: 'BK06-mcp-rate-limit-mocks.md',
    titulo: 'MCP Dedicated Rate Limiting (60 req/min) + Mock Isolation em Produção',
    squad: 'mcp/nodes (w-security, w-code-review)',
    targetFiles: ['apps/api/src/routes/mcp.ts', 'apps/api/src/mcp/server.ts', 'apps/api/src/mcp/tools.ts'],
    description: `Adicionar rate limit específico de 60 requisições por minuto por API Key/Org para o endpoint /mcp/http e /mcp/status usando Redis sliding window. Garantir que todas as 114 ferramentas mockadas possuam flag 'mock: true' explícita e sejam bloqueadas ou retornem aviso estruturado quando executadas em ambiente de produção (NODE_ENV=production).`
  },
  {
    id: 'BK07-stripe-sync-1',
    missionId: 'BK07STRIPE01',
    seqKey: 'BK07STRIPE',
    filename: 'BK07-stripe-plans-sync.md',
    titulo: 'Stripe Product & Price Sync com plans.ts + Dynamic Tier Webhook Reconciliation',
    squad: 'billing/obs (w-database, w-architect)',
    targetFiles: ['apps/api/src/routes/billing.ts', 'apps/api/src/lib/stripe.ts', 'packages/shared/src/plans.ts'],
    description: `Implementar script e rotinas de sincronização bidirecional entre as definições de tier em 'plans.ts' (FREE, PRO, ENTERPRISE) e os Produtos/Preços da Stripe API. Hardening do webhook 'customer.subscription.updated' e 'invoice.payment_succeeded' para atualizar atomicamente o campo 'tier' e 'billingPeriodEnd' da Organization no Prisma.`
  },
  {
    id: 'BK08-quota-1',
    missionId: 'BK08QUOTA001',
    seqKey: 'BK08QUOTA',
    filename: 'BK08-quota-middleware-enforcement.md',
    titulo: 'Multi-Tenant Quota Middleware (Workflows, Executions, AI Tokens, Storage)',
    squad: 'billing/obs (w-database, w-api)',
    targetFiles: ['apps/api/src/middleware/quota.ts', 'apps/api/src/routes/workflows.ts', 'apps/api/src/routes/executions.ts'],
    description: `Implementar middleware 'checkQuota' centralizado e reutilizável que valida os limites do plano da organização antes de operações críticas: número máximo de workflows ativos, execuções mensais acumuladas, uso de tokens de IA (NIM/OpenAI) e retenção de logs. Retornar '402 Payment Required' com payload detalhado de upgrade caso a cota tenha sido atingida.`
  },
  {
    id: 'BK09-switch-1',
    missionId: 'BK09SWTCH001',
    seqKey: 'BK09SWTCH',
    filename: 'BK09-node-switch-branching.md',
    titulo: 'Workflow Node Catalog: Switch Node & Dynamic Expression Branching Engine',
    squad: 'mcp/nodes (w-architect, w-api)',
    targetFiles: ['apps/api/src/services/nodes/switch.ts', 'apps/api/src/services/executor.ts'],
    description: `Implementar o nó 'switch' no executor de workflows com suporte a múltiplas saídas condicionais baseadas em regras tipadas (equal, not_equal, contains, regex, numeric comparisons) e avaliação segura de expressões JSONPath / JavaScript seguro. Conectar o roteamento de saída no DAG de execução para disparar apenas os ramos conectados aos outputs correspondentes.`
  },
  {
    id: 'BK10-split-batches-1',
    missionId: 'BK10SPLIT001',
    seqKey: 'BK10SPLIT',
    filename: 'BK10-node-split-in-batches.md',
    titulo: 'Workflow Node Catalog: SplitInBatches & Sub-workflow Loop Handler',
    squad: 'mcp/nodes (w-architect, w-api)',
    targetFiles: ['apps/api/src/services/nodes/split-in-batches.ts', 'apps/api/src/services/executor.ts'],
    description: `Implementar o nó 'splitInBatches' para iteração sobre listas e conjuntos volumosos de dados em lotes configuráveis (batchSize: 1..100). Suportar loops no DAG com controle de estado de iteração, preservando contexto de execução e evitando recursão infinita através de limite máximo de iterações configurável por workflow (maxIterations).`
  },
  {
    id: 'BK11-form-wait-1',
    missionId: 'BK11FORMW001',
    seqKey: 'BK11FORMW',
    filename: 'BK11-node-form-trigger-wait.md',
    titulo: 'Workflow Node Catalog: Form Trigger & Interactive Wait/Webhook Resumption',
    squad: 'mcp/nodes (w-architect, w-api)',
    targetFiles: ['apps/api/src/services/nodes/form-trigger.ts', 'apps/api/src/services/nodes/wait.ts', 'apps/api/src/routes/webhooks.ts'],
    description: `Implementar nós 'formTrigger' e 'wait': 'formTrigger' gera páginas de formulário públicas com schema dinâmico de campos para submissão de dados; 'wait' pausa a execução salvando o estado no Postgres/Redis até que um tempo expire ou um webhook/aprovação humana externa com token seguro retome a execução do workflow.`
  },
  {
    id: 'BK12-error-trigger-1',
    missionId: 'BK12ERRTR001',
    seqKey: 'BK12ERRTR',
    filename: 'BK12-node-error-trigger-fallback.md',
    titulo: 'Workflow Node Catalog: Error Trigger & Workflow Exception Fallback Handler',
    squad: 'mcp/nodes (w-architect, w-code-review)',
    targetFiles: ['apps/api/src/services/nodes/error-trigger.ts', 'apps/api/src/services/executor.ts'],
    description: `Implementar mecanismo global de 'errorTrigger' e 'Error Workflow Handler': quando qualquer nó de um workflow falhar sem tratamento local, o executor captura o erro com payload detalhado (nodeId, input, erro, stacktrace sanitizado) e dispara o workflow de erro configurado para enviar alertas (Slack, Discord, Email) ou executar rollbacks automáticos.`
  },
  {
    id: 'BK13-sandbox-1',
    missionId: 'BK13SNDBX001',
    seqKey: 'BK13SNDBX',
    filename: 'BK13-sandbox-isolated-vm.md',
    titulo: 'Code Sandbox Hardening: Isolated-VM & Strict Resource Capping (CPU 500ms, Mem 128MB)',
    squad: 'executor/queue (w-security, w-code-review)',
    targetFiles: ['apps/api/src/services/nodes/code-sandbox.ts', 'apps/api/src/services/nodes/code.ts'],
    description: `Reforçar o isolamento de execução de scripts de nós 'code' e 'code-sandbox' utilizando 'isolated-vm' ou V8 Isolates com restrições rígidas: CPU wall-clock limit 500ms, memória máxima 128MB, desativação total de 'require', 'import', 'fs', 'net' e 'process'. Garantir flag 'EXEC_CODE_DISABLED' para desativação global em ambientes restritos.`
  },
  {
    id: 'BK14-ssrf-1',
    missionId: 'BK14SSRF0001',
    seqKey: 'BK14SSRF',
    filename: 'BK14-ssrf-dns-rebind-defense.md',
    titulo: 'SSRF Defense-in-Depth: DNS Rebind Mitigation & IPv6 Link-Local / Private CIDR Block',
    squad: 'executor/queue (w-security, w-architect)',
    targetFiles: ['apps/api/src/lib/ssrf.ts', 'apps/api/src/services/nodes/http.ts', 'apps/api/test/ssrf.test.ts'],
    description: `Reforçar a proteção contra SSRF no 'lib/ssrf.ts' e nó 'http': implementar verificação de IP pós-resolução DNS imediatamente antes do socket connect para anular ataques de DNS Rebinding (Time-of-Check to Time-of-Use). Bloquear faixas completas IPv4 e IPv6 (0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, ::1/128, fe80::/10, fc00::/7).`
  },
  {
    id: 'BK15-bullboard-1',
    missionId: 'BK15BULLB001',
    seqKey: 'BK15BULLB',
    filename: 'BK15-bullboard-admin-auth.md',
    titulo: 'BullBoard Admin Dashboard Authentication & Role-Based Guard (OWNER/ADMIN only)',
    squad: 'executor/queue (w-security, w-api)',
    targetFiles: ['apps/api/src/routes/admin.ts', 'apps/api/src/server.ts'],
    description: `Proteger o dashboard web do BullBoard montado em /admin/queues: adicionar middleware de autenticação obrigatória via Session Cookie / Bearer Token exigindo papel de sistema 'SYSTEM_ADMIN' ou 'ORG_OWNER'. Adicionar suporte a Basic Auth configurável via variáveis de ambiente (BULL_BOARD_USER, BULL_BOARD_PASS) para acesso direto de DevOps.`
  },
  {
    id: 'BK16-pino-logs-1',
    missionId: 'BK16PINOL001',
    seqKey: 'BK16PINOL',
    filename: 'BK16-structured-logging-pino.md',
    titulo: 'Structured JSON Logging (Pino) + RequestId Correlation + Node Execution Metrics',
    squad: 'billing/obs (w-architect, w-code-review)',
    targetFiles: ['apps/api/src/lib/logger.ts', 'apps/api/src/server.ts', 'apps/api/src/services/executor.ts'],
    description: `Padronizar toda a emissão de logs do backend Fastify em formato JSON estruturado com Pino. Garantir injeção de 'requestId' (UUID v4 / x-request-id) em todas as requisições HTTP, propagando-o para as execuções de nós em 'services/executor.ts' com métricas precisas de latência em milissegundos e contadores de sucesso/erro.`
  },
  {
    id: 'BK17-otel-1',
    missionId: 'BK17OTEL0001',
    seqKey: 'BK17OTEL',
    filename: 'BK17-otel-tracing-executions.md',
    titulo: 'OpenTelemetry Distributed Tracing for Multi-Step Node Executions & DB/Redis Spans',
    squad: 'billing/obs (w-architect, w-api)',
    targetFiles: ['apps/api/src/lib/otel.ts', 'apps/api/src/services/executor.ts', 'apps/api/src/server.ts'],
    description: `Expandir instrumentação OpenTelemetry (OTEL) criando spans dedicados para cada nó executado no DAG de workflows ('agentflow.node.execute'), consultas Prisma e operações de fila BullMQ/Redis. Configurar exportador OTLP/gRPC condicional para ferramentas como Grafana Tempo, Datadog ou Jaeger.`
  },
  {
    id: 'BK18-ai-nim-1',
    missionId: 'BK18AINIM001',
    seqKey: 'BK18AINIM',
    filename: 'BK18-ai-agent-nim-rag.md',
    titulo: 'Real RAG & AI Agent Nodes Integration via NVIDIA NIM / OpenAI Endpoints',
    squad: 'mcp/nodes (w-api, w-architect)',
    targetFiles: ['apps/api/src/services/nodes/ai.ts', 'apps/api/src/services/nodes/ai_agent.ts', 'apps/api/src/lib/nim.ts'],
    description: `Implementar nós 'ai' e 'ai_agent' com chamadas reais para NVIDIA NIM (Llama 3.3 70B, DeepSeek R1) e OpenAI-compatible APIs com streaming, structured outputs (JSON Schema Zod), histórico de conversação em memória e suporte a RAG com recuperação de documentos do banco/armazenamento vetorial.`
  },
  {
    id: 'BK19-load-test-1',
    missionId: 'BK19LOADT001',
    seqKey: 'BK19LOADT',
    filename: 'BK19-load-testing-benchmark.md',
    titulo: 'High-RPS Load Testing Suite (100+ RPS) & Performance Benchmarking',
    squad: 'qa/security (w-code-review, w-api)',
    targetFiles: ['apps/api/scripts/load-test.ts', 'scripts/load-test.mjs', 'scripts/k6-load-test.js'],
    description: `Criar e executar suíte de teste de carga para simular 100+ requisições por segundo contínuas nos endpoints críticos (/api/workflows, /api/executions/trigger, /api/webhooks/trigger/:path e /mcp/http). Gerar relatório de latência p50/p95/p99, throughput de jobs BullMQ e consumo de CPU/memória sob estresse.`
  },
  {
    id: 'BK20-vitest-cov-1',
    missionId: 'BK20VITEST01',
    seqKey: 'BK20VITEST',
    filename: 'BK20-vitest-e2e-coverage.md',
    titulo: 'Vitest Integration & E2E Test Suite Expansion for High Code Coverage (>80%)',
    squad: 'qa/security (w-code-review, w-security)',
    targetFiles: ['apps/api/test/e2e.test.ts', 'apps/api/test/executor.test.ts', 'apps/api/test/mcp-full.test.ts'],
    description: `Expandir os testes unitários e de integração de 39 casos para cobertura completa (>80%) cobrindo: fluxo E2E completo (Registro -> Login -> Criação de Workflow -> Execução com múltiplos nós -> Webhook Trigger assinado -> Checagem de Quotas e Faturamento Stripe) e todos os cenários de erro e exceções.`
  }
];

// Load current seq.json and index.json
let seq = {};
if (fs.existsSync(SEQ_FILE)) {
  seq = JSON.parse(fs.readFileSync(SEQ_FILE, 'utf8'));
}

let index = {};
if (fs.existsSync(INDEX_FILE)) {
  index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

for (const b of briefs) {
  const filePath = path.join(BRIEFS_DIR, b.filename);
  
  const content = `---
id: ${b.id}
missionId: ${b.missionId}
titulo: ${b.titulo}
status: aberto
---

# Missão: ${b.titulo}

> **ID da Missão:** \`${b.missionId}\`  
> **Brief ID:** \`${b.id}\`  
> **Squad Delegado:** \`${b.squad}\`  
> **Stack:** Fastify 5 + Prisma 6 + BullMQ + Redis + JWT + Stripe + Zod + Vitest  
> **Arquivos Alvo:** ${b.targetFiles.map(f => `\`${f}\``).join(', ')}

---

## 1. Contexto & Diagnóstico
No âmbito do plano de 7 horas e do gap audit do backend AgentFlow, este componente foi identificado como melhoria urgente para garantir segurança, resiliência, escalabilidade e conformidade com ambientes de produção de alta demanda.

## 2. Objetivo & Requisitos
${b.description}

### Critérios de Aceite:
1. Implementação completa do comportamento especificado sem regressões no ecossistema Fastify/Prisma.
2. Tratamento estrito de erros com tipagem TypeScript e validação de esquemas via Zod.
3. Testes unitários/integração correspondentes cobrindo cenários de sucesso, erro e borda.
4. Preservação de conformidade de tipos (\`tsc --noEmit\` com 0 erros).

---

## Worker Contract (Mandatory, in order):
1. \`pwd\` — Confirm the repository root.
2. Read the pointed files (+ parent context if necessary).
3. Execute strictly within the specified file scope: ${b.targetFiles.join(', ')}.
4. Write the result and findings back into the item under \`## Resultado\`.
5. Run typecheck and tests to guarantee zero regressions.
6. Commit with pathspec citing item ID \`${b.id}\` (PRE-AUTHORIZED).
7. Submit handoff via \`handoff_submit({ briefId: "${b.id}", summary, status: "concluido" })\`.

## Resultado

<!-- worker: escreva o resultado da execução aqui e finalize com handoff_submit -->
`;

  fs.writeFileSync(filePath, content, 'utf8');

  // Update seq
  seq[b.seqKey] = (seq[b.seqKey] || 0) + 1;

  // Generate 16 hex key for index if not already there
  let hexKey = null;
  for (const [k, v] of Object.entries(index)) {
    if (v.id === b.id) {
      hexKey = k;
      break;
    }
  }
  if (!hexKey) {
    hexKey = crypto.randomBytes(8).toString('hex');
  }
  index[hexKey] = {
    id: b.id,
    path: filePath
  };
}

fs.writeFileSync(SEQ_FILE, JSON.stringify(seq, null, 2), 'utf8');
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');

console.log(`Generated ${briefs.length} briefs successfully.`);
