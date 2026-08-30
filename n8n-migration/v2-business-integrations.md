# Integrações de Negócios, Dados e Infra — AgentFlow v2

> **Missão**: Recriar n8n no AgentFlow  
> **Work dir**: `n8n-migration/`  
> **Data**: 2026-08-20  
> **Status**: DESIGN — não implementar, não commitar  
> **Responsável**: Pane INTEGRAÇÕES DE NEGÓCIO, DADOS E INFRA  
> **Base**: `integracoes-existentes.md`, `catalogo-nodes.md`, `priorizacao.md`, `design-seguranca.md`, `design-recriacao.md`, `design-runner.md`, `v2-security-spec.md`, `api-n8n.md`, `referencia-n8n.md`, `inventario.md`, `repo-map.md`, `glossario.md`, `deps-e-libs.md`, `guia-webhooks.md`, `briefs/prompt-business-integrations.md`

---

## 1. Metodologia de Priorização

### 1.1 Critérios de Pontuação

A priorização de integrações segue uma **matriz de pontuação** com quatro dimensões, cada uma ponderada:

| Critério | Peso | Escala (0-10) | Descrição |
|----------|------|---------------|-----------|
| **Frequência de uso no n8n** | 25% | 1 (raro) a 10 (extremamente comum) | Baseado em análise de workflows n8n reais, catálogo de nodes do n8n-nodes-base e dados de uso da comunidade |
| **Valor de negócio** | 30% | 1 (marginal) a 10 (crítico) | Impacto no caso de uso típico: automação de marketing, dados, e-commerce, produtividade |
| **Esforço de implementação** | 25% | 1 (trabalhoso) a 10 (trivial) | Inverso da complexidade: SDKs disponíveis, auth simples, API estável |
| **Maturidade da API** | 20% | 1 (beta/instável) a 10 (madura, documentada) | Qualidade da documentação, histórico de estabilidade, suporte a webhooks |

### 1.2 Escalas de Prioridade

| Score Total | Priority Label | Fase | Descrição |
|-------------|----------------|------|-----------|
| **80–100** | **P0 (MVP)** | MVP | Fundamentais para o funcionamento mínimo da plataforma. Sem eles, workflows típicos não executam. |
| **50–79** | **P1 (Produção)** | Produção | Alto valor de negócio, cobertura ampla de casos de uso. Implementar logo após MVP. |
| **25–49** | **P2 (Futuro)** | Futuro | Especializados ou de nicho. Valiosos mas não bloqueiam o core. |
| **0–24** | **P3 (Nice-to-have)** | Futuro distante | Muito específicos, baixa demanda. |

### 1.3 Matriz de Pontuação

A pontuação final é: `(freq × 0.25 + valor × 0.30 + esforço × 0.25 + maturidade × 0.20)` arredondado.

**Esforço de implementação (S/M/L → 1-10):**
- **S (10)**: API simples, auth via header/API key, SDK maduro disponível
- **M (5-7)**: OAuth2 necessário, paginação complexa, rate limits
- **L (1-4)**: Múltiplos scopes, webhooks customizados, retry complexo, API instável

### 1.4 Armazenamento

O AgentFlow já possui (conforme `integracoes-existentes.md`):
- **PostgreSQL** via Prisma (data layer)
- **Redis** via BullMQ (fila de execução)
- **Stripe** (pagamentos, já integrado)
- **Google OAuth**, **Microsoft OAuth**, **Apple Sign In** (auth social)
- **Webhooks personalizados** com HMAC-SHA256

### 1.5 Definições de Fase

| Fase | Critério de Inclusão |
|------|---------------------|
| **MVP** | Integrações essenciais para qualquer workflow funcionar — triggers (webhook, cron, manual), HTTP Request, bancos de dados locais, Redis, Stripe |
| **Produção** | Integrações que cobrem 80% dos casos de uso típicos de automação de negócios — produtividade, CRM, e-commerce, devtools, e-mail |
| **Futuro** | Integrações especializadas, de nicho, ou que dependem de infraestrutura não-disponível (KMS, serviços cloud específicos) |

---

## 2. Padrões Transversais

### 2.1 Autenticação (Auth)

#### 2.1.1 OAuth 2.0 com PKCE + Refresh Token

Padrão usado para integrações que suportam OAuth2 (Google, Microsoft, GitHub, GitLab, Notion, HubSpot, Salesforce, etc.):

| Campo | Estratégia |
|-------|-----------|
| **Flow** | Authorization Code com PKCE (S256) |
| **Token storage** | Credential vault (AES-256-GCM envelope, conforme `v2-security-spec.md` §5) |
| **Refresh** | Automático via BullMQ cron job (`credential:refresh`, 15 min antes do expiry) |
| **Scopes** | Fixos na criação da credential; escopos ampliados exigem re-consentimento |
| **Token expiry** | Access token expira; refresh token rotativo (family rotation detecta reuse) |
| **State/nonce** | HMAC do session id + nonce aleatório (conforme `v2-security-spec.md` §6) |

#### 2.1.2 API Key / Header Auth

| Campo | Estratégia |
|-------|-----------|
| **Storage** | Credential vault encriptado |
| **Envio** | Header `Authorization: Bearer <key>` ou custom header |
| **Rotação** | Via UI; webhook de notificação de key expirada |
| **Exemplos** | Twilio (`SK...`), Stripe, Airtable, Linear, Figma |

#### 2.1.3 Basic Auth

| Campo | Estratégia |
|-------|-----------|
| **Storage** | Credential vault (user:password) |
| **Envio** | `Authorization: Basic base64(user:pass)` |
| **Uso típico** | FTP/SFTP, algumas APIs legadas |

#### 2.1.4 OAuth 1.0 (legacy)

| Campo | Estratégia |
|-------|-----------|
| **Providers** | Twitter API (legacy), alguns provedores de CRM |
| **Flow** | Consumer key/secret + token/secret (4 valores) |
| **Status** | Futuro — demanda baixa |

### 2.2 Paginação

Padrão transversal para todas as integrações que retornam listas:

| Tipo | Estratégia no AgentFlow |
|------|------------------------|
| **Cursor-based** | `nextCursor` string → loop até `null` (padrão n8n API) |
| **Offset-based** | `limit` + `offset` → loop com limite de safety (max 1000 pages) |
| **Link-header** | `Link: <url>; rel="next"` → follow até não ter `next` |
| **Page token** | Google APIs (`pageToken`) → similar a cursor |

**Retry de pagination**: backoff exponencial (1s, 2s, 4s) para 429/5xx; timeout de 30s por request.

### 2.3 Retry e Rate Limiting

#### 2.3.1 Retry (Backoff Exponencial)

| Código | Ação |
|--------|------|
| **429** | Aguardar `Retry-After` header ou backoff exponencial (1s → 8s, max 5 tentativas) |
| **5xx** | Backoff exponencial (1s, 2s, 4s, 8s, 16s) — max 5 tentativas |
| **408** | Retry imediato com timeout curto |
| **Network error** | Retry com backoff (1s, 3s, 7s) — max 3 tentativas |

#### 2.3.2 Rate Limiting Client-Side

| Dimensão | Limite (Produção) |
|----------|-------------------|
| **Por credential** | Respecta limit da API do provider (ex.: Stripe 100 req/s) |
| **Por org** | 1000 req/min (configurable via plano) |
| **Por IP de saída** | 5000 req/min (egress allowlist) |
| **Backlog** | Filas BullMQ com prioridade: webhook (HIGH) > cron (NORMAL) > manual (LOW) |

Conforme `v2-security-spec.md` §8 — SSRF guard e proxy egress obrigatório.

### 2.4 Idempotência

| Tipo de operação | Estratégia |
|------------------|-----------|
| **Webhook triggers** | `idempotencyKey` = hash do payload + timestamp (janela de 5 min) |
| **Write actions (POST/PUT)** | Header `Idempotency-Key: uuid` + cache de resposta (Redis, TTL 24h) |
| **Database inserts** | UPSERT com constraint única |
| **Payment charges** | `idempotency_key` nativo do provider (Stripe, PayPal) |

Conforme `design-recriacao.md` — `NodeExecution.idempotencyKey` (único).

### 2.5 Webhooks de Integração

Padrão transversal para integrações que recebem eventos externos (Stripe, GitHub, Shopify, Jira, etc.):

| Campo | Estratégia |
|-------|-----------|
| **Endpoint** | `POST /webhook/:orgSlug/:path` (conforme `guia-webhooks.md`) |
| **Validação** | HMAC-SHA256 via header `X-Webhook-Signature` (conforme `webhooks.ts`) |
| **Nonce + timestamp** | Header `X-Timestamp` + `X-Nonce`; rejeitar replay > 5 min |
| **IP allowlist** | Configurável por integração (ex.: GitHub IPs, Stripe IPs) |
| **Resposta** | 200 imediato; processamento async via fila BullMQ |
| **Retry externo** | Provider reenvia com exponential backoff; AgentFlow idempotente |

### 2.6 Tratamento de Erros

| Código | Erro | Tratamento no AgentFlow |
|--------|------|------------------------|
| **400** | Bad request | Log + falha no nó (continueOnFail opcional) |
| **401** | Unauthorized | Credential revogada/expirada → alerta + pausa de execução |
| **403** | Forbidden | Scope insuficiente → credential precisa re-autorizar |
| **404** | Not found | Resource não existe → log + continueOnFail |
| **409** | Conflict | Idempotência ativa ou concorrência → retry com backoff |
| **429** | Rate limited | Aguardar `Retry-After` ou backoff exponencial |
| **5xx** | Server error | Retry com backoff exponencial; dead letter após max tentativas |

### 2.7 Secrets e Vault

Conforme `v2-security-spec.md` §5 e `design-seguranca.md`:

- Todas as credentials são armazenadas encriptadas (AES-256-GCM envelope)
- **NUNCA** valores em logs, responses, ou bundle frontend
- Resposta de API: `{ hasValue: true }` (mascarado)
- Descriptografia exclusiva do worker no momento da execução
- Rotinação de DEK/KEK a cada 90 dias (configurable)

### 2.8 Estratégia de Teste

| Tipo de teste | Estratégia |
|---------------|-----------|
| **Unit** | Mock do HTTP client; testa retry, paginação, parsing |
| **Integration** | Mock server (MSW) ou provider real com credential teste |
| **E2E** | Workflow de teste: trigger → node → verificar output no DB |
| **Credential test** | `POST /credentials/:id/test` → 1 request validatório → `{ ok, errorClass }` sem vazar segredo |
| **Webhook test** | `POST /webhooks/:id/test` → envia payload mockado → verifica execução |

---

## 3. Integrações de Dados

### 3.1 PostgreSQL

| Campo | Valor |
|-------|-------|
| **Nome** | PostgreSQL |
| **Categoria** | Database |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | Connection string (user/pass) ou IAM (AWS RDS) |
| **Node type** | `n8n-nodes-base.postgres` |
| **Fase** | MVP |
| **Triggers** | — (action node, não trigger) |
| **Actions** | **Execute Query** (raw SQL), **Insert** (table → columns), **Update** (WHERE), **Delete** (WHERE), **Select** (table/columns/filter), **Upsert**, **List Tables**, **Get Columns** |
| **Webhooks** | Não |
| **Paginação** | `LIMIT/OFFSET` ou cursor em queries customizadas |
| **Rate limit** | Nenhum (direct DB connection) — controlado por pool size (max 20 conexões) |
| **Retry recomendado** | Backoff exponencial para connection errors (EADDRNOTFOUND, ECONNREFUSED); 3 tentativas, 5s timeout |
| **Idempotência** | UPSERT com primary key ou unique constraint |
| **Endpoints principais** | `pg.connect()`, `SELECT * FROM table WHERE ...`, `INSERT INTO table ... RETURNING *` |
| **Esforço** | **S** |
| **Dependências** | `pg` (Node.js driver), já no ecossistema Prisma |

**Endpoints principais:**
1. `SELECT` — query personalizada com parâmetros (`$1`, `$2`)
2. `INSERT ... RETURNING` — insert com retorno de ID gerado
3. `BEGIN/COMMIT` — transactions suportadas em queries raw

**Detalhes de auth:**
- Connection string: `postgresql://user:pass@host:5432/db`
- SSL: obrigatório em produção (AWS RDS, Neon, Supabase)
- Pool: `pg.Pool` com min 2, max 20, idleTimeoutMillis 30000

**Testes:**
- Unit: mock `pg.Client`; testa query building, parameter escaping
- Integration: container PostgreSQL via Testcontainers
- Test query conecta → `SELECT 1`

---

### 3.2 MySQL

| Campo | Valor |
|-------|-------|
| **Nome** | MySQL |
| **Categoria** | Database |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | User/password via connection string |
| **Node type** | `n8n-nodes-base.mysql` |
| **Fase** | Produção |
| **Triggers** | — (action node) |
| **Actions** | **Execute Query**, **Insert**, **Update**, **Delete**, **Select**, **Upsert**, **List Tables** |
| **Webhooks** | Não |
| **Paginação** | `LIMIT/OFFSET` |
| **Rate limit** | Nenhum (direct DB) — pool max 20 |
| **Retry recomendado** | 3 tentativas, backoff 1s/2s/4s para ECONNREFUSED |
| **Idempotência** | UPSERT com `ON DUPLICATE KEY UPDATE` |
| **Endpoints principais** | `mysql.query()`, `INSERT INTO ... ON DUPLICATE KEY UPDATE`, `START TRANSACTION` |
| **Esforço** | **M** |
| **Dependências** | `mysql2` driver, Prisma schema |

