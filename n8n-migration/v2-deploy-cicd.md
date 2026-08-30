# Deploy e CI/CD — AgentFlow

> **Missão:** Projetar pipeline de entrega e operação de deploy para a plataforma AgentFlow (recriação n8n, execução 24/7).
> **Work dir:** `n8n-migration/`
> **Data:** 2026-08-20
> **Status:** DESIGN — não implementar, não commitar, não fazer deploy real
> **Base:** `briefs/prompt-deploy-cicd.md`, harmonizado com `v2-arquitetura-cloud.md`, `v2-operations.md`, `v2-test-strategy.md`, `v2-database-schema.md`, `v2-security-spec.md`, `setup-dev.md`, `docker-compose.yml`, `apps/*/Dockerfile`, `.github/workflows/{ci,deploy}.yml`.

---

## 1. Visão geral

O AgentFlow é um monorepo **pnpm + Turborepo** com TypeScript:

```
apps/
├── api/   Fastify 5 (REST API + worker bootstrap + scheduler)   port 3001
└── web/   Next.js 15 + React 19 + @xyflow/react                 port 3000
packages/
├── database/  Prisma 6 schema + seed + migrations
└── shared/    Zod schemas + types compartilhados
```

**Serviços do plano de controle (control plane)** — conforme `v2-arquitetura-cloud.md`:

| Serviço            | Imagem                 | Entrypoint                  | Porta  | Observação                                          |
|--------------------|------------------------|-----------------------------|--------|-----------------------------------------------------|
| API                | `agentflow-api`        | `node dist/server.js`       | 3001   | Fastify: rotas REST, webhooks, health               |
| Worker             | `agentflow-api`        | `node dist/worker.js`       | —      | BullMQ Worker (fila `workflows`), concurrency 5     |
| Scheduler          | `agentflow-api`        | `node dist/scheduler.js`    | —      | Cron distribuído, leader election via Redis SETNX  |
| Webhook Gateway    | `agentflow-webhook`    | (Fastify plugin)            | 3001   | HMAC, dedup, fila offline; pode ser sidecar do API  |
| Web (dashboard)    | `agentflow-web`        | `node server.js` (standalone)| 3000 | Next.js App Router, editor visual                  |
| Postgres           | `postgres:16-alpine`   | —                           | 5432   | Fonte de verdade                                   |
| Redis              | `redis:7-alpine`       | —                           | 6379   | BullMQ filas + cache                               |
| Object storage     | S3/minIO               | —                           | 9000   | Artefatos/binários                                  |

> O repositório já possui `apps/api/Dockerfile` e `apps/web/Dockerfile` (multi-stage, `node:22-alpine`). O `docker-compose.yml` sobe `api`, `worker`, `web`, `postgres`, `redis`. O deploy atual usa **Vercel (web)** + **Railway (api via Docker)** (ver `.github/workflows/deploy.yml`).

---

## 2. Arquitetura de entrega

### 2.1 Diagrama ASCII — pipeline completo

```
                        ┌──────────────────────────────────────────────┐
                        │  DESENVOLVEDOR (push/PR no GitHub)           │
                        └───────────┬──────────────────────────────────┘
                                    │
                        ┌───────────▼──────────────────────────────────┐
                        │  CI (GitHub Actions)                         │
                        │  gates: lint → typecheck → unit → integration│
                        │  → contract → n8n-parity → e2e → build       │
                        │  → image scan (trivy/grype)                   │
                        └───────────┬──────────────────────────────────┘
                                    │ imagem assinada + tag semver
                                    │ publicada no registry (GHCR/ACR)
                 ┌──────────────────┼──────────────────────────────────────────┐
                 ▼                  ▼                                          ▼
          ┌────────────┐   ┌───────────────┐                         ┌────────────────┐
          │  PREVIEW   │   │  STAGING      │                         │  PRODUCTION    │
          │  (por PR)  │   │  (espelho prod)│                         │  (blue/green)  │
          │ ephemeral  │   │  dados sintéticos│                        │  rollout canary│
          │ k8s namespace│  │  migrations expand│                      │  10% → 50% →100%│
          └──────┬─────┘   └──────┬────────┘                         └──────┬───────┘
                 │                │                                          │
          ┌──────▼───────┐  ┌──────▼────────┐                      ┌───────▼────────┐
          │  deploy k8s  │  │  deploy k8s   │                      │  deploy k8s    │
          │  helm --dry-run│ │ migrations up│                      │  canary +      │
          │  + smoke test  │ │ + smoke test  │                      │  health checks │
          └──────────────┘  └──────┬────────┘                      └───────┬────────┘
                                   │                                        │
                           ┌───────▼────────┐                   ┌─────────▼──────┐
                           │  promote staging │                   │  rollback auto │
                           │  → production    │◄──────────────────┤  on health fail│
                           └──────────────────┘                   └────────────────┘
                                    │                                        │
                           ┌────────▼────────┐                    ┌─────────▼────────┐
                           │  v1 (old) kept  │                    │  v-1 (old)       │
                           │  ready for rb   │                    │  kept 5m → rmb   │
                           └─────────────────┘                    └──────────────────┘
```

### 2.2 Fluxo de aprovação por ambiente

| Gate                  | Onde validado                | Falha →                |
|-----------------------|------------------------------|------------------------|
| Build + test          | GitHub Actions (CI)          | PR bloqueada           |
| Image scan            | GitHub Actions (`trivy`)     | Push de imagem bloqueado se CRITICAL |
| Smoke test (preview)  | Namespace ephemeral k8s      | Revert do deploy da PR |
| Contract/parity       | CI obrigatório               | PR não mergea          |
| Health pós-deploy     | Probe readiness + /health    | Rollback automático    |
| SLO pós-promoção      | SLO burn rate no Grafana     | Rollback/alerta on-call|

---

## 3. Docker

### 3.1 Estratégia de imagens

- **Um monorepo, imagens distintas por serviço.** Build único no CI gera `agentflow-api`, `agentflow-web`, `agentflow-scheduler` (mesmo binário do API, entrypoint distinto) — evita rebuild duplicado e garante versão alinhada.
- **Multi-stage build** (`node:22-alpine` build → `node:22-alpine` slim runner).
- **Non-root** obrigatório (`USER nodeapi:nodejs`, gid 1001) — corrige L-01 do audit.
- **Imutabilidade:** tag semver + SHA curto; nunca `:latest` em prod.
- **.dockerignore** para excluir `.git`, `node_modules`, `tests`, `n8n-migration`, logs.

### 3.2 Dockerfile — API / Worker / Scheduler (base única)

