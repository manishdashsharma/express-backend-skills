# PostgreSQL files

Add these for a PostgreSQL (Prisma 7) project, on top of `common.md`. Make `docker-entrypoint.sh` executable (`chmod +x`).

Files in this bundle: 8.

## `Dockerfile`

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json prisma.config.js ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npm run db:generate

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.js ./
COPY prisma ./prisma
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R app:app /app
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "src/healthcheck.js"]
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
```

## `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: YOUR_DB_PASSWORD
      POSTGRES_DB: app
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d app']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ['redis-server', '--appendonly', 'yes']
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  redis-data:
```

## `docker-entrypoint.sh`

```sh
#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
```

## `package.json`

```json
{
  "name": "__PACKAGE_NAME__",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.10.0",
    "@prisma/client": "^7.10.0",
    "bcrypt": "^6.0.0",
    "compression": "^1.8.1",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-rate-limit": "^8.6.2",
    "helmet": "^8.3.0",
    "ioredis": "^6.0.0",
    "jsonwebtoken": "^9.0.3",
    "pg": "^8.23.0",
    "winston": "^3.19.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.9.1",
    "prisma": "^7.10.0"
  }
}
```

## `prisma.config.js`

```js
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

## `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  OWNER
  MANAGER
  STAFF
}

model User {
  id           String    @id @default(cuid())
  name         String    @db.VarChar(100)
  email        String    @unique @db.VarChar(254)
  passwordHash String
  role         UserRole  @default(OWNER)
  lastLoginAt  DateTime?
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  sessions Session[]

  @@index([email, isActive])
  @@map("users")
}

model Session {
  id                String    @id
  userId            String
  tokenHash         String
  previousTokenHash String?
  userAgent         String?   @db.VarChar(300)
  ip                String?   @db.VarChar(64)
  expiresAt         DateTime
  revokedAt         DateTime?
  refreshedAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId, revokedAt])
  @@index([expiresAt])
  @@map("sessions")
}
```

## `src/config/databases.js`

```js
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from './index.js';
import logger from '../shared/utils/logger.js';

let writeClient;
let readClient;

const createClient = (connectionString) => new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: config.database.poolMax }),
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});

const getWriteDB = () => {
  if (!writeClient) {
    writeClient = createClient(config.database.url);
  }
  return writeClient;
};

const getReadDB = () => {
  if (!config.database.readUrl) {
    return getWriteDB();
  }
  if (!readClient) {
    readClient = createClient(config.database.readUrl);
  }
  return readClient;
};

const connectDatabases = async () => {
  await getWriteDB().$connect();
  logger.info('PostgreSQL write connected');
  if (getReadDB() !== getWriteDB()) {
    await getReadDB().$connect();
    logger.info('PostgreSQL read connected');
  }
};

const checkDatabaseHealth = async () => {
  const startedAt = Date.now();
  try {
    await getWriteDB().$queryRaw`SELECT 1`;
    return { connected: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { connected: false, latencyMs: null, error: error.message };
  }
};

const disconnectDatabases = async () => {
  await Promise.all([writeClient?.$disconnect(), readClient?.$disconnect()]);
  logger.info('PostgreSQL disconnected');
};

export { getWriteDB, getReadDB, connectDatabases, checkDatabaseHealth, disconnectDatabases };
```

## `src/modules/auth/services/auth.service.js`

```js
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import config from '../../../config/index.js';
import { getReadDB, getWriteDB } from '../../../config/databases.js';
import {
  logger,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../../shared/index.js';

const USER_SELECT = { id: true, name: true, email: true, role: true, createdAt: true };
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);

const failure = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const claimsOf = (user) => ({ userId: user.id, role: user.role });

const sessionExpiry = () => new Date(Date.now() + config.cookie.maxAgeMs);

const withinGrace = (moment) => Boolean(moment)
  && Date.now() - moment.getTime() <= config.session.refreshReuseGraceMs;

const createSession = async (db, user, ctx) => {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken({ userId: user.id, sessionId, jti: randomUUID() });
  await db.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      expiresAt: sessionExpiry(),
    },
    select: { id: true },
  });
  return { accessToken: signAccessToken(claimsOf(user)), refreshToken };
};