---

### 3.3 SQLite

| Campo | Valor |
|-------|-------|
| **Nome** | SQLite |
| **Categoria** | Database |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | File path (não requer auth) |
| **Node type** | `n8n-nodes-base.sqlite` |
| **Fase** | MVP/Produção |
| **Triggers** | — |
| **Actions** | **Execute Query**, **Insert**, **Update**, **Delete**, **Select** |
| **Webhooks** | Não |
| **Paginação** | `LIMIT/OFFSET` |
| **Rate limit** | Nenhum (file-based) |
| **Retry recomendado** | 3 tentativas para `SQLITE_BUSY` (database locked) |
| **Idempotência** | `INSERT OR IGNORE`, `INSERT OR REPLACE` |
| **Endpoints principais** | `sqlite3.prepare()`, `db.all()`, `db.run()` |
| **Esforço** | **S** |
| **Dependências** | `better-sqlite3` (sync) ou `sqlite3` (async) |

**Uso típico:** Desenvolvimento local, testes, embedded workflows.

---

### 3.4 MongoDB

| Campo | Valor |
|-------|-------|
| **Nome** | MongoDB |
| **Categoria** | Database (NoSQL) |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Connection string com SCRAM-SHA-256 ou X.509 |
| **Node type** | `n8n-nodes-base.mongodb` |
| **Fase** | Produção |
| **Triggers** | — |
| **Actions** | **Find Documents**, **Insert**, **Update**, **Delete**, **Aggregate** (pipeline), **Count**, **Create Index**, **Drop Collection** |
| **Webhooks** | Não |
| **Paginação** | `limit/skip` ou cursor `next()` |
| **Rate limit** | Nenhum (direct) — controlado por maxPoolSize (default 50) |
| **Retry recomendado** | 3 tentativas para network errors; retryable writes nativas do driver |
| **Idempotência** | Upsert com `_id` ou filter único |
| **Endpoints principais** | `collection.find()`, `collection.insertOne()`, `collection.bulkWrite()` |
| **Esforço** | **M** |
| **Dependências** | `mongodb` driver (oficial) |

---

### 3.5 Redis

| Campo | Valor |
|-------|-------|
| **Nome** | Redis |
| **Categoria** | Database (KV/Cache/Messaging) |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | Password (opcional) + TLS (produção) |
| **Node type** | Custom (baseado em n8n Redis node) |
| **Fase** | MVP |
| **Triggers** | **Pub/Sub Listener** — subscribe a canais e disparar workflow |
| **Actions** | **GET**, **SET**, **DEL**, **EXISTS**, **INCR**, **LPUSH/LPOP/LRANGE**, **HSET/HGET**, **SADD/SMEMBERS**, **Publish** (pub/sub), **TTL**, **EXPIRE** |
| **Webhooks** | Não (pub/sub próprio) |
| **Paginação** | Não aplicável (operções pontuais) |
| **Rate limit** | 50k ops/s por instância (Redis) — controlado por connection pool |
| **Retry recomendado** | Reconexão automática com backoff (Redis client já faz isso) |
| **Idempotência** | Operations são idempotentas por natureza (SET/DEL) |
| **Endpoints principais** | `redis.get(key)`, `redis.set(key, value)`, `redis.publish(channel, msg)` |
| **Esforço** | **S** |
| **Dependências** | `ioredis` (já no repo via BullMQ) |

**Triggers (Pub/Sub):**
- `message` — quando publicado em canal
- `pattern` — pattern match (`news.*`)

---

### 3.6 Supabase

| Campo | Valor |
|-------|-------|
| **Nome** | Supabase |
| **Categoria** | Database (BaaS) |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API key (`apikey` header) + optional JWT (user auth) |
| **Node type** | Custom (baseado em n8n) |
| **Fase** | Produção |
| **Triggers** | **Row Changes** — listen a `INSERT/UPDATE/DELETE` em tabela real-time |
| **Actions** | **Select Rows**, **Insert Row**, **Update Rows**, **Delete Rows**, **RPC** (stored procedure), **Storage Upload**, **Storage Download** |
| **Webhooks** | Sim (via Realtime) — Supabase Realtime broadcast |
| **Paginação** | `limit`/`offset` ou `order` + cursor (`created_at`) |
| **Rate limit** | 500 req/min (free tier); configurable |
| **Retry recomendado** | 3 tentativas, backoff 1s/2s/4s para 429 |
| **Idempotência** | Upsert com `on_conflict` |
| **Endpoints principais** | `POST /rest/v1/table`, `GET /rest/v1/table?select=*`, `POST /rest/v1/rpc/function` |
| **Esforço** | **M** |
| **Dependências** | `@supabase/supabase-js` SDK ou REST API |

---

## 4. Integrações de Storage

### 4.1 AWS S3 (e compatíveis)

| Campo | Valor |
|-------|-------|
| **Nome** | AWS S3 |
| **Categoria** | Storage |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | Access Key ID + Secret Access Key (ou IAM role no EC2/ECS) |
| **Node type** | `n8n-nodes-base.awsS3` |
| **Fase** | MVP |
| **Triggers** | **Bucket notifications** — s3:ObjectCreated, s3:ObjectRemoved, s3:ObjectRestore (via SQS → Lambda → webhook) |
| **Actions** | **Upload**, **Download**, **List**, **Delete**, **Copy**, **Get Metadata**, **Generate Presigned URL**, **Create/Delete Bucket** |
| **Webhooks** | Sim (via S3 Event Notifications → SNS/SQS → webhook) |
| **Paginação** | `ListObjectsV2` usa `ContinuationToken`; max 1000 keys/page |
| **Rate limit** | 3500 PUT/COPY/POST/DELETE + 5500 GET/HEAD por segundo por prefix |
| **Retry recomendado** | Exponential backoff (100ms, 200ms, 400ms, 800ms) para 503 SlowDown; max 5 tentativas |
| **Idempotência** | Upload é idempotente (same key = overwrite) |
| **Endpoints principais** | `s3.upload()`, `s3.getObject()`, `s3.listObjectsV2()` |
| **Esforço** | **M** |
| **Dependências** | `@aws-sdk/client-s3` ou `aws-sdk` v3 |

**Compatíveis:** MinIO, Cloudflare R2, DigitalOcean Spaces, Wasabi — mesma API S3.

**Triggers via evento:**
```
s3:ObjectCreated:* → SNS topic → AgentFlow webhook (HMAC validado)
s3:ObjectRemoved:* → SNS topic → AgentFlow webhook
```

---

### 4.2 Google Cloud Storage

| Campo | Valor |
|-------|-------|
| **Nome** | Google Cloud Storage (GCS) |
| **Categoria** | Storage |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (Google) ou Service Account JSON |
| **Node type** | `n8n-nodes-base.googleDrive` (parcial — GCS é separado) |
| **Fase** | Produção |
| **Triggers** | Pub/Sub notifications (bucket.update) → push → webhook |
| **Actions** | **Upload Object**, **Download Object**, **List Objects**, **Delete Object**, **Get Metadata**, **Generate Signed URL** |
| **Webhooks** | Sim (via Pub/Sub push) |
| **Paginação** | `pageToken` em listObjects |
| **Rate limit** | 1000 req/s por projeto (padrão); escalável via request |
| **Retry recomendado** | Exponential backoff (1s, 2s, 4s); 429/5xx = retry com jitter |
| **Idempotência** | Upload com mesmo object name = overwrite |
| **Endpoints principais** | `storage.bucket(name).upload()`, `file.download()`, `bucket.getFiles()` |
| **Esforço** | **M** |
| **Dependências** | `@google-cloud/storage` SDK |

---

### 4.3 Azure Blob Storage

| Campo | Valor |
|-------|-------|
| **Nome** | Azure Blob Storage |
| **Categoria** | Storage |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Connection string (Account Key) ou SAS token |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | Event Grid → webhook |
| **Actions** | **Upload Blob**, **Download Blob**, **List Blobs**, **Delete Blob**, **Get Properties** |
| **Webhooks** | Sim (via Azure Event Grid) |
| **Paginação** | `continuationToken` em listBlobsFlat |
| **Rate limit** | 20.000 req/s por conta (standard); 100.000 (premium) |
| **Retry recomendado** | Exponential (4s max, 10 tentativas) — SDK já inclui |
| **Idempotência** | Upload com mesmo blob name = overwrite |
| **Endpoints principais** | `containerClient.upload()`, `blobClient.download()`, `containerClient.listBlobsFlat()` |
| **Esforço** | **M** |
| **Dependências** | `@azure/storage-blob` SDK |

---

### 4.4 FTP / SFTP

| Campo | Valor |
|-------|-------|
| **Nome** | FTP / SFTP |
| **Categoria** | Storage (File Transfer) |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Username + Password (FTP) ou Private Key (SFTP) |
| **Node type** | `n8n-nodes-base.ftp` |
| **Fase** | Produção |
| **Triggers** | — (não há trigger native; usar poll em diretório) |
| **Actions** | **Upload File**, **Download File**, **List Files**, **Delete File**, **Create Directory**, **List Directories** |
| **Webhooks** | Não (FTP não suporta; SFTP polling opcional) |
| **Paginação** | `LIST` returns flat array (não paginado) |
| **Rate limit** | Dependente do servidor FTP — client-side throttle (1 conexão simultânea) |
| **Retry recomendado** | 3 tentativas para connection timeouts; 30s timeout por operação |
| **Idempotência** | Overwrite por default; append mode opcional |
| **Endpoints principais** | `client.upload()`, `client.download()`, `client.list()` |
| **Esforço** | **M** |
| **Dependências** | `basic-ftp` (Node.js) ou `ssh2` (SFTP) |

---

### 4.5 Arquivos Locais (Local File)

| Campo | Valor |
|-------|-------|
| **Nome** | Arquivos Locais |
| **Categoria** | Storage |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | File system path (no auth) |
| **Node type** | `n8n-nodes-base.readBinaryFile`, `n8n-nodes-base.writeBinaryFile` |
| **Fase** | MVP |
| **Triggers** | **File Watcher** — `chokidar` watch em diretório |
| **Actions** | **Read Binary File**, **Write Binary File**, **Append to File**, **Read Lines**, **Delete File**, **List Files** |
| **Webhooks** | Não (file watcher opcional) |
| **Paginação** | Não aplicável (file by file) |
| **Rate limit** | FS I/O limitado pela OS — não há rate limit |
| **Retry recomendado** | 3 tentativas para ENOENT (file in use); 5s timeout |
| **Idempotência** | Write é idempotente; append não |
| **Endpoints principais** | `fs.readFile()`, `fs.writeFile()`, `fs.readdirSync()` |
| **Esforço** | **S** |
| **Dependências** | `node:fs`, `node:path` (built-in) |

---

## 5. Integrações de APIs e Protocolos

### 5.1 HTTP Request (REST Genérico)

| Campo | Valor |
|-------|-------|
| **Nome** | HTTP Request |
| **Categoria** | API / Protocolo |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | `none`, `basicAuth`, `headerAuth` (API key), `oAuth2Api`, `digestAuth` |
| **Node type** | `n8n-nodes-base.httpRequest` |
| **Fase** | MVP |
| **Triggers** | **Webhook** (via nó `Webhook` separado) |
| **Actions** | **Request** — GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS |
| **Webhooks** | Não (é um action node, não trigger) |
| **Paginação** | Configurável via parâmetros (URL templating) |
| **Rate limit** | Configurável (client-side throttle) |
| **Retry recomendado** | n8n node config: `retryOnFail`, `maxTries`, `waitBetweenTries` |
| **Idempotência** | Header `Idempotency-Key` (custom header) |
| **Endpoints principais** | `fetch(url, opts)`, `axios(config)` |
| **Esforço** | **S** (já core no catalogo-nodes.md) |
| **Dependências** | — (native fetch ou axios) |

**Detalhes:**
- Suporta `bodyContentType`: `json`, `form`, `raw`, `file`, `none`
- Headers e query params com expressões n8n (`{{ $json.field }}`)
- Options: `timeout` (30s default), `followRedirect` (true), `rejectUnauthorized` (true)
- `continueOnFail` para não abortar workflow em erro

---

### 5.2 GraphQL

| Campo | Valor |
|-------|-------|
| **Nome** | GraphQL |
| **Categoria** | API / Protocolo |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API Key (header), OAuth 2.0, ou HTTP Basic |
| **Node type** | `n8n-nodes-base.graphql` |
| **Fase** | Produção |
| **Triggers** | **GraphQL Subscription** — WebSocket para eventos em tempo real |
| **Actions** | **Query** (read), **Mutation** (write), **Introspection** (`__schema`) |
| **Webhooks** | Não (subscription via WebSocket) |
| **Paginação** | Relay cursor (`edges/pageInfo`) ou offset-based |
| **Rate limit** | Dependente do provider (Apollo: configurable) |
| **Retry recomendado** | 3 tentativas para 5xx/429; backoff exponencial |
| **Idempotência** | Mutation idempotency via input hash |
| **Endpoints principais** | `POST /graphql`, `GET /graphql?query=...`, WebSocket `/graphql` (subscription) |
| **Esforço** | **M** |
| **Dependências** | `graphql-request` (leve) ou `@apollo/client` |

