# Common files

Every generated project gets every file below, written at exactly the path in its heading.

Files in this bundle: 34.

## `.dockerignore`

```gitignore
node_modules
.env
.env.*
!.env.example
logs
coverage
.git
sessions
*.md
```

## `.env.example`

```dotenv
NODE_ENV=development
APP_NAME=App
PORT=5000
API_VERSION=v1
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

__DATABASE_ENV__

REDIS_URLS=redis://localhost:6379
REDIS_PASSWORD=

JWT_SECRET=YOUR_JWT_SECRET
JWT_REFRESH_SECRET=YOUR_JWT_REFRESH_SECRET
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

AI_API_KEY=YOUR_AI_API_KEY
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_MODEL_POOL=
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_KEY_ENCRYPTION_SECRET=YOUR_AI_KEY_ENCRYPTION_SECRET
ALLOW_PRIVATE_AI_HOSTS=false

RATE_LIMIT_ENABLED=
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=300
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX_REQUESTS=10
RATE_LIMIT_WRITE_MAX_REQUESTS=60
RATE_LIMIT_READ_MAX_REQUESTS=240
RATE_LIMIT_AI_WINDOW_MS=600000
RATE_LIMIT_AI_MAX_REQUESTS=20

BCRYPT_ROUNDS=12
REFRESH_COOKIE_NAME=rt
REFRESH_COOKIE_MAX_AGE_MS=604800000
LOG_LEVEL=info
```

## `.gitignore`

```gitignore
node_modules/
.env
.env.*
!.env.example
logs/
coverage/
.DS_Store
sessions/
```

## `CLAUDE.md`

````markdown
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
````

## `README.md`

````markdown
# __PROJECT_NAME__ API

__ONE_LINE_PRODUCT_DESCRIPTION__

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
__SETUP_EXTRA__npm run dev
```

API: `http://localhost:5000/v1` · Health: `GET /v1/health` · Readiness: `GET /v1/health/ready`

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with file watching |
| `npm start` | Start for production |
| `npm run lint` | Lint `src/` |
__SCRIPTS_EXTRA__
## Modules

See [api/README.md](api/README.md).
````

## `eslint.config.js`

```js
import js from '@eslint/js';

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'dist/**',
      'coverage/**',
      '.next/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': 'error',
      'arrow-spacing': 'error',
      'comma-dangle': 'off',
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'eol-last': ['error', 'always'],
      'no-trailing-spaces': 'error',
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'keyword-spacing': 'error',
      'space-before-blocks': 'error',
      'space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      'space-in-parens': ['error', 'never'],
      'space-infix-ops': 'error',
      'space-unary-ops': 'error',
      'spaced-comment': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      'padded-blocks': ['error', 'never'],
      'max-len': [
        'error',
        { code: 100, ignoreUrls: true, ignoreStrings: true },
      ],
      camelcase: ['error', { properties: 'never' }],
      'new-cap': ['error', { newIsCap: true, capIsNew: false }],
      'no-mixed-operators': 'error',
      'no-whitespace-before-property': 'error',
      'operator-linebreak': ['error', 'before'],
      'consistent-return': 'error',
      curly: ['error', 'all'],
      'default-case': 'error',
      'dot-notation': 'error',
      eqeqeq: ['error', 'always'],
      'guard-for-in': 'error',
      'no-alert': 'error',
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-div-regex': 'error',
      'no-else-return': 'error',
      'no-empty-function': 'error',
      'no-empty-pattern': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-fallthrough': 'error',
      'no-floating-decimal': 'error',
      'no-implicit-globals': 'error',
      'no-implied-eval': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-loop-func': 'error',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': 'error',
      'no-proto': 'error',
      'no-redeclare': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-escape': 'error',
      'no-void': 'error',
      'no-warning-comments': 'warn',
      'no-with': 'error',
      radix: 'error',
      'vars-on-top': 'error',
      'wrap-iife': 'error',
      yoda: 'error',
    },
  },
  {
    files: ['src/models/**/*.js', 'src/modules/**/models/*.js'],
    rules: {
      'no-invalid-this': 'off',
    },
  },
];
```

## `api/README.md`

```markdown
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
```

## `api/auth.md`

```markdown
# Auth

`/v1/auth`. Access token in the response body (keep it in memory), refresh token in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/v1/auth`.

The `user` object: `{ id, name, email, role, createdAt }`.

---