```dockerfile
# apps/api/Dockerfile  — produção revisada (não altera código fonte)
FROM node:22.21.0-alpine AS base
RUN apk add --no-cache dumb-init libc6-compat ca-certificates tini

# ── build ──────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/database/package.json packages/database/tsconfig.json* ./packages/database/
COPY packages/shared/package.json packages/shared/tsconfig.json* ./packages/shared/
COPY apps/api/package.json apps/api/tsconfig.json* ./apps/api/
RUN pnpm install --frozen-lockfile --filter @agentflow/api...

FROM deps AS build
WORKDIR /app
COPY packages/database/prisma ./packages/database/prisma
COPY packages/shared/src ./packages/shared/src
COPY apps/api/src ./apps/api/src
RUN pnpm --filter @agentflow/database generate
RUN pnpm --filter @agentflow/shared build
RUN pnpm --filter @agentflow/api build

# ── runtime ───────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs agentflow
USER agentflow

COPY --from=build --chown=agentflow:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=agentflow:nodejs /app/packages/database/node_modules/@prisma/client ./node_modules/.prisma
COPY --from=build --chown=agentflow:nodejs /app/packages/shared/dist ./packages/shared/dist

WORKDIR /app/apps/api

# Healthcheck: liveness probe (processo up + porta aceita)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get('http://127.0.0.1:3001/health',(r)=>{process.exit(r.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.setTimeout(5000,()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server.js"]
```

> O binário `dist/worker.js` e `dist/scheduler.js` compartilham a mesma imagem. O entrypoint muda por serviço no compose/k8s (`CMD ["node","dist/worker.js"]`).

### 3.3 Dockerfile — Web (Next.js standalone)

```dockerfile
# apps/web/Dockerfile  — build otimizado
FROM node:22.21.0-alpine AS base
RUN apk add --no-cache libc6-compat ca-certificates tini

FROM base AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json* ./packages/shared/
COPY apps/web/package.json apps/web/tsconfig.json* ./apps/web/
RUN pnpm install --frozen-lockfile --filter @agentflow/web...

FROM deps AS build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://api:3001}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
WORKDIR /app
COPY packages/shared/src ./packages/shared/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
RUN pnpm --filter @agentflow/shared build
RUN pnpm --filter @agentflow/web build   # gera .next/standalone + .next/static

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["tini", "--"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1:3000/',{timeout:5000},(r)=>{if(r.statusCode>=200&&r.statusCode<500)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
```

### 3.4 Healthchecks — modelo de endpoint

A API expõe `/health` (Fastify, `src/routes/health.ts`). Para 24/7, estendemos com `/ready` e `/live`:

```typescript
// apps/api/src/routes/health.ts (extensão — não implementa, documenta o contrato)
app.get("/health",  /* 200 ok sem checks internos — liveness rápido */);
app.get("/ready",   /* DB + Redis + BullMQ conectados, migrations aplicadas */);
app.get("/live",    /* processo vivo, memória/CPU dentro de limites */);
```

**Contract:**
- `/health` → `{"status":"ok","timestamp":...}` (liveness, sempre 200 a menos que processo morto).
- `/ready` → `200` se conexões OK, `503` se Postgres/Redis indisponíveis. K8s *readinessProbe* usa isso.
- `/live` → `200` se heap < 85% do limite e event loop < 950ms; `503` caso contrário. K8s *livenessProbe* usa isso.

---

## 4. Orquestração

### 4.1 docker-compose (dev + small prod)

Reutiliza o `docker-compose.yml` existente, estendido para produção-small (não-root, secrets, replicas):

```yaml
# docker-compose.prod.yml — override sobre o existente
services:
  api:
    image: ghcr.io/agentflow/agentflow-api:${VERSION:-v0.1.0}
    read_only: true
    restart: unless-stopped
    replicas: 2            # (compose v2.20+ scale)
    env_file:
      - .env              # nunca committed; .env.production no repo (sem valores)
    secrets:
      - jwt_secret
      - credential_key
    environment:
      DATABASE_URL: postgresql://agentflow:${POSTGRES_PASSWORD}@postgres:5432/agentflow?schema=public
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/ready"]
      interval: 30s; timeout: 5s; retries: 5; start_period: 20s
    deploy:
      resources:
        limits:   { memory: 1Gi, cpus: "1.0" }
        reservations: { memory: 512Mi, cpus: "0.5" }

  worker:
    image: ghcr.io/agentflow/agentflow-api:${VERSION:-v0.1.0}
    command: ["node", "apps/api/dist/worker.js"]
    replicas: 3
    env_file: [.env]
    secrets: [jwt_secret, credential_key]
    environment:
      DATABASE_URL: postgresql://agentflow:${POSTGRES_PASSWORD}@postgres:5432/agentflow?schema=public
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
      QUEUE_CONCURRENCY: "10"
    deploy:
      resources:
        limits: { memory: 2Gi, cpus: "2.0" }; reservations: { memory: 1Gi, cpus: "1.0" }

  scheduler:
    image: ghcr.io/agentflow/agentflow-api:${VERSION:-v0.1.0}
    command: ["node", "apps/api/dist/scheduler.js"]
    replicas: 1                       # leader-elected; mais de 1 = só 1 vence lock
    env_file: [.env]

  web:
    image: ghcr.io/agentflow/agentflow-web:${VERSION:-v0.1.0}
    replicas: 2
    ports: ["80:3000"]
    env_file: [.env]

secrets:
  jwt_secret:       { external: true, name: agentflow-jwt-secret }
  credential_key:   { external: true, name: agentflow-cred-key }

volumes:
  postgres_data: { driver: local }
  redis_data:    { driver: local }
```

> **Small prod:** compose é suficiente até ~5k execuções/dia. Acima disso, migre para k8s (§4.2).

### 4.2 Kubernetes (produção escalável)

#### 4.2.1 Namespace e configmaps

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata: { name: agentflow-prod }
```

```yaml
# k8s/base/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: agentflow-config, namespace: agentflow-prod }
data:
  NODE_ENV: production
  PORT: "3001"
  DATABASE_URL: postgresql://agentflow:${POSTGRES_PASSWORD}@postgres.agentflow-prod:5432/agentflow?schema=public
  REDIS_URL: redis://redis-master.agentflow-prod:6379
  JWT_EXPIRES_IN: 15m
  REFRESH_EXPIRES_IN: 7d
  EXECUTION_TIMEOUT_MS: "300000"
  NODE_TIMEOUT_MS: "60000"
  QUEUE_CONCURRENCY: "10"
```

#### 4.2.2 Secrets (externo — HashiCorp Vault / Doppler)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: agentflow-secrets
  namespace: agentflow-prod
type: Opaque
stringData:
  jwt-secret:            ${VAULT:secret/agentflow/prod:jwt_secret}
  credential-key:        ${VAULT:secret/agentflow/prod:credential_encryption_key}
  postgres-password:     ${VAULT:secret/agentflow/prod:postgres_password}
  stripe-secret-key:     ${VAULT:secret/agentflow/prod:stripe_secret_key}
```

> Em k8s, monte secrets via `envFrom` (nunca em imagem). Use **sealed-secrets** ou **external-secrets** operator para sync do Vault → k8s Secret.

#### 4.2.3 Deploy — API