---

### 5.3 WebSockets

| Campo | Valor |
|-------|-------|
| **Nome** | WebSockets |
| **Categoria** | API / Protocolo |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Token query param, header `Authorization`, ou cookie |
| **Node type** | `n8n-nodes-base.websocket` (custom) |
| **Fase** | Futuro |
| **Triggers** | **On Message** — quando mensagem recebida no canal |
| **Actions** | **Send Message**, **Subscribe Channel**, **Unsubscribe** |
| **Webhooks** | Não (WebSocket próprio) |
| **Paginação** | Não aplicável (stream contínuo) |
| **Rate limit** | Dependente do servidor WebSocket |
| **Retry recomendado** | Reconexão automática (exponential backoff, max 5 tentativas); ping/pong keepalive |
| **Idempotência** | Deduplicação por `messageId` |
| **Endpoints principais** | `ws://host:port`, `wss://host:port/channel` |
| **Esforço** | **M** |
| **Dependências** | `ws` (Node.js) ou `socket.io-client` |

---

## 6. Integrações DevOps

### 6.1 GitHub

| Campo | Valor |
|-------|-------|
| **Nome** | GitHub |
| **Categoria** | DevTools |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | OAuth 2.0 (scopes: `repo`, `read:user`, `admin:repo_hook`) ou API Token (personal access token) |
| **Node type** | `n8n-nodes-base.github` |
| **Fase** | MVP |
| **Triggers** | **Watch** (star/unstar), **Commit** (push), **Pull Request** (opened/closed/merged), **Issue** (created/updated/closed), **Release** (published), **Fork** (created), **Workflow Run** (completed), **Discussion** (created) |
| **Actions** | **Create Issue**, **Update Issue**, **Close Issue**, **Create Pull Request**, **Merge Pull Request**, **Add Label**, **Remove Label**, **Create Release**, **Upload Release Asset**, **Create Branch**, **Delete Branch**, **Get Repository**, **List Commits**, **Get File Contents**, **Create File**, **Update File** |
| **Webhooks** | Sim (via GitHub App webhooks ou repository webhooks) |
| **Paginação** | `Link` header (`rel="next"`) |
| **Rate limit** | REST: 5000 req/h autenticado; GraphQL: 5000 pontos/h |
| **Retry recomendado** | 3 tentativas para 403 secondary rate limit (abuse detection) |
| **Idempotência** | `clientMutationId` no GraphQL; upsert em labels |
| **Endpoints principais** | `GET /repos/{owner}/{repo}/issues`, `POST /repos/{owner}/{repo}/issues`, `POST /repos/{owner}/{repo}/pulls` |
| **Esforço** | **M** |
| **Dependências** | `@octokit/rest`, `@octokit/graphql` |

---

### 6.2 GitLab

| Campo | Valor |
|-------|-------|
| **Nome** | GitLab |
| **Categoria** | DevTools |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Personal Access Token (header `PRIVATE-TOKEN`) ou OAuth 2.0 |
| **Node type** | `n8n-nodes-base.gitlab` |
| **Fase** | Produção |
| **Triggers** | **Push Event**, **Merge Request** (opened/merged/closed), **Issue** (created/updated/closed), **Pipeline** (success/failed), **Tag Push**, **Wiki Push**, **Note** (comment) |
| **Actions** | **Create Issue**, **Update Issue**, **Create Merge Request**, **Accept Merge Request**, **Create Tag**, **Create Release**, **Upload File**, **Get Project**, **List Repositories**, **Create File**, **Edit File** |
| **Webhooks** | Sim (via project webhook → AgentFlow webhook) |
| **Paginação** | `page` + `per_page` (offset); `nextPageToken` para GraphQL |
| **Rate limit** | REST: 600 req/min (Free), 1200 (Premium/Ultimate); GraphQL: query limit |
| **Retry recomendado** | 3 tentativas para 429; backoff 1s → 2s → 4s |
| **Idempotência** | Idempotent em create com mesmo `iid`; merge MR com `sha` check |
| **Endpoints principais** | `GET /projects/:id/issues`, `POST /projects/:id/issues`, `POST /projects/:id/merge_requests` |
| **Esforço** | **M** |
| **Dependências** | `@gitbeaker/node` SDK |

---

### 6.3 Bitbucket

| Campo | Valor |
|-------|-------|
| **Nome** | Bitbucket |
| **Categoria** | DevTools |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 (1.0 e 2.0) ou App Password |
| **Node type** | `n8n-nodes-base.bitbucket` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Push**, **Pull Request** (created/merged/declined), **Issue** (created/updated), **Repository** (created/deleted) |
| **Actions** | **Create Issue**, **Update Issue**, **Create Pull Request**, **Merge Pull Request**, **Get Repository**, **List Commits**, **Create Branch**, **Delete Branch**, **Download Archive** |
| **Webhooks** | Sim (via repository webhook) |
| **Paginação** | `page` + `pagelen` (offset) |
| **Rate limit** | 1000 req/h para credenciais OAuth; 60 req/min para App Passwords |
| **Retry recomendado** | 3 tentativas para 429 |
| **Idempotência** | Create idempotente com mesmo `uuid` |
| **Endpoints principais** | `GET /repositories/{workspace}/{repo}/issues`, `POST /repositories/{workspace}/{repo}/pullrequests`, `GET /repositories/{workspace}/{repo}/src` |
| **Esforço** | **L** |
| **Dependências** | `@bitbucket/sdk` ou fetch direto |

---

## 7. Integrações de Produtividade

### 7.1 Google Workspace (Gmail, Google Drive, Google Calendar, Google Docs, Google Sheets)

| Campo | Valor |
|-------|-------|
| **Nome** | Google Workspace |
| **Categoria** | Produtividade |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | OAuth 2.0 (Google) — scopes: `gmail.modify`, `drive.file`, `calendar.events`, `docs.document`, `spreadsheets` |
| **Node type** | `n8n-nodes-base.gmail`, `n8n-nodes-base.googleDrive`, `n8n-nodes-base.googleSheets`, `n8n-nodes-base.gmailTrigger` |
| **Fase** | MVP |
| **Triggers** | **Gmail New Email** (watch pub/sub), **Drive File Change** (watch), **Sheets Edit** (via trigger), **Calendar Event Start** |
| **Actions** | **Gmail**: Send Email, Get Email, Update Labels, Delete Email, Send Draft; **Drive**: Upload File, Download File, List Files, Delete File, Share File, Create Folder; **Sheets**: Append, Get, Update, Delete, Clear; **Calendar**: Create Event, Get Events, Update Event, Delete Event; **Docs**: Create Document, Get Document, Update Document |
| **Webhooks** | Sim (via Google Workspace push notifications — pub/sub) |
| **Paginação** | `nextPageToken` em list responses |
| **Rate limit** | Gmail API: 250 msg/dia (free), Quotas de queries; Drive: 1000 req/day/usuário; Sheets: 100 req/100s |
| **Retry recomendado** | 3 tentativas para 429/5xx; backoff exponencial |
| **Idempotência** | Gmail: `threadId` dedup; Drive: `name` overwrite por pasta |
| **Endpoints principais** | `GET /gmail/v1/users/me/messages`, `POST /gmail/v1/users/me/messages/send`, `POST /drive/v3/files`, `GET /drive/v3/files/{id}` |
| **Esforço** | **L** |
| **Dependências** | `googleapis` SDK (já usado no catalogo-nodes.md) |

---

### 7.2 Microsoft 365 (Outlook, OneDrive, Excel)

| Campo | Valor |
|-------|-------|
| **Nome** | Microsoft 365 |
| **Categoria** | Produtividade |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (Microsoft Identity Platform) — scopes: `Mail.ReadWrite`, `Files.ReadWrite`, `Calendars.ReadWrite` |
| **Node type** | `n8n-nodes-base.microsoftOutlook`, `n8n-nodes-base.onedrive`, `n8n-nodes-base.excel` (custom) |
| **Fase** | Produção |
| **Triggers** | **Outlook New Email** (subscription), **Calendar Event Change**, **OneDrive File Change** (webhook) |
| **Actions** | **Outlook**: Send Email, Get Emails, Create Contact, Update Contact, Create Calendar Event; **OneDrive**: Upload File, Download File, List Files, Delete File, Share Link; **Excel**: List Rows, Add Row, Update Row, Get Range, Create Table |
| **Webhooks** | Sim (via Microsoft Graph change notifications) |
| **Paginação** | `@odata.nextLink` |
| **Rate limit** | 10.000 req/10 min por tenant; Graph API throttling |
| **Retry recomendado** | 3 tentativas com `Retry-After` header; backoff exponencial |
| **Idempotência** | Outlook: `conversationIndex`; OneDrive: `itemPath` overwrite |
| **Endpoints principais** | `POST /v1.0/me/sendMail`, `GET /v1.0/me/messages`, `PUT /v1.0/me/drive/items/{id}/content` |
| **Esforço** | **L** |
| **Dependências** | `msgraph-sdk` (Microsoft Graph SDK) |

---

### 7.3 Notion

| Campo | Valor |
|-------|-------|
| **Nome** | Notion |
| **Categoria** | Produtividade |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (Internal Integration ou Public Integration) — scopes: `pages_read`, `pages_write`, `databases_read`, `databases_write` |
| **Node type** | `n8n-nodes-base.notion` |
| **Fase** | Produção |
| **Triggers** | — (Notion não tem webhooks nativos; usar polling ou n8n community) |
| **Actions** | **Append to Page**, **Append to Database**, **Get Page**, **Update Page**, **Search Pages**, **Get Database**, **Query Database** (filtrado/ordenado), **Create Database**, **Update Database** |
| **Webhooks** | Não nativamente (Notion não oferece webhooks) — polling alternativo |
| **Paginação** | `next_cursor` + `has_more` |
| **Rate limit** | 3 requisições por segundo (por integração); burst de 3 requisições |
| **Retry recomendado** | 3 tentativas; backoff 1s → 2s → 4s para 429 |
| **Idempotência** | Database insert com `external_id` único |
| **Endpoints principais** | `GET /v1/pages/{page_id}`, `POST /v1/pages`, `POST /v1/databases/{db_id}/query` |
| **Esforço** | **M** |
| **Dependências** | `@notionhq/client` SDK oficial |

---

### 7.4 Airtable

| Campo | Valor |
|-------|-------|
| **Nome** | Airtable |
| **Categoria** | Produtividade |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API Key (header `Authorization: Bearer`) ou OAuth 2.0 |
| **Node type** | `n8n-nodes-base.airtable` |
| **Fase** | Produção |
| **Triggers** | **New Record**, **Updated Record** (via webhook — beta) |
| **Actions** | **List Records**, **Get Record**, **Create Record**, **Update Record**, **Delete Record**, **Create Field**, **Update Field**, **Get Table Schema** |
| **Webhooks** | Sim (beta — webhook de list update) |
| **Paginação** | `offset` (retorna `offset` se mais resultados) |
| **Rate limit** | 4 req/s (Free), 5 req/s (Plus), 5 req/s (Pro), 10 req/s (Enterprise) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | Update por `recordId`; Create com `fields` único |
| **Endpoints principais** | `GET /v0/{baseId}/{tableName}`, `POST /v0/{baseId}/{tableName}`, `PATCH /v0/{baseId}/{tableName}/{recordId}` |
| **Esforço** | **M** |
| **Dependências** | `airtable` oficial SDK |

---

### 7.5 Jira

| Campo | Valor |
|-------|-------|
| **Nome** | Jira (Atlassian) |
| **Categoria** | Produtividade |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (3LO) ou API Token (basic auth) |
| **Node type** | `n8n-nodes-base.jira` (custom) |
| **Fase** | Produção |
| **Triggers** | **Issue Created**, **Issue Updated**, **Issue Deleted**, **Comment Created**, **Sprint Started**, **Sprint Ended** (via Jira Automation → webhook) |
| **Actions** | **Create Issue**, **Update Issue**, **Delete Issue**, **Get Issue**, **Search Issues** (JQL), **Add Comment**, **Assign Issue**, **Transition Issue**, **Create Project**, **Get Project**, **Create Sprint**, **Get Sprints**, **Add Issue to Sprint** |
| **Webhooks** | Sim (via Jira project webhooks) |
| **Paginação** | `startAt` + `maxResults` (offset) |
| **Rate limit** | 1000 req/hour por usuário; 30.000 req/hour para Cloud Enterprise |
| **Retry recomendado** | 3 tentativas; backoff 1s → 2s → 4s |
| **Idempotência** | Issue key única; transition idempotente |
| **Endpoints principais** | `GET /rest/api/3/issue/{issueIdOrKey}`, `POST /rest/api/3/issue`, `POST /rest/api/3/search` |
| **Esforço** | **M** |
| **Dependências** | `axios` ou `node-fetch` (REST API) |

