# Guia de Teste de Webhooks — AgentFlow (Dev Local)

> Objetivo: expor a API local (Fastify, porta **3001**) via túnel HTTPS público, registrar a URL nos webhooks do AgentFlow e validar execuções ponta a ponta com **curl**, **Insomnia** ou **Postman**.

---

## 1. Rodar o App Local (Fastify API)

O backend roda na porta **3001** (conforme `.env` → `PORT=3001`).

```bash
# 1. Instalar dependências (monorepo usa pnpm)
pnpm install

# 2. Subir banco (Postgres) + Redis — se ainda não estiverem rodando
#    Opção A: Docker Compose (recomendado)
docker compose up -d postgres redis

#    Opção B: Serviços locais instalados
#    - Postgres em localhost:5433 (conforme DATABASE_URL)
#    - Redis em localhost:6379

# 3. Rodar migrações e seed
cd apps/api
pnpm db:migrate
pnpm db:seed

# 4. Iniciar API em modo dev (hot reload com tsx)
pnpm dev
# → AgentFlow API running on 0.0.0.0:3001
```

> **Nota**: o frontend Next.js (`apps/web`) roda na porta **3000** (`NEXT_PUBLIC_APP_URL`). Para testes de webhook **só a API (3001) precisa estar exposta**.

---

## 2. Abrir Túnel HTTPS para a Porta 3001

Duas opções principais: **ngrok** (mais simples) ou **cloudflared** (gratuito, sem limite de tempo).

---

### Opção A — ngrok

