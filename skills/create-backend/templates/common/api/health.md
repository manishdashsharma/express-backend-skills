# Health

`/v1/health`. No auth.

## GET /v1/health

Liveness. Never touches dependencies.

**200** → `data`: `{ "status": "alive", "uptime", "timestamp" }`.

## GET /v1/health/ready

Readiness. Checks the database; Redis is reported but not required.

**200** → `data`: `{ "status": "ready", "database": { "connected", "latencyMs" }, "redis": { ... } }`.
**503** database unreachable; `data` carries the same shape with `status: "degraded"`.