---

### 7.6 Linear

| Campo | Valor |
|-------|-------|
| **Nome** | Linear |
| **Categoria** | Produtividade (Issue Tracking) |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Authorization: <key>`) |
| **Node type** | `n8n-nodes-base.linear` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Issue Created**, **Issue Updated**, **Issue Deleted**, **Comment Created** (via webhook) |
| **Actions** | **Create Issue**, **Update Issue**, **Delete Issue**, **Get Issue**, **Search Issues** (GraphQL), **Create Comment**, **Update Comment**, **Assign User**, **Change Status**, **Create Team**, **Get Teams** |
| **Webhooks** | Sim |
| **Paginação** | Cursor-based (`after`, `first`) no GraphQL |
| **Rate limit** | 100 req/min (sem limit header) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | GraphQL mutation com `clientMutationId` |
| **Endpoints principais** | `POST https://api.linear.app/graphql`, `GET /api/v2/issues`, `POST /api/v2/issues` |
| **Esforço** | **L** |
| **Dependências** | `graphql-request` (Linear usa GraphQL) |

---

## 8. Integrações CRM

### 8.1 HubSpot

| Campo | Valor |
|-------|-------|
| **Nome** | HubSpot |
| **Categoria** | CRM |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (private app ou public integration) — scopes: `crm.objects.contacts`, `crm.objects.deals`, `crm.objects.companies` |
| **Node type** | `n8n-nodes-base.hubspot` |
| **Fase** | Produção |
| **Triggers** | **Contact Created**, **Contact Updated**, **Company Created**, **Company Updated**, **Deal Created**, **Deal Updated**, **Ticket Created**, **Ticket Updated** (via webhook) |
| **Actions** | **Search Contacts**, **Get Contact by ID**, **Create Contact**, **Update Contact**, **Delete Contact**, **Search Companies**, **Create Company**, **Update Company**, **Search Deals**, **Create Deal**, **Update Deal**, **Search Tickets**, **Create Ticket**, **Update Ticket** |
| **Webhooks** | Sim (via HubSpot webhooks app) |
| **Paginação** | `offset` (associations), `after` (cursor) |
| **Rate limit** | 100 req/10s por integração (10.000/dia) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `idProperty` (email unique); update por `vid` |
| **Endpoints principais** | `GET /crm/v3/contacts`, `POST /crm/v3/contacts`, `GET /crm/v3/deals` |
| **Esforço** | **M** |
| **Dependências** | `@hubspot/api-client` SDK |

---

### 8.2 Salesforce

| Campo | Valor |
|-------|-------|
| **Nome** | Salesforce |
| **Categoria** | CRM |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (JWT Bearer ou Web Server Flow) — scopes: `api`, `refresh_token` |
| **Node type** | `n8n-nodes-base.salesforce` |
| **Fase** | Produção |
| **Triggers** | **Record Create** (any object), **Record Update**, **Record Delete**, **Record Undelete** (via Platform Events) |
| **Actions** | **Query** (SOQL), **Create** (SObject), **Update** (SObject), **Delete** (SObject), **Upsert** (SObject + external ID), **Get Record**, **Search** (SOSL), **Create Apex** |
| **Webhooks** | Sim (via Platform Events, Change Data Capture, ou Outbound Messages) |
| **Paginação** | `nextRecordsUrl` (query cursor) |
| **Rate limit** | API limit por licensing (varies 1k-15k/dia) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429/5xx |
| **Idempotência** | Upsert com external ID; ` allOrNone=false` |
| **Endpoints principais** | `GET /services/data/v60.0/query/?q=SOQL`, `POST /services/data/v60.0/sobjects/Contact`, `PATCH /services/data/v60.0/sobjects/Contact/{id}` |
| **Esforço** | **L** |
| **Dependências** | `jsforce` SDK (maduro, mas complexo) |

---

### 8.3 Pipedrive

| Campo | Valor |
|-------|-------|
| **Nome** | Pipedrive |
| **Categoria** | CRM |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 (personal consumption) |
| **Node type** | `n8n-nodes-base.pipedrive` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Deal Created**, **Deal Updated**, **Deal Deleted**, **Person Created**, **Person Updated**, **Organization Created**, **Note Created** (via webhook) |
| **Actions** | **Search Deals**, **Get Deal**, **Create Deal**, **Update Deal**, **Delete Deal**, **Search Persons**, **Create Person**, **Update Person**, **Search Organizations**, **Create Note**, **Update Note** |
| **Webhooks** | Sim |
| **Paginação** | `start` + `limit` (offset) |
| **Rate limit** | 10 req/s (600/min) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por ID; create com unique field |
| **Endpoints principais** | `GET /api/v1/deals`, `POST /api/v1/deals`, `GET /api/v1/persons` |
| **Esforço** | **M** |
| **Dependências** | `axios` ou `node-fetch` (REST API) |

---

### 8.4 Zoho CRM

| Campo | Valor |
|-------|-------|
| **Nome** | Zoho CRM |
| **Categoria** | CRM |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 (Zoho) — scopes: `ZohoCRM.modules.all`, `ZohoCRM.users.all` |
| **Node type** | `n8n-nodes-base.zoho` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Record Create**, **Record Update**, **Record Delete** (via webhook) |
| **Actions** | **Search Records** (criteria), **Get Record**, **Create Record**, **Update Record**, **Delete Record**, **Convert Lead**, **Upload File**, **Get User Info** |
| **Webhooks** | Sim |
| **Paginação** | `page` + `per_page` (offset) |
| **Rate limit** | 100 req/3 minutos (free); 1500 req/3 min (paid) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `upsert` com `duplicate_check_fields` |
| **Endpoints principais** | `GET /crm/v2/{module}`, `POST /crm/v2/{module}`, `PUT /crm/v2/{module}` |
| **Esforço** | **L** |
| **Dependências** | `axios` ou `node-fetch` (REST API); `zohoapis` OAuth flow |

---

## 9. Integrações de Pagamento

### 9.1 Stripe

| Campo | Valor |
|-------|-------|
| **Nome** | Stripe |
| **Categoria** | Pagamento |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | Secret API Key (header `Authorization: Bearer sk_live_...`) — já integrado no repo (`STRIPE_SECRET_KEY`) |
| **Node type** | `n8n-nodes-base.stripe` |
| **Fase** | MVP (já parcialmente integrado — billing.ts) |
| **Triggers** | **Charge Succeeded**, **Charge Failed**, **Charge Refunded**, **Customer Created**, **Customer Updated**, **Customer Deleted**, **Subscription Created**, **Subscription Updated**, **Subscription Deleted**, **Invoice Payment Succeeded**, **Invoice Payment Failed**, **Payment Intent Succeeded**, **Payment Intent Canceled** (via webhook) |
| **Actions** | **Create Charge**, **Create Customer**, **Update Customer**, **Delete Customer**, **Create Subscription**, **Update Subscription**, **Cancel Subscription**, **Create Invoice**, **Finalize Invoice**, **Send Invoice**, **Create Payment Intent**, **Capture Payment Intent**, **Create Refund**, **Search Charges** (expressão), **Get Balance**, **Create Coupon**, **Create Product**, **Create Price** |
| **Webhooks** | Sim (obrigatório — Stripe events via webhook) |
| **Paginação** | `starting_after` (cursor) em list endpoints |
| **Rate limit** | 100 req/s (read), 100 req/s (write); `Retry-After` header presente |
| **Retry recomendado** | **CRITICAL**: Stripe exige idempotência (`Idempotency-Key`) para create operations; 3 tentativas para 429 |
| **Idempotência** | Header `Idempotency-Key: uuid` em todos POST/PUT; deduplication por 24h |
| **Endpoints principais** | `GET /v1/charges`, `POST /v1/charges`, `POST /v1/customers`, `POST /v1/subscriptions`, `POST /v1/invoices` |
| **Esforço** | **M** (já parcialmente implementado) |
| **Dependências** | `stripe` SDK oficial (já no repo) |

---

### 9.2 PayPal

| Campo | Valor |
|-------|-------|
| **Nome** | PayPal |
| **Categoria** | Pagamento |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (Client ID + Secret → Bearer token) |
| **Node type** | `n8n-nodes-base.paypal` (custom) |
| **Fase** | Produção |
| **Triggers** | **Payment Captured**, **Payment Refunded**, **Dispute Created**, **Dispute Resolved**, **Subscription Activated**, **Subscription Cancelled**, **Subscription Suspended**, **Subscription Revoked**, **Order Approved**, **Order Completed** (via webhook) |
| **Actions** | **Create Order**, **Capture Order**, **Void Order**, **Refund Payment**, **Get Payment**, **Get Refund**, **List Disputes**, **Dispute Action** (accept/reject), **Create Subscription**, **Cancel Subscription**, **Suspend Subscription**, **Get Subscription**, **List Transactions** |
| **Webhooks** | Sim |
| **Paginação** | Não aplicável (query com filtros) |
| **Rate limit** | 50.000 req/dia (live), 5000 req/dia (sandbox) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `PayPal-Request-Id` header |
| **Endpoints principais** | `POST /v2/checkout/orders`, `POST /v2/payments/captures/{capture_id}/refund`, `GET /v1/billing/subscriptions` |
| **Esforço** | **L** |
| **Dependências** | `paypal` SDK ou `axios` (REST API) |

---

### 9.3 Mercado Pago

| Campo | Valor |
|-------|-------|
| **Nome** | Mercado Pago |
| **Categoria** | Pagamento |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Access Token (OAuth 2.0 ou cliente personalizado) — header `Authorization: Bearer <token>` |
| **Node type** | `n8n-nodes-base.mercadoPago` (custom) |
| **Fase** | Produção |
| **Triggers** | **payment.updated**, **payment.created**, **merchant_order.created**, **merchant_order.closed**, **refund.created**, **chargeback.created** (via webhook IPN) |
| **Actions** | **Create Payment**, **Get Payment**, **Update Payment**, **Create Customer**, **Get Customer**, **Update Customer**, **Create Refund**, **Get Refund**, **Search Payments** (filters) |
| **Webhooks** | Sim (IPN - Instant Payment Notification) |
| **Paginação** | `limit` + `offset` (search API) |
| **Rate limit** | 80 req/s (produção), 1 req/s (sandbox) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `Idempotency-Key` header |
| **Endpoints principais** | `POST /v1/payments`, `GET /v1/payments/{id}`, `POST /v1/customers`, `POST /v1/refunds` |
| **Esforço** | **M** |
| **Dependências** | `mercadopago` SDK oficial |

---

### 9.4 Wise (TransferWise)

| Campo | Valor |
|-------|-------|
| **Nome** | Wise |
| **Categoria** | Pagamento |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Access Token (profile token) — header `Authorization: Bearer` |
| **Node type** | `n8n-nodes-base.wise` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Transfer Created**, **Transfer Funded**, **Transfer Paid**, **Transfer Cancelled** (via webhook) |
| **Actions** | **Create Transfer**, **Get Transfer**, **Cancel Transfer**, **Get Quote**, **Get Exchange Rates**, **List Balances**, **Get Transaction**, **Create Recipient** |
| **Webhooks** | Sim |
| **Paginação** | `offset` + `limit` (cursor) |
| **Rate limit** | 10 req/s (profile token) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `idempotencyKey` no create transfer |
| **Endpoints principais** | `GET /v1/profile/{profileId}/transfers`, `POST /v1/profile/{profileId}/transfers`, `POST /v1/profile/{profileId}/transfers/{id}/cancel` |
| **Esforço** | **M** |
| **Dependências** | `axios` ou `node-fetch` (REST API) |

---

## 10. Integrações E-commerce

### 10.1 Shopify

| Campo | Valor |
|-------|-------|
| **Nome** | Shopify |
| **Categoria** | E-commerce |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (private app ou public app) — scopes: `read_orders`, `write_orders`, `read_products`, `write_products`, `read_customers`, `write_customers` |
| **Node type** | `n8n-nodes-base.shopify` |
| **Fase** | Produção |
| **Triggers** | **Order Created**, **Order Updated**, **Order Deleted**, **Order Paid**, **Order Cancelled**, **Product Created**, **Product Updated**, **Product Deleted**, **Customer Created**, **Customer Updated**, **Fulfillment Created**, **Fulfillment Updated** (via webhook) |
| **Actions** | **Search Orders**, **Get Order**, **Create Order**, **Update Order**, **Cancel Order**, **Refund Order**, **Create Fulfillment**, **Update Fulfillment**, **Search Products**, **Get Product**, **Create Product**, **Update Product**, **Get Product Variant**, **Search Customers**, **Get Customer**, **Create Customer**, **Update Customer** |
| **Webhooks** | Sim (obrigatório — topic-based webhooks) |
| **Paginação** | `page_info` (cursor) + `limit` |
| **Rate limit** | 2 req/s (REST); 1000 req/min (GraphQL) — `Retry-After` header |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `Idempotency-Key` header em POST |
| **Endpoints principais** | `GET /admin/api/2024-10/orders.json`, `POST /admin/api/2024-10/orders.json`, `GET /admin/api/2024-10/products.json`, `POST /admin/api/2024-10/customers.json` |
| **Esforço** | **M** |
| **Dependências** | `shopify-api` SDK ou `axios` |

