# __PROJECT_NAME__ API

Base URL: `/v1`.

| Module | File | Status |
|---|---|---|
| Health | [health.md](health.md) | live |
| Auth | [auth.md](auth.md) | live |

## Conventions

**Envelope** — `{ "success", "statusCode", "request", "message", "data" }`. Errors set `success: false` and `data: null` (or details for some 4xx).

**Auth** — send `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes. On `401`, call `POST /v1/auth/refresh` once (the refresh token rides an httpOnly cookie, so use `credentials: 'include'`), then retry the original request once.

**Pagination** — `?page` (default 1) and `?limit` (default 20, max 100) → `data: { items: [], pagination: { total, page, limit, hasNextPage } }`.

**Scope** — records belong to `__SCOPE_FIELD__`. Records outside your scope return `404`.

**Methods** — GET reads, POST writes. Update `POST /:id`, delete `POST /:id/remove` (soft delete).

**Rate limits** — `429` with `RateLimit` headers. Per-IP global limit, strict limit on auth endpoints, per-user limits on writes.
