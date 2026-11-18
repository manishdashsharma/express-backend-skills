# __PROJECT_NAME__ — Backend

Express 5 · ES Modules · __DATABASE__ · Redis (optional) · Zod 4 · winston

__ONE_LINE_PRODUCT_DESCRIPTION__

## Layout

```
src/
  server.js            boot, listen, graceful shutdown
  app.js               express wiring only
  config/index.js      the only file that reads process.env
  config/databases.js  database lifecycle and getters
  config/redis.js      optional Redis, CacheManager, SessionManager
  router/index.js      mounts every module under /v1
  shared/              middleware, utils, constants; import via shared/index.js
  modules/<name>/
    controllers/<name>.controller.js
    services/<name>.service.js
    routes/<name>.route.js
    validations/<name>.schema.js
    prompt/            AI modules only: <purpose>.prompt.js
    tools/             AI modules only: <verb>-<noun>.tool.js + index.js
    evals/             AI modules only: cases.js, score.js, run-evals.js
    index.js           export { default as <name>Routes }
__MODELS_LINE__
api/                   one <module>.md per module + README.md index
```

## Rules

- No comments of any kind. No `console.log`; use `logger`.
- Routes are GET and POST only. Update `POST /:id`, delete `POST /:id/remove`.
- Route chain: `authenticate → authorize(...roles) → validateRequest(schema, source) → controller`.
- Controllers: HTTP only, one service call, `asyncHandler` + try/catch, `httpError(req, res, error, error.statusCode || 500)`.
- Services: all logic and data access; throw `Error` with `statusCode` for expected failures.
- Soft delete only (`isActive: false`); every read filters `isActive: true` and the scope field from `req.user`.
- Select fields explicitly, `Promise.all` independent queries, never query inside a loop, index every filter field.
- Response: list → `{ items, pagination }`; single item → `{ <name> }`; never pass `{ data }`.
- Redis keys always have a TTL, include the scope, and are busted on write. Redis failures never throw.
- Naming: `<verb><Resource>Service`, `<verb><Resource>`, `<verb><Resource>Schema`, `E`-prefixed enums.
- A route change is not done until `api/<module>.md` is updated.

## Scopes

Scope field: `__SCOPE_FIELD__`. `req.user` is `{ id, role }`__SCOPE_CLAIM_NOTE__.

## Commands

`npm run dev` · `npm run lint` · `npm start`__EXTRA_COMMANDS__