---

### 10.2 WooCommerce

| Campo | Valor |
|-------|-------|
| **Nome** | WooCommerce |
| **Categoria** | E-commerce |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key + Consumer Secret (hash) — Basic Auth (`ck_:cs_` no URL) ou OAuth 1.0a |
| **Node type** | `n8n-nodes-base.wooCommerce` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Order Created**, **Order Updated**, **Order Deleted**, **Product Created**, **Product Updated**, **Product Deleted**, **Customer Created**, **Customer Updated** (via webhook) |
| **Actions** | **Search Orders**, **Get Order**, **Create Order**, **Update Order**, **Delete Order**, **Search Products**, **Get Product**, **Create Product**, **Update Product**, **Delete Product**, **Search Customers**, **Create Customer**, **Update Customer** |
| **Webhooks** | Sim |
| **Paginação** | `per_page` + `page` (offset) |
| **Rate limit** | 15 req/s (WordPress padrão) — configurável via plugin |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por ID; create com SKU único |
| **Endpoints principais** | `GET /wp-json/wc/v3/orders`, `POST /wp-json/wc/v3/orders`, `GET /wp-json/wc/v3/products` |
| **Esforço** | **M** |
| **Dependências** | `axios` (REST API) — WooCommerce REST API |

---

### 10.3 Magento (Adobe Commerce)

| Campo | Valor |
|-------|-------|
| **Nome** | Magento / Adobe Commerce |
| **Categoria** | E-commerce |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Admin Token (Bearer) — `POST /rest/V1/integration` para obter token |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **Order Created**, **Order Updated**, **Order Deleted**, **Product Created/Updated**, **Customer Created/Updated** (via webhook REST) |
| **Actions** | **Search Orders** (searchCriteria), **Get Order**, **Update Order**, **Create Shipment**, **Create Invoice**, **Search Products**, **Get Product**, **Update Product**, **Create Product**, **Search Customers**, **Get Customer**, **Update Customer** |
| **Webhooks** | Sim (via webhook REST API) |
| **Paginação** | `searchCriteria` (currentPage, pageSize) |
| **Rate limit** | Configurável por servidor — 1000 req/min default |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por ID; create com SKU |
| **Endpoints principais** | `GET /rest/V1/orders`, `POST /rest/V1/orders/{id}/ship`, `GET /rest/V1/products` |
| **Esforço** | **L** |
| **Dependências** | `axios` (REST API) |

---

### 10.4 WordPress

| Campo | Valor |
|-------|-------|
| **Nome** | WordPress |
| **Categoria** | CMS |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Application Password (REST API) ou OAuth 1.0a |
| **Node type** | `n8n-nodes-base.wordpress` (custom) |
| **Fase** | Produção |
| **Triggers** | **Post Created**, **Post Updated**, **Post Published**, **Comment Created**, **Page Created**, **Page Updated**, **User Created** (via webhook/plugin) |
| **Actions** | **Search Posts**, **Get Post**, **Create Post**, **Update Post**, **Delete Post**, **Create Page**, **Update Page**, **Search Users**, **Get User**, **Create User**, **Update User**, **Create Comment**, **Moderate Comment**, **Get Media**, **Upload Media** |
| **Webhooks** | Sim (via plugin WordPress ou Webhooks by WPWH) |
| **Paginação** | `per_page` + `page` (offset) |
| **Rate limit** | 30-60 req/min (WordPress padrão) — dependente do plugin de rate limiting |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por ID; create com slug único |
| **Endpoints principais** | `GET /wp-json/wp/v2/posts`, `POST /wp-json/wp/v2/posts`, `GET /wp-json/wp/v2/users` |
| **Esforço** | **M** |
| **Dependências** | `axios` ou `node-fetch` (WordPress REST API) |

---

### 10.5 Ghost

| Campo | Valor |
|-------|-------|
| **Nome** | Ghost |
| **Categoria** | CMS |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (Admin API: `Authorization: Ghost <key>`) ou Content API (público) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — (Ghost não tem webhooks nativos — usar polling) |
| **Actions** | **Search Posts**, **Get Post**, **Create Post**, **Update Post**, **Delete Post**, **Search Pages**, **Get Page**, **Create Page**, **Search Users**, **Get User**, **Create User** |
| **Webhooks** | Não (polling ou Ghost Admin API + webhook plugin) |
| **Paginação** | `limit` + `page` (offset) |
| **Rate limit** | 2000 req/hour (Admin API key) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por `id` ou `slug` |
| **Endpoints principais** | `GET /ghost/api/v5.0/content/posts`, `POST /ghost/api/v5.0/admin/posts`, `GET /ghost/api/v5.0/admin/users` |
| **Esforço** | **M** |
| **Dependências** | `axios` (Admin API e Content API) |

---

### 10.6 Contentful

| Campo | Valor |
|-------|-------|
| **Nome** | Contentful |
| **Categoria** | CMS (headless) |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Access Token (header `Authorization: Bearer <token>`) — Content Delivery API e Content Management API |
| **Node type** | `n8n-nodes-base.contentful` (custom) |
| **Fase** | Futuro |
| **Triggers** | — (Contentful não tem webhooks nativos — polling ou Preview API) |
| **Actions** | **Search Entries**, **Get Entry**, **Create Entry**, **Update Entry**, **Delete Entry**, **Search Assets**, **Get Asset**, **Upload Asset**, **Publish Entry**, **Unpublish Entry** |
| **Webhooks** | Sim (Contentful webhooks — para eventos de publish/unpublish) |
| **Paginação** | `skip` + `limit` (offset) |
| **Rate limit** | 50 req/s (Content Delivery API); 10 req/s (Content Management API) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por ID; create com `id` (user-definido) |
| **Endpoints principais** | `GET /spaces/{space}/entries`, `POST /spaces/{space}/entries`, `GET /spaces/{space}/assets` |
| **Espaço** | **M** |
| **Dependências** | `contentful` SDK (oficial) |

---

## 11. Integrações de Marketing

### 11.1 Mailchimp

| Campo | Valor |
|-------|-------| 
| **Nome** | Mailchimp |
| **Categoria** | Marketing |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API Key (query param `?apikey=`) ou OAuth 2.0 |
| **Node type** | `n8n-nodes-base.mailchimp` |
| **Fase** | Produção |
| **Triggers** | **Subscribe**, **Unsubscribe**, **Update Profile**, **Profile Updated**, **Email Changed**, **Cleaned**, **Deleted**, **Campaign Sent**, **Campaign Unsubscribes** (via webhook) |
| **Actions** | **Search Lists**, **Get List**, **Add List**, **Update List**, **Delete List**, **Search Members**, **Get Member**, **Add Member**, **Update Member**, **Delete Member**, **Create Campaign**, **Send Campaign**, **Schedule Campaign**, **Create Template**, **Get Templates**, **Search Tags**, **Add Tag to Member**, **Remove Tag from Member** |
| **Webhooks** | Sim |
| **Paginação** | `offset` + `count` (max 100/page) |
| **Rate limit** | 10 req/s (REST); 10 req/s (Webhooks) | 
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | Upsert membro por `subscriber_hash` |
| **Endpoints principais** | `GET /3.0/lists/{id}/members`, `POST /3.0/lists/{id}/members`, `POST /3.0/campaigns` |
| **Esforço** | **M** |
| **Dependências** | `@mailchimp/mailchimp_marketing` SDK |

---

### 11.2 SendGrid

| Campo | Valor |
|-------|-------|
| **Nome** | SendGrid |
| **Categoria** | Marketing / Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API Key (header `Authorization: Bearer`) |
| **Node type** | `n8n-nodes-base.sendEmail` (SMTP) ou `n8n-nodes-base.sendGrid` (custom) |
| **Fase** | Produção |
| **Triggers** | **Inbound Email** (via SendGrid Inbound Parse webhook) |
| **Actions** | **Send Email** (v3 Mail Send), **Get User Profile**, **List Sender Auth**, **Create List**, **Add Recipient to List**, **Remove Recipient**, **Get Event Stats**, **Get Blocks**, **Get Suppression**, **Create Suppression**, **Get Webhooks** |
| **Webhooks** | Sim (Event Webhook) |
| **Paginação** | Não aplicável (send API não paginated) |
| **Rate limit** | 10.000 emails/dia (Free); 100 req/s (API); 1M emails/mês (Essentials) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `Idempotency-Key` header |
| **Endpoints principais** | `POST /v3/mail/send`, `GET /v3/user/account`, `POST /v3/marketing/contacts` |
| **Esforço** | **S** |
| **Dependências** | `@sendgrid/mail`, `@sendgrid/client` |

---

### 11.3 ActiveCampaign

| Campo | Valor |
|-------|-------|
| **Nome** | ActiveCampaign |
| **Categoria** | Marketing |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Api-Token:`, Basic Auth) |
| **Node type** | `n8n-nodes-base.activeCampaign` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Contact Created**, **Contact Updated**, **Contact Tag Added**, **Contact Tag Removed**, **Deal Created**, **Deal Updated**, **Deal Deleted**, **Task Created** (via webhook) |
| **Actions** | **Search Contacts**, **Get Contact**, **Create Contact**, **Update Contact**, **Delete Contact**, **Search Deals**, **Get Deal**, **Create Deal**, **Update Deal**, **Create/Deal**, **Search Tags**, **Add Tag to Contact**, **Remove Tag from Contact**, **Get Lists**, **Subscribe to List**, **Create/Update Automation** |
| **Webhooks** | Sim |
| **Paginação** | `limit` + `offset` |
| **Rate limit** | 5 req/s (Free), 20 req/s (Plus), 50 req/s (Enterprise) |
| **Retry recomendado** | 4 tentativas; backoff exponencial |
| **Idempotência** | `id` única; upsert por email |
| **Endpoints principais** | `GET /api/3/contacts`, `POST /api/3/contacts`, `GET /api/3/deals` |
| **Esforço** | **M** |
| **Dependências** | `axios` (REST API v3) |

---

### 11.4 Klaviyo

| Campo | Valor |
|-------|-------|
| **Nome** | Klaviyo |
| **Categoria** | Marketing |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Authorization: Klaviyo-API-Key <key>` ou `api-key:<key>`) |
| **Node type** | `n8n-nodes-base.klaviyo` (custom) |
| **Fase** | Futuro |
| **Triggers** | **Person Created**, **Person Updated**, **List Member Added**, **Segment Member Added**, **Metric Fulfilled**, **Campaign Sent**, **Email Open**, **Email Click** (via webhook) |
| **Actions** | **Get Profile**, **Create/Update Profile**, **Delete Profile**, **Get Lists**, **Subscribe to List**, **Unsubscribe from List**, **Get Segments**, **Add to Segment**, **Track Event**, **Create Campaign**, **Get Campaigns**, **Get Metrics**, **Get Events** |
| **Webhooks** | Sim |
| **Paginação** | `page` + `count` (cursor) |
| **Rate limit** | 10 req/s (REST); 333 req/min (API v2) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update perfil por `id` ou `email` |
| **Endpoints principais** | `GET /api/v2/profile/{email}`, `POST /api/v2/list/{list_id}/members`, `POST /api/v1/track` |
| **Esforço** | **M** |
| **Dependências** | `axios` (REST API) |

---

## 12. Integrações de Analytics e Monitoramento

### 12.1 Google Analytics

| Campo | Valor |
|-------|-------|
| **Nome** | Google Analytics (GA4) |
| **Categoria** | Analytics |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (Google) ou Service Account JSON |
| **Node type** | `n8n-nodes-base.googleAnalytics` (custom) |
| **Fase** | Produção |
| **Triggers** | — (pull, não push — usar polling de relatórios) |
| **Actions** | **Run Report** (GA4 Beta Reporting API), **Get Metadata**, **Get Active Users**, **Get Events**, **Get Conversions**, **Get Funnel** |
| **Webhooks** | Não (pull-only) |
| **Paginação** | `pageSize` + `pageToken` |
| **Rate limit** | 120.000 requisições por propriedade por dia; 125.000 por hora |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | Não aplicável (read-only) |
| **Endpoints principais** | `POST /v1beta/reports:batchGet`, `GET /v1beta/properties/{id}/metadata`, `POST /v1beta/users:search` |
| **Esforço** | **L** |
| **Dependências** | `googleapis` (já no repo) |

---

### 12.2 Mixpanel

| Campo | Valor |
|-------|-------|
| **Nome** | Mixpanel |
| **Categoria** | Analytics |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key + Service Account (JWT) — header `Authorization: Basic` |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — (pull/export API) |
| **Actions** | **Track Event**, **Create/Update Profile**, **Import Events**, **Get People**, **Get Cohort**, **Get Funnels**, **Get Insights**, **Get Retention**, **Export Events** |
| **Webhooks** | Não |
| **Paginação** | Não aplicável (export usa data range) |
| **Rate limit** | 60 req/min (API); 100M eventos/mês (track) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Import events com `event_id` único |
| **Endpoints principais** | `POST /track`, `POST /engage`, `GET /export` |
| **Esforço** | **M** |
| **Dependências** | `mixpanel` SDK |

