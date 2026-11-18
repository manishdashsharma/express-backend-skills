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
