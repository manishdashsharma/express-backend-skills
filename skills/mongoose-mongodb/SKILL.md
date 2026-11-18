---
name: mongoose-mongodb
description: MongoDB with Mongoose done right — connection handling (server and serverless), model schema requirements, indexes, .select/.lean, pagination, soft delete, $in batching instead of N+1, aggregation, transactions and duplicate-key handling. Use when writing or reviewing Mongoose models, queries or MongoDB data access in Node.js.
---

# Mongoose / MongoDB

## Connection

One connection per process, pool capped at 10, reused everywhere:

```js
import { getMongoose } from '../config/databases.js';
```

- Long-running server: call `connectDatabases()` once in `server.js` before `listen`; disconnect in the graceful shutdown.
- Serverless / Next.js route handlers: call `await getMongoose()` at the top of each service. The connection promise is cached on `globalThis` so hot reloads and warm invocations reuse it, and a failed connect clears the cached promise so the next call retries.
- `maxPoolSize: 10`. Do not raise it per call site.

## Model requirements

```js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: Object.values(EOrderStatus), default: EOrderStatus.PENDING },
    total: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

orderSchema.index({ storeId: 1, isActive: 1 });
orderSchema.index({ storeId: 1, isActive: 1, status: 1, createdAt: -1 });

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
```

Every model has:
- `isActive: { type: Boolean, default: true }` and `{ timestamps: true }`.
- A scope field (`storeId` / `orgId` / `userId`), required and indexed.
- Compound `{ scope: 1, isActive: 1 }` index.
- An index covering **every** field used in a `find`/`findOne` filter or sort. Compound order: equality fields first, then sort, then range (ESR).
- Unique constraints that must ignore soft-deleted rows use `partialFilterExpression: { isActive: true }`.
- `enum` values come from an `E`-prefixed constant, not inline strings repeated across files.
- `trim`, `maxlength`, `min` on user input fields, mirroring the Zod schema.
- The `mongoose.models.X ||` guard so hot reload does not throw `OverwriteModelError`.
- Model files may need `no-invalid-this: off` in ESLint (for `pre` hooks using `this`); the override must be the last config entry.

## Query rules

```js
const [total, items] = await Promise.all([
  Order.countDocuments(filter),
  Order.find(filter)
    .select('status total customerId createdAt')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(),
]);
```

- **Always `.select()`** the fields you return. Never fetch the whole document by default.
- **Always `.lean()`** on reads you do not `.save()` afterwards.
- **Always filter `isActive: true` and the scope field.** Scope comes from `req.user`, never from the body.
- **Never query inside a loop.** Collect ids and batch:

```js
const customerIds = [...new Set(orders.map((order) => String(order.customerId)))];
const customers = await Customer.find({ _id: { $in: customerIds }, isActive: true })
  .select('name phone')
  .lean();
const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));
```

  `populate` with `select` is fine for one level; prefer the `$in` + `Map` pattern for hot paths and anything paginated.
- Independent queries go in `Promise.all`.
- Updates by scope, not just `_id`: `findOneAndUpdate({ _id, storeId, isActive: true }, { $set: payload }, { new: true, runValidators: true })`. A `null` result means 404.
- Soft delete: `{ $set: { isActive: false } }`. Never `deleteOne`, `deleteMany`, `findByIdAndDelete`.
- Bulk changes: `updateMany` / `bulkWrite`, never a loop of `save()`.
- User-supplied search goes through a regex escape before `$regex`, and is length-limited in Zod.
- Unbounded reads always carry a `.limit()`.

## Aggregation

Use for reporting, grouping and joins you would otherwise do in a loop. First stage is always `$match` on scope + `isActive` so it uses the index; `$project` early to drop fields. Cast string ids with `new mongoose.Types.ObjectId(id)` inside `$match` (aggregate does not auto-cast).

## Transactions

Use `session.withTransaction` only when several documents must change together (requires a replica set). Pass `{ session }` to every operation inside. Keep the work inside short; no external calls.

## Errors

- Duplicate key `code === 11000` → 409 with a human message (handled centrally by `publicError`, or throw your own when you need a specific sentence).
- `CastError` on a bad id → 400. Validate ids in Zod (`/^[a-f\d]{24}$/i`) so this rarely reaches the database.
- Not found / not yours → 404.

## Validation alignment

Zod validates at the edge; the schema validates at the data layer. Keep limits identical (`max(100)` ↔ `maxlength: 100`).