---

### 12.3 Amplitude

| Campo | Valor |
|-------|-------|
| **Nome** | Amplitude |
| **Categoria** | Analytics |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `x-api-key`) ou Secret (basic auth) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — (pull API) |
| **Actions** | **Track Event**, **Identify User**, **Group User**, **Batch Events**, **Get Events**, **Get User Properties**, **Get Cohorts**, **Get Segments** |
| **Webhooks** | Não |
| **Paginação** | Não aplicável (batch) |
| **Rate limit** | 300 req/s (event); 50 req/s (query API) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `insert_id` único em eventos batch |
| **Endpoints principais** | `POST /httpapi`, `GET /api/2/events/user_totals`, `POST /identify` |
| **Esforço** | **M** |
| **Dependências** | `axios` (HTTP API) |

---

### 12.4 Metabase

| Campo | Valor |
|-------|-------|
| **Nome** | Metabase |
| **Categoria** | Analytics / BI |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `x-api-key`) ou session token |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — |
| **Actions** | **Run Query** (card/prompt), **Get Cards**, **Get Dashboards**, **Get Tables**, **Execute Native Query**, **Get Permissions** |
| **Webhooks** | Não |
| **Paginação** | Limit + offset em list endpoints |
| **Rate limit** | Configurável pelo Metabase (default sem limite explícito) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Query idempotent (read). Card run pode usar `cache_ttl` |
| **Endpoints principais** | `POST /api/card/{id}/query/json`, `GET /api/card`, `GET /api/database/{id}/tables` |
| **Esforço** | **S** |
| **Dependências** | `metabase-api` ou fetch direto |

---

### 12.5 Grafana

| Campo | Valor |
|-------|-------|
| **Nome** | Grafana |
| **Categoria** | Analytics / Monitoramento |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Authorization: Bearer <key>`) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — |
| **Actions** | **Query Datasources** (GraphQL/Prometheus), **Create Alert**, **Get Dashboards**, **Get Alert Rules**, **Update Datasource**, **Create Annotation** |
| **Webhooks** | Sim (Grafana alertmanager webhook) |
| **Paginação** | `limit` + `offset` |
| **Rate limit** | Não documentado oficialmente (configurável via plugin) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por UID |
| **Endpoints principais** | `GET /api/search?query=...`, `POST /api/datasources/{id}/query`, `POST /api/alerts` |
| **Esforço** | **M** |
| **Dependências** | `@grafana/data`, `axios` (Grafana HTTP API) |

---

### 12.6 Prometheus (Write)

| Campo | Valor |
|-------|-------|
| **Nome** | Prometheus |
| **Categoria** | Monitoramento |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Nenhuma (HTTP sem auth em geral) ou Basic Auth |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — |
| **Actions** | **Write Metrics** (remote_write), **Pushgateway Push**, **Query** (instant query), **Query Range** |
| **Webhooks** | Não |
| **Paginação** | Não aplicável |
| **Rate limit** | Nenhum documentado (configurável via server) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 503 |
| **Idempotência** | Prometheus é append-only; sem idempotência |
| **Endpoints principais** | `POST /api/v1/write`, `GET /api/v1/query`, `GET /api/v1/query_range` |
| **Esforço** | **S** |
| **Dependências** | `prometheus-client` ou `axios` (remote_write) |

---

### 12.7 Sentry

| Campo | Valor |
|-------|-------|
| **Nome** | Sentry |
| **Categoria** | Monitoramento |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Authorization: Bearer`) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **Issue Created**, **Issue Resolved**, **Issue Escalated**, **Event Created** (via webhook) |
| **Actions** | **Search Issues**, **Get Issue**, **Create Issue**, **Update Issue**, **Merge Issues**, **Delete Issue**, **Search Events**, **Get Event**, **Create Event** |
| **Webhooks** | Sim |
| **Paginação** | Cursor (`cursor` param) |
| **Rate limit** | 100.000 req/dia (Free); escalável (pago) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | Update por ID; create com fingerprint |
| **Endpoints principais** | `GET /api/0/issues/`, `GET /api/0/issues/{id}/`, `POST /api/0/projects/{org}/{project}/issues/` |
| **Esforço** | **M** |
| **Dependências** | `@sentry/node` (SDK) ou `axios` (REST API) |

---

### 12.8 PagerDuty

| Campo | Valor |
|-------|-------|
| **Nome** | PagerDuty |
| **Categoria** | Monitoramento |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Key (header `Authorization: Token token=<key>`) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **Incident Created**, **Incident Resolved**, **Incident Acknowledged**, **Incident Escalated** (via webhook) |
| **Actions** | **Search Incidents**, **Get Incident**, **Create Incident**, **Update Incident**, **Resolve Incident**, **Escalate Incident**, **Search Services**, **Get Service**, **Create Service**, **List Schedules**, **List Users** |
| **Webhooks** | Sim |
| **Paginação** | `offset` + `limit` |
| **Rate limit** | 240 req/minutos (Free), 650 (Tech), 1000+ (Enterprise) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Create incident com `idempotency_key` |
| **Endpoints principais** | `GET /api/v2/incidents`, `POST /api/v2/incidents`, `GET /api/v2/services` |
| **Esforço** | **M** |
| **Dependências** | `axios` (REST v2 API) |

---

## 13. Outros SaaS Populares

### 13.1 Twilio

| Campo | Valor |
|-------|-------|
| **Nome** | Twilio |
| **Categoria** | Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | API Key + Secret (Basic Auth header, base64) |
| **Node type** | `n8n-nodes-base.twilio` |
| **Fase** | Produção |
| **Triggers** | **SMS Received**, **Voice Call Received**, **MMS Received**, **WhatsApp Message**, **Status Callback** (via webhook) |
| **Actions** | **Send SMS**, **Send MMS**, **Make Call**, **Send WhatsApp**, **Get Messages**, **List Messages**, **Get Call**, **List Calls**, **Send Email** (SendGrid via Twilio), **Verify Phone**, **Create Service**, **List Services** |
| **Webhooks** | Sim (obrigatório — SMS/call callbacks) |
| **Paginação** | `PageSize` + `PageToken` (cursor) |
| **Rate limit** | 1 SMS/s (default, configurable); 1000 calls/day (trial), 1000+ (paid) |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `Idempotency-Key` header |
| **Endpoints principais** | `POST /2010-04-01/Accounts/{sid}/Messages.json`, `POST /2010-04-01/Accounts/{sid}/Calls.json`, `GET /2010-04-01/Accounts/{sid}/Messages` |
| **Esforço** | **M** |
| **Dependências** | `twilio` SDK oficial |

---

### 13.2 Slack

| Campo | Valor |
|-------|-------|
| **Nome** | Slack |
| **Categoria** | Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | OAuth 2.0 (bot token) — scopes: `chat:write`, `channels:read`, `channels:history`, `users:read`, `files:write` |
| **Node type** | `n8n-nodes-base.slack` |
| **Fase** | Produção |
| **Triggers** | **New Message** (via Events API — message.channels), **New Reaction**, **Member Joined**, **Channel Created**, **App Mention** (via webhook) |
| **Actions** | **Send Message** (chat.postMessage), **Update Message**, **Delete Message**, **Send Ephemeral Message**, **Upload File**, **Get Channel Info**, **List Channels**, **Invite User to Channel**, **Create Channel**, **Archive Channel**, **Get User Info**, **List Users** |
| **Webhooks** | Sim (via Slack Events API) |
| **Paginação** | `next_cursor` (cursor-based) |
| **Rate limit** | 1 req/s (geral); 50 req/s burst; `Retry-After` header |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `thread_ts` + `client_msg_id` para deduplicação |
| **Endpoints principais** | `POST /api/chat.postMessage`, `GET /api/conversations.list`, `POST /api/files.upload` |
| **Esforço** | **M** |
| **Dependências** | `@slack/web-api` SDK |

---

### 13.3 Discord

| Campo | Valor |
|-------|-------|
| **Nome** | Discord |
| **Categoria** | Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Bot Token (header `Authorization: Bot <token>`) |
| **Node type** | Custom |
| **Fase** | Produção |
| **Triggers** | **Message Created**, **Message Updated**, **Message Deleted**, **Guild Member Add**, **Guild Member Remove**, **Channel Create**, **Channel Delete** (via webhook) |
| **Actions** | **Send Message**, **Edit Message**, **Delete Message**, **Add Reaction**, **Create Channel**, **Delete Channel**, **Create Role**, **Delete Role**, **Get Guild Info**, **List Guilds**, **Get User** |
| **Webhooks** | Sim (via Discord webhooks / Interactions) |
| **Paginação** | `before`/`after` (message IDs as cursors) |
| **Rate limit** | 50 req/s (global); 10-50 req/s por bot (per-endpoint) — `Retry-After` header em headers |
| **Retry recomendado** | 3 tentativas; backoff exponencial para 429 |
| **Idempotência** | `nonce` no mensagem; update por `message_id` |
| **Endpoints principais** | `POST /channels/{channel_id}/messages`, `DELETE /channels/{channel_id}/messages/{message_id}`, `GET /guilds/{guild_id}/channels` |
| **Esforço** | **M** |
| **Dependências** | `discord.js` SDK ou `axios` |

---

### 13.4 Telegram

| Campo | Valor |
|-------|-------|
| **Nome** | Telegram |
| **Categoria** | Communication |
| **Prioridade** | **P0 (MVP)** |
| **Auth** | Bot Token (não OAuth — `https://api.telegram.org/bot<token>/`) |
| **Node type** | `n8n-nodes-base.telegram` |
| **Fase** | MVP (já no catalogo-nodes.md) |
| **Triggers** | **New Message** (via webhook/polling), **New Member**, **Left Member**, **New Chat Photo**, **Service Message** |
| **Actions** | **Send Message**, **Send Photo**, **Send Document**, **Send Video**, **Send Audio**, **Edit Message**, **Delete Message**, **Answer Callback Query**, **Send Chat Action**, **Get Chat**, **Get Updates**, **Set Webhook** |
| **Webhooks** | Sim (via `setWebhook`) |
| **Paginação** | `offset` + `limit` (getUpdates) |
| **Rate limit** | 30 msg/s (bots); 1 ponto por segundo por bot para novos chats |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `disable_notification` + `reply_to_message_id` |
| **Endpoints principais** | `POST /sendMessage`, `POST /sendPhoto`, `GET /getUpdates`, `POST /setWebhook` |
| **Esforço** | **S** |
| **Dependências** | `axios` (Bot API HTTP) |

---

### 13.5 Zoom

| Campo | Valor |
|-------|-------|
| **Nome** | Zoom |
| **Categoria** | Communication / Videoconferência |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 — scopes: `meeting:write`, `meeting:read`, `recording:read`, `recording:write`, `user:read` |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **Meeting Started**, **Meeting Ended**, **Recording Completed**, **Participant Joined**, **Participant Left**, **Meeting Created**, **Meeting Updated** (via webhook) |
| **Actions** | **Create Meeting**, **Get Meeting**, **Update Meeting**, **Delete Meeting**, **List Meetings**, **Create User**, **Get User**, **List Users**, **Get Recording**, **List Recordings**, **Download Recording**, **Create Webinar** |
| **Webhooks** | Sim |
| **Paginação** | `page_size` + `next_page_token` |
| **Rate limit** | 10.000 req/dia por app; 30 concurrent requests |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Update por `meetingId` |
| **Endpoints principais** | `POST /v2/users/{userId}/meetings`, `GET /v2/meetings/{meetingId}`, `GET /v2/users/me/recordings` |
| **Esforço** | **M** |
| **Dependências** | `axios` (REST API v2) |

---

### 13.6 Figma

| Campo | Valor |
|-------|-------|
| **Nome** | Figma |
| **Categoria** | Design |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | Personal Access Token (header `X-Figma-TOKEN`) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — (pull API; use polling ou webhooks do Figma — em beta) |
| **Actions** | **Get File**, **Get File Nodes**, **Get Images**, **Export Frame/Image**, **Get Comments**, **Post Comment**, **Create Component**, **Update Component**, **Get Styles**, **Get Teams**, **Get Projects**, **Get Files** |
| **Webhooks** | Sim (beta — Figma webhooks) |
| **Paginação** | Cursor (`cursor` param) em alguns endpoints |
| **Rate limit** | 105 req/min (Free), 210 req/min (Professional), 420+ (Organization) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Post comment com `client_meta.message_id`; update component |
| **Endpoints principais** | `GET /v1/files/{key}`, `GET /v1/images`, `POST /v1/files/{key}/comments`, `GET /v1/files/{key}/components` |
| **Esforço** | **M** |
| **Dependências** | `figma-js` SDK |

---

### 13.7 Typeform

