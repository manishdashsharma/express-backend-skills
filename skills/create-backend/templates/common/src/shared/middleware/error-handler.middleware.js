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
