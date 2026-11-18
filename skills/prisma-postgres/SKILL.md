---
name: prisma-postgres
description: PostgreSQL with Prisma 7 done right — read/write client getters with replica support, schema requirements and indexes, explicit select, pagination, N+1-free batching, transactions with atomic counters, error codes, migrations workflow and raw SQL rules. Use when writing or reviewing Prisma schema, queries, migrations or Postgres data access in Node.js.
---

# Prisma / PostgreSQL

## Client access

Never `new PrismaClient()` in a module. Use the getters:

```js
import { getWriteDB, getReadDB } from '../../../config/databases.js';
```

- Call the getter **inside** the function, never at module top level.
- `getReadDB()` for reads (uses the read replica when `DATABASE_READ_URL` is set).
- `getWriteDB()` for writes **and** for read-before-write consistency checks (a replica may lag).
- Prisma 7 uses the driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) })`. Pool size comes from config.

## Schema requirements

```prisma
model Invoice {
  id         String        @id @default(cuid())
  orgId      String
  customerId String
  number     Int
  status     InvoiceStatus @default(DRAFT)
  total      Decimal       @db.Decimal(12, 2)
  isActive   Boolean       @default(true)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  org      Organization @relation(fields: [orgId], references: [id])
  customer Customer     @relation(fields: [customerId], references: [id])

  @@unique([orgId, number])
  @@index([orgId, isActive])
  @@index([orgId, isActive, status, createdAt])
  @@index([customerId])
  @@map("invoices")
}
```

- Every table: `isActive Boolean @default(true)`, `createdAt`, `updatedAt`, a scope field.
- `@@index([scope, isActive])` always. Every field in a `where` or `orderBy` is covered by an index. Foreign keys get their own index (Postgres does not add one).
- `@@map` to snake_case plural table names; be consistent with `@map` on columns.
- Money is `Decimal`, never `Float`. Status fields are Prisma `enum`s.
- Append-only tables (audit logs, billing events) may skip `isActive` — say so explicitly.

## Query rules

```js
const db = getReadDB();
const where = { orgId, isActive: true, ...(status ? { status } : {}) };
const [total, items] = await Promise.all([
  db.invoice.count({ where }),
  db.invoice.findMany({
    where,
    select: { id: true, number: true, status: true, total: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  }),
]);
```

- **Always `select` or `include` explicitly.** Never return a full row; never `include` a relation without its own `select`.
- **Always `isActive: true` + scope** in `where`. Use `findFirst` with scope rather than `findUnique` by id alone, so another tenant's id returns nothing.
- **No query inside a loop.** Batch with `where: { id: { in: ids } }` and join in memory with a `Map`, or use a nested `select`.
- Independent queries in `Promise.all`.
- Scoped writes: `updateMany({ where: { id, orgId, isActive: true }, data })` and check `count === 0` → 404. This avoids a separate existence read and cannot touch another tenant's row.
- Soft delete: `data: { isActive: false }`. Never `delete` / `deleteMany`.
- Bulk: `createMany`, `updateMany`. Never a loop of single writes.

## Transactions

Use an interactive transaction when several writes must succeed together:

```js
const invoice = await getWriteDB().$transaction(async (tx) => {
  const org = await tx.organization.update({
    where: { id: orgId },
    data: { invoiceSeq: { increment: 1 } },
    select: { invoiceSeq: true },
  });
  return tx.invoice.create({
    data: { orgId, customerId, number: org.invoiceSeq, total },
    select: { id: true, number: true },
  });
});
```

- Sequence/counter fields are bumped with `{ increment: 1 }` inside the same transaction as the insert. Never read-then-write a counter.
- Audit rows are written in the same transaction as the change they describe.
- Keep transactions short: no network calls, no AI calls, no email inside.
- Derived totals that are read often are maintained in the same transaction as the change, not recomputed with a live `SUM()` on every read.

## Errors

Handled centrally by `publicError`; throw your own only for a domain-specific sentence:

| Code | Meaning | Status |
|---|---|---|
| `P2002` | Unique constraint | 409 |
| `P2025` | Record not found | 404 |
| `P2003` | Foreign key violation | 409 |
| `P2000` | Value too long | 400 |

Do not catch Prisma errors in services just to rethrow them.

## Migrations

- After a schema change: `npm run db:generate && npm run db:migrate -- --name <what_changed>`.
- Migrations are committed. Never edit an applied migration; write a new one.
- Deploy runs `prisma migrate deploy` (entrypoint or release step), never `migrate dev`.
- Destructive changes go in two steps: stop reading/writing the column, deploy, then drop it in a later migration.
- Backfills that touch many rows are a migration SQL step or a one-off job script, not request-time code.

## Raw SQL

Only when Prisma has no equivalent (full-text, vector search, window functions). Always the tagged template `$queryRaw\`... ${value}\`` so values are parameterized. Never `$queryRawUnsafe` with user input.