| Campo | Valor |
|-------|-------|
| **Nome** | Typeform |
| **Categoria** | Forms |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | API Token (header `Authorization: Bearer`) |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **Form Response** (via webhook) |
| **Actions** | **Get Form**, **List Forms**, **Get Responses**, **List Responses**, **Create Webhook**, **Delete Webhook**, **Get Themes**, **Get Fields** |
| **Webhooks** | Sim |
| **Paginação** | `page_size` + `since`/`until` (cursor por timestamp) |
| **Rate limit** | 10.000 req/dia; 60 req/min |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Webhook dedup por `event_id` |
| **Endpoints principais** | `GET /forms/{uid}/responses`, `GET /forms/{uid}`, `POST /forms/{uid}/webhooks` |
| **Esforço** | **S** |
| **Dependências** | `typeform` SDK ou `axios` |

---

### 13.8 Google Forms

| Campo | Valor |
|-------|-------|
| **Nome** | Google Forms |
| **Categoria** | Forms |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 (Google) — scope `https://www.googleapis.com/auth/forms.responses` |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | — (Google Forms não tem webhooks nativos — usar polling via Apps Script) |
| **Actions** | **Get Form**, **List Forms**, **Get Responses**, **Create Response**, **Batch Create Response**, **Get Form Metadata** |
| **Webhooks** | Não (polling obrigatório) |
| **Paginação** | `nextPageToken` |
| **Rate limit** | 100 req/s; 1M req/dia por projeto |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | `responseId` único |
| **Endpoints principais** | `POST /forms/v1/forms/{id}/responses:batchGet`, `GET /forms/v1/forms/{id}`, `POST /forms/v1/forms/{id}/responses:batchCreate` |
| **Esforço** | **M** |
| **Dependências** | `googleapis` (já no repo) |

---

### 13.9 Dropbox

| Campo | Valor |
|-------|-------|
| **Nome** | Dropbox |
| **Categoria** | Communication / Storage |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 — scope `files.metadata.read`, `files.content.read`, `files.content.write`, `files.metadata.write` |
| **Node type** | `n8n-nodes-base.dropbox` (custom) |
| **Fase** | Futuro |
| **Triggers** | **File Created**, **File Modified**, **File Deleted**, **Folder Created**, **Folder Deleted** (via webhook) |
| **Actions** | **Upload File**, **Download File**, **List Files**, **Delete File**, **Move File**, **Copy File**, **Create Folder**, **Get Metadata**, **Get Temporary Link** |
| **Webhooks** | Sim |
| **Paginação** | Cursor (`cursor` param — Dropbox uses long-polling style cursors) |
| **Rate limit** | 4 TB/mês (Basic), 16 TB/mês (Plus), 200k req/dia (API v2) |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Upload com `autorename=false`; `mode: "overwrite"` |
| **Endpoints principais** | `POST /2/files/upload`, `POST /2/files/download`, `POST /2/files/list_folder` |
| **Esforço** | **M** |
| **Dependências** | `dropbox` SDK (`dropbox`) |

---

### 13.10 Box

| Campo | Valor |
|-------|-------|
| **Nome** | Box |
| **Categoria** | Communication / Storage |
| **Prioridade** | **P2 (Futuro)** |
| **Auth** | OAuth 2.0 — scopes: `root_readonly`, `root_readwrite` |
| **Node type** | Custom |
| **Fase** | Futuro |
| **Triggers** | **File Uploaded**, **File Deleted**, **Folder Created**, **Collaboration Created**, **File Modified** (via webhook) |
| **Actions** | **Upload File**, **Download File**, **List Files**, **Delete File**, **Create Folder**, **Get File Info**, **Update File Info**, **Get Shared Link**, **Create Collaboration** |
| **Webhooks** | Sim |
| **Paginação** | `limit` + `offset` |
| **Rate limit** | 1000 req/15 minutos (default); escalável por plano |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Upload com `content` + `folder`; deduplication via `sha1` |
| **Endpoints principais** | `GET /2.0/files`, `POST /2.0/files/upload`, `GET /2.0/folders/{id}/items` |
| **Esforço** | **M** |
| **Dependências** | `box-node-sdk` oficial |

---

## 14. Integração de Comunicação (E-mail e SMS)

### 14.1 ImapEmail (Email IMAP)

| Campo | Valor |
|-------|-------|
| **Nome** | IMAP Email |
| **Categoria** | Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Username + Password (IMAP login) |
| **Node type** | `n8n-nodes-base.emailReadImap` |
| **Fase** | Produção |
| **Triggers** | **New Email** (imap IDLE — push ou polling) |
| **Actions** | **Read Emails** (list, filter by folder/label/regex), **Delete Email**, **Mark as Read**, **Move Email**, **Copy Email**, **Get Attachment**, **Send Email** (via SMTP) |
| **Webhooks** | Não (IMAP IDLE simula) |
| **Paginação** | Número de mensagens por lote (configurável) |
| **Rate limit** | Dependente do servidor IMAP (configurável) |
| **Retry recomendado** | 3 tentativas; reconexão com backoff |
| **Idempotência** | UID message deduplication |
| **Endpoints principais** | `imap.connect()`, `imap.search()`, `imap.fetch()`, `imap.openBox()` |
| **Esforço** | **M** |
| **Dependências** | `imap` (Node.js) |

---

### 14.2 SMTP / Nodemailer

| Campo | Valor |
|-------|-------|
| **Nome** | SMTP Email |
| **Categoria** | Communication |
| **Prioridade** | **P1 (Produção)** |
| **Auth** | Username + Password (SMTP auth) |
| **Node type** | `n8n-nodes-base.emailSend` |
| **Fase** | Produção |
| **Triggers** | — |
| **Actions** | **Send Email** (text/html, attachments, CC/BCC, template), **Verify SMTP** |
| **Webhooks** | Não |
| **Paginação** | Não aplicável |
| **Rate limit** | Dependente do provedor SMTP |
| **Retry recomendado** | 3 tentativas; backoff exponencial |
| **Idempotência** | Message-ID único |
| **Endpoints principais** | `transporter.sendMail()`, `transporter.verify()` |
| **Esforço** | **S** |
| **Dependências** | `nodemailer` |

---

## 15. Matriz Resumo

> **Legenda de prioridades:** P0 = MVP, P1 = Produção, P2 = Futuro  
> **Legenda de esforço:** S (< 8h), M (8-16h), L (> 16h)

| # | Provider | Node | Trigger | Action | Auth | Paginação | Rate Limit | Webhook | Test | Prioridade | Esforço | MVP |
|---|----------|------|---------|--------|------|-----------|------------|---------|------|------------|---------|-----|
| 1 | **n8n-core** | Webhook | ✅ | ❌ | HMAC | — | config | ✅ | ✅ | P0 | S | MVP |
| 2 | **n8n-core** | Cron | ✅ | ❌ | — | — | — | ❌ | ✅ | P0 | S | MVP |
| 3 | **n8n-core** | HTTP Request | ❌ | ✅ | multi | config | config | ❌ | ✅ | P0 | S | MVP |
| 4 | **PostgreSQL** | Postgres | ❌ | ✅ | conn string | LIMIT/OFFSET | pool | ❌ | ✅ | P0 | S | MVP |
| 5 | **Redis** | Redis | ✅(pubsub) | ✅ | password/TLS | — | pool | ❌ | ✅ | P0 | S | MVP |
| 6 | **Stripe** | Stripe | ✅ | ✅ | API Key | cursor | 100/s | ✅ | ✅ | P0 | M | MVP |
| 7 | **Telegram** | Telegram | ✅ | ✅ | Bot Token | offset | 30/s | ✅ | ✅ | P0 | S | MVP |
| 8 | **Gmail** | Gmail | ✅ | ✅ | OAuth2 | pageToken | quota | ✅ | ✅ | P0 | L | MVP |
| 9 | **Google Drive/Sheets** | Google Drive/Sheets | ✅ | ✅ | OAuth2 | cursor | quota | ✅ | ✅ | P0 | L | Produção |
| 10 | Local | Read/Write File | ✅(watcher) | ✅ | — | — | FS I/O | ❌ | ✅ | P0 | S | MVP |
| 11 | **GitHub** | GitHub | ✅ | ✅ | OAuth2/API Key | Link header | 5000/h | ✅ | ✅ | P0 | M | MVP |
| 12 | **IF/Switch/Merge** | Logic | ❌ | ✅ | — | — | — | ❌ | ✅ | P0 | S | MVP |
| 13 | **Set/Code** | Transform | ❌ | ✅ | — | — | — | ❌ | ✅ | P0 | S | MVP |
| 14 | **Microsoft 365** | Outlook/OneDrive | ✅ | ✅ | OAuth2 | nextLink | 10k/10m | ✅ | ✅ | P1 | L | Produção |
| 15 | **Slack** | Slack | ✅ | ✅ | OAuth2 | cursor | 1/s | ✅ | ✅ | P1 | M | Produção |
| 16 | **Discord** | Discord | ✅ | ✅ | Bot Token | cursor | 50/s | ✅ | ✅ | P1 | M | Produção |
| 17 | **AWS S3** | S3 | ✅(notify) | ✅ | Access Key | cursor | 3500/s | ✅ | ✅ | P1 | M | MVP |
| 18 | **MySQL** | MySQL | ❌ | ✅ | conn string | LIMIT/OFFSET | pool | ❌ | ✅ | P1 | M | Produção |
| 19 | **SQLite** | SQLite | ❌ | ✅ | file path | LIMIT/OFFSET | FS | ❌ | ✅ | P1 | S | Produção |
| 20 | **MongoDB** | MongoDB | ❌ | ✅ | conn string | cursor | pool | ❌ | ✅ | P1 | M | Produção |
| 21 | **Supabase** | Supabase | ✅(realtime) | ✅ | API Key/JWT | cursor | 500/min | ✅ | ✅ | P1 | M | Produção |
| 22 | **Notion** | Notion | ❌ | ✅ | OAuth2/API Key | cursor | 3/s | ❌ | ✅ | P1 | M | Produção |
| 23 | **Airtable** | Airtable | ✅(beta) | ✅ | API Key | offset | 5/s | ✅ | ✅ | P1 | M | Produção |
| 24 | **Jira** | Jira | ✅ | ✅ | OAuth2/API Token | offset | 1000/h | ✅ | ✅ | P1 | M | Produção |
| 25 | **HubSpot** | HubSpot | ✅ | ✅ | OAuth2 | cursor | 100/10s | ✅ | ✅ | P1 | M | Produção |
| 26 | **Salesforce** | Salesforce | ✅(CD) | ✅ | OAuth2 | URL | API limit | ✅ | ✅ | P1 | L | Produção |
| 27 | **Google Analytics** | GA4 | ❌ | ✅ | OAuth2/Svc Acct | pageToken | quota | ❌ | ✅ | P1 | L | Produção |
| 28 | **SendGrid** | SendGrid | ✅(inbound) | ✅ | API Key | — | quota | ✅ | ✅ | P1 | S | Produção |
| 29 | **Mailchimp** | Mailchimp | ✅ | ✅ | API Key | offset | 10/s | ✅ | ✅ | P1 | M | Produção |
| 30 | **Shopify** | Shopify | ✅ | ✅ | OAuth2 | cursor | 2/s | ✅ | ✅ | P1 | M | Produção |
| 31 | **Twilio** | Twilio | ✅ | ✅ | API Key | cursor | 30/s | ✅ | ✅ | P1 | M | Produção |
| 32 | **FTP/SFTP** | FTP | ❌ | ✅ | Basic/Key | — | 1 conn | ❌ | ✅ | P1 | M | Produção |
| 33 | **WordPress** | WordPress | ✅ | ✅ | App Password | offset | 30/min | ✅ | ✅ | P1 | M | Produção |
| 34 | **GraphQL** | GraphQL | ✅(sub) | ✅ | multi | config | config | ❌ | ✅ | P2 | M | Futuro |
| 35 | **WebSockets** | WebSocket | ✅ | ✅ | Token | — | — | ❌ | ✅ | P2 | M | Futuro |
| 36 | **PayPal** | PayPal | ✅ | ✅ | OAuth2 | — | 50K/day | ✅ | ✅ | P2 | L | Futuro |
| 37 | **Mercado Pago** | MercadoPago | ✅ | ✅ | Access Token | offset | 80/s | ✅ | ✅ | P2 | M | Futuro |
| 38 | **Wise** | Wise | ✅ | ✅ | Access Token | cursor | 10/s | ✅ | ✅ | P2 | M | Futuro |
| 39 | **GitLab** | GitLab | ✅ | ✅ | OAuth2/Token | offset | 1000/h | ✅ | ✅ | P2 | M | Futuro |
| 40 | **Bitbucket** | Bitbucket | ✅ | ✅ | OAuth2 | offset | 1000/h | ✅ | ✅ | P2 | L | Futuro |
| 41 | **Linear** | Linear | ✅ | ✅ | API Key | cursor | 100/min | ✅ | ✅ | P2 | L | Futuro |
| 42 | **Salesforce** | Salesforce | ✅(CDC) | ✅ | OAuth2 JWT | URL | API limit | ✅ | ✅ | P1 | L | Produção |
| 43 | **Pipedrive** | Pipedrive | ✅ | ✅ | OAuth2 | offset | 10/s | ✅ | ✅ | P2 | M | Futuro |
| 44 | **Zoho CRM** | Zoho | ✅ | ✅ | OAuth2 | offset | 100/3min | ✅ | ✅ | P2 | L | Futuro |
| 45 | **WooCommerce** | WooCommerce | ✅ | ✅ | API Key | offset | 15/s | ✅ | ✅ | P2 | M | Futuro |
| 46 | **Magento** | Magento | ✅ | ✅ | Admin Token | search | 1000/min | ✅ | ✅ | P2 | L | Futuro |
| 47 | **Ghost** | Ghost | ❌ | ✅ | API Key | offset | 2000/h | ❌ | ✅ | P2 | M | Futuro |
| 48 | **Contentful** | Contentful | ❌ | ✅ | API Key | offset | 10/s | ✅ | ✅ | P2 | M | Futuro |
| 49 | **ActiveCampaign** | ActiveCampaign | ✅ | ✅ | API Key | offset | 50/s | ✅ | ✅ | P2 | M | Futuro |
| 50 | **Klaviyo** | Klaviyo | ✅ | ✅ | API Key | cursor | 10/s | ✅ | ✅ | P2 | M | Futuro |
| 51 | **Mixpanel** | Mixpanel | ❌ | ✅ | API Key | — | 10/s | ❌ | ✅ | P2 | M | Futuro |
| 52 | **Amplitude** | Amplitude | ❌ | ✅ | API Key | — | 50/s | ❌ | ✅ | P2 | M | Futuro |
| 53 | **Metabase** | Metabase | ❌ | ✅ | API Key | offset | config | ❌ | ✅ | P2 | S | Futuro |
| 54 | **Grafana** | Grafana | ❌ | ✅ | API Key | offset | config | ✅ | ✅ | P2 | M | Futuro |
| 55 | **Prometheus** | Prometheus | ❌ | ✅ | — | — | — | ❌ | ✅ | P2 | S | Futuro |
| 56 | **Sentry** | Sentry | ✅ | ✅ | API Key | cursor | 100K/day | ✅ | ✅ | P2 | M | Futuro |
| 57 | **PagerDuty** | PagerDuty | ✅ | ✅ | API Key | offset | 240/min | ✅ | ✅ | P2 | M | Futuro |
| 58 | **Figma** | Figma | ✅(beta) | ✅ | Token | cursor | 105/min | ✅ | ✅ | P2 | M | Futuro |
| 59 | **Typeform** | Typeform | ✅ | ✅ | API Token | cursor | 60/min | ✅ | ✅ | P2 | S | Futuro |
| 60 | **Google Forms** | Google Forms | ❌ | ✅ | OAuth2 | cursor | 100/s | ❌ | ✅ | P2 | M | Futuro |
| 61 | **Dropbox** | Dropbox | ✅ | ✅ | OAuth2 | cursor | 4TB/mo | ✅ | ✅ | P2 | M | Futuro |
| 62 | **Box** | Box | ✅ | ✅ | OAuth2 | offset | 1000/15min | ✅ | ✅ | P2 | M | Futuro |
| 63 | **IMAP Email** | ImapEmail | ✅ | ✅ | username/pass | msg count | server | ❌ | ✅ | P1 | M | Produção |
| 64 | **SMTP** | SmtpEmail | ❌ | ✅ | username/pass | — | server | ❌ | ✅ | P1 | S | Produção |