## POST /v1/auth/sign-up

Public. Strict per-IP rate limit.

**Body**: `{ "name", "email", "password" }` — name 1–100, password 8–128.

**201** → `data`: `{ "accessToken", "user": <user> }` and sets the refresh cookie. **409** email already registered.

---

## POST /v1/auth/sign-in

Public. Strict per-IP rate limit.

**Body**: `{ "email", "password" }`.

**200** → `data`: `{ "accessToken", "user": <user> }` and sets the refresh cookie. **401** "Email or password is incorrect".

---

## POST /v1/auth/refresh

Cookie only. Rotates the refresh token. Two tabs refreshing at once are both served. Reusing an old refresh token signs the account out everywhere.

**200** → `data`: `{ "accessToken" }`. **401** no session, expired, revoked or reused (cookie cleared).

---

## POST /v1/auth/logout

Cookie only. Revokes this session and clears the cookie. Always **200**.

---

## POST /v1/auth/logout-all

Bearer auth. Revokes every session for the user.

**200** → `null`.

---

## GET /v1/auth/me

Bearer auth.

**200** → `data`: `{ "user": <user> }`. **404** account no longer active.

---

## GET /v1/auth/sessions

Bearer auth. Active sessions, newest first, max 50.

**200** → `data`: `{ "sessions": [ { "id", "userAgent", "ip", "createdAt", "lastActiveAt", "isCurrent" } ] }`.
```

## `api/health.md`

```markdown
# Health

`/v1/health`. No auth.

## GET /v1/health

Liveness. Never touches dependencies.

**200** → `data`: `{ "status": "alive", "uptime", "timestamp" }`.

## GET /v1/health/ready

Readiness. Checks the database; Redis is reported but not required.

**200** → `data`: `{ "status": "ready", "database": { "connected", "latencyMs" }, "redis": { ... } }`.
**503** database unreachable; `data` carries the same shape with `status: "degraded"`.
```

## `src/app.js`

```js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import config from './config/index.js';
import { logger, errorHandler, notFoundHandler, globalLimiter } from './shared/index.js';
import router from './router/index.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || config.cors.origins.includes(origin)),
  credentials: true,
}));
app.use(globalLimiter);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
      requestId: req.requestId,
    });
  });
  next();
});

