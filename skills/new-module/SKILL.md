---
name: new-module
description: Add a new feature module (model/schema, validation, service, controller, route, index, router registration, API doc) to an existing Express backend, matching its conventions exactly. Use when the user asks to add a feature, resource, entity, CRUD, endpoint group or module to a backend that already exists.
argument-hint: "<module-name> [what it should do]"
---

# New Module

Add one complete module to an existing backend. If no backend exists yet, use `create-backend` instead.

## 1. Learn the project first

Read, in this order, and match what you find over anything below:
1. `CLAUDE.md` / `AGENTS.md` at the repo root and in the server folder.
2. `package.json` → which database (mongoose vs `@prisma/client`), Redis, Zod version.
3. `src/router/index.js` → mount style and prefix.
4. One existing module end to end (route, controller, service, schema, index) — or `src/modules/_template/` if present.
5. `src/shared/index.js` → the exact names of `authenticate`, role middleware, `validateRequest`, `httpResponse`, `logger`.
6. How `req.user` is shaped (`req.user.id` for owner-scoped data, or a tenant id such as `req.user.storeId` / `req.user.orgId`) — this decides the scope argument.

## 2. Confirm the contract

Before writing, state in a few lines and wait if anything is unclear:
- Fields, scope field, indexes.
- Endpoints (GET/POST only), roles per endpoint, request and response shapes.
- What existing tables/collections, caches or modules it touches and what could break.

## 3. Build in this order

1. **Data**
   - Mongoose: `src/models/<name>.model.js` — `isActive`, `{ timestamps: true }`, indexed scope field, `{ scope: 1, isActive: 1 }` index, index for every filter/sort field, default export with `mongoose.models.X ||` guard.
   - Prisma: model in `prisma/schema.prisma` — `isActive`, `createdAt`, `updatedAt`, `@@index([scope, isActive])`, `@@map("snake_plural")`, and the back-relation field on the scope model (`vendors Vendor[]` on `User`); then `npm run db:generate && npm run db:migrate -- --name add_<name>`. Never edit an applied migration.
2. **Validation** `validations/<name>.schema.js` — one inline-exported Zod schema per input (body, query, params). Coerce query values. Partial updates require at least one field.
3. **Service** `services/<name>.service.js` — scope id as first argument, explicit field selection, `isActive: true` on every read, `Promise.all` for independent queries, no queries in loops, thrown errors with `statusCode`, cache invalidation on every write if the entity is cached. Named exports at the bottom.
4. **Controller** `controllers/<name>.controller.js` — `asyncHandler` + try/catch, one service call, `logger.info` on state changes, `logger.error` with `error`, `stack`, `userId`, `requestId`, `httpError(req, res, error, error.statusCode || 500)`. Named exports at the bottom.
5. **Route** `routes/<name>.route.js` — `authenticate → role → validateRequest → controller`. Update = `POST /:id`, delete = `POST /:id/remove`.
6. **Index** `index.js` — export `<name>Routes` the same way other modules do.
7. **Register** in `src/router/index.js`.
8. **Docs** — `api/<name>.md` and a row in `api/README.md` if the project keeps API docs (see `api-docs`). If it uses Swagger/OpenAPI instead, update that.

Reference implementations: `../create-backend/templates/mongodb-example.md` and `../create-backend/templates/postgres-example.md` — a complete `vendor` module, each file under a `## \`<path>\`` heading. For an AI feature, model it on `src/modules/assistant/` in `../create-backend/templates/ai.md` (`prompt/`, `tools/`, `evals/`).

## 4. Verify

- `npm run lint` (or the project's lint script) passes.
- The app starts cleanly with `npm run dev` and the new routes are mounted.
- If the server can run locally, hit each new route once and report real status codes. If it cannot, say so.
- Re-read your diff for: comments, `console.log`, PUT/PATCH/DELETE, missing `isActive`, missing selection, double-wrapped `data`, unindexed filters.

Report the files created/changed and the endpoint table.