const revokeAllSessions = (db, userId) => db.session.updateMany({
  where: { userId, revokedAt: null },
  data: { revokedAt: new Date() },
});

const signUpService = async ({ name, email, password }, ctx) => {
  const db = getWriteDB();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw failure('An account with this email already exists', 409);
  }
  const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);
  const user = await db.user.create({
    data: { name, email, passwordHash, lastLoginAt: new Date() },
    select: USER_SELECT,
  });
  const tokens = await createSession(db, user, ctx);
  return { ...tokens, user };
};

const signInService = async ({ email, password }, ctx) => {
  const db = getWriteDB();
  const found = await db.user.findFirst({
    where: { email, isActive: true },
    select: { ...USER_SELECT, passwordHash: true },
  });
  const matches = await bcrypt.compare(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!found || !matches) {
    throw failure('Email or password is incorrect', 401);
  }
  const user = Object.fromEntries(
    Object.entries(found).filter(([field]) => field !== 'passwordHash')
  );
  const [tokens] = await Promise.all([
    createSession(db, user, ctx),
    db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    }),
  ]);
  return { ...tokens, user };
};

const refreshSessionService = async (rawToken, ctx) => {
  if (!rawToken) {
    throw failure('No active session', 401);
  }
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw failure('Session expired, please sign in again', 401);
  }

  const db = getWriteDB();
  const session = await db.session.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      previousTokenHash: true,
      expiresAt: true,
      revokedAt: true,
      refreshedAt: true,
      user: { select: { id: true, role: true, isActive: true } },
    },
  });
  if (!session || session.userId !== payload.sub) {
    throw failure('Session not found', 401);
  }
  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw failure('Session expired, please sign in again', 401);
  }
  if (!session.user.isActive) {
    throw failure('Account is disabled', 401);
  }

  const presented = hashToken(rawToken);
  const accessToken = signAccessToken(claimsOf(session.user));

  if (presented === session.previousTokenHash && withinGrace(session.refreshedAt)) {
    return { accessToken, refreshToken: null };
  }
  if (presented !== session.tokenHash) {
    await revokeAllSessions(db, session.userId);
    logger.security('Refresh token reuse detected', { userId: session.userId });
    throw failure('Session invalidated, please sign in again', 401);
  }

  const refreshToken = signRefreshToken({
    userId: session.userId,
    sessionId: session.id,
    jti: randomUUID(),
  });
  const rotated = await db.session.updateMany({
    where: { id: session.id, tokenHash: presented, revokedAt: null },
    data: {
      tokenHash: hashToken(refreshToken),
      previousTokenHash: presented,
      refreshedAt: new Date(),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      expiresAt: sessionExpiry(),
    },
  });
  return { accessToken, refreshToken: rotated.count === 1 ? refreshToken : null };
};

const logoutService = async (rawToken) => {
  if (!rawToken) {
    return;
  }
  try {
    const payload = verifyRefreshToken(rawToken);
    await getWriteDB().session.updateMany({
      where: { id: payload.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    logger.info('Logout with an invalid refresh token');
  }
};

const logoutAllService = async (userId) => {
  await revokeAllSessions(getWriteDB(), userId);
};

const getMeService = async (userId) => {
  const user = await getReadDB().user.findFirst({
    where: { id: userId, isActive: true },
    select: USER_SELECT,
  });
  if (!user) {
    throw failure('Account not found', 404);
  }
  return user;
};

const listSessionsService = async (userId, rawToken) => {
  const currentHash = rawToken ? hashToken(rawToken) : null;
  const sessions = await getReadDB().session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      tokenHash: true,
      previousTokenHash: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      refreshedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt,
    lastActiveAt: session.refreshedAt ?? session.createdAt,
    isCurrent: currentHash !== null
      && (session.tokenHash === currentHash || session.previousTokenHash === currentHash),
  }));
};

export {
  signUpService,
  signInService,
  refreshSessionService,
  logoutService,
  logoutAllService,
  getMeService,
  listSessionsService,
};
```