app.use(`/${config.apiVersion}`, router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

## `src/config/index.js`

```js
import 'dotenv/config';

const toInt = (value, fallback) => parseInt(value, 10) || fallback;
const toList = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  appName: process.env.APP_NAME || 'App',
  port: toInt(process.env.PORT, 5000),
  apiVersion: process.env.API_VERSION || 'v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  database: {
    url: process.env.DATABASE_URL,
    readUrl: process.env.DATABASE_READ_URL,
    poolMax: toInt(process.env.DATABASE_POOL_MAX, 10),
  },

  mongo: {
    uri: process.env.MONGODB_URI,
    maxPoolSize: 10,
  },

  redis: {
    urls: toList(process.env.REDIS_URLS),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  session: {
    refreshReuseGraceMs: 10000,
  },

  cookie: {
    refreshName: process.env.REFRESH_COOKIE_NAME || 'rt',
    path: '/v1/auth',
    secure: env === 'production',
    sameSite: 'strict',
    maxAgeMs: toInt(process.env.REFRESH_COOKIE_MAX_AGE_MS, 604800000),
  },

  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== undefined
      ? process.env.RATE_LIMIT_ENABLED === 'true'
      : env !== 'development',
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 300),
    authWindowMs: toInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 900000),
    authMaxRequests: toInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10),
    writeMaxRequests: toInt(process.env.RATE_LIMIT_WRITE_MAX_REQUESTS, 60),
    readMaxRequests: toInt(process.env.RATE_LIMIT_READ_MAX_REQUESTS, 240),
    aiWindowMs: toInt(process.env.RATE_LIMIT_AI_WINDOW_MS, 600000),
    aiMaxRequests: toInt(process.env.RATE_LIMIT_AI_MAX_REQUESTS, 20),
  },

  bcrypt: {
    rounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },

  cors: {
    origins: toList(process.env.CORS_ORIGIN).length > 0
      ? toList(process.env.CORS_ORIGIN)
      : [process.env.CLIENT_URL || 'http://localhost:5173'],
  },

  ai: {
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    modelPool: toList(process.env.AI_MODEL_POOL),
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    keyEncryptionSecret: process.env.AI_KEY_ENCRYPTION_SECRET,
    allowPrivateHosts: process.env.ALLOW_PRIVATE_AI_HOSTS === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = requiredEnvVars.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export default config;
```

## `src/config/redis.js`

```js
import Redis from 'ioredis';
import config from './index.js';
import logger from '../shared/utils/logger.js';

const DEFAULT_TTL_SECONDS = 3600;

let client;
let initialized = false;

const buildClient = () => {
  const { urls, password } = config.redis;
  if (urls.length === 0) {
    logger.warn('No Redis URLs configured, running without Redis');
    return null;
  }
  const options = { lazyConnect: true, connectTimeout: 10000, maxRetriesPerRequest: 3 };
  if (urls.length === 1) {
    return new Redis(urls[0], options);
  }
  const nodes = urls.map((url) => {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port, 10) || 6379 };
  });
  return new Redis.Cluster(nodes, {
    redisOptions: { ...options, password },
    enableOfflineQueue: false,
  });
};

const getRedisClient = () => {
  if (!initialized) {
    initialized = true;
    client = buildClient();
    client?.on('error', (error) => logger.error('Redis error', { error: error.message }));
  }
  return client;
};

const safely = async (operation, fallback, label) => {
  const redis = getRedisClient();
  if (!redis) {
    return fallback;
  }
  try {
    return await operation(redis);
  } catch (error) {
    logger.error(`Redis ${label} failed`, { error: error.message });
    return fallback;
  }
};

const scanKeys = (redis, pattern) => new Promise((resolve, reject) => {
  const found = [];
  const stream = redis.scanStream({ match: pattern, count: 200 });
  stream.on('data', (keys) => found.push(...keys));
  stream.on('end', () => resolve(found));
  stream.on('error', reject);
});

class CacheManager {
  get(key) {
    return safely(async (redis) => {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    }, null, 'get');
  }

  set(key, value, ttl = DEFAULT_TTL_SECONDS) {
    return safely(async (redis) => {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return true;
    }, false, 'set');
  }

  del(...keys) {
    return safely(async (redis) => {
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    }, false, 'del');
  }

  exists(key) {
    return safely(async (redis) => (await redis.exists(key)) === 1, false, 'exists');
  }

  incr(key, ttl = DEFAULT_TTL_SECONDS) {
    return safely(async (redis) => {
      const value = await redis.incr(key);
      if (value === 1) {
        await redis.expire(key, ttl);
      }
      return value;
    }, 0, 'incr');
  }

  delByPattern(pattern) {
    return safely(async (redis) => {
      const keys = await scanKeys(redis, pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return keys.length;
    }, 0, 'delByPattern');
  }
}

class SessionManager {
  constructor(prefix = 'session') {
    this.prefix = prefix;
  }

  key(userId, sessionId) {
    return `${this.prefix}:${userId}:${sessionId}`;
  }

  createSession(userId, sessionId, data, ttl = 86400) {
    return safely(async (redis) => {
      const payload = { userId, ...data, createdAt: new Date().toISOString() };
      await redis.set(this.key(userId, sessionId), JSON.stringify(payload), 'EX', ttl);
      return sessionId;
    }, null, 'createSession');
  }

  getSession(userId, sessionId) {
    return safely(async (redis) => {
      const value = await redis.get(this.key(userId, sessionId));
      return value ? JSON.parse(value) : null;
    }, null, 'getSession');
  }

  deleteSession(userId, sessionId) {
    return safely(async (redis) => {
      await redis.del(this.key(userId, sessionId));
      return true;
    }, false, 'deleteSession');
  }

  deleteUserSessions(userId) {
    return safely(async (redis) => {
      const keys = await scanKeys(redis, `${this.prefix}:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    }, false, 'deleteUserSessions');
  }
}

const checkRedisHealth = () => safely(async (redis) => {
  const startedAt = Date.now();
  await redis.ping();
  return { connected: true, latencyMs: Date.now() - startedAt };
}, { connected: false, latencyMs: null }, 'ping');

const disconnectRedis = async () => {
  if (client) {
    await client.quit();
    client = null;
    initialized = false;
  }
};

export { getRedisClient, CacheManager, SessionManager, checkRedisHealth, disconnectRedis };
```

## `src/healthcheck.js`

```js
const port = process.env.PORT || 5000;
const TIMEOUT_MS = 4000;

