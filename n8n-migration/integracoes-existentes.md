# Integrações Existentes no AgentFlow

Este documento mapeia todas as integrações externas já existentes no repositório AgentFlow, conforme solicitado para a missão "Recriar n8n no AgentFlow".

## (a) Todas as variáveis de ambiente usadas (por nome)

### Arquivo: `.env.example`
- NODE_ENV
- PORT
- CORS_ORIGIN
- HOST
- TRUST_PROXY
- DATABASE_URL
- REDIS_URL
- QUEUE_ENABLED
- JWT_SECRET
- JWT_EXPIRES_IN
- REFRESH_EXPIRES_IN
- CREDENTIAL_ENCRYPTION_KEY
- NVIDIA_NIM_API_KEY
- NVIDIA_NIM_BASE_URL
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID_MONTHLY
- STRIPE_PRICE_ID_YEARLY
- STRIPE_PRICE_ID_PRO
- STRIPE_PRICE_ID_TEAM
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_APP_URL
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- MICROSOFT_CLIENT_ID
- MICROSOFT_CLIENT_SECRET
- APPLE_CLIENT_ID
- APPLE_TEAM_ID
- APPLE_KEY_ID
- APPLE_PRIVATE_KEY

### Arquivo: `apps/api/.env.example`
- NODE_ENV
- PORT
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_EXPIRES_IN
- REFRESH_EXPIRES_IN
- CORS_ORIGIN
- NVIDIA_NIM_BASE_URL
- NVIDIA_NIM_API_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

### Arquivo: `.env` (valores reais, mas apenas nomes listados aqui)
- NODE_ENV
- PORT
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_EXPIRES_IN
- REFRESH_EXPIRES_IN
- CORS_ORIGIN
- NVIDIA_NIM_BASE_URL
- NVIDIA_NIM_API_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

## (b) Integrações existentes e onde (arquivo:linha)

### NVIDIA NIM (API de IA)
- `apps/api/src/services/executor.ts:297` - `process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY`
- `apps/api/src/services/executor.ts:300` - Base URL configuration
- `apps/api/src/services/executor.ts:319` - NIM error handling
- `apps/api/src/services/executor.ts:303` - fetchWithTimeout to NIM
- `apps/api/src/services/executor.ts:373` - fetchWithTimeout to NIM
- `apps/api/src/routes/ai.ts:6` - NIM_BASE constant
- `apps/api/src/routes/ai.ts:58` - apiKey from process.env
- `apps/api/src/routes/ai.ts:63` - fetch to NIM chat/completions endpoint
- `apps/api/src/lib/env.ts:34-35` - NVIDIA_NIM_BASE_URL and NVIDIA_NIM_API_KEY in schema
- `apps/api/src/routes/oauth.ts:88,100,101,159,163` - fetch calls to Apple endpoints
- `apps/api/src/docs/openapi.ts:867-868,917,927,936,937,946` - OpenAPI documentation for NIM

### Stripe (Pagamentos)
- `apps/api/src/routes/billing.ts:2` - import Stripe from "stripe"
- `apps/api/src/routes/billing.ts:130` - new Stripe(process.env.STRIPE_SECRET_KEY)
- `apps/api/src/routes/billing.ts:173` - new Stripe with fallback
- `apps/api/src/routes/billing.ts:17` - STRIPE_PRICE_ID_PRO comparison
- `apps/api/src/routes/billing.ts:18` - STRIPE_PRICE_ID_TEAM comparison
- `apps/api/src/routes/billing.ts:19` - STRIPE_PRICE_ID_MONTHLY/YEARLY checks
- `apps/api/src/routes/billing.ts:108` - STRIPE_SECRET_KEY check
- `apps/api/src/routes/billing.ts:116-119` - Stripe price IDs in response
- `apps/api/src/routes/billing.ts:142` - NEXT_PUBLIC_APP_URL
- `apps/api/src/routes/billing.ts:161` - STRIPE_WEBHOOK_SECRET
- `apps/api/src/routes/billing.ts:155,163,177` - Stripe error handling
- `apps/api/src/docs/openapi.ts:49,186,232,917,927,936,937,946,1233` - OpenAPI documentation for Stripe

### OAuth (Logins sociais)
- `apps/api/src/routes/oauth.ts:34` - apiBase from NEXT_PUBLIC_API_URL
- `apps/api/src/routes/oauth.ts:39-40` - GOOGLE_CLIENT_ID/SECRET
- `apps/api/src/routes/oauth.ts:52-53` - MICROSOFT_CLIENT_ID/SECRET
- `apps/api/src/routes/oauth.ts:65` - APPLE_CLIENT_ID
- `apps/api/src/routes/oauth.ts:88-108` - Apple token exchange (fetch calls)
- `apps/api/src/routes/oauth.ts:159-169` - Google token exchange (fetch calls)
- `apps/api/src/routes/oauth.ts:181` - Microsoft token validation
- `apps/api/src/routes/oauth.ts:233` - frontendUrl from NEXT_PUBLIC_APP_URL

### Credentials (Armazenamento criptografado)
- `apps/api/src/lib/crypto.ts:6` - CREDENTIAL_ENCRYPTION_KEY from process.env
- `apps/api/src/routes/credentials.ts:6` - import encryptCredential
- `apps/api/src/routes/credentials.ts:62` - encryptCredential call

### Prisma (ORM/Banco de dados)
- `apps/api/src/lib/prisma.ts:2` - import PrismaClient
- `apps/api/src/lib/prisma.ts:9` - DATABASE_URL check
- `apps/api/src/lib/prisma.ts:10` - ALLOW_MEMORY_DB check
- `apps/api/src/lib/prisma.ts:23` - globalForPrisma.prisma assignment
- `packages/database/src/index.ts:8,11` - log configuration and global prisma

