# 🚀 AgentFlow Production Deployment & Railway Checklist

Comprehensive production deployment guide and operations checklist for **AgentFlow**, covering Multi-Stage Docker builds, Railway PaaS configuration, Environment Variable Matrix, CORS & TRUST_PROXY reverse proxy hardening, Prisma migrations, and Disaster Recovery.

---

## 📑 Table of Contents

1. [Architectural Topology](#1-architectural-topology)
2. [Multi-Stage Dockerfile Specifications](#2-multi-stage-dockerfile-specifications)
3. [Railway Deployment Setup](#3-railway-deployment-setup)
4. [Environment Variables Matrix](#4-environment-variables-matrix)
5. [CORS & TRUST_PROXY Hardening](#5-cors--trust_proxy-hardening)
6. [Database & Prisma Migrations](#6-database--prisma-migrations)
7. [Pre-Flight & Post-Deploy Verification Checklist](#7-pre-flight--post-deploy-verification-checklist)
8. [Monitoring, Telemetry & Healthchecks](#8-monitoring-telemetry--healthchecks)
9. [Disaster Recovery & Zero-Downtime Secret Rotation](#9-disaster-recovery--zero-downtime-secret-rotation)

---

## 1. Architectural Topology

AgentFlow runs as a distributed multi-service architecture:

```
                      ┌────────────────────────────────────────┐
                      │    Cloudflare / Railway Edge Proxy     │
                      │        (TLS Termination & WAF)         │
                      └──────────────────┬─────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
                   ▼                                           ▼
       ┌────────────────────────┐                 ┌────────────────────────┐
       │   apps/web (Next.js)   │                 │   apps/api (Fastify)   │
       │   Port 3000 (Standalone)│                 │   Port 3001 (Node.js)  │
       └────────────────────────┘                 └───────────┬────────────┘
                                                              │
                                       ┌──────────────────────┴──────────────────────┐
                                       │                                             │
                                       ▼                                             ▼
                          ┌────────────────────────┐                    ┌────────────────────────┐
                          │   PostgreSQL 16+ DB    │                    │      Redis 7+ DB       │
                          │   (Prisma ORM Models)  │                    │   (BullMQ + Caching)   │
                          └────────────────────────┘                    └───────────┬────────────┘
                                                                                    │
                                                                                    ▼
                                                                       ┌────────────────────────┐
                                                                       │   apps/worker Engine   │
                                                                       │   (Async Executions)   │
                                                                       └────────────────────────┘
```

---

## 2. Multi-Stage Dockerfile Specifications

Both `apps/api` and `apps/web` use **multi-stage Docker builds** based on `node:22-alpine` with Corepack pnpm 9.15 for minimal image size, cached dependencies, and unprivileged user execution.

### A. API & Worker Container (`apps/api/Dockerfile`)
- **Stage 1 (`base`)**: Installs Corepack and pnpm 9.15.
- **Stage 2 (`deps`)**: Copies lockfile & package manifests, runs `pnpm install --frozen-lockfile` (cached layer).
- **Stage 3 (`build`)**: Compiles `@agentflow/database` (Prisma client), `@agentflow/shared`, `@agentflow/api` TypeScript, and runs `pnpm prune --prod`.
- **Stage 4 (`runner`)**: Slim alpine runtime, non-root user `api:nodejs` (`uid 1001`), `wget` healthcheck, exposes port 3001.

### B. Web Frontend Container (`apps/web/Dockerfile`)
- **Stage 1 (`base`)**: Installs Corepack and pnpm.
- **Stage 2 (`build`)**: Compiles `@agentflow/shared` and runs Next.js build with `output: "standalone"`.
- **Stage 3 (`runner`)**: Unprivileged user `nextjs:nodejs` (`uid 1001`), copies `.next/standalone`, `.next/static`, and `public` assets, exposes port 3000.

### C. Local & Self-Hosted Stack (`docker-compose.yml`)
Run the full production stack locally with:
```bash
docker compose up -d --build
```

---

## 3. Railway Deployment Setup

Railway allows 1-click deployment via GitHub repository connection or Railway CLI.

### Recommended Service Configuration on Railway:

| Service Name | Source / Dockerfile | Build Context | Start Command | Healthcheck Path |
| :--- | :--- | :--- | :--- | :--- |
| **`agentflow-db`** | Railway PostgreSQL Plugin | — | — | Database internal |
| **`agentflow-redis`** | Railway Redis Plugin | — | — | Redis internal |
| **`agentflow-api`** | `apps/api/Dockerfile` | Root `/` | `node dist/server.js` | `/health` |
| **`agentflow-worker`**| `apps/api/Dockerfile` | Root `/` | `node dist/worker.js` | Process alive |
| **`agentflow-web`** | `apps/web/Dockerfile` | Root `/` | `node apps/web/server.js` | `/` |

### Railway Configuration Files:
- **`railway.json` / `apps/api/railway.json`**:
  ```json
  {
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
      "builder": "DOCKERFILE",
      "dockerfilePath": "apps/api/Dockerfile"
    },
    "deploy": {
      "startCommand": "node dist/server.js",
      "healthcheckPath": "/health",
      "healthcheckTimeout": 15,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
- **`apps/web/railway.json`**:
  ```json
  {
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
      "builder": "DOCKERFILE",
      "dockerfilePath": "apps/web/Dockerfile"
    },
    "deploy": {
      "startCommand": "node apps/web/server.js",
      "healthcheckPath": "/",
      "healthcheckTimeout": 15,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```

---

## 4. Environment Variables Matrix

### `apps/api` & `apps/worker` Environment Variables

| Variable | Required | Default / Example | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Enables production error handling, security headers, HSTS, and Pino JSON log formatting. |
| `PORT` | **Yes** | `3001` (or `$PORT`) | Port for the Fastify server. Railway assigns this automatically. |
| `HOST` | **Yes** | `0.0.0.0` | Binds to all interfaces inside container (default in prod). |
| `TRUST_PROXY` | **Yes** | `true` | Enables reverse proxy IP resolution (`req.ip`) behind Railway / Cloudflare load balancers. |
| `CORS_ORIGIN` | **Yes** | `https://app.yourdomain.com` | Allowed CORS origins (supports comma-separated list or `*`). |
| `DATABASE_URL` | **Yes** | `postgresql://...` | Connection string to PostgreSQL instance. |
| `REDIS_URL` | **Yes** | `redis://...` | Connection string to Redis instance. |
| `JWT_SECRET` | **Yes** | *(64-character random string)* | Secret for signing access tokens (min 32 chars). |
| `JWT_SECRET_PREVIOUS` | *No* | *(Previous 64-char key)* | Enables zero-downtime secret rotation. |
| `JWT_EXPIRES_IN` | *No* | `15m` | Lifetime of JWT access token. |
| `REFRESH_EXPIRES_IN` | *No* | `7d` | Lifetime of Refresh token. |
| `CREDENTIAL_ENCRYPTION_KEY` | **Yes** | *(64-hex chars / 32 bytes)* | AES-256-GCM Vault encryption key for credentials. |
| `NVIDIA_NIM_API_KEY` | *No* | `nvapi-...` | API key for NVIDIA NIM AI workflow generation. |
| `NVIDIA_NIM_BASE_URL` | *No* | `https://integrate.api.nvidia.com/v1` | Base URL for NVIDIA NIM endpoint. |
| `STRIPE_SECRET_KEY` | *No* | `sk_live_...` | Stripe secret key for subscriptions and checkout. |
| `STRIPE_WEBHOOK_SECRET` | *No* | `whsec_...` | Stripe webhook signing secret. |
| `EXEC_CODE_DISABLED` | *No* | `false` | Set to `true` to disable arbitrary JS code execution node. |
| `EGRESS_ALLOWED_HOSTS` | *No* | `api.github.com,slack.com` | Optional strict allowlist for HTTP request node egress. |

### `apps/web` Environment Variables

| Variable | Required | Example | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Production mode. |
| `PORT` | **Yes** | `3000` | Port for Next.js standalone server. |
| `HOSTNAME` | **Yes** | `0.0.0.0` | Bind address. |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://api.yourdomain.com` | Publicly reachable URL of the AgentFlow API. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `https://app.yourdomain.com` | Publicly reachable URL of the Web Frontend. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | *No* | `pk_live_...` | Stripe publishable key for client-side checkout. |

---

## 5. CORS & TRUST_PROXY Hardening

### `TRUST_PROXY=true` (or `1`)
- Fastify derives client IP from `X-Forwarded-For` supplied by Railway / Cloudflare.
- Ensures accurate IP-based rate limiting (`@fastify/rate-limit`).
- Correct client IP logging in Pino structured JSON logs.

### `CORS_ORIGIN` Configuration
- Development default: `http://localhost:3000`
- Production single origin: `https://agentflow.yourdomain.com`
- Production multi-origin: `https://agentflow.yourdomain.com,https://app.yourdomain.com`
- Fastify CORS plugin automatically parses comma-delimited origins and enforces `credentials: true`.

### Security Headers Active in Production:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 6. Database & Prisma Migrations

### Apply Migrations in Production:
Before or during deployment, run Prisma migrations:
```bash
# Execute migrations against production DATABASE_URL
pnpm --filter @agentflow/database db:migrate
```
Or via Prisma CLI:
```bash
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

### Seed Initial Admin / Demo Workflows (Optional):
```bash
pnpm --filter @agentflow/database db:seed
```

---

## 7. Pre-Flight & Post-Deploy Verification Checklist

- [ ] **1. Secret Generation**:
  - `JWT_SECRET` generated with at least 32 characters (`openssl rand -hex 32`).
  - `CREDENTIAL_ENCRYPTION_KEY` generated with 64 hex characters (`openssl rand -hex 32`).
- [ ] **2. Database & Redis Connectivity**:
  - PostgreSQL instance reachable and migrated (`prisma migrate deploy`).
  - Redis instance reachable with TLS/AUTH if required.
- [ ] **3. Reverse Proxy & Network**:
  - `TRUST_PROXY=true` set on API service.
  - `CORS_ORIGIN` set to the exact frontend domain(s).
  - `HOST=0.0.0.0` configured for container port exposure.
- [ ] **4. Build & Container Validation**:
  - `pnpm --filter @agentflow/api typecheck` passes with 0 errors.
  - Multi-stage Docker builds complete successfully for API, Worker, and Web.
- [ ] **5. Endpoint Sanity Checks**:
  - `GET /health` returns `{ "status": "ok", "uptime": ... }` with HTTP 200.
  - `GET /metrics` returns Prometheus telemetry metrics.
  - `GET /docs` serves OpenAPI documentation.
  - `POST /api/auth/register` and `POST /api/auth/login` issue valid JWT + Refresh token pair.
  - `POST /api/auth/refresh` rotates refresh token with reuse protection.
  - `GET /admin/queues` opens Bull Board for Queue monitoring.

---

## 8. Monitoring, Telemetry & Healthchecks

### Standard Healthcheck Endpoint:
```http
GET /health
```
Response:
```json
{
  "status": "ok",
  "timestamp": "2026-08-25T22:15:00.000Z",
  "uptime": 3600.5
}
```

### Prometheus Metrics Endpoint:
```http
GET /metrics
```
Provides:
- `http_requests_total{method="POST",route="/api/workflows",status="201"}`
- `http_request_duration_ms_bucket`
- `agentflow_node_executions_total`
- `agentflow_execution_duration_ms`

---

## 9. Disaster Recovery & Zero-Downtime Secret Rotation

### Zero-Downtime `JWT_SECRET` Rotation Procedure:
1. Generate new 64-character secret: `NEW_SECRET=$(openssl rand -hex 32)`.
2. Update environment variables:
   - Set `JWT_SECRET_PREVIOUS` to the current `JWT_SECRET`.
   - Set `JWT_SECRET` to `$NEW_SECRET`.
3. Deploy API service. Active sessions will authenticate seamlessly against `JWT_SECRET_PREVIOUS` and receive new tokens upon refresh.
4. After `REFRESH_EXPIRES_IN` (e.g. 7 days), remove `JWT_SECRET_PREVIOUS`.

### Worker Graceful Shutdown:
The worker listens for `SIGTERM` and `SIGINT`, pauses queue intake, allows in-flight workflow nodes to finish execution, and safely closes Redis connections before process termination.