const check = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    process.exit(response.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
};

check();
```

## `src/modules/auth/controllers/auth.controller.js`

```js
import config from '../../../config/index.js';
import {
  asyncHandler,
  httpResponse,
  httpError,
  responseMessage,
  logger,
} from '../../../shared/index.js';
import {
  signUpService,
  signInService,
  refreshSessionService,
  logoutService,
  logoutAllService,
  getMeService,
  listSessionsService,
} from '../services/auth.service.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: config.cookie.path,
});

const setRefreshCookie = (res, refreshToken) => {
  res.cookie(config.cookie.refreshName, refreshToken, {
    ...cookieOptions(),
    maxAge: config.cookie.maxAgeMs,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(config.cookie.refreshName, cookieOptions());
};

const requestContext = (req) => ({
  userAgent: req.get('User-Agent')?.slice(0, 300) ?? null,
  ip: req.ip ?? null,
});

const refreshTokenOf = (req) => req.cookies?.[config.cookie.refreshName] ?? null;

const failed = (req, res, error, message) => {
  const status = error.statusCode || 500;
  logger[status >= 500 ? 'error' : 'warn'](message, {
    error: error.message,
    stack: status >= 500 ? error.stack : undefined,
    userId: req.user?.id,
    requestId: req.requestId,
  });
  return httpError(req, res, error, status);
};

const signUp = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await signUpService(req.body, requestContext(req));
    setRefreshCookie(res, refreshToken);
    logger.info('User signed up', { userId: user.id, requestId: req.requestId });
    return httpResponse(req, res, 201, responseMessage.custom('Account created'), {
      accessToken,
      user,
    });
  } catch (error) {
    return failed(req, res, error, 'Sign up failed');
  }
});

const signIn = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await signInService(req.body, requestContext(req));
    setRefreshCookie(res, refreshToken);
    logger.info('User signed in', { userId: user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Signed in'), { accessToken, user });
  } catch (error) {
    return failed(req, res, error, 'Sign in failed');
  }
});

const refreshSession = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken } = await refreshSessionService(
      refreshTokenOf(req),
      requestContext(req)
    );
    if (refreshToken) {
      setRefreshCookie(res, refreshToken);
    }
    return httpResponse(req, res, 200, responseMessage.custom('Session refreshed'), {
      accessToken,
    });
  } catch (error) {
    clearRefreshCookie(res);
    return failed(req, res, error, 'Refresh failed');
  }
});

const logout = asyncHandler(async (req, res) => {
  try {
    await logoutService(refreshTokenOf(req));
    clearRefreshCookie(res);
    return httpResponse(req, res, 200, responseMessage.custom('Signed out'));
  } catch (error) {
    return failed(req, res, error, 'Logout failed');
  }
});

const logoutAll = asyncHandler(async (req, res) => {
  try {
    await logoutAllService(req.user.id);
    clearRefreshCookie(res);
    logger.info('Signed out everywhere', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Signed out on every device'));
  } catch (error) {
    return failed(req, res, error, 'Logout everywhere failed');
  }
});

const getMe = asyncHandler(async (req, res) => {
  try {
    const user = await getMeService(req.user.id);
    return httpResponse(req, res, 200, responseMessage.custom('Profile fetched'), { user });
  } catch (error) {
    return failed(req, res, error, 'Get profile failed');
  }
});

const listSessions = asyncHandler(async (req, res) => {
  try {
    const sessions = await listSessionsService(req.user.id, refreshTokenOf(req));
    return httpResponse(req, res, 200, responseMessage.custom('Sessions fetched'), { sessions });
  } catch (error) {
    return failed(req, res, error, 'List sessions failed');
  }
});

export { signUp, signIn, refreshSession, logout, logoutAll, getMe, listSessions };
```

## `src/modules/auth/index.js`

```js
export { default as authRoutes } from './routes/auth.route.js';
```

## `src/modules/auth/routes/auth.route.js`

```js
import express from 'express';
import { authenticate, validateRequest, authLimiter } from '../../../shared/index.js';
import {
  signUp,
  signIn,
  refreshSession,
  logout,
  logoutAll,
  getMe,
  listSessions,
} from '../controllers/auth.controller.js';
import { signUpSchema, signInSchema } from '../validations/auth.schema.js';

const router = express.Router();

router.post('/sign-up', authLimiter, validateRequest(signUpSchema, 'body'), signUp);
router.post('/sign-in', authLimiter, validateRequest(signInSchema, 'body'), signIn);
router.post('/refresh', authLimiter, refreshSession);
router.post('/logout', logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, getMe);
router.get('/sessions', authenticate, listSessions);

export default router;
```

## `src/modules/auth/validations/auth.schema.js`

```js
import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'));

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});
```

## `src/modules/health/controllers/health.controller.js`

```js
import { httpResponse, httpError, responseMessage } from '../../../shared/index.js';
import { getLivenessService, getReadinessService } from '../services/health.service.js';

