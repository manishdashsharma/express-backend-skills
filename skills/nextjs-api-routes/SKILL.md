---
name: nextjs-api-routes
description: Backend inside a Next.js App Router project — thin route.js handlers over the same modules/services/validations/models structure as an Express API, cached Mongoose or Prisma connection for serverless, Zod parsing, a single errorResponse helper, GET/POST only. Use when building API endpoints in a Next.js app (app/api/**/route.js) or moving Express-style modules into Next.js.
---

# Next.js API Routes

Keep the same module discipline as an Express backend; only the HTTP layer changes. Next.js versions change fast — if the project has `AGENTS.md` or `node_modules/next/dist/docs/`, read it before using any non-trivial API.

## Layout

```
src/
  app/api/<resource>/route.js            GET, POST
  app/api/<resource>/remove/route.js     POST (soft delete)
  config/databases.js                    cached connection
  lib/http.js                            errorResponse
  modules/<name>/
    models/<name>.model.js               Mongoose
    services/<name>.service.js
    validations/<name>.schema.js
```

Route handlers replace controllers and routes. Services, validations and models follow the `backend-conventions`, `mongoose-mongodb` or `prisma-postgres` skills unchanged.

## Connection (serverless-safe)

```js
import mongoose from 'mongoose';
import config from '@/config/index.js';

const cache = globalThis.mongooseCache || (globalThis.mongooseCache = { conn: null, promise: null });

const getMongoose = async () => {
  if (cache.conn) {
    return cache.conn;
  }
  const { uri } = config.mongo;
  if (!uri) {
    const error = new Error('The database connection is not configured');
    error.statusCode = 500;
    throw error;
  }
  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, { maxPoolSize: 10 }).catch((error) => {
      cache.promise = null;
      throw error;
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
};

export { getMongoose };
```

`src/config/index.js` is the only module that reads environment variables; it exposes `config.mongo.uri`. Each service starts with `await getMongoose();`. For Prisma, keep a single client on `globalThis` in development the same way.

## Handler

```js
import { errorResponse } from '@/lib/http.js';
import { createLogService, getLogsService } from '@/modules/log/services/log.service.js';
import { createLogSchema, getLogsSchema } from '@/modules/log/validations/log.schema.js';

const GET = async (request) => {
  try {
    const params = new URL(request.url).searchParams;
    const query = getLogsSchema.parse({
      days: params.get('days') ?? undefined,
      date: params.get('date') ?? undefined,
    });
    return Response.json(await getLogsService(query));
  } catch (error) {
    return errorResponse(error);
  }
};

const POST = async (request) => {
  try {
    const data = createLogSchema.parse(await request.json());
    const item = await createLogService(data);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
};

export { GET, POST };
```

## Errors

```js
import { ZodError } from 'zod';

const errorResponse = (error) => {
  if (error instanceof ZodError) {
    return Response.json({ message: 'Invalid input' }, { status: 400 });
  }
  if (error?.name === 'CastError') {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }
  const status = error.statusCode || 500;
  const message = status >= 500 ? 'Something went wrong' : error.message;
  return Response.json({ message }, { status });
};

export { errorResponse };
```

## Rules

- Only `GET` and `POST` exports. Delete is `POST /api/<resource>/remove` with `{ id }` → soft delete.
- Handlers parse with Zod, call one service, return JSON. No database code in `route.js`.
- Auth: verify the session/token at the top of each handler (or in `middleware.js` for coarse gating) and pass the user/scope into the service; never trust ids from the body for scoping.
- Read env only in one config module; `NEXT_PUBLIC_*` never holds secrets.
- Mark handlers that must not be cached as dynamic per the installed Next.js version's docs.
- Single-user/personal apps may skip the scope field, but still keep `isActive`, timestamps and indexes on every filter field.
