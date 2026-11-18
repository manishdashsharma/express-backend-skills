---
name: redis-cache
description: Redis with ioredis in a Node.js backend — CacheManager and SessionManager helpers, cache-aside reads, key naming, mandatory TTLs, invalidation on write, Redis as non-fatal, SCAN instead of KEYS, Redis-backed rate limiting and pub/sub. Use when adding caching, sessions, rate limits, counters or realtime fan-out with Redis, or reviewing Redis code.
---

# Redis

## Access

Never `new Redis()` in a module. Use the helpers from `src/config/redis.js` (template in the `create-backend` skill):

```js
import { getRedisClient, CacheManager, SessionManager } from '../../../config/redis.js';

const cache = new CacheManager();
```

Instantiating `CacheManager` at module scope is fine — it holds no connection of its own.

## Non-negotiables

1. **Every key has a TTL.** `cache.set(key, value, ttlSeconds)`; counters use `incr(key, ttl)` which sets expiry on first hit. No key lives forever, especially anything sensitive.
2. **Redis is non-fatal.** Every helper catches errors and returns a safe default (`null`, `false`, `0`, `[]`). Services must still work when Redis is down. Never `throw` from a cache path.
3. **Invalidate on write.** The service function that mutates data deletes every cache key that covers it, in the same function, after the write succeeds. Cross-entity writes bust every affected key.
4. **Never `KEYS` in production code.** Use `SCAN` (`delByPattern` in the template). Prefer deterministic keys you can delete directly over pattern deletes.

## Key naming

`<resource>:<scopeId>:<id>` or `<resource>:<scopeId>:<detail>` — always include the tenant scope so one tenant can never read another's cache.

```
vendor:store_1:abc123
categories:store_1
unread:store_1:user_4
stats:store_1:daily
```

Define key builders and TTL constants once per module or in `shared/cache/`:

```js
const VENDOR_TTL_SECONDS = 300;
const vendorKey = (storeId, vendorId) => `vendor:${storeId}:${vendorId}`;
```

## Cache-aside

```js
const readThrough = async (key, ttl, loader) => {
  const hit = await cache.get(key);
  if (hit !== null) {
    return hit;
  }
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    await cache.set(key, fresh, ttl);
  }
  return fresh;
};

const getVendorService = (storeId, vendorId) =>
  readThrough(vendorKey(storeId, vendorId), VENDOR_TTL_SECONDS, () => loadVendor(storeId, vendorId));
```

- The caller never sees a miss.
- Do not cache "not found" unless you also bust it on create.

## What to cache

Good: single-entity detail reads, small per-tenant lookups (tags, settings, plan limits), unread counts, dashboard aggregates with a short TTL (30–120 s), user/session lookups on the auth path.

Do not cache: paginated or filtered lists (the key space explodes and invalidation is unreliable), anything that must be strongly consistent (balances, inventory decrements), or data larger than a few hundred KB.

## Sessions

Refresh-token tracking and "log out everywhere" go through `SessionManager` or a database session table — not `CacheManager`. Session keys include the user id so all of a user's sessions can be found with one `SCAN`. TTL equals the refresh-token lifetime.

## Rate limiting

Back `express-rate-limit` with a Redis store so limits hold across instances:
- A coarse per-IP limit on everything.
- A strict per-IP limit on credential endpoints (sign-in, sign-up, refresh, password reset).
- Per-user limits (IP fallback) for reads and writes, and a tighter one for expensive routes (AI, exports).
- All numbers come from config (`RATE_LIMIT_*`), disabled automatically in development, forcible via env.
- Store: `MULTI` → `INCR` + `PTTL`, set `PEXPIRE` when the key is new; on Redis error, fail open with a single-hit result and log.

## Pub/Sub and realtime

Publishing to a channel for a separate realtime service is fire-and-forget: wrap in try/catch, log, never fail the request. Payloads carry ids and an event name, not full records with private fields. Use a dedicated subscriber connection (`client.duplicate()`), never the command client.
