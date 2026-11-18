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
