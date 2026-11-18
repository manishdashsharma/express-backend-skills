---
name: scheduled-jobs
description: Scheduled and background work for Node.js backends without a queue library — one plain script per job in src/jobs, run by cron (supercronic in a scheduler container), idempotent, batched, reusing module services, with clean connect/disconnect and exit codes. Use when adding cron jobs, nightly cleanups, reminders, digests, expiry sweeps, recurring records or backfills.
---

# Scheduled Jobs

Default to plain scripts. Add a queue library only when the user asks for one or the work is triggered per request and must survive restarts.

## Layout

```
src/jobs/<verb>-<noun>.js       expire-trials.js, send-weekly-reports.js
cron/prod.crontab
cron/staging.crontab
package.json scripts:           "job:expire-trials": "node src/jobs/expire-trials.js"
```

## Script shape

```js
import 'dotenv/config';
import { connectDatabases, disconnectDatabases, getWriteDB } from '../config/databases.js';
import { disconnectRedis } from '../config/redis.js';
import { logger } from '../shared/index.js';
import { expireTrialService } from '../modules/billing/services/billing.service.js';

const BATCH_SIZE = 200;

const run = async () => {
  await connectDatabases();
  const db = getWriteDB();
  const now = new Date();
  let processed = 0;
  let cursor;

  for (;;) {
    const batch = await db.subscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { lt: now }, isActive: true },
      select: { id: true, orgId: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) {
      break;
    }
    await Promise.all(batch.map((subscription) => expireTrialService(db, subscription)));
    processed += batch.length;
    cursor = batch.at(-1).id;
  }

  logger.info('Expired trials processed', { count: processed });
};

run()
  .catch((error) => {
    logger.error('expire-trials failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis();
    await disconnectDatabases();
  });
```

## Rules

- **Idempotent.** Running twice, or overlapping with the previous run, must not double-send or double-apply. Select only rows still in the "to do" state and transition them with a conditional update (`updateMany({ where: { id, status: 'TRIAL' } })`), or record a `sentAt`/`lastRunKey`.
- **Batched.** Cursor-paginate large sets; never load the whole table. Concurrency inside a batch is bounded (`Promise.all` over one batch, not over everything).
- **Reuse services.** Business logic lives in module services so the API and the job behave identically. The job script only selects work and calls services.
- **Same rules as requests:** explicit `select`, `isActive` filters, no N+1, cache invalidation on writes.
- **Exit codes:** set `process.exitCode = 1` on failure so the scheduler and alerts see it; always disconnect in `finally`.
- **Time:** compare in UTC; per-user local times (a report at 9am local) store the user's timezone and select by computed UTC window.
- **Locking** (multiple scheduler replicas): take a Redis lock `SET job:<name> <id> NX EX <seconds>` at start and skip if held; or run exactly one scheduler container.

## Scheduling

Run the same image as the API in a `scheduler` container with `supercronic` (cron for containers, logs to stdout):

```
*/15 * * * *  node src/jobs/expire-trials.js
0    2 * * *  node src/jobs/purge-expired-sessions.js
0    9 * * 1  node src/jobs/send-weekly-reports.js
```

Offset minutes (`17 * * * *`) so jobs do not all start at :00. Keep separate crontabs per environment.