### Redis/Fila
- `apps/api/src/services/queue.ts:7` - QUEUE_ENABLED check
- `apps/api/src/lib/env.ts:30` - REDIS_URL default
- `.env.example:26-27` - REDIS_URL and QUEUE_ENABLED

### Webhooks
- `apps/api/src/routes/webhooks.ts` - Arquivo completo de webhooks
- `apps/api/src/routes/webhooks.ts:7` - import createWebhookSchema
- `apps/api/src/routes/webhooks.ts:19-25` - stripSecret function
- `apps/api/src/routes/webhooks.ts:19-25` - verifySignature function
- `apps/api/src/routes/webhooks.ts:56-87` - webhook management routes
- `apps/api/src/routes/webhooks.ts:99-160` - public webhook trigger endpoint
- `apps/api/src/lib/env.ts:41` - EGRESS_ALLOWED_HOSTS in schema

### APIs internas
- `apps/web/src/lib/api.ts:1` - API_BASE from NEXT_PUBLIC_API_URL
- `apps/web/src/lib/api.ts:42,61,75` - fetch calls to API_BASE
- `apps/web/next.config.ts:6` - NEXT_PUBLIC_API_URL usage
- `apps/web/next.config.ts:26,33` - NODE_ENV based configuration
- `apps/web/src/lib/mock-data.ts:40,55,56` - mock data showing Discord and Google Sheets credentials

### Variáveis de ambiente de teste
- `apps/api/tests/unit/env.test.ts` - vários testes com process.env
- `apps/api/tests/e2e/auth.test.ts:3-7` - variáveis de ambiente de teste
- `apps/api/test/backend.test.ts:6` - DELETE process.env

## (c) MCP servers configurados (.mcp.json)

### ECC MCP Server
- Arquivo: `.claude-code-import/ECC/.mcp.json`
- Conteúdo: configuração para servidores MCP do ECC (não especificada no trecho lido)

### oh-my-openagent MCP Servers
- Arquivo: `.claude-code-import/oh-my-openagent/.mcp.json`
  - Servidor: "chrome-devtools" - comando: npx -y chrome-devtools-mcp@latest
- Arquivo: `.claude-code-import/oh-my-openagent/packages/omo-codex/plugin/.mcp.json`
  - Servidor: "codegraph" - tipo: stdio, comando: codegraph serve --mcp
- Arquivo: `.claude-code-import/oh-my-openagent/packages/omo-codex/plugin/components/lsp/.mcp.json`
  - (presumivelmente similar, mas não lido completamente)

## (d) APIs de terceiros já integradas

1. **NVIDIA NIM** - API de inferência de IA (usada em `/api/ai/generate`)
2. **Stripe** - Processamento de pagamentos e webhooks
3. **Google OAuth** - Login social
4. **Microsoft OAuth** - Login social (Azure AD)
5. **Apple Sign In** - Login social
6. **Prisma ORM** - Conexão com PostgreSQL
7. **Redis** - Fila de background jobs (BullMQ)
8. **Webhooks personalizados** - Sistema de webhooks próprio com verificação de assinatura
9. **Fastify** - Framework web subjacente (com plugins como cors, jwt, rate-limit, sensible)
10. **Zod** - Validação de esquema de variáveis de ambiente e schemas de rota

## (e) Lacunas: o que falta para suportar os workflows do n8n

Comparando com as integrações típicas do n8n, o AgentFlow atualmente falta:

### Serviços de comunicação
- Telegram (bot API)
- Slack (webhooks e API)
- Discord (webhooks e bot API)
- Email (SMTP, SendGrid, Mailgun, etc.)
- SMS (Twilio, Vonage, etc.)

### Serviços de armazenamento e arquivos
- AWS S3
- Google Cloud Storage
- Dropbox
- Google Drive
- OneDrive
- FTP/SFTP

### Serviços de banco de dados adicionais
- MySQL
- MongoDB
- SQLite
- Redis (já integrado, mas poderia expandir uso)
- Elasticsearch

### Serviços de nuvem e infraestrutura
- AWS (Lambda, EC2, S3, etc.)
- Google Cloud Platform
- Azure
- DigitalOcean
- Webhooks genéricos (recebimento e envio)

### Serviços de produtividade e CRM
- Salesforce
- HubSpot
- Zendesk
- Trello
- Asana
- Notion
- Airtable
- Google Sheets (apenas como mock, não integrado)

### Serviços de analytics e monitoramento
- Google Analytics
- Mixpanel
- Datadog
- New Relic
- Sentry (para erro, já poderia ser adicionado)
- Loggly

### Serviços de CI/CD e desenvolvimento
- GitHub (webhooks e API)
- GitLab
- Jenkins
- Docker
- Kubernetes

### Outros serviços populares no n8n
- RSS feeds
- CSV processing
- XML/JSON transformation
- HTTP Request (genérico - parcialmente coberto pelo fetch)
- Cron/job scheduling (parcialmente com QUEUE_ENABLED)
- Formulários (Typeform, Google Forms)
- PDF generation/manipulation
- Image processing (Resize, conversion, etc.)

### Autenticação e autorização adicionais
- API Key auth (genérico)
- Basic Auth
- Digest Auth
- OAuth 1.0
- JWT (parcialmente usado internamente)

### Serviços de pagamento adicionais
- PayPal
- Adyen
- Square
- Stripe (já integrado, bom começo)
- Boleto Bancário (popular no Brasil)
- Pix (popular no Brasil)

Para suportar workflows completos do n8n, seria necessário expandir significativamente o conjunto de integrações, particularmente focando nos serviços populares de automação de negócios que o n8n oferece nativamente.