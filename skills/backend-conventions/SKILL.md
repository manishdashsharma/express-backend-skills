---
name: backend-conventions
description: The house rules for Node.js Express backends — module layout, file and function naming, controller/service/route responsibilities, error throwing, response envelope, pagination shape, logging, config and lint style. Use whenever writing, editing or generating any Express/Node.js backend code (routes, controllers, services, validations, middleware), even for a one-line change.
---

# Backend Conventions

Apply these to every backend file you touch. A project's own `CLAUDE.md` overrides anything here; otherwise match the surrounding code first and these rules second.

## Stack defaults

Node.js ≥ 22, ES Modules (`"type": "module"`), Express 5, Zod 4, winston. Database: Mongoose (MongoDB) or Prisma (PostgreSQL). Cache/sessions: Redis via ioredis.

## Module layout

```
src/modules/<name>/
  controllers/<name>.controller.js
  services/<name>.service.js          more services as <topic>.service.js when one file grows
  routes/<name>.route.js
  validations/<name>.schema.js        omitted only when the module takes no input
  index.js                            export { default as <name>Routes } from './routes/<name>.route.js';
  prompt/<purpose>.prompt.js          AI modules: system prompts and prompt builders
  tools/<verb>-<noun>.tool.js         AI modules: one tool per file, tools/index.js registry
  evals/                              AI modules: cases.js, score.js, run-evals.js
```

Mongoose models live in `src/models/<name>.model.js`; Prisma models in `prisma/schema.prisma`. Domain enums live in `src/shared/constant/<name>.js`. Shared code lives in `src/shared/` and is imported through `src/shared/index.js`. Modules are mounted in `src/router/index.js` under `/v1`.

## Naming

| Thing | Pattern | Example |
|---|---|---|
| File | `<name>.<type>.js` | `vendor.controller.js`, `vendor.model.js` |
| Service | `<verb><Resource>Service` | `getVendorsService`, `createVendorService` |
| Controller | `<verb><Resource>` | `getVendors`, `createVendor` |
| Zod schema | `<verb><Resource>Schema` | `createVendorSchema` |
| Enum | `E` prefix, frozen object | `EUserRole`, `EOrderStatus` |
| Route export | `<name>Routes` | `vendorRoutes` |
| Redis key | `<resource>:<scopeId>:<id>` | `vendor:store_1:abc` |

## Exports

- Services and controllers: declare `const` functions, **named exports at the bottom** — `export { a, b };`
- Models: default export — `export default mongoose.models.Vendor || mongoose.model('Vendor', schema);`
- Zod schemas: inline — `export const createVendorSchema = z.object({ ... });`
- Routes: `export default router;`

## Layer responsibilities

**Route** — wiring only. Fixed order:
`authenticate → authorize(...roles) → validateRequest(schema, 'body'|'query'|'params') → controller`

**Controller** — HTTP in, HTTP out. Read the request, call one service, shape the response, log. No database, no cache, no business rules.

```js
const createVendor = asyncHandler(async (req, res) => {
  try {
    const vendor = await createVendorService(req.user.id, req.body);
    logger.info('Vendor created', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 201, responseMessage.custom('Vendor created'), { vendor });
  } catch (error) {
    logger.error('Create vendor failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestId: req.requestId,
    });
    return httpError(req, res, error, error.statusCode || 500);
  }
});
```

**Service** — all business logic and data access. Plain async functions; never touch `req`/`res`. Scope ids come from `req.user` via the controller, never from the request body.

## Errors

Expected failures are thrown from services as a plain `Error` with a status and a sentence a user can act on:

```js
const error = new Error('Vendor not found');
error.statusCode = 404;
throw error;
```

- Do not wrap in try/catch just to log and rethrow. Let unexpected errors bubble.
- `publicError` decides what the client sees: 4xx messages pass through; unexpected 5xx become a generic message and the real one is logged.
- Database codes map centrally: Prisma `P2002`/Mongo `11000` → 409, `P2025` → 404, `P2003` → 409, `CastError` → 400.
- Another tenant's record is **404**, never 403.

## Response envelope

`httpResponse(req, res, status, message, data)` → `{ success, statusCode, request, message, data }`.

- List: pass the service result straight through → `data: { items, pagination }`.
- Single item: wrap in a named key → `data: { vendor }`. (If the project's CLAUDE.md says `data` *is* the resource, follow that instead — pick one per project and never mix.)
- No body: omit `data` → `null`.
- **Never** pass `{ data: ... }` yourself.

## Pagination

```js
{ items, pagination: { total, page, limit, hasNextPage: ((page - 1) * limit) + items.length < total } }
```

Count and fetch run in `Promise.all`. Query params: `page` default 1, `limit` default 20, max 100, coerced by Zod.

## HTTP methods

Only `GET` and `POST`. Never `PUT`, `PATCH`, `DELETE`.
- Update: `POST /vendors/:vendorId`
- Delete: `POST /vendors/:vendorId/remove` → sets `isActive: false`
- Actions: `POST /orders/:orderId/cancel`

## Data rules (both databases)

- Soft delete only: `isActive: false`. Every read filters `isActive: true`.
- Always select fields explicitly. Never return a full row/document by default.
- Independent queries in `Promise.all`. Never `await` them in sequence.
- No query inside a loop (N+1 is a bug): batch with `$in` / `{ in: [...] }`.
- Every filtered or sorted field is covered by an index.

## Config, logging, style

- `src/config/index.js` is the only file that reads `process.env`. Required vars are validated at boot.
- `logger` (winston) only; never `console.log`. Every log carries `{ requestId, userId, ...context }`. Never log secrets, tokens, passwords or full bodies.
- Single quotes, semicolons, 2-space indent, max 100 chars, `curly: all`, `eqeqeq`.
- `no-param-reassign` is on: build new objects instead of mutating arguments.
- No comments of any kind — no inline, block, JSDoc, `TODO`, banners or commented-out code. Rename or extract a function instead.
- No unrequested abstractions, libraries, config or "while I was here" refactors.
