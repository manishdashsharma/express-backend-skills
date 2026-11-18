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
