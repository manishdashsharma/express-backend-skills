---
name: deploy-docker
description: Production packaging for Node.js Express backends — multi-stage Dockerfile (non-root, tini, healthcheck), entrypoint that runs Prisma migrations, docker-compose for local Postgres/Mongo/Redis, scheduler container with supercronic, health/readiness endpoints, graceful shutdown and an environment checklist. Use when preparing a backend to deploy, containerizing it, or debugging production startup.
---

# Deploy with Docker

## Dockerfile

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npm run db:generate

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini supercronic && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY src ./src
COPY cron ./cron
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R app:app /app
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "src/healthcheck.js"]
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
```

Mongoose projects drop the `prisma` lines. Drop `supercronic` and `cron` if there are no jobs. Add `python3 make g++` to the deps stage only if a native module (bcrypt) needs building.

- `tini` as PID 1 forwards `SIGTERM` so graceful shutdown runs.
- The health check runs `src/healthcheck.js` (shipped in the `create-backend` templates), a tiny file that requests `/v1/health` and exits 0 or 1. Keep probes as files in the image, not inline code.
- Non-root user. No `.env` baked into the image; add a `.dockerignore` with `node_modules`, `.env*`, `logs`, `.git`, `coverage`.

## Entrypoint (Prisma)

```sh
#!/bin/sh
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  ./node_modules/.bin/prisma migrate deploy
fi
exec "$@"
```

With several API replicas, set `RUN_MIGRATIONS=true` on one release task only.

## Local services (docker-compose.yml)

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: YOUR_DB_PASSWORD
      POSTGRES_DB: app
    ports: ['5432:5432']
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U app -d app'], interval: 10s, retries: 5 }
  mongo:
    image: mongo:8
    ports: ['27017:27017']
    volumes: [mongo-data:/data/db]
  redis:
    image: redis:7-alpine
    command: ['redis-server', '--appendonly', 'yes']
    ports: ['6379:6379']
    volumes: [redis-data:/data]
volumes:
  postgres-data:
  mongo-data:
  redis-data:
```

Keep only the services the project uses. Use `pgvector/pgvector:pg17` if you need vector search. Mongo transactions need a replica set (`--replSet rs0` + `rs.initiate()`).

## Scheduler

Same image, different command: `command: ["supercronic", "/app/cron/prod.crontab"]`. Run exactly one scheduler replica (see `scheduled-jobs`).

## Health

- `GET /v1/health` — liveness, no dependencies, always fast.
- `GET /v1/health/ready` — checks the database (and Redis as informational); 503 when the database is down. Point load balancers at readiness, container healthchecks at liveness.

## Production checklist

- `NODE_ENV=production`; `trust proxy` matches the proxy count; CORS origins are the real domains.
- All required env vars set; secrets differ per environment; `AI_KEY_ENCRYPTION_SECRET` / JWT secrets are random 32+ bytes.
- Logs go to stdout as JSON; no secrets in logs.
- Graceful shutdown: stop accepting, finish in-flight requests, close DB/Redis, force-exit after 30 s.
- Database: pooled connection limits fit the provider; migrations applied; backups on.
- Rate limiting enabled; Redis reachable or the app degrades cleanly without it.
- Behind nginx: `proxy_buffering off` (or `X-Accel-Buffering: no`) on SSE routes; request body limit matches Express.
