---
name: create-backend
description: Build a complete, production-grade Node.js backend from a plain-language product description — "create a backend for X using MongoDB/Postgres". Plans entities and the API contract, waits for approval, then assembles a working Express 5 + ES Modules project from tested templates (config, database, auth with rotating refresh tokens, rate limits, feature modules, optional AI module, API docs, Docker) and verifies it runs. Use whenever the user asks to create, scaffold, start or bootstrap a backend, API or server from scratch.
argument-hint: "<what the product does> [using mongodb|postgres] [with ai]"
---

# Create Backend

The user describes **what** they are building. You decide **how** using this skill, and never invent product scope. Every file comes from the Markdown bundles in `templates/` next to this file. Each bundle lists files under `## \`<path>\`` headings, each followed by one fenced code block holding the complete file. Write each block's content, byte for byte, to that path inside the project, then adapt. Do not rewrite templates from memory and do not skip files.

## Templates

| Bundle | Files | Contents |
|---|---|---|
| `templates/common.md` | 34 | every project: app, server, config, shared/, health + auth modules, CLAUDE.md, README, api/ docs, ESLint, env |
| `templates/mongodb.md` | 7 | MongoDB: config/databases.js, User + Session models, auth service, package.json, Docker |
| `templates/postgres.md` | 8 | PostgreSQL: config/databases.js, prisma/schema.prisma, prisma.config.js, auth service, package.json, Docker, entrypoint |
| `templates/ai.md` | 21 | optional: shared/ai, shared/crypto, shared/network, modules/assistant (prompt/, tools/, evals/), api/assistant.md |
| `templates/mongodb-example.md` | 7 | reference feature module ("vendor") for MongoDB — a pattern, never shipped as is |
| `templates/postgres-example.md` | 7 | reference feature module ("vendor") for PostgreSQL — a pattern, never shipped as is |

A project = `common.md` + one of `mongodb.md` / `postgres.md` (+ `ai.md` when needed). No path appears in two bundles. Read a bundle fully before writing from it. The fence around each file can be longer than three backticks when the file itself contains code fences; the file content is everything between the opening and the matching closing fence.

## Phase 0 — Read first

1. If the target folder already has `package.json` or `src/`, stop: this is an existing project → use `new-module`.
2. If there is a `CLAUDE.md` or `AGENTS.md`, read it; its rules win.
3. Choose the stack:

| Signal | Choice |
|---|---|
| "mongodb", "mongo", "mongoose", or document-shaped data | `mongodb.md` |
| "postgres", "sql", "prisma", or relational/reporting-heavy data | `postgres.md` |
| "ai", "llm", "chat", "assistant", "summarize", "agent" | add `ai.md` |

If the database is genuinely unclear, ask once. Otherwise decide and say which.

## Phase 1 — Contract (wait for approval)

Write this plan and **wait for the user to confirm** before creating anything:

```
Stack: Express 5, ESM, <Mongoose | Prisma>, Zod 4, winston, Redis optional<, OpenAI-compatible AI>
Scope: <ownerId | storeId | orgId> — the field every domain record is scoped by

Entities
| Entity | Fields | Scope | Indexes |

Roles: EUserRole = { OWNER, MANAGER, STAFF }   (adjust to the product)

Endpoints (GET/POST only)
| Method | Path | Roles | Input | Returns |

Out of scope: <what you deliberately did not add>
Questions: <only ones that change schema or contract>
```

- Only entities and endpoints the user described, plus `User` and `Session` for auth.
- Update = `POST /:id`, delete = `POST /:id/remove` (soft delete), actions = `POST /:id/<verb>`.
- **Scope.** Single-owner data → `ownerId` = `req.user.id` (what the templates do). Multi-tenant (stores, orgs, clinics) → a tenant entity and a `<tenant>Id` on every record; see Phase 4.

## Phase 2 — Assemble

1. Write every file from `templates/common.md`.
2. Write every file from `templates/mongodb.md` or `templates/postgres.md`. For Postgres, `chmod +x docker-entrypoint.sh`.
3. With AI only: write every file from `templates/ai.md`.
4. Check the count: the files you wrote equal the bundle counts above (34 + 7, or 34 + 8, plus 21 with AI).

Then replace every placeholder (`grep -rn "__[A-Z_]*__" <project>` must return nothing at the end):