```yaml
# k8s/base/deployment-api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentflow-api
  namespace: agentflow-prod
  labels: { app: agentflow-api }
spec:
  replicas: 2
  selector:
    matchLabels: { app: agentflow-api }
  template:
    metadata:
      labels: { app: agentflow-api }
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3001"
        prometheus.io/path: "/metrics"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: api
          image: ghcr.io/agentflow/agentflow-api:v0.1.0@sha256:abcdef123456
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3001
          envFrom:
            - configMapRef: { name: agentflow-config }
            - secretRef:     { name: agentflow-secrets }
          env:
            - name: POD_IP
              valueFrom: { fieldRef: { fieldPath: status.podIP } }
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "1500m", memory: "1Gi" }
          livenessProbe:
            httpGet: { path: "/live", port: 3001 }
            initialDelaySeconds: 20; periodSeconds: 30; timeoutSeconds: 5; failureThreshold: 3
          readinessProbe:
            httpGet: { path: "/ready", port: 3001 }
            initialDelaySeconds: 10; periodSeconds: 10; timeoutSeconds: 3; failureThreshold: 3
          startupProbe:
            httpGet: { path: "/health", port: 3001 }
            failureThreshold: 30; periodSeconds: 5
          lifecycle:
            preStop:
              exec: { command: ["/bin/sh","-c","curl -XPOST localhost:3001/drain || true"] }
```

#### 4.2.4 HPA — API (CPU) e Worker (fila)

```yaml
# k8s/base/hpa-api.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: agentflow-api, namespace: agentflow-prod }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: agentflow-api }
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 60 } }
    - type: Pods
      pods:
        metric: { name: request_duration_p95 }
        target: { type: AverageValue, averageValue: "500ms" }
```

```yaml
# k8s/base/hpa-workers.yaml — escala por profundidade da fila BullMQ
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: agentflow-worker }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: agentflow-worker }
  minReplicas: 2
  maxReplicas: 30
  behavior:
    scaleDown: { stabilizationWindowSeconds: 180, policies: [{type: Percent, value: 10, periodSeconds: 60}] }
    scaleUp:   { stabilizationWindowSeconds: 60, policies: [{type: Percent, value: 50, periodSeconds: 60}] }
  metrics:
    - type: External
      external:
        metric: { name: bullmq_queue_waiting, selector: { matchLabels: { queue: workflows } } }
        target: { type: Value, value: "50" }    # 50 jobs waiting → scale up
```

> A métrica `bullmq_queue_waiting` exige o **Prometheus exporter do BullMQ** (`@btm24/bull-board` ou `bull-mq-exporter`). Se não disponível, use HPA por CPU como fallback (menos preciso).

#### 4.2.5 PDB e deploy estratégico

```yaml
# k8s/base/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: agentflow-api-pdb, namespace: agentflow-prod }
spec:
  minAvailable: 1
  selector: { matchLabels: { app: agentflow-api } }
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: agentflow-worker-pdb, namespace: agentflow-prod }
spec:
  minAvailable: 1
  selector: { matchLabels: { app: agentflow-worker } }
```

#### 4.2.6 Services, Ingress e Gateway

```yaml
# k8s/base/services.yaml
apiVersion: v1
kind: Service
metadata: { name: agentflow-api, namespace: agentflow-prod }
spec:
  selector: { app: agentflow-api }
  ports: [{ port: 3001, targetPort: 3001, name: http }]
---
apiVersion: v1
kind: Service
metadata:
  name: agentflow-webhook
  namespace: agentflow-prod
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing: "true"
spec:
  selector: { app: agentflow-webhook }
  ports: [{ port: 80, targetPort: 3001, name: webhook }]
  type: ClusterIP
---
# Ingress público com TLS — webhook gateway + API
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agentflow-ingress
  namespace: agentflow-prod
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: HTTPS
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "server: AgentFlow";
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts: [api.agentflow.io, webhook.agentflow.io]
      secretName: agentflow-tls
  rules:
    - host: api.agentflow.io
      http:
        paths:
          - path: /health; /ready; /live; /api/
            pathType: Prefix
            backend: { service: { name: agentflow-api, port: { number: 3001 } } }
    - host: webhook.agentflow.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: agentflow-webhook, port: { number: 80 } } }
```

#### 4.2.7 Scheduler — leader election (únicoativo)

```yaml
# k8s/base/deployment-scheduler.yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: agentflow-scheduler, namespace: agentflow-prod }
spec:
  replicas: 1    # único ativo; failover via restartPolicy + leader election no app
  selector: { matchLabels: { app: agentflow-scheduler } }
  template:
    metadata: { labels: { app: agentflow-scheduler } }
    spec:
      containers:
        - name: scheduler
          image: ghcr.io/agentflow/agentflow-api:v0.1.0@sha256:abcdef123456
          command: ["node", "apps/api/dist/scheduler.js"]
          envFrom:
            - configMapRef: { name: agentflow-config }
            - secretRef:     { name: agentflow-secrets }
          # Leader election via Redis: SETNX lock com TTL 30s.
          # Se o líder morre, outro replica pega o lock em < 30s.
          lifecycle:
            preStop:
              exec: { command: ["/bin/sh","-c","curl -XPOST localhost:3001/scheduler/drain || true"] }
```

> O scheduler usa **leader election via Redis** (`SET key NX EX 30` com renovação a cada 10s). Em k8s, manter `replicas: 1` + `PodDisruptionBudget` é suficiente; para HA, aumente réplicas e deixe o lock fazer o arbitration.

#### 4.2.8 Service Mesh (opcional)

O **Istio** ou **Linkerd** é opcional. Recomendado para:
- mTLS entre pods (API ↔ Worker ↔ Postgres/Redis).
- Retry/circuit-breaker no webhook gateway.
- Observability (traffic metrics).

Trade-off: +complexidade operacional. Para small/medium, **skip**; use TLS na edge (nginx ingress + cert-manager) e confiança na rede do cluster.

```yaml
# Exemplo Istio (opcional) — DestinationRule com circuit breaker
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: agentflow-api-dr
  namespace: agentflow-prod
spec:
  host: agentflow-api
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http: { http1MaxPendingRequests: 50, http2MaxRequests: 100, maxRequestsPerConnection: 10 }
    outlierDetection:
      consecutive5xxErrors: 5; interval: 30s; baseEjectionTime: 60s
```

#### 4.2.9 Alternativas gerenciadas (compare)

| Plataforma | Deploy | Auto-esc. | TLS/DBaaS | Observabilidade | Trade-offs |
|------------|--------|-----------|-----------|-----------------|------------|
| **Kubernetes (EKS/GKE/AKS)** | Helm/Terraform | ✅ HPA + VPA | Externo | Full (Prometheus/Grafana) | Mais controle, maior complexidade |
| **Fly.io** | 1 comando (`fly deploy`) | ✅ Machine alloc | Voluntary + Postgres gerenciado | Básico | Simples, bom para small; vendor lock-in Fly |
| **Render** | Docker deploy | ✅ Auto | Postgres gerenciado | Básico | Simples; limits no plano free; region única |
| **Railway** | Docker deploy | ❌ manual | Postgres plugin | Básico | Atual: usado pelo `deploy.yml`; bom dev/POC |
| **Vercel (web)** | Auto | ✅ Edge | N/A | Full | Perfeito para Next.js web; API serverless não serve para workers longos |