| Item | Detalhes |
|------|----------|
| **Instalação** | `brew install ngrok` (mac) / `winget install ngrok` (win) / [download](https://ngrok.com/download) |
| **Autenticação** | `ngrok config add-authtoken <SEU_TOKEN>` (conta gratuita em dashboard.ngrok.com) |
| **Comando** | `ngrok http 3001` |
| **URL pública** | Ex.: `https://abc123.ngrok-free.app` (aleatória a cada execução no plano free) |
| **Dashboard** | `http://localhost:4040` — inspeção de requests/responses em tempo real |
| **Domínio fixo (pago)** | `ngrok http --domain=meu-dominio.ngrok.app 3001` |

```bash
# Exemplo completo
ngrok http 3001
# Saída:
# Forwarding  https://a1b2c3d4.ngrok-free.app -> http://localhost:3001
# Web Interface  http://127.0.0.1:4040
```

---

### Opção B — cloudflared (Cloudflare Tunnel)

| Item | Detalhes |
|------|----------|
| **Instalação** | `brew install cloudflared` / `winget install Cloudflare.cloudflared` / [download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |
| **Login** | `cloudflared tunnel login` (abre browser, autoriza domínio) |
| **Criar túnel** | `cloudflared tunnel create agentflow-dev` |
| **Roteamento DNS** | `cloudflared tunnel route dns agentflow-dev webhook-dev.seu-dominio.com` |
| **Rodar** | `cloudflared tunnel run agentflow-dev` |
| **URL pública** | `https://webhook-dev.seu-dominio.com` (fixa, seu domínio) |
| **Dashboard** | Cloudflare Zero Trust → Networks → Tunnels |

```bash
# Fluxo rápido (já tem domínio no Cloudflare)
cloudflared tunnel login
cloudflared tunnel create agentflow-dev
cloudflared tunnel route dns agentflow-dev webhook-dev.meudominio.com
cloudflared tunnel run agentflow-dev
# → Your quick Tunnel has been created! Visit https://webhook-dev.meudominio.com
```

> **Dica**: cloudflared não exige conta paga para domínios fixos; ngrok free rotaciona a URL a cada restart.

---

## 3. Registrar a URL Pública nos Webhooks do AgentFlow

A rota de trigger público é:

```
POST /api/webhooks/trigger/:orgSlug/:path
```

Exemplo: se sua org tem `slug = "minha-org"` e o webhook foi criado com `path = "stripe"`, a URL final é:

```
https://<SEU_TUNEL>/api/webhooks/trigger/minha-org/stripe
```

### Passo a passo

1. **Crie a organização** (se não existir) — via UI ou API:
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"dev@local","password":"senha123","orgName":"Minha Org","orgSlug":"minha-org"}'
   ```

2. **Crie o webhook** (precisa de auth — use o token JWT do login):
   ```bash
   # Login para obter token
   TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"dev@local","password":"senha123"}' | jq -r '.accessToken')

   # Criar webhook (secret será retornado UMA VEZ — salve!)
   curl -X POST http://localhost:3001/api/webhooks \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "path": "stripe",
       "method": "POST",
       "secret": "meu-segredo-super-seguro-123",
       "workflowId": "<ID_DO_WORKFLOW_ATIVO>"
     }'
   ```
   Resposta esperada (guarde o `secret` e `triggerPath`):
   ```json
   {
     "id": "wh_abc123",
     "path": "stripe",
     "method": "POST",
     "workflowId": "wf_xyz789",
     "triggerPath": "minha-org/stripe",
     "secret": "meu-segredo-super-seguro-123"
   }
   ```

3. **Monte a URL pública completa**:
   ```
   https://a1b2c3d4.ngrok-free.app/api/webhooks/trigger/minha-org/stripe
   ```

4. **Configure essa URL no serviço externo** (Stripe, GitHub, n8n, etc.) como endpoint de webhook.

---

## 4. Testar com curl / Insomnia / Postman

### Requisitos da requisição

| Header | Obrigatório? | Valor |
|--------|--------------|-------|
| `Content-Type` | Sim | `application/json` (ou `application/x-www-form-urlencoded`) |
| `X-Webhook-Signature` | **Sim** | `sha256=<HMAC_SHA256_DO_BODY_COM_SECRET>` |

> **Importante**: o AgentFlow **exige assinatura HMAC-SHA256** em **todas** as chamadas ao endpoint `/trigger/*` (linha 122-128 de `webhooks.ts`). Sem header ou assinatura inválida → `401 Invalid signature`.

### Gerar assinatura (exemplo Node.js)

```js
// generate-signature.js
const crypto = require('crypto');
const secret = 'meu-segredo-super-seguro-123'; // o secret do webhook
const payload = { event: 'test', data: { foo: 'bar' } };
const rawBody = JSON.stringify(payload);
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
console.log('X-Webhook-Signature:', sig);
console.log('Body:', rawBody);
```

```bash
node generate-signature.js
# X-Webhook-Signature: sha256=a1b2c3d4e5f6...
# Body: {"event":"test","data":{"foo":"bar"}}
```

### curl completo (copie e ajuste)

```bash
#!/usr/bin/env bash
# send-test.sh — veja arquivo dedicado em testes-webhooks/

TUNNEL_URL="https://a1b2c3d4.ngrok-free.app"   # <- AJUSTE
ORG_SLUG="minha-org"
WEBHOOK_PATH="stripe"
SECRET="meu-segredo-super-seguro-123"          # <- AJUSTE (secret do webhook)
PAYLOAD_FILE="./payloads/json-exemplo.json"    # <- AJUSTE

RAW_BODY=$(cat "$PAYLOAD_FILE")
SIG="sha256=$(echo -n "$RAW_BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST "$TUNNEL_URL/api/webhooks/trigger/$ORG_SLUG/$WEBHOOK_PATH" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$RAW_BODY" \
  -v
```

### Exemplos no Insomnia / Postman

1. **Method**: `POST`
2. **URL**: `https://<SEU_TUNEL>/api/webhooks/trigger/minha-org/stripe`
3. **Headers**:
   - `Content-Type: application/json`
   - `X-Webhook-Signature: sha256:<HMAC_CALCULADO>`
4. **Body (raw JSON)**:
   ```json
   {
     "event": "checkout.session.completed",
     "data": {
       "object": {
         "id": "cs_test_123",
         "amount_total": 1990,
         "currency": "brl",
         "customer_email": "cliente@email.com"
       }
     }
   }
   ```

> **Dica Insomnia/Postman**: use **pre-request script** para calcular HMAC automaticamente (evita copiar/colar manual).

---

## 5. Validar Execução (Banco / Execuções)

Após o POST bem-sucedido (HTTP **202 Accepted**):

```json
{ "executionId": "exec_abc123def456" }
```

### Verificar no banco (Prisma Studio)

```bash
cd apps/api
pnpm db:studio
# Abre http://localhost:5555 → tabela workflowExecution
```

Campos-chave:
- `status`: `PENDING` → `RUNNING` → `COMPLETED` / `FAILED`
- `input`: JSON recebido no webhook
- `output`: resultado final do workflow
- `error`: mensagem se `FAILED`
- `finishedAt`: timestamp de conclusão

### Verificar via API

```bash
# Listar execuções do workflow
curl -X GET "http://localhost:3001/api/executions?workflowId=<WF_ID>" \
  -H "Authorization: Bearer $TOKEN"

# Detalhes de uma execução
curl -X GET "http://localhost:3001/api/executions/exec_abc123def456" \
  -H "Authorization: Bearer $TOKEN"
```

### Logs da API (terminal onde `pnpm dev` roda)

```
[info] Incoming webhook trigger: org=minha-org path=stripe workflow=wf_xyz789
[info] Execution created: exec_abc123def456 status=PENDING
[info] Execution queued: exec_abc123def456
[info] Worker picked up exec_abc123def456
[info] Node HTTP Request executed: status=200
[info] Execution completed: exec_abc123def456 status=COMPLETED
```

---

## 6. Troubleshooting

| Sintoma | Causa Provável | Solução |
|---------|----------------|---------|
| **401 Missing signature** | Header `X-Webhook-Signature` ausente | Adicionar header com `sha256=<hmac>` |
| **401 Invalid signature** | Secret errado / body modificado / encoding | 1) Confirme `secret` exato do webhook (case-sensitive). 2) Use **raw body** exato (sem pretty-print, sem espaços extras). 3) `Content-Type` deve matchar o body (JSON → `application/json`). |
| **404 Webhook not found** | `orgSlug` ou `path` errados na URL | Verifique `triggerPath` retornado na criação (`orgSlug/path`). |
| **405 Method not allowed** | Webhook criado com `method: "POST"` mas mandou `GET` (ou vice-versa) | Alinhe o método HTTP ao cadastrado no webhook. |
| **429 Monthly quota exceeded** | Plano free/excedeu execuções do mês | Upgrade plan ou aguarde virada do mês (contagem reseta dia 1 UTC). |
| **503 Queue unavailable** | Redis/BullMQ não está rodando | `docker compose up -d redis` e verifique `REDIS_URL` no `.env`. |
| **CORS error no browser** | Frontend (3000) chamando API (3001) direto | Webhooks **não** passam pelo browser — use curl/Insomnia. Para chamadas do frontend, ajuste `CORS_ORIGIN` no `.env`. |
| **Túnel não abre / connection refused** | Porta errada / API não subiu | Confirme `PORT=3001` e `pnpm dev` rodando. Teste `curl http://localhost:3001/api/health`. |
| **URL do túnel muda a cada restart (ngrok free)** | Plano gratuito | Use **cloudflared** com domínio próprio ou ngrok pago (domínio fixo). |
| **Variável `BASE_URL` errada no workflow** | Workflow usa `{{ $parameter.baseUrl }}` hardcoded | Configure `NEXT_PUBLIC_API_URL` / `BETTER_AUTH_URL` no `.env` para o túnel (ex.: `https://a1b2c3d4.ngrok-free.app`) ou use variável de ambiente no workflow. |

---

## 7. Checklist Rápido (Copy-paste)

```bash
# [ ] 1. Docker compose up (postgres + redis)
# [ ] 2. pnpm install (raiz)
# [ ] 3. cd apps/api && pnpm db:migrate && pnpm db:seed
# [ ] 4. pnpm dev (porta 3001)
# [ ] 5. ngrok http 3001  (ou cloudflared tunnel run ...)
# [ ] 6. Copiar URL HTTPS do túnel (ex: https://abc.ngrok-free.app)
# [ ] 7. Criar org + webhook via API (salvar secret + triggerPath)
# [ ] 8. Montar URL completa: <TUNNEL>/api/webhooks/trigger/<orgSlug>/<path>
# [ ] 9. Gerar HMAC (script generate-signature.js ou pre-request Insomnia)
# [ ] 10. POST com curl/Insomnia → 202 + executionId
# [ ] 11. Verificar execução no Prisma Studio ou GET /api/executions/:id
# [ ] 12. Logs da API mostram completed/failed
```

---

## 8. Referências Rápidas

| Comando | Descrição |
|---------|-----------|
| `ngrok http 3001` | Expõe porta 3001 com URL aleatória |
| `ngrok http --domain=meu.ngrok.app 3001` | URL fixa (plano pago) |
| `cloudflared tunnel run agentflow-dev` | Túnel Cloudflare com domínio próprio |
| `openssl dgst -sha256 -hmac "secret" <<< '{"json":"body"}'` | Gera HMAC-SHA256 (stdin) |
| `pnpm db:studio` | Prisma Studio para inspecionar execuções |
| `curl -v ...` | Verboso para debug de headers/body |

---

## 9. Arquivos de Apoio (este repositório)

```
n8n-migration/
├── guia-webhooks.md           # Este arquivo
└── testes-webhooks/
    ├── send-test.sh           # Script curl genérico (executável)
    └── payloads/
        ├── json-exemplo.json      # Payload JSON típico (Stripe-like)
        ├── form-exemplo.txt       # application/x-www-form-urlencoded
        └── query-params-exemplo.txt  # Query string para GET
```

> **Não implemente nada no app** — este guia e scripts são **ferramentas de desenvolvimento** para validar webhooks localmente antes de ir para staging/prod.