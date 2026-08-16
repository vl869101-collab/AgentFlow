FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── deps + build ──────────────────────────
FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @agentflow/database generate
RUN pnpm --filter @agentflow/shared build
RUN pnpm --filter @agentflow/api build

# ── runner ────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy everything from build (v3)
COPY --from=build /app .

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
