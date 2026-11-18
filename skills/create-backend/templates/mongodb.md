# MongoDB files

Add these for a MongoDB (Mongoose) project, on top of `common.md`.

Files in this bundle: 7.

## `Dockerfile`

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN chown -R app:app /app
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
```

## `docker-compose.yml`

```yaml
services:
  mongo:
    image: mongo:8
    restart: unless-stopped
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', 'db.adminCommand("ping")']
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
  mongo-data:
  redis-data:
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
    "lint:fix": "eslint src --fix"
  },
  "dependencies": {
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
    "mongoose": "^9.12.1",
    "winston": "^3.19.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.9.1"
  }
}
```

## `src/config/databases.js`

```js
import mongoose from 'mongoose';
import config from './index.js';
import logger from '../shared/utils/logger.js';

const state = globalThis.mongooseState || { conn: null, promise: null };
globalThis.mongooseState = state;

const getMongoose = async () => {
  if (state.conn) {
    return state.conn;
  }
  if (!config.mongo.uri) {
    const error = new Error('MONGODB_URI is not set');
    error.statusCode = 503;
    throw error;
  }
  if (!state.promise) {
    state.promise = mongoose
      .connect(config.mongo.uri, { maxPoolSize: config.mongo.maxPoolSize })
      .catch((error) => {
        state.promise = null;
        throw error;
      });
  }
  state.conn = await state.promise;
  return state.conn;
};

const connectDatabases = async () => {
  await getMongoose();
  logger.info('MongoDB connected');
};

const checkDatabaseHealth = async () => {
  const startedAt = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { connected: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { connected: false, latencyMs: null, error: error.message };
  }
};

const disconnectDatabases = async () => {
  await mongoose.disconnect();
  state.conn = null;
  state.promise = null;
  logger.info('MongoDB disconnected');
};

export { getMongoose, connectDatabases, checkDatabaseHealth, disconnectDatabases };
```

## `src/models/session.model.js`

```js
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    refreshedAt: { type: Date },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);
```

## `src/models/user.model.js`

```js
import mongoose from 'mongoose';
import { EUserRole } from '../shared/constant/user.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(EUserRole), default: EUserRole.OWNER },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ email: 1, isActive: 1 });

export default mongoose.models.User || mongoose.model('User', userSchema);
```

## `src/modules/auth/services/auth.service.js`

```js
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import config from '../../../config/index.js';
import User from '../../../models/user.model.js';
import Session from '../../../models/session.model.js';
import {
  logger,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../../shared/index.js';

const USER_FIELDS = 'name email role createdAt';
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);

const failure = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

const claimsOf = (user) => ({ userId: user._id, role: user.role });

const sessionExpiry = () => new Date(Date.now() + config.cookie.maxAgeMs);

const withinGrace = (moment) => Boolean(moment)
  && Date.now() - new Date(moment).getTime() <= config.session.refreshReuseGraceMs;

const createSession = async (user, ctx) => {
  const sessionId = new mongoose.Types.ObjectId();
  const refreshToken = signRefreshToken({ userId: user._id, sessionId, jti: randomUUID() });
  await Session.create({
    _id: sessionId,
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    expiresAt: sessionExpiry(),
  });
  return { accessToken: signAccessToken(claimsOf(user)), refreshToken };
};

const revokeAllSessions = (userId) => Session.updateMany(
  { userId, revokedAt: null },
  { $set: { revokedAt: new Date() } }
);

const signUpService = async ({ name, email, password }, ctx) => {
  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) {
    throw failure('An account with this email already exists', 409);
  }
  const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);
  const user = await User.create({ name, email, passwordHash, lastLoginAt: new Date() });
  const tokens = await createSession(user, ctx);
  return { ...tokens, user: toUser(user) };
};

const signInService = async ({ email, password }, ctx) => {
  const user = await User.findOne({ email, isActive: true })
    .select(`${USER_FIELDS} +passwordHash`)
    .lean();
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw failure('Email or password is incorrect', 401);
  }
  const [tokens] = await Promise.all([
    createSession(user, ctx),
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }),
  ]);
  return { ...tokens, user: toUser(user) };
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

  const session = await Session.findById(payload.sid)
    .select('userId tokenHash previousTokenHash expiresAt revokedAt refreshedAt')
    .lean();
  if (!session || String(session.userId) !== payload.sub) {
    throw failure('Session not found', 401);
  }
  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw failure('Session expired, please sign in again', 401);
  }

  const user = await User.findOne({ _id: session.userId, isActive: true })
    .select('role')
    .lean();
  if (!user) {
    throw failure('Account is disabled', 401);
  }

  const presented = hashToken(rawToken);
  const accessToken = signAccessToken(claimsOf(user));

  if (presented === session.previousTokenHash && withinGrace(session.refreshedAt)) {
    return { accessToken, refreshToken: null };
  }
  if (presented !== session.tokenHash) {
    await revokeAllSessions(session.userId);
    logger.security('Refresh token reuse detected', { userId: String(session.userId) });
    throw failure('Session invalidated, please sign in again', 401);
  }

  const refreshToken = signRefreshToken({
    userId: session.userId,
    sessionId: session._id,
    jti: randomUUID(),
  });
  const rotated = await Session.updateOne(
    { _id: session._id, tokenHash: presented, revokedAt: null },
    {
      $set: {
        tokenHash: hashToken(refreshToken),
        previousTokenHash: presented,
        refreshedAt: new Date(),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: sessionExpiry(),
      },
    }
  );
  return { accessToken, refreshToken: rotated.modifiedCount === 1 ? refreshToken : null };
};

const logoutService = async (rawToken) => {
  if (!rawToken) {
    return;
  }
  try {
    const payload = verifyRefreshToken(rawToken);
    await Session.updateOne(
      { _id: payload.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  } catch {
    logger.info('Logout with an invalid refresh token');
  }
};

const logoutAllService = async (userId) => {
  await revokeAllSessions(userId);
};

const getMeService = async (userId) => {
  const user = await User.findOne({ _id: userId, isActive: true }).select(USER_FIELDS).lean();
  if (!user) {
    throw failure('Account not found', 404);
  }
  return toUser(user);
};

const listSessionsService = async (userId, rawToken) => {
  const currentHash = rawToken ? hashToken(rawToken) : null;
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select('tokenHash previousTokenHash userAgent ip createdAt refreshedAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return sessions.map((session) => ({
    id: String(session._id),
    userAgent: session.userAgent ?? null,
    ip: session.ip ?? null,
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
