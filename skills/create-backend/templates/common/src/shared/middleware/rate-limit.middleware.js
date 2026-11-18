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