| Placeholder | File | Value |
|---|---|---|
| `__PACKAGE_NAME__` | package.json | kebab-case project name |
| `__PROJECT_NAME__` | CLAUDE.md, README.md, api/README.md | display name |
| `__ONE_LINE_PRODUCT_DESCRIPTION__` | CLAUDE.md, README.md | one sentence from the user |
| `__DATABASE__` | CLAUDE.md | `MongoDB (Mongoose)` or `PostgreSQL (Prisma 7)` |
| `__MODELS_LINE__` | CLAUDE.md | Mongo: `  models/<name>.model.js  Mongoose models, default export`; Postgres: `prisma/schema.prisma  models + migrations/` |
| `__SCOPE_FIELD__` | CLAUDE.md, api/README.md | the scope field |
| `__SCOPE_CLAIM_NOTE__` | CLAUDE.md | empty, or `, plus <tenant>Id from the token` when multi-tenant |
| `__EXTRA_COMMANDS__` | CLAUDE.md | Postgres: ` · npm run db:migrate · npm run db:generate`; add ` · npm run eval:assistant` with AI; else empty |
| `__SETUP_EXTRA__` | README.md | Postgres: `npm run db:migrate` plus a newline; else empty |
| `__SCRIPTS_EXTRA__` | README.md | Postgres rows for `db:migrate`, `db:generate`, `db:migrate:deploy`; AI row for `eval:assistant`; else empty |
| `__DATABASE_ENV__` | .env.example | Mongo: `MONGODB_URI=mongodb://localhost:27017/<name>`; Postgres: `DATABASE_URL=postgresql://app:YOUR_DB_PASSWORD@localhost:5432/app`, `DATABASE_READ_URL=`, `DATABASE_POOL_MAX=10`. Tell the user to pick a real local password and set it in both `docker-compose.yml` (`POSTGRES_PASSWORD`) and `DATABASE_URL` |

Clean up what does not apply:
- `src/config/index.js`: delete the `mongo` block for Postgres, the `database` block for MongoDB.
- No AI: delete the `ai` config block, `AI_*` lines in `.env.example`, and the `aiLimiter` export with its `rateLimiting.ai*` config.
- With AI: add `"openai"` to dependencies, `"eval:assistant": "node src/modules/assistant/evals/run-evals.js"` to scripts, mount `assistantRoutes` at `/assistant` in `src/router/index.js`, add `assistant.md` to `api/README.md`.
- Redis stays: everything works without `REDIS_URLS` (cache returns misses, rate limits use memory). Remove the `redis` service from `docker-compose.yml` only if the user says no Redis.

## Phase 3 — Install and database

```bash
npm install
```

Use current versions; if a template version fails to resolve, check `npm view <pkg> version` and update.

Postgres: `docker compose up -d postgres` then `npm run db:migrate -- --name init`.

## Phase 4 — Auth and scope

Auth is already complete in the templates: sign-up, sign-in, refresh rotation with reuse detection, logout, logout-all, me, sessions. `authenticate` sets `req.user = { id, role }`.

Multi-tenant products need three edits, all in one change:
1. Tenant model (`Store`, `Organization`, …) and a `<tenant>Id` on `User` (or a membership collection/table if users belong to several tenants).
2. `claimsOf` in `src/modules/auth/services/auth.service.js` adds `<tenant>Id`; `signAccessToken` in `src/shared/utils/token.js` puts it in the JWT; `authenticate` copies it onto `req.user`.
3. Feature modules scope by `req.user.<tenant>Id` instead of `req.user.id`.

Change the default `role` on `User` if self sign-up should not create an `OWNER`. Follow `auth-sessions` for email verification or Google sign-in if requested.

## Phase 5 — Feature modules

For each entity in the approved plan, take `templates/mongodb-example.md` or `templates/postgres-example.md`, write its files with `vendor` / `Vendor` / `vendors` / `VENDOR` renamed throughout:

| From the example bundle | To project |
|---|---|
| `src/models/vendor.model.js` (Mongo) | `src/models/<name>.model.js` |
| `prisma/vendor.prisma` (Postgres) | append to `prisma/schema.prisma`; add the back-relation (`<names> <Name>[]`) on `User` or the tenant; migrate |
| `src/shared/constant/vendor.js` | `src/shared/constant/<name>.js` — `E<Name>Status`, etc. |
| `src/modules/vendor/{controllers,services,routes,validations}/` | `src/modules/<name>/…` with `<name>.<type>.js` file names |
| `src/modules/vendor/index.js` | `export { default as <name>Routes } from './routes/<name>.route.js';` |

Register each in `src/router/index.js`: `router.use('/<plural>', <name>Routes);`. Write `api/<name>.md` and add it to `api/README.md` (see `api-docs`).

Every module has `controllers/`, `services/`, `routes/`, `validations/`, `index.js`. AI modules add `prompt/`, `tools/`, `evals/` like `modules/assistant` in `templates/ai.md`. A module with no input (health) has no `validations/`.

Apply `backend-conventions` to every file. Use `mongoose-mongodb` or `prisma-postgres` for queries and indexes.

## Phase 6 — Verify (required, report honestly)

1. `grep -rn "__[A-Z_]*__" .` → nothing.
2. `npm run lint` → zero problems.
3. With `.env` filled (`cp .env.example .env`, real JWT secrets): `docker compose up -d`, `npm run dev`, then
   - `GET /v1/health` → 200, `GET /v1/health/ready` → 200
   - `POST /v1/auth/sign-up` → 201 with `accessToken`
   - one create + list on each feature module with that token → 201 / 200
4. If Docker or a database is not available, say exactly which checks you could not run. Never claim it works without running it.

Finish with: the tree, the endpoint table, env vars to fill, and the next commands.

## Non-negotiables

- No comments in code. No `console.log`.
- GET and POST only. Soft delete only. Every read filters `isActive: true` and the scope.
- Select fields explicitly; `Promise.all` independent queries; no queries in loops; index every filter.
- Services throw `Error` with `statusCode`; controllers use `httpResponse` / `httpError`; never pass `{ data }`.
- No features, libraries or abstractions the user did not ask for.
