---
name: api-docs
description: Write and maintain Markdown API docs for an Express backend — one api/<module>.md per module plus an api/README.md index with envelope, auth, pagination, scoping, roles and rate-limit conventions — derived from the actual routes, schemas and services. Use when adding or changing routes, when asked to document an API, or when docs drift from code.
argument-hint: "[module-name | all]"
---

# API Docs

A route change is not done until its doc is updated in the same change. Docs are read by frontend developers and AI assistants, so they must match the code exactly. If the project already uses OpenAPI/Swagger, update that instead and keep its style.

## Source of truth

For each module read: `routes/<name>.route.js` (paths, methods, middleware order → auth and roles), `validations/<name>.schema.js` (body/query/params, required, limits, defaults), `services/<name>.service.js` (returned fields, thrown status codes and messages), and the controller (status code, response key).

## `api/README.md`

```markdown
# <Project> API

Base URL: `/v1`.

| Module | File | Status |
|---|---|---|
| Health | [health.md](health.md) | live |
| Auth | [auth.md](auth.md) | live |

## Conventions

**Envelope** — `{ "success", "statusCode", "message", "data" }`. Errors: `success: false`, `data: null`.
**Auth** — `Authorization: Bearer <access token>` (15 min). On 401 call `POST /v1/auth/refresh` once, then retry.
**Pagination** — `?page` (default 1), `?limit` (default 20, max 100) → `{ items, pagination: { total, page, limit, hasNextPage } }`.
**Scope** — <how tenancy works>; resources outside your scope return 404.
**Methods** — GET reads, POST everything else. Update = `POST /:id`, delete = `POST /:id/remove`.
**Roles** — <enum values and who counts as admin>.
**Rate limits** — 429 with `RateLimit-*` headers; <tiers>.
```

## `api/<module>.md`

```markdown
# Vendors

`/v1/vendors`. All routes require Bearer auth. Scoped to the caller's active store.

The `vendor` object: `{ _id, name, phone, status, createdAt, updatedAt }`.

---

## GET /v1/vendors

Any role. **Query**: `page`, `limit`, `search?` (≤ 100 chars).

**200** → `data`: `{ "items": [ <vendor> ], "pagination": { ... } }`.

---

## POST /v1/vendors

`OWNER` / `MANAGER`.

**Body**: `{ "name", "phone"? }` — `name` 1–100 chars.

**201** → `data`: `{ "vendor": <vendor> }`. **409** phone already used in this store. **403** role not allowed.

---

## POST /v1/vendors/:vendorId/remove

`OWNER` / `MANAGER`. Soft-deletes the vendor.

**200** → `null`. **404** unknown vendor.
```

## Rules

- Define each object shape once at the top, reference it as `<vendor>` below.
- Every endpoint lists: who can call it, inputs with limits, the success status and `data` shape, and every non-obvious error status with when it happens.
- Mark optional fields with `?`. Write partial updates as "Body (≥ 1): `a`, `b`".
- Never put real keys, tokens, emails or customer data in examples.
- Document behaviour a client must know (side effects, idempotency, what gets soft-deleted with it), not implementation details.
- When a route is removed, remove its section; update the README table status.
