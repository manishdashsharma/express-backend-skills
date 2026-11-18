import { CacheManager } from '../../config/redis.js';

const cache = new CacheManager();

const readThrough = async (key, ttlSeconds, loader) => {
  const hit = await cache.get(key);
  if (hit !== null && hit !== undefined) {
    return hit;
  }
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    await cache.set(key, fresh, ttlSeconds);
  }
  return fresh;
};

const bust = (...keys) => cache.del(...keys);

export { readThrough, bust };