const getLiveness = (req, res) => httpResponse(
  req,
  res,
  200,
  responseMessage.custom('OK'),
  getLivenessService()
);

const getReadiness = async (req, res) => {
  const { ready, database, redis } = await getReadinessService();
  const data = { status: ready ? 'ready' : 'degraded', database, redis };
  if (!ready) {
    return httpError(req, res, Object.assign(new Error('Service is degraded'), { data }), 503);
  }
  return httpResponse(req, res, 200, responseMessage.custom('Ready'), data);
};

export { getLiveness, getReadiness };
```

## `src/modules/health/index.js`

```js
export { default as healthRoutes } from './routes/health.route.js';
```

## `src/modules/health/routes/health.route.js`

```js
import express from 'express';
import { getLiveness, getReadiness } from '../controllers/health.controller.js';

const router = express.Router();

router.get('/', getLiveness);
router.get('/ready', getReadiness);

export default router;
```

## `src/modules/health/services/health.service.js`

```js
import { checkDatabaseHealth } from '../../../config/databases.js';
import { checkRedisHealth } from '../../../config/redis.js';

const getLivenessService = () => ({
  status: 'alive',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});

const getReadinessService = async () => {
  const [database, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  return { ready: database.connected, database, redis };
};

export { getLivenessService, getReadinessService };
```

## `src/router/index.js`

```js
import express from 'express';
import { healthRoutes } from '../modules/health/index.js';
import { authRoutes } from '../modules/auth/index.js';

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

export default router;
```

## `src/server.js`

```js
import app from './app.js';
import config from './config/index.js';
import { logger } from './shared/index.js';
import { connectDatabases, disconnectDatabases } from './config/databases.js';
import { disconnectRedis } from './config/redis.js';

const SHUTDOWN_TIMEOUT_MS = 30000;

const start = async () => {
  await connectDatabases();

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, { env: config.env });
  });

  server.on('error', (error) => {
    logger.error('Server error', { error: error.message, code: error.code });
    process.exit(1);
  });

  const shutdown = (signal) => {
    logger.warn(`Received ${signal}, shutting down`);
    server.close(async () => {
      try {
        await Promise.all([disconnectDatabases(), disconnectRedis()]);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Shutdown failed', { error: error.message });
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});
```

## `src/shared/cache/cache.js`

```js
import { CacheManager } from '../../config/redis.js';

const cache = new CacheManager();

const readThrough = async (key, ttlSeconds, loader) => {
  const hit = await cache.get(key);
  if (hit !== null && hit !== undefined) {
    return hit;
  }
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    await cache.set(key, fresh, ttlSeconds);
  }
  return fresh;
};

const bust = (...keys) => cache.del(...keys);

export { readThrough, bust };
```

## `src/shared/constant/application.js`

```js
export const EApplicationEnvironment = Object.freeze({
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
});
```

## `src/shared/constant/user.js`

```js
export const EUserRole = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
});
```

## `src/shared/index.js`

```js
export { EApplicationEnvironment } from './constant/application.js';
export { EUserRole } from './constant/user.js';
export { default as logger } from './utils/logger.js';
export {
  httpResponse,
  httpError,
  errorObject,
  publicError,
  responseMessage,
} from './utils/response.js';
export {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from './utils/token.js';
export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from './middleware/error-handler.middleware.js';
export { validateRequest } from './middleware/validate.middleware.js';
export { authenticate, authorize } from './middleware/auth.middleware.js';
export {
  globalLimiter,
  authLimiter,
  writeLimiter,
  readLimiter,
  aiLimiter,
} from './middleware/rate-limit.middleware.js';
export { readThrough, bust } from './cache/cache.js';
```

## `src/shared/middleware/auth.middleware.js`

```js
import { verifyAccessToken } from '../utils/token.js';
import { httpError } from '../utils/response.js';
import logger from '../utils/logger.js';

const extractBearer = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
};

