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
