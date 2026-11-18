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