const authenticate = (req, res, next) => {
  const token = extractBearer(req);
  if (!token) {
    return httpError(req, res, new Error('Authentication required'), 401);
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    logger.security('Access token rejected', { requestId: req.requestId });
    return httpError(req, res, new Error('Invalid or expired token'), 401);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return httpError(req, res, new Error('You do not have access to this'), 403);
  }
  return next();
};

export { authenticate, authorize };
```

## `src/shared/middleware/error-handler.middleware.js`

```js
import logger from '../utils/logger.js';
import { errorObject, responseMessage } from '../utils/response.js';

const KNOWN_ERRORS = [
  [(err) => err.name === 'JsonWebTokenError', 401, responseMessage.ERROR.UNAUTHORIZED],
  [(err) => err.name === 'TokenExpiredError', 401, 'Your session has expired. Please sign in again.'],
  [(err) => err.type === 'entity.parse.failed', 400, 'The request could not be read.'],
  [(err) => err.type === 'entity.too.large', 413, 'The request is too large.'],
];

const errorHandler = (err, req, res, _next) => {
  logger.error(`Unhandled error ${req.method} ${req.originalUrl}`, {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    userId: req.user?.id,
  });

  const known = KNOWN_ERRORS.find(([matches]) => matches(err));
  const body = known
    ? errorObject(Object.assign(new Error(known[2]), { statusCode: known[1] }), req, known[1])
    : errorObject(err, req, err.statusCode || err.status || 500);

  return res.status(body.statusCode).json(body);
};

const notFoundHandler = (req, res) => {
  const body = errorObject(new Error(`Route ${req.originalUrl} not found`), req, 404);
  return res.status(404).json(body);
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export { errorHandler, notFoundHandler, asyncHandler };
```

## `src/shared/middleware/rate-limit.middleware.js`

```js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getRedisClient } from '../../config/redis.js';
import config from '../../config/index.js';
import logger from '../utils/logger.js';
import { httpResponse } from '../utils/response.js';

const limits = config.rateLimiting;

class RedisRateStore {
  constructor(scope) {
    this.prefix = `rl:${scope}:`;
    this.windowMs = 60000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const fallback = { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    const client = getRedisClient();
    if (!client) {
      return fallback;
    }
    const redisKey = this.prefix + key;
    try {
      const results = await client.multi().incr(redisKey).pttl(redisKey).exec();
      const totalHits = results?.[0]?.[1] ?? 1;
      let ttl = results?.[1]?.[1] ?? -1;
      if (ttl < 0) {
        await client.pexpire(redisKey, this.windowMs);
        ttl = this.windowMs;
      }
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch (error) {
      logger.error('Rate limit store error', { error: error.message });
      return fallback;
    }
  }

  async decrement(key) {
    try {
      await getRedisClient()?.decr(this.prefix + key);
    } catch (error) {
      logger.error('Rate limit decrement error', { error: error.message });
    }
  }

  async resetKey(key) {
    try {
      await getRedisClient()?.del(this.prefix + key);
    } catch (error) {
      logger.error('Rate limit reset error', { error: error.message });
    }
  }
}

const byIp = (req) => ipKeyGenerator(req.ip);
const byUserOrIp = (req) => req.user?.id ?? byIp(req);

const passThrough = (req, res, next) => next();

const buildLimiter = ({ scope, windowMs, max, byUser }) => {
  if (!limits.enabled) {
    return passThrough;
  }
  return rateLimit({
    windowMs,
    limit: max,
    store: getRedisClient() ? new RedisRateStore(scope) : undefined,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: byUser ? byUserOrIp : byIp,
    handler: (req, res) => {
      logger.security('Rate limit exceeded', { scope, requestId: req.requestId });
      return httpResponse(req, res, 429, 'Too many requests, please slow down and try again.');
    },
  });
};

const globalLimiter = buildLimiter({
  scope: 'global',
  windowMs: limits.windowMs,
  max: limits.maxRequests,
  byUser: false,
});

const authLimiter = buildLimiter({
  scope: 'auth',
  windowMs: limits.authWindowMs,
  max: limits.authMaxRequests,
  byUser: false,
});

const writeLimiter = buildLimiter({
  scope: 'write',
  windowMs: 60000,
  max: limits.writeMaxRequests,
  byUser: true,
});

const readLimiter = buildLimiter({
  scope: 'read',
  windowMs: 60000,
  max: limits.readMaxRequests,
  byUser: true,
});

const aiLimiter = buildLimiter({
  scope: 'ai',
  windowMs: limits.aiWindowMs,
  max: limits.aiMaxRequests,
  byUser: true,
});

export { globalLimiter, authLimiter, writeLimiter, readLimiter, aiLimiter };
```

## `src/shared/middleware/validate.middleware.js`

```js
import { httpError } from '../utils/response.js';

const validateRequest = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
      .join(', ');
    return httpError(req, res, new Error(message), 400);
  }

