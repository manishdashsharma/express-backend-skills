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
