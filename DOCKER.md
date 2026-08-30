# AgentFlow — Docker Guide

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2+

## Quick Start

### 1. Create `.env` from template

```bash
cp .env.docker .env
# Edit .env with your real values (NVIDIA_API_KEY, STRIPE_*, etc.)
```

### 2. Start full stack

```bash
make up
# or
docker compose up -d
```

**Services:**
| Service | URL | Description |
|---------|-----|-------------|
| Web | http://localhost:3000 | Next.js frontend |
| API | http://localhost:3001 | Fastify backend |
| Postgres | localhost:5432 | Database |
| Redis | localhost:6379 | Job queue |

### 3. Run migrations

```bash
make migrate
# or
docker compose exec api npx prisma migrate deploy
```

## Development Mode

For local development with only database services:

```bash
make dev
# Starts only postgres + redis, then run:
pnpm dev
```

## Useful Commands

```bash
make logs          # Tail all logs
make logs-api      # API logs only
make ps            # List containers
make down          # Stop everything
make clean         # Remove everything (volumes + images)
make db-shell      # PostgreSQL shell
make shell-api     # Shell into API container
```

## First Time Setup

```bash
# 1. Start infrastructure
make dev

# 2. Run migrations
make migrate

# 3. Seed database (optional)
make seed

# 4. Start dev servers
pnpm dev
```

## Production Build

```bash
# Build and start all services
docker compose -f docker-compose.yml up -d --build

# Or use Makefile
make build && make up
```

## Environment Variables

Key variables to configure in `.env`:

| Variable | Description | Required |
|----------|-------------|----------|
| `NVIDIA_API_KEY` | NVIDIA NIM API key for AI generation | Optional |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing | Optional |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Optional |
| `JWT_SECRET` | Secret for JWT tokens (min 32 chars) | Yes |
| `CREDENTIAL_ENCRYPTION_KEY` | Key for encrypting credentials (32 bytes) | Yes |

## Troubleshooting

### Port conflicts
```bash
# Check what's using the port
lsof -i :3000
# or on Windows
netstat -ano | findstr :3000
```

### Database connection issues
```bash
# Verify postgres is healthy
docker compose ps postgres
# Check logs
docker compose logs postgres
```

### Clean start
```bash
make clean
make up
make migrate
```
