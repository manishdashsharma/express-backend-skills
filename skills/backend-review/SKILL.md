---
name: backend-review
description: Strict production review of Node.js/Express backend code — conventions, database queries and indexes (Mongoose and Prisma), Redis usage, response shape, error handling, security and performance — that fixes every violation it finds and reports what needs a human. Use when asked to review, audit, check or clean up backend code, a module, a diff or a PR, or before committing or shipping backend changes.
argument-hint: "[module-name | file-path | (empty = current git diff)]"
---

# Backend Review

Find every issue, fix every fixable one, report precisely.

## 1. Scope and context

- No argument → `git diff` + `git diff --staged` (and untracked files under `src/`). Module name → every file in `src/modules/<name>/` plus its model/schema. Path → that file.
- Read the project `CLAUDE.md` first; its rules override the checklist. Read one healthy neighbouring module to know the house style.
- Never touch files outside the scope.

## 2. Checklist

**Structure & naming**
- [ ] Module files and names follow `<name>.<type>.js`, `<verb><Resource>Service`, `<verb><Resource>`, `<verb><Resource>Schema`, `E`-prefixed enums
- [ ] Named exports at the bottom of services/controllers; default export for models and routers
- [ ] Controllers contain no DB/cache/business logic; services never touch `req`/`res`
- [ ] Route chain: `authenticate → role → validateRequest → controller`
- [ ] Only GET and POST

**Data access (Mongoose)**
- [ ] `.select()` on every read; `.lean()` on every read-only query
- [ ] `isActive: true` + scope on every filter; scope from `req.user`
- [ ] No query in a loop (`$in` + `Map`); independent queries in `Promise.all`
- [ ] Paginated: `countDocuments` + `find` in `Promise.all`, with `.limit()`
- [ ] Every filter/sort field indexed; `{ scope: 1, isActive: 1 }` exists
- [ ] Soft delete only; `findOneAndUpdate` filters by scope

**Data access (Prisma)**
- [ ] `select`/`include` explicit everywhere; getters called inside functions
- [ ] `getReadDB` for reads, `getWriteDB` for writes and read-before-write
- [ ] `{ in: [...] }` instead of loops; counters via `{ increment }` in a transaction
- [ ] `@@index([scope, isActive])` and indexes for filter fields; FKs indexed
- [ ] No `delete`/`deleteMany`; scoped `updateMany` with `count === 0` → 404

**Redis**
- [ ] Helpers only, never `new Redis()`; every set has a TTL
- [ ] Every write busts the keys that cover it; keys include the scope
- [ ] Cache failures never throw; no `KEYS`; paginated lists not cached

**Responses & errors**
- [ ] Thrown errors carry `statusCode` and a user-actionable message
- [ ] Controller catch: `logger.error` with `error`, `stack`, `userId`, `requestId` → `httpError(req, res, error, error.statusCode || 500)`
- [ ] No double-wrapped `data`; list passes `{ items, pagination }` straight through; single item consistent with project rule
- [ ] Other tenant's record → 404

**Security**
- [ ] Every body/query/params validated with Zod; strings and arrays bounded
- [ ] No mass assignment of `role`, `isActive`, scope or ownership fields
- [ ] No secrets in code or logs; no sensitive fields in responses
- [ ] Rate limits on credential and expensive routes

**Hygiene**
- [ ] Zero comments, JSDoc, TODOs, commented-out code
- [ ] Zero `console.log`
- [ ] No `no-param-reassign` violations; lines ≤ 100
- [ ] No dead code, unused exports or imports; no unrequested abstractions
- [ ] API docs updated for changed routes

**Performance**
- [ ] No unbounded reads; payloads return only needed fields
- [ ] Hot single-entity reads cached where it pays off
- [ ] No sequential awaits that could be parallel; no heavy work inside transactions

## 3. Fix

Apply each fix with minimal edits in the existing style. For an index change, also add the migration (Prisma) or model index (Mongoose). Run the project's lint after fixing.

## 4. Report

```
Fixed 6 issues in 3 files
- src/modules/order/services/order.service.js:48 — N+1 customer lookup → $in + Map
- src/models/order.model.js:31 — added { storeId: 1, isActive: 1, status: 1, createdAt: -1 }
- src/modules/order/controllers/order.controller.js:22 — removed { data: {...} } double wrap

Needs your decision
- POST /v1/orders/:id/refund has no rate limit — which limiter tier?

Lint: passing
```

If nothing is wrong: "No issues found — code meets production standards." Do not invent findings.