  Object.defineProperty(req, source, {
    value: result.data,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return next();
};

export { validateRequest };
```

## `src/shared/utils/logger.js`

```js
import winston from 'winston';
import config from '../../config/index.js';

const isProduction = config.env === 'production';

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${extra}`;
  })
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({ format: isProduction ? productionFormat : developmentFormat }),
];

if (isProduction) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: productionFormat,
  transports,
  exitOnError: false,
});

logger.security = (message, meta = {}) => logger.warn(message, { security: true, ...meta });

export default logger;
```

## `src/shared/utils/response.js`

```js
import logger from './logger.js';
import config from '../../config/index.js';
import { EApplicationEnvironment } from '../constant/application.js';

export const responseMessage = {
  SUCCESS: {
    DEFAULT: 'Success',
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    FETCHED: 'Resource fetched successfully',
  },
  ERROR: {
    NOT_FOUND: 'Route not found',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    TOO_MANY_REQUESTS: 'Too many requests',
  },
  custom: (message) => message,
};

const UNEXPECTED_ERROR_MESSAGE = 'Unexpected server error. Please try again.';

const KNOWN_DATABASE_ERRORS = {
  P2000: [400, 'A value is longer than allowed.'],
  P2002: [409, 'A record with these details already exists.'],
  P2003: [409, 'A related record is missing.'],
  P2025: [404, 'Record not found.'],
  11000: [409, 'A record with these details already exists.'],
};

export const publicError = (err, statusCode = 500) => {
  const known = KNOWN_DATABASE_ERRORS[err?.code];
  if (known && !err.statusCode) {
    return { statusCode: known[0], message: known[1] };
  }
  if (err?.name === 'CastError') {
    return { statusCode: 400, message: 'Invalid id.' };
  }
  const message = err instanceof Error ? err.message : '';
  const intended = statusCode < 500 || err?.statusCode >= 500 || err?.expose === true;
  if (message && intended) {
    return { statusCode, message };
  }
  return { statusCode: statusCode >= 500 ? statusCode : 500, message: UNEXPECTED_ERROR_MESSAGE };
};

const requestMeta = (req) => ({
  method: req.method,
  url: req.originalUrl,
  ...(config.env === EApplicationEnvironment.PRODUCTION ? {} : { ip: req.ip || null }),
});

export const httpResponse = (req, res, statusCode, message, data = null) => {
  const body = { success: true, statusCode, request: requestMeta(req), message, data };
  return res.status(statusCode).json(body);
};

export const errorObject = (err, req, fallbackStatusCode = 500) => {
  const { statusCode, message } = publicError(err, fallbackStatusCode);
  const body = {
    success: false,
    statusCode,
    request: requestMeta(req),
    message,
    data: statusCode < 500 && err?.data ? err.data : null,
  };
  if (config.env !== EApplicationEnvironment.PRODUCTION && err instanceof Error) {
    body.trace = { error: err.stack };
  }
  return body;
};

export const httpError = (req, res, err, fallbackStatusCode = 500) => {
  const body = errorObject(err, req, fallbackStatusCode);
  const level = body.statusCode >= 500 ? 'error' : 'warn';
  logger[level]('Request failed', {
    statusCode: body.statusCode,
    url: req.originalUrl,
    requestId: req.requestId,
    cause: err instanceof Error ? err.message : String(err),
  });
  return res.status(body.statusCode).json(body);
};
```

## `src/shared/utils/token.js`

```js
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

const signAccessToken = ({ userId, role }) => jwt.sign(
  { sub: String(userId), role },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);

const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

const signRefreshToken = ({ userId, sessionId, jti }) => jwt.sign(
  { sub: String(userId), sid: String(sessionId), jti },
  config.jwt.refreshSecret,
  { expiresIn: config.jwt.refreshExpiresIn }
);

const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken, hashToken };
```