**Recomendação:** `dev` = docker-compose local; `staging` + `prod` = **k8s (EKS)** com Postgres gerenciado (RDS) e Redis gerenciado (Valkey/ElastiCache). Small (<1k exec/dia) pode usar **Fly.io** até escalar. Web mantém Vercel (SSR + edge), mas API+workers vão para k8s.

---

## 5. CI/CD

### 5.1 Branch strategy

```
main  (protegida) ──────────────────────────────────► deploy prod (manual gate)
  │
  ├── PR (feature/*) ──► CI completo ──► preview k8s (efêmero)
  ├── hotfix/*     ──► CI ──► staging ──► prod (fast-track)
  └── release/*    ──► tag semver ──► imagem publicada
```

- **main** é proteção: exige PR aprovada + status checks verdes + 1 reviewer.
- **feature branches** → PR → preview environment (namespace k8s efêmero, destruído ao fechar PR).
- **Versionamento semântico:** `vMAJOR.MINOR.PATCH` (ex: `v0.2.0`). Tag no merge → imagem buildada + publicada.
- Tags docker: `ghcr.io/agentflow/agentflow-api:v0.2.0` e `:v0.2.0-sha.abc123`.

### 5.2 Pipeline de CI (GitHub Actions)

```
lint → typecheck → unit → integration → contract → n8n-parity → e2e → build → build-image → scan → push
```

```yaml
# .github/workflows/ci.yml — extensão (merge com o existente)
name: CI

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  # ── existente (lint, typecheck, test, build) mantido ──
  lint:        { ... }   # apps/api + apps/web + packages
  typecheck:   { ... }   # pnpm run typecheck
  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @agentflow/database generate
      - run: pnpm vitest run --coverage
      # coverage gate: >= 80% lines, >= 70% functions
  integration:
    name: Integration
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, ... }
      redis:    { image: redis:7, ... }
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @agentflow/database exec prisma migrate deploy
      - run: pnpm --filter @agentflow/database db:seed
      - run: pnpm vitest run -t integration
    env:
      DATABASE_URL: postgresql://agentflow:agentflow_dev@localhost:5432/agentflow_test?schema=public
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-key-32-chars-minimum-ok
      CREDENTIAL_ENCRYPTION_KEY: 0123456789abcdef...
  contract:
    name: Contract (n8n parity)
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run -t parity-n8n
      - run: pnpm vitest run -t contract
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @agentflow/web build
      - run: pnpm --filter @agentflow/api dev &    # start dev API
      - run: pnpm --filter @agentflow/web dev &     # start dev web
      - run: pnpm exec playwright test --workers=4
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report/ }
  build:
    name: Build
    needs: [lint, typecheck, unit, integration, contract, e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @agentflow/database generate
      - run: pnpm --filter @agentflow/shared build
      - run: pnpm --filter @agentflow/web build
      - run: pnpm --filter @agentflow/api build

  # ── build + scan + push de imagens ──
  image:
    name: Image (build + scan + push)
    needs: [build]
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - name: Generate semver tag
        id: semver
        run: |
          echo "sha=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
          # Se tag, usa; senão, sha
          echo "tag=v$(cat package.json | jq -r .version)-sha-${{ steps.semver.sha }}" >> $GITHUB_OUTPUT
      - name: Build API image
        run: docker build --pull --build-arg VERSION=${{ steps.semver.tag }} -t ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }} -f apps/api/Dockerfile .
      - name: Build Worker image
        run: docker build -t ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }} -f apps/api/Dockerfile --target runtime --build-arg CMD="worker" .
      - name: Build Web image
        run: docker build -t ghcr.io/agentflow/agentflow-web:${{ steps.semver.tag }} -f apps/web/Dockerfile .
      - name: Scan images (trivy)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }}
          severity: CRITICAL,HIGH
          exit-code: 1
          ignore-unfixed: true
          vuln-type: os,library
      - name: Scan web image (trivy)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/agentflow/agentflow-web:${{ steps.semver.tag }}
          severity: CRITICAL,HIGH
          exit-code: 1
      - name: Sign and push images (cosign)
        uses: sigstore/cosign-installer@v3
        with: { cosign-release: "latest" }
      - run: cosign sign --yes ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }}
      - run: cosign sign --yes ghcr.io/agentflow/agentflow-web:${{ steps.semver.tag }}
      - name: Push API image
        run: docker push ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }}
      - name: Push Web image
        run: docker push ghcr.io/agentflow/agentflow-web:${{ steps.semver.tag }}
      - name: Provenance attestation
        uses: actions/attest-provenance@v2
        with:
          subject: ghcr.io/agentflow/agentflow-api:${{ steps.semver.tag }}
```

> **Supply chain hardening (M-06 do audit):** `trivy` bloqueia CRITICAL/HIGH; `cosign` assina imagens + attestation; `gitsign` assina commits; SBOM (`syft`/`cyclonedx`) anexado ao release. `node:22.21.0-alpine` (versão fixa, não `:latest`).

### 5.3 Gate de merge

| Stage | Timeout | Gate                              |
|-------|---------|-----------------------------------|
| lint + typecheck | 10 min | 0 erros |
| unit | 10 min | coverage ≥ 80% lines |
| integration | 15 min | 0 failures |
| contract + parity | 15 min | 100% dos nodes-mapeados passam |
| e2e | 15 min | 0 failures críticos |
| build | 15 min | exit 0 |
| image scan | 10 min | 0 CRITICAL, CRITICAL>exit-code=1 |
| push + sign | 10 min | cosign OK |

---

## 6. Migrations de banco

### 6.1 Estratégia expand/contract (N-1 compatibility)

Princípio: **nunca quebrar a versão rodando**. Sempre 3 fases:

```
Fase 1 (EXPAND):  migration ADDITIVE  → nova coluna/index/tipo compatível com código antigo
  - código antigo roda sem quebrar (coluna nova nullable, código antigo ignora)
  - código novo pode usar

Fase 2 (DEPLOY):  deploy do código novo (usa coluna nova)

Fase 3 (CONTRACT):  migration DESTRUTIVA → drop coluna/index antigo (janela de manutenção)
  - apenas após todos os réplicas/processos usareem a nova versão
```

### 6.2 Lock de migração

- Prisma Migrate (`prisma migrate deploy`) é **idempotente** e usa lock de migração via tabela `_Migrations` no Postgres.
- No CI/CD, rode migrações **antes** do deploy do novo código (blue/green: migra no green antes de traffic-switch).
- Em k8s, migração roda como **init container** ou **job** (ver §6.4).

### 6.3 Rollback de schema

- Migrations Prisma são **forward-only**. Rollback = job de re-migração inversa (manual/SQL).
- Para rollback rápido: mantenha **migration revert SQL** ao lado de cada migração:
  `migrations/<timestamp>_<nome>/migration.sql` + `migrations/<timestamp>_<nome>/revert.sql`.
- Em produção, rollback de schema só em janela de manutenção (ex: 2h madrugada). Rollback de **código** (imagem) é imediato e não toca schema (compat N-1).

### 6.4 Job de migração (k8s)

```yaml
# k8s/base/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate-{{ .Values.image.tag }}
  namespace: agentflow-prod
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: ghcr.io/agentflow/agentflow-api:{{ .Values.image.tag }}
          command: ["sh", "-c"]
          args:
            - |
              set -e
              echo "🔒 Acquiring migration lock..."
              pnpm --filter @agentflow/database exec prisma migrate deploy \
                --schema=../packages/database/prisma/schema.prisma
              echo "✅ Migrations applied"
              # Smoke de schema
              node -e "const {prisma}=require('./dist'); prisma.$queryRaw\`SELECT 1\`.then(()=>{console.log('DB reachable')},e=>{console.error(e);process.exit(1)})"
          envFrom:
            - configMapRef: { name: agentflow-config }
            - secretRef:     { name: agentflow-secrets }
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits:   { cpu: "500m", memory: "256Mi" }
```

### 6.5 Migrações destrutivas (deferred)

Exemplo: drop de coluna `Workflow.old_config` usada pela v0.1:

```sql
-- migrations/20260825000000_drop_old_config/migration.sql
-- FASE EXPAND (rodar antes do deploy da v0.3):
ALTER TABLE "Workflow" ADD COLUMN "config_v2" JSONB;
UPDATE "Workflow" SET "config_v2" = "config"::JSONB WHERE "config_v2" IS NULL;

-- migrations/20260826000000_drop_old_config/migration.sql
-- FASE CONTRACT (após todos rodarem v0.3+):
ALTER TABLE "Workflow" DROP COLUMN IF EXISTS "config";
```

### 6.6 Dados grandes em lotes

Migrações de dados (`UPDATE`/`INSERT` em tabelas grandes) usam job background (BullMQ) com lock:

```typescript
// Pseudocódigo — job BullMQ "migration:backfill"
async function backfillWorkflowsBatch(offset: number, batchSize = 1000) {
  const batch = await prisma.workflow.findMany({
    where: { config_v2: null },
    select: { id: true, config: true },
    take: batchSize,
    skip: offset,
  });
  if (batch.length === 0) return; // done
  await prisma.$transaction(async (tx) => {
    for (const w of batch) {
      await tx.workflow.update({
        where: { id: w.id },
        data: { config_v2: transformConfig(w.config) },
      });
    }
  });
  // reenqueue self for next batch
  await migrationQueue.add("backfill", { offset: offset + batchSize });
}
```

### 6.7 N-1 compatibility checklist (antes de merge)

- [ ] Nova coluna é nullable **OU** tem default; código antigo não quebra.
- [ ] Nome de coluna/index não conflita com produção atual.
- [ ] Código novo trata coluna antiga ausente (defensivo).
- [ ] Migração roda < 5 min (ou em background job).
- [ ] Rollback revirtível não perde dados.

---

## 7. Ambientes e promoção

### 7.1 Matriz de ambientes

| Ambiente | Infra                    | Dados                    | Observação                          |
|----------|--------------------------|--------------------------|-------------------------------------|
| **dev**  | docker-compose local     | In-memory ou local PG    | Hot-reload, tudo `localhost`        |
| **preview** | k8s namespace efêmero | Sintético                | Por PR; destruído em 1h após fechar |
| **staging** | k8s/staging (small)   | Espelho prod (anônimo)   | Testes smoke + integração           |
| **production** | k8s/prod (multi-AZ) | Real                     | Blue/green ou rolling canary        |

### 7.2 Dados

- **staging** usa banco espelhado (snapshot) ou dados sintéticos (schema `v2-test-strategy.md` §14). **Nunca dados reais fora de prod.**
- **Preview** não tem banco próprio — aponta para um DB de teste compartilhado ou cria um PostgreSQL efêmero (Testcontainers no CI).

### 7.3 Promoção staging → produção

Fluxo **Argo Rollouts** (canary) ou **manual via Helm**:

```
1. Image tag v0.2.0 já no registry (signed)
2. staging: helm upgrade --install agentflow ./charts --namespace staging --set image.tag=v0.2.0
   → migrations (init) → smoke → contract test
3. Manual approval: "Promover para prod?"
4. prod: helm upgrade --install agentflow ./charts \
     --namespace production \
     --set image.tag=v0.2.0 \
     --set strategy.type=Canary \
     --set strategy.canary.steps='{set weight: 10, pause: {duration: 60s}, set weight: 50, pause: {duration: 120s}}'
5. Monitor: SLO burn, error rate < 0.1%, latency p95 < 500ms
6. Se falhar em qualquer step → argo rollouts undo → rollback automático
```

### 7.4 Preview environment por PR (efêmero)

```yaml
# .github/workflows/preview.yml
name: Preview
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
  pull_request_closed:

jobs:
  deploy-preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          NAMESPACE=pr-${{ github.event.number }}
          helm upgrade --install $NAMESPACE ./charts \
            --namespace $NAMESPACE --create-namespace \
            --set image.tag=sha-${{ github.sha }} \
            --set ingress.host=pr-${{ github.event.number }}.agentflow.io
          echo "PREVIEW_URL=https://pr-${{ github.event.number }}.agentflow.io" >> $GITHUB_ENV
      - run: echo "Preview: ${{ env.PREVIEW_URL }}"
```

---

## 8. Secrets

### 8.1 Princípios (do audit `v2-security-spec.md` + `L-02`)

- Nunca em imagem, nunca em `.env` committed, nunca em `localStorage` (web tokens).
- Rotacionar a cada 90 dias (JWT_SECRET, DEK) ou imediatamente após vazamento.
- Criptografia de credenciais: **envelope AES-256-GCM** (conforme `crypto.ts` e `v2-security-spec.md` §5).

### 8.2 Tabela de secrets

| Secret                    | Gerador                | Onde armazenar                | Frequência |
|---------------------------|------------------------|-------------------------------|------------|
| `JWT_SECRET`              | `openssl rand -hex 32` | Vault / Doppler / GH Secrets  | 90d        |
| `REFRESH_SECRET`          | `openssl rand -hex 32` | Vault                         | 90d        |
| `CREDENTIAL_ENCRYPTION_KEY` | `openssl rand -hex 32` | Vault (KEK env)             | 90d        |
| `STRIPE_SECRET_KEY`       | Stripe Dashboard       | Vault                         | 1y         |
| `STRIPE_WEBHOOK_SECRET`   | Stripe CLI             | Vault                         | 1y         |
| `NVIDIA_NIM_API_KEY`      | NVIDIA                 | Vault                         | 1y         |
| `POSTGRES_PASSWORD`       | `openssl rand -hex 32` | RDS IAM / Vault               | 90d        |
| `REDIS_PASSWORD`          | `openssl rand -hex 32` | ElastiCache ACL / Vault       | 90d        |

### 8.3 Secrets no CI

- GitHub Actions usa `secrets.*` (never hardcoded).
- `secrets.OIDC_TOKEN` para auth no registry (GHCR já funciona com GHA identity).
- Scan de secret em PR: `gitleaks` (bloqueia merge se achar chave).

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scan
on: [push, pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        with: { config: .gitleaks.toml, report_format: sarif }
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

### 8.4 Docker secrets (compose) vs k8s

- **Compose:** `secrets:` externos (gerenciados pelo orchestrator do deploy: `docker secret create`).
- **K8s:** `Secret` via `external-secrets` operator → sync do Vault. Rotate muda o Secret → pods rollout automático (`annotations: checksum/secret: {{ include (...) }}`).

```yaml
# k8s — restart automático quando secret muda
spec:
  template:
    metadata:
      annotations:
        checksum/secret: {{ include (print _.Template.BasePath "/secrets.yaml") . | sha256sum }}
```

---

## 9. Escala

### 9.1 Workers (fila BullMQ)

- **HPA por profundidade da fila** (`bullmq_queue_waiting` > 50 → scale up) — ver §4.2.5.
- **Concorrência** por worker: `QUEUE_CONCURRENCY=10` (env, `worker.ts`).
- **Job preemption:** jobs de trigger high-priority (webhook) usam `priority` no BullMQ; retries com exponential backoff (`attempts`, `backoff`).
- **Dead-letter queue:** jobs que falham N vezes vão para `workflows:failed` (DLQ); alerta on-call.

```typescript
// apps/api/src/worker.ts (extensão — documenta, não altera)
const worker = new Worker("workflows", handler, {
  connection,
  concurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
  lockDuration: 30000,        // renewal
  autorun: true,
  removeOnFail: { amount: 5000 },
  removeOnComplete: { amount: 1000 },
  settings: {
    lockDuration: 30000,
    backpressure: 100,        // max jobs na fila antes de recusar
  },
});
worker.on("failed", () => { /* emit prometheus counter */ });
```

### 9.2 API (Fastify)

- **HPA por CPU** (target 60%) + **request latency p95** (< 500ms) — ver §4.2.4.
- **Rate limiting:** `@fastify/rate-limit` ≥ 11.2.0 (corrige CVE-2026-15144 do audit). Store em Redis para multi-instance.
- **Slow query timeout:** Postgres `statement_timeout=10s` via `DATABASE_URL` ou pool config.

### 9.3 Scheduler (cron)

- **Singleton ativo** (leader election Redis `SETNX`). Réplicas stand-by não executam.
- Em k8s: `replicas: 1` + PDB `minAvailable: 1`. Para HA: `replicas: 3` + leader election no app.
- **Jitter:** ±30s nos cron jobs para evitar thundering herd.

### 9.4 Webhook Gateway

- **HPA por request rate** (target 1000 RPS/pod).
- **Dedup:** HMAC + nonce em Redis (`SETEX webhook:<nonce> 60 1` → reject replay).
- **Fila offline:** webhooks recebidos quando worker offline → persistidos em `webhook_events` (Postgres) → reprocessados.

### 9.5 Limites de recursos (tabela)

| Serviço      | requests          | limits           | PDB minAvailable |
|--------------|-------------------|------------------|------------------|
| API          | cpu 500m / mem 512Mi | cpu 1500m / mem 1Gi | 1 (de N=2)      |
| Worker       | cpu 500m / mem 1Gi   | cpu 2000m / mem 2Gi | 1 (de N=2)      |
| Scheduler    | cpu 100m / mem 256Mi | cpu 500m / mem 512Mi | 0 (N=1)          |
| Web          | cpu 250m / mem 256Mi | cpu 1000m / mem 512Mi | 2 (de N=2)      |
| Webhook GW   | cpu 200m / mem 256Mi | cpu 1000m / mem 512Mi | 1 (de N=2)      |

### 9.6 Sharding

- **Fila única** (`workflows`) hoje. Para >10k exec/dia, shard por **org_id** ou **região**:
  - Filas por região: `workflows:us-east`, `workflows:eu-west`.
  - Workers pool dedicada por shard.
- **Multi-região (opcional):** k8s multi-cluster (Cluster API) + read-replica PostGIS; latência < 50ms dentro da região.

---

## 10. Observabilidade de deploy

### 10.1 Métricas de release (Prometheus)

```
# Métricas expostas em /metrics pelo API (Fastify metrics plugin)
agentflow_build_info{version="v0.2.0", git_sha="abc123"} 1
agentflow_deploy_timestamp{env="prod", version="v0.2.0"} 1.72e9
agentflow_execution_count{status="success|failed|running", version="v0.2.0"} 42
agentflow_error_rate{version="v0.2.0"} 0.001
agentflow_queue_depth{queue="workflows"} 12
agentflow_worker_heartbeat{worker="worker-abc"} 1.72e9
agentflow_slo_burn_rate{window="5m"} 0.5   # 0 = no burn, 14.4 = burn budget
```

### 10.2 Canary deployment

```yaml
# k8s — Canary com Argo Rollouts (recomendado p/ prod)
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: agentflow-api
spec:
  replicas: 4
  strategy:
    canary:
      steps:
        - setWeight: 10    # 10% do tráfego
        - pause: { duration: 60s }
        - analysis:         # verifica SLOs
            templates: [slo-pass-analysis]
            startingStep: 1
        - setWeight: 50
        - pause: { duration: 120s }
        - setWeight: 100
  revisionHistoryLimit: 5
  selector: { matchLabels: { app: agentflow-api } }
  template: { ... # mesmo do Deployment }
```

### 10.3 Feature flags (deploy gradual)

Feature flags via **config no banco** (`feature_flags` table) ou **Unleash** (self-hosted). Exemplo de flag:

```sql
CREATE TABLE "FeatureFlag" (
  "key" TEXT PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rollout_pct" INTEGER DEFAULT 0,   -- 0-100
  "org_ids" TEXT[] DEFAULT '{}',      -- nil = all orgs
  "created_at" TIMESTAMP DEFAULT now()
);
```

```typescript
// apps/api/src/lib/flags.ts (documenta, não altera)
export async function isEnabled(flag: string, orgId: string): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key: flag } });
  if (!row || !row.enabled) return false;
  if (row.org_ids.length === 0) return hashOrg(orgId) < row.rollout_pct;
  return row.org_ids.includes(orgId);
}
```

### 10.4 Canary sem flags (image-based)

- 10% pods recebem imagem `v0.2.0`; 90% ficam em `v0.1.0`.
- Métricas: `error_rate`, `latency_p95`, `slo_burn_rate` — se `error_rate_v0.2.0 > 2% * baseline` → rollback.

### 10.5 Dashboard de deploy

Grafana dashboard com:
- **Panel: Error rate by version** — filtra `image_version`, alerta se `rate(errors{version:v0.2.0}[5m]) > 0.02 * baseline`.
- **Panel: Latency p95 by version** — alerta se p95 > 500ms por 5 min.
- **Panel: Queue depth** — alerta se > 1000 por 2 min.
- **Panel: SLO burn** — `sum(rate(slo_burn[5m])) > 14.4` → ticket on-call.

```yaml
# k8s — ServiceMonitor (Prometheus Operator)
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata: { name: agentflow-api, namespace: agentflow-prod }
spec:
  selector: { matchLabels: { app: agentflow-api } }
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
      relabelings:
        - targetLabel: environment
          replacement: production
```

---

## 11. Scripts e runbooks

### 11.1 Makefile (CLI de deploy)

```makefile
.PHONY: deploy deploy-staging deploy-prod rollback health-check

VERSION ?= $(shell git describe --tags --always --dirty)

## Preflight: lint + typecheck + test local antes do commit
preflight:
	pnpm lint
	pnpm typecheck
	pnpm test

## Build local de todas as imagens
build-images:
	docker build -t agentflow/api:${VERSION} -f apps/api/Dockerfile .
	docker build -t agentflow/web:${VERSION} -f apps/web/Dockerfile .

## Dry-run k8s (Helm)
deploy-dry-run:
	helm upgrade --install agentflow ./charts --namespace staging --dry-run=client

## Deploy staging
deploy-staging: build-images
	helm upgrade --install agentflow ./charts --namespace staging \
		--set image.tag=${VERSION} --wait --timeout=5m
	$(MAKE) health-check NAMESPACE=staging

## Deploy production (canary)
deploy-prod:
	helm upgrade --install agentflow ./charts --namespace production \
		--set image.tag=${VERSION} \
		--set strategy.type=Canary
	# Health check automático por 10 min
	@sleep 600 && $(MAKE) health-check NAMESPACE=production

## Health check (verifica pods vivos + ready + 1 exec de teste)
health-check:
	kubectl -n ${NAMESPACE} wait --for=condition=ready pod -l app=agentflow-api --timeout=300s
	@echo "✅ API ready"
	@curl -fsSL https://api.agentflow.io/health || (echo "❌ health failed" && exit 1)

## Rollback produção para tag anterior
rollback:
	@echo "Rolling back to PREVIOUS version..."
	helm rollback agentflow -n production
	$(MAKE) health-check NAMESPACE=production

## Migrate DB (produção)
migrate-up:
	helm test -n production -l agentflow-migrate
```

### 11.2 Runbooks

#### RB-01: Deploy normal (produção)

1. Merge PR para `main` (CI passa).
2. GitHub Action publica imagem signed `vX.Y.Z`.
3. On-call ou scheduler aprova promoção: `helm upgrade --install agentflow ./charts -n production --set image.tag=vX.Y.Z --set strategy.type=Canary`.
4. Argo Rollouts inicia canary 10% → pause 60s.
5. On-call verifica Grafana: error rate < baseline, SLO burn ~0, latência ok.
6. `argo rollouts promote` → 50% → pause 120s → 100%.
7. Se falhar em qualquer step → `argo rollouts undo` → rollback.

#### RB-02: Rollback automático (health fail)

- Trigger: readiness probe falha por 3 ciclos (30s) **OU** SLO burn rate > 14.4 em 5 min.
- Ação: Argo Rollouts rollback automático para revision anterior.
- Alerta: Slack `#ops-alerts` + PagerDuty on-call.
- Runbook:
  1. `kubectl -n production get rollouts agentflow-api` → confirma rollback.
  2. `kubectl -n production events --sort=.lastTimestamp` → causa raiz.
  3. Se DB migration envolvida → pausar rollout, reverter migration (janela manutenção).

#### RB-03: Hotfix (produção)

1. Branch `hotfix/vX.Y.Z-fix` a partir de `main`.
2. CI roda (lint→typecheck→test).
3. Tag `vX.Y.Z+hotfix.1` → imagem publicada.
4. Deploy canary `vX.Y.Z+hotfix.1` → promote full (pular staging se crítico).
5. Merge `hotfix/*` → `main` (backport).

#### RB-04: Banco — migração destrutiva (janela manutenção)

1. Anunciar janela: 2h madrugada (ex: 02:00–04:00 UTC).
2. Escalar workers para 0 (`helm scale deployment agentflow-worker --replicas=0`).
3. Pausar webhook receivers.
4. Backup antes: `pg_dump` + WAL archive.
5. Rodar migration contract (drop column).
6. Smoke test: `POST /health`, `GET /ready`, `POST /api/executions/trigger` (dry).
7. Escalar workers de volta, destravar webhook.
8. Monitor 30 min.

#### RB-05: Restore de backup

1. Identificar PIT (ex: 2026-08-20T03:00Z).
2. Provisionar PG restauração (snapshot + WAL replay até PIT).
3. Apontar `DATABASE_URL` → DB restaurado.
4. Dry-run migrations (`prisma migrate status`).
5. Escalar API 1 replica → health check → escalar full.

---

## 12. Custos estimados

| Componente        | Tier        | Estimativa/mês (USD) | Notas                                  |
|-------------------|-------------|----------------------|----------------------------------------|
| **Postgresql**    | RDS db.t4g.small (2vCPU, 2GB) | $60           | Multi-AZ + automated backup            |
| **Redis**         | ElastiCache cache.t4g.micro  | $25          | 1 AZ (dev); 2 AZ prod                  |
| **Object storage**| S3 / minIO                  | $5–50         | Artefatos, binários                   |
| **k8s (EKS)**     | Small cluster (3× t4g.small)| $150         | t3.medium × 3, incl. 20% overhead      |
| **API pods**      | 2× t4g.medium              | $60          | 24/7, cpu 1.5 / mem 1Gi cada           |
| **Worker pods**   | 3× t4g.medium              | $90          | escala HPA; baseline 3 réplicas        |
| **Scheduler**     | 1× t4g.micro               | $8           | singleton                              |
| **Webhook GW**    | 2× t4g.micro               | $16          | autoscaling                            |
| **Web (Vercel)**  | Hobby/plan pago            | $20          | SSR + edge                            |
| **Observabilidade**| Grafana Cloud / Loki     | $50         | logs + métricas + alertas              |
| **Registry**      | GHCR (gratuito até limite) | $0–20       | ou ECR ($0.10/GB)                     |
| **Banda**         | -                          | $30–200      | varia com egress                        |
| **TOTAL (small)** |                          | **$484–720** | Baseline 24/7                         |
| **TOTAL (medium)**| (workers=10, RDS medium)  | **$1,800–2,500** | ~50k exec/dia                        |

> Estimativas baseadas em us-east-1, 2024. Small = <1k exec/dia; Medium = 1k–50k exec/dia.

---

## 13. ADRs

### ADR-01: Registry de imagens

**Context:** Precisamos publicar imagens assinadas de alta confiabilidade.
**Decisão:** GitHub Container Registry (`ghcr.io`) + `cosign` para assinatura + `syft` para SBOM.
**Consequências:** Integrado ao GitHub (sem registry externo); pronto para sigstore. Alternativa: ECR se time migrar para AWS-native.

### ADR-02: Orquestrador de deploy

**Context:** Precisamos de deploy zero-downtime + rollback automático + canary.
**Decisão:** **Kubernetes (EKS)** como produção; **docker-compose** para dev + small-prod (<5k exec/dia).
**Consequências:** EKS exige operação (cluster-autoscaler, cert-manager, ingress-nginx). Compose não sobe para produção real. Para small business, Fly.io é escape hatch (single `fly deploy`).

### ADR-03: Estratégia de deploy

**Context:** Zero downtime, rollback rápido.
**Decisão:** **Canary + blue/green híbrido.** Canary (10→50->100%) para releases normais; blue/green para releases críticos (migratory).
**Conseqüências:** Argo Rollouts obrigatório; mais complexidade, mas controle fino de SLO.

### ADR-04: Migração de banco

**Context:** Schema evolve; produção não para.
**Decisão:** **Expand/Contract (3 fases)** + migration job como init-container. Nunca migrate → deploy → migrate. Sempre migrate antes (green) ou como job prévio.
**Consequências:** Desenvolvedor deve escrever migrations additivas primeiro. Destructive drops aguardam release seguinte.

### ADR-05: Secrets

**Context:** JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY, Stripe, NVIDIA — não podem vazar.
**Decisão:** **HashiCorp Vault + external-secrets operator** no k8s; GitHub Secrets no CI; `gitleaks` como gate.
**Consequências:** Necessita operar Vault (HA). Self-hosted pode usar Doppler. Never env vars committed.

### ADR-06: Supply chain

**Context:** Imagens Node.js têm CVEs; precisamos confiança.
**Decisão:** `trivy` scan no CI (CRITICAL/HIGH fail), `cosign` sign + attest, `node:22.21.0-alpine` (versão fixa), dependabot PRs.
**Consequências:** Build mais lento (+~2min scan); imagens maiores por assinaturas, mas rastreabilidade completa.

### ADR-07: Node type allowlist

**Context:** Security audit (C-03) mostrou que `node.type` é livre → vm sandbox escape → RCE.
**Decisão:** Manter deploy isolado; **allowlist server-side** de tipos de nó (`http`, `condition`, `webhook`, `cron`, `set_fields`, etc.). `code`/`transform` requerem flag `EXEC_CODE_DISABLED=false` + org OWNER apenas.
**Consequências:** Paridade n8n limitada a nodes allowlist; nodes custom precisam de review de segurança antes de ativar.

### ADR-08: Webhook gateway — enqueue-only

**Context:** Security audit (H-03) mostrou que webhook faz `runExecution` inline → DoS do processo API + bypass de quota.
**Decisão:** Webhook gateway enfilera (`enqueueExecution`) sempre; nunca executa inline. Quota e usage sempre contabilizados.
**Consequências:** Latência de resposta do webhook aumenta em ~50ms (Redis roundtrip); mas elimina API-process DoS.

---

## 14. Glossário

| Termo | Definição |
|-------|-----------|
| **Expand/Contract** | Estratégia de migração: fase expand (additive, compatível N-1) → deploy código → fase contract (destructive). |
| **Blue/Green** | Dois ambientes ativos; swap de tráfego via DNS/Ingress. |
| **Canary** | % do tráfego direcionado a nova versão gradualmente. |
| **Leader election** | Algoritmo para escolher um coordenador entre réplicas (ex: SETNX no Redis). |
| **PDB** | PodDisruptionBudget (k8s) — mínimo de pods sempre disponível. |
| **HPA** | HorizontalPodAutoscaler (k8s) — escala por metric. |
| **DLQ** | Dead Letter Queue — jobs que falharam após N retries. |
| **SLO** | Service Level Objective — meta de disponibilidade/latência. |
| **Burn rate** | Taxa de consumo do erro-orçamento; 14.4 = esgotamento em 5 min (1h budget). |
| **Smoke test** | Verificação rápida pós-deploy (health, endpoints críticos). |
| **SBOM** | Software Bill of Materials — inventário de dependências. |
| **TTL** | Time To Live — retenção de dados/jobs. |
| **Imutabilidade de imagem** | Tag fixa; atualização = nova tag, nunca mutar. |
| **N-1 compatibility** | Nova versão funciona com schema/ambiente da versão anterior. |
| **Feature flag** | Chave de configuração para habilitar/desabilitar feature em runtime. |
| **Preemption** | Job de alta prioridade que interrompe job de baixa prioridade. |
| **Backoff** | Atraso exponencial entre retries. |
| **Readiness probe** | sinaliza se pod recebe tráfego. |
| **Liveness probe** | sinaliza se pod restarting needed. |

---

## 15. Checklists operacionais

### 15.1 Checklist de deploy (antes de merge)

- [ ] CI completo: lint, typecheck, unit (≥80%), integration, contract, parity, e2e, build
- [ ] Image scan: 0 CRITICAL, 0 HIGH
- [ ] cosign sign + attestation OK
- [ ] Migrations: expand-only (N-1 compat) ou janela manutenção agendada
- [ ] Secrets: presentes no Vault/k8s Secret (não em imagem)
- [ ] Feature flags: nova feature default OFF
- [ ] Smoke test preview passou

### 15.2 Checklist de promoção staging→prod

- [ ] staging health + smoke 5min sem erro
- [ ] contract/parity green em staging
- [ ] approval manual (on-call ou release manager)
- [ ] SLO baseline capturado
- [ ] rollback plan documentado

### 15.3 Checklist de pós-deploy

- [ ] pods ready (kubectl wait)
- [ ] /health 200, /ready 200, /live 200
- [ ] error_rate < 0.1% por 5min
- [ ] latency p95 < 500ms
- [ ] queue_depth < 100
- [ ] SLO burn ~0
- [ ] feature flag toggle testada

---

## 16. Roadmap de maturidade

| Maturidade | Foco |
|------------|------|
| **Atual (v0.1)** | docker-compose + GitHub Actions CI básico + Vercel/Railway |
| **P1 (v0.3)** | k8s staging, canary, cosign, trivy, external-secrets, HPA por CPU |
| **P2 (v0.5)** | HPA por fila, DLQ alerting, blue/green para migrations, Argo Rollouts |
| **P3 (v0.8)** | Multi-região, Istio service mesh, full SLO automation, chaos engineering |

---

<!-- handoff_submit -->
> **Status:** done. Documento `n8n-migration/v2-deploy-cicd.md` produzido com arquitetura de entrega, Dockerfiles/multi-stage/healthchecks, orquestração (compose + k8s manifests/HPA/PDB/probes/Ingress), pipeline CI/CD estágio a estágio com gates, estratégia expand/contract de migrations, matriz de ambientes + promoção staging→prod (canary), gerenciamento de secrets/Vault/supply-chain scanning, escala (HPA, leader election, limites), observabilidade de deploy (canary + feature flags + métricas), runbooks (deploy/rollback/hotfix/DB) e custos estimados. Harmonizado com a arquitetura cloud (`v2-arquitetura-cloud.md`), test strategy (`v2-test-strategy.md`), database schema (`v2-database-schema.md`) e security spec (`v2-security-spec.md`). Nenhum código do app foi alterado; nenhum deploy real foi feito.
<!-- /handoff_submit -->