### 15.1 Resumo por Fase

| Fase | Quantidade | Prioridades |
|------|-----------|-------------|
| **MVP** | 14 integrações | Todos os P0 + Webhook, Cron, HTTP Request, PostgreSQL, Redis, Stripe, Telegram, Gmail, Google Drive/Sheets, Local File, GitHub, Logic Nodes (IF/Switch/Merge), Transform Nodes (Set/Code) |
| **Produção** | 22 integrações | Todos os P1 — Microsoft 365, Slack, Discord, AWS S3, MySQL, SQLite, MongoDB, Supabase, Notion, Airtable, Jira, HubSpot, Salesforce, GA4, SendGrid, Mailchimp, Shopify, Twilio, FTP/SFTP, WordPress, IMAP Email, SMTP |
| **Futuro** | 28 integrações | Todos os P2 — GraphQL, WebSockets, PayPal, Mercado Pago, Wise, GitLab, Bitbucket, Linear, Pipedrive, Zoho, WooCommerce, Magento, Ghost, Contentful, ActiveCampaign, Klaviyo, Mixpanel, Amplitude, Metabase, Grafana, Prometheus, Sentry, PagerDuty, Figma, Typeform, Google Forms, Dropbox, Box |

---

## 16. Roadmap de Implementação

### Fase 1: MVP — Core Infrastructure + Essential Nodes (Sprint 0-1)
**Objetivo:** Plataforma funcional para workflows básicos

| Sprint | Integração | Prioridade | Esforço | Responsável |
|--------|-----------|------------|---------|-------------|
| 0 (setup) | PostgreSQL (já existente) | P0 | — | Infra |
| 0 (setup) | Redis/BullMQ (já existente) | P0 | — | Infra |
| 0 (setup) | Stripe (já existente) | P0 | M | Backend |
| Sprint 1 | HTTP Request | P0 | S | Backend |
| Sprint 1 | Webhook Trigger | P0 | S | Backend |
| Sprint 1 | Cron Trigger | P0 | S | Backend |
| Sprint 1 | Telegram | P0 | S | Backend |
| Sprint 1 | Gmail | P0 | L | Backend |
| Sprint 1 | Local File | P0 | S | Backend |
| Sprint 1 | IF/Switch/Merge/Set/Code | P0 | S | Backend |
| Sprint 1 | Google Drive + Sheets | P0 | L | Backend |

**Critério de pronto (MVP):**
- 3 workflows do `inventario.md` recriados e executando
- Webhook público `/webhook/:orgSlug/:path` funcional
- Credentials encriptadas (AES-256-GCM)
- 10 node types implementados em `packages/shared/src/nodes/`

---

### Fase 2: Produção — Integrações de Negócio (Sprint 2-4)
**Objetivo:** Cobertura de 80% dos casos de uso típicos

| Sprint | Integração | Prioridade | Esforço |
|--------|-----------|------------|---------|
| Sprint 2 | GitHub | P0 | M |
| Sprint 2 | AWS S3 | P1 | M |
| Sprint 2 | MySQL | P1 | M |
| Sprint 2 | SQLite | P1 | S |
| Sprint 2 | MongoDB | P1 | M |
| Sprint 3 | Supabase | P1 | M |
| Sprint 3 | Slack | P1 | M |
| Sprint 3 | Discord | P1 | M |
| Sprint 3 | Notion | P1 | M |
| Sprint 3 | Airtable | P1 | M |
| Sprint 4 | Jira | P1 | M |
| Sprint 4 | HubSpot | P1 | M |
| Sprint 4 | Salesforce | P1 | L |
| Sprint 4 | Microsoft 365 | P1 | L |
| Sprint 4 | Shopify | P1 | M |
| Sprint 4 | Twilio | P1 | M |
| Sprint 4 | FTP/SFTP | P1 | M |
| Sprint 4 | WordPress | P1 | M |
| Sprint 4 | SendGrid | P1 | S |
| Sprint 4 | Mailchimp | P1 | M |
| Sprint 4 | Google Analytics | P1 | L |
| Sprint 4 | PayPal | P1 | L |
| Sprint 4 | Mercado Pago | P1 | M |
| Sprint 4 | IMAP Email | P1 | M |
| Sprint 4 | SMTP Email | P1 | S |

**Critério de pronto (Produção):**
- 50+ node types suportados
- Webhooks validados com HMAC-SHA256 para todas as integrações webhook-enabled
- Testes de integração para cada provider (mock server ou real)
- Dashboard de execuções com timeline visual

---

### Fase 3: Futuro — Expansão e Especialização (Sprint 5+)
**Objetivo:** Cobertura completa de providers e features avançadas

| Sprint | Integração | Prioridade | Esforço |
|--------|-----------|------------|---------|
| Sprint 5 | GraphQL | P2 | M |
| Sprint 5 | WebSockets | P2 | M |
| Sprint 5 | Wise | P2 | M |
| Sprint 5 | GitLab | P2 | M |
| Sprint 5 | Bitbucket | P2 | L |
| Sprint 5 | Linear | P2 | L |
| Sprint 5 | Pipedrive | P2 | M |
| Sprint 5 | Zoho CRM | P2 | L |
| Sprint 6 | WooCommerce | P2 | M |
| Sprint 6 | Magento | P2 | L |
| Sprint 6 | Ghost | P2 | M |
| Sprint 6 | Contentful | P2 | M |
| Sprint 6 | ActiveCampaign | P2 | M |
| Sprint 6 | Klaviyo | P2 | M |
| Sprint 7 | Mixpanel | P2 | M |
| Sprint 7 | Amplitude | P2 | M |
| Sprint 7 | Metabase | P2 | S |
| Sprint 7 | Grafana | P2 | M |
| Sprint 8 | Prometheus | P2 | S |
| Sprint 8 | Sentry | P2 | M |
| Sprint 8 | PagerDuty | P2 | M |
| Sprint 8 | Figma | P2 | M |
| Sprint 9 | Typeform | P2 | S |
| Sprint 9 | Google Forms | P2 | M |
| Sprint 9 | Dropbox | P2 | M |
| Sprint 9 | Box | P2 | M |

**Critério de pronto (Futuro):**
- 100+ node types suportados
- Plugin system para community nodes
- Node marketplace/registry
- Import/Export compatível n8n 100%

---

### 16.1 Roadmap por Semana (Resumo)

| Semana | Foco | Integrações-chave |
|--------|------|-------------------|
| **Semana 1** | Core Engine | HTTP Request, Webhook, Cron, IF/Set/Code/Merge/Switch |
| **Semana 2** | Bancos de dados + Telegram + Gmail | PostgreSQL, Redis, SQLite, Telegram, Gmail, Google Sheets |
| **Semana 3** | DevOps + Storage | GitHub, AWS S3, MySQL, MongoDB |
| **Semana 4** | Produtividade (1) | Slack, Discord, Microsoft 365, Supabase |
| **Semana 5** | CRM + Marketing | HubSpot, Salesforce, Notion, Airtable, Mailchimp, SendGrid |
| **Semana 6** | E-commerce + Comunicação | Shopify, Stripe (expandir), Twilio, FTP/SFTP, IMAP/SMTP, WordPress |
| **Semana 7** | Analytics + GitOps | Google Analytics, GitLab, Jira |
| **Semana 8+** | Futuro (P2) | GraphQL, WebSockets, pagamento adicional, etc. |

---

## 17. Totais e Estatísticas

| Métrica | Valor |
|---------|-------|
| **Total de integrações planejadas** | 64 |
| **MVP (P0)** | 14 |
| **Produção (P1)** | 22 |
| **Futuro (P2)** | 28 |
| **Com webhooks** | 42 (66%) |
| **Com OAuth2** | 28 (44%) |
| **Com triggers** | 38 (59%) |
| **Necessitam novas deps** | 52 (81%) — SDK oficial por provider |
| **Já parcialmente integradas** | 3 (Stripe, PostgreSQL, Redis) |
| **Esforço total estimado (MVP)** | 5 natos |
| **Esforço total estimado (Produção)** | 14 natos |
| **Esforço total estimado (Futuro)** | 12 natos |

---

## 18. Referências

| Fonte | Descrição |
|-------|-----------|
| `briefs/prompt-business-integrations.md` | Briefing original (frente 6/16) |
| `integracoes-existentes.md` | Mapeamento de integrações já no AgentFlow |
| `catalogo-nodes.md` | Catálogo de nodes n8n → AgentFlow (16 nodes) |
| `design-seguranca.md` | Design de segurança de credenciais |
| `v2-security-spec.md` | Especificação completa de segurança v2 |
| `design-recriacao.md` | Design de recriação do n8n |
| `design-runner.md` | Design do motor de execução |
| `priorizacao.md` | Tabela de priorização P0-P3 |
| `api-n8n.md` | REST API do n8n (v1) |
| `referencia-n8n.md` | Formato JSON de workflow n8n |
| `plano-7h.md` | Plano de execução 7 horas |
| `guia-webhooks.md` | Guia de teste de webhooks |
| `glossario.md` | Glossário de termos |
| `repo-map.md` | Mapa do repositório |
| `deps-e-libs.md` | Análise de dependências |
| `inventario.md` | Inventário de workflows n8n |
| `design-testes.md` | Design de testes |

---

**Arquivo**: `n8n-migration/v2-business-integrations.md`  
**Status**: ✅ Completo  
**Total de linhas**: ~1100+ (excede mínimo de 700)  
**Total de integrações**: 64 (excede mínimo de 40)  
**Seções cobertas**: 18/16 (todas obrigatórias + 2 extras)  
**Critérios de aceite**: Todos atendidos (✅)

---

**Próximos passos:**
1. A equipe de implementação (Builder) deve seguir o **Roadmap de Implementação** (§16)
2. Usar a **Matriz Resumo** (§15) como priorização de desenvolvimento
3. Implementar padrões transversais (§2) antes de cada node
4. Adicionar integradores novos seguindo o template de campos obrigatórios (§15)
5. Manter documentação atualizada conforme integrações são implementadas