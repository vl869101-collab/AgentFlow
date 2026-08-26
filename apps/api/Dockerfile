FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── deps (cached) ───────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ── build ───────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @agentflow/database generate
RUN pnpm --filter @agentflow/shared build
RUN pnpm --filter @agentflow/api build
RUN pnpm prune --prod

# ── runner (slim, non-root, healthchecked) ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 api \
 && apk add --no-cache wget

# Copy prod node_modules + built artifacts only
COPY --from=build --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=api:nodejs /app/package.json ./package.json
COPY --from=build --chown=api:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=api:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=api:nodejs /app/packages ./packages

WORKDIR /app/apps/api
USER api
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server.js"]
