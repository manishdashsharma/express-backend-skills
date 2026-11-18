# MongoDB example module

A complete reference feature module ("vendor") for MongoDB. It is a pattern: copy it once per entity and rename `vendor` / `Vendor` / `vendors` / `VENDOR`. Never ship it as is.

Files in this bundle: 7.

## `src/models/vendor.model.js`

```js
import mongoose from 'mongoose';
import { EVendorStatus } from '../shared/constant/vendor.js';

const vendorSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 20 },
    status: {
      type: String,
      enum: Object.values(EVendorStatus),
      default: EVendorStatus.ACTIVE,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vendorSchema.index({ ownerId: 1, isActive: 1 });
vendorSchema.index({ ownerId: 1, isActive: 1, createdAt: -1 });
vendorSchema.index(
  { ownerId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { isActive: true, phone: { $type: 'string' } } }
);

export default mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
```

## `src/modules/vendor/controllers/vendor.controller.js`

```js
import {
  asyncHandler,
  httpResponse,
  httpError,
  responseMessage,
  logger,
} from '../../../shared/index.js';
import {
  listVendorsService,
  getVendorService,
  createVendorService,
  updateVendorService,
  removeVendorService,
} from '../services/vendor.service.js';

const failed = (req, res, error, message) => {
  const status = error.statusCode || 500;
  logger[status >= 500 ? 'error' : 'warn'](message, {
    error: error.message,
    stack: status >= 500 ? error.stack : undefined,
    userId: req.user?.id,
    requestId: req.requestId,
  });
  return httpError(req, res, error, status);
};

const listVendors = asyncHandler(async (req, res) => {
  try {
    const result = await listVendorsService(req.user.id, req.query);
    return httpResponse(req, res, 200, responseMessage.custom('Vendors fetched'), result);
  } catch (error) {
    return failed(req, res, error, 'List vendors failed');
  }
});

const getVendor = asyncHandler(async (req, res) => {
  try {
    const vendor = await getVendorService(req.user.id, req.params.vendorId);
    return httpResponse(req, res, 200, responseMessage.custom('Vendor fetched'), { vendor });
  } catch (error) {
    return failed(req, res, error, 'Get vendor failed');
  }
});

const createVendor = asyncHandler(async (req, res) => {
  try {
    const vendor = await createVendorService(req.user.id, req.body);
    logger.info('Vendor created', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 201, responseMessage.custom('Vendor created'), { vendor });
  } catch (error) {
    return failed(req, res, error, 'Create vendor failed');
  }
});

const updateVendor = asyncHandler(async (req, res) => {
  try {
    const vendor = await updateVendorService(req.user.id, req.params.vendorId, req.body);
    logger.info('Vendor updated', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Vendor updated'), { vendor });
  } catch (error) {
    return failed(req, res, error, 'Update vendor failed');
  }
});

const removeVendor = asyncHandler(async (req, res) => {
  try {
    await removeVendorService(req.user.id, req.params.vendorId);
    logger.info('Vendor removed', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Vendor removed'));
  } catch (error) {
    return failed(req, res, error, 'Remove vendor failed');
  }
});

export { listVendors, getVendor, createVendor, updateVendor, removeVendor };
```

## `src/modules/vendor/index.js`

```js
export { default as vendorRoutes } from './routes/vendor.route.js';
```

## `src/modules/vendor/routes/vendor.route.js`

```js
import express from 'express';
import { authenticate, authorize, validateRequest, EUserRole } from '../../../shared/index.js';
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  removeVendor,
} from '../controllers/vendor.controller.js';
import {
  vendorIdSchema,
  listVendorsSchema,
  createVendorSchema,
  updateVendorSchema,
} from '../validations/vendor.schema.js';

const router = express.Router();

const managers = authorize(EUserRole.OWNER, EUserRole.MANAGER);

router.use(authenticate);

router.get('/', validateRequest(listVendorsSchema, 'query'), listVendors);
router.post('/', managers, validateRequest(createVendorSchema, 'body'), createVendor);
router.get('/:vendorId', validateRequest(vendorIdSchema, 'params'), getVendor);
router.post(
  '/:vendorId',
  managers,
  validateRequest(vendorIdSchema, 'params'),
  validateRequest(updateVendorSchema, 'body'),
  updateVendor
);
router.post(
  '/:vendorId/remove',
  managers,
  validateRequest(vendorIdSchema, 'params'),
  removeVendor
);

export default router;
```

## `src/modules/vendor/services/vendor.service.js`

```js
import Vendor from '../../../models/vendor.model.js';
import { CacheManager } from '../../../config/redis.js';

const cache = new CacheManager();

const VENDOR_FIELDS = 'name phone status createdAt updatedAt';
const VENDOR_TTL_SECONDS = 300;

const vendorKey = (ownerId, vendorId) => `vendor:${ownerId}:${vendorId}`;

const notFound = () => {
  const error = new Error('Vendor not found');
  error.statusCode = 404;
  return error;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listVendorsService = async (ownerId, { page, limit, search }) => {
  const filter = { ownerId, isActive: true };
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }

  const [total, items] = await Promise.all([
    Vendor.countDocuments(filter),
    Vendor.find(filter)
      .select(VENDOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    items,
    pagination: { total, page, limit, hasNextPage: ((page - 1) * limit) + items.length < total },
  };
};

const getVendorService = async (ownerId, vendorId) => {
  const cached = await cache.get(vendorKey(ownerId, vendorId));
  if (cached) {
    return cached;
  }

  const vendor = await Vendor.findOne({ _id: vendorId, ownerId, isActive: true })
    .select(VENDOR_FIELDS)
    .lean();
  if (!vendor) {
    throw notFound();
  }

  await cache.set(vendorKey(ownerId, vendorId), vendor, VENDOR_TTL_SECONDS);
  return vendor;
};

const createVendorService = async (ownerId, payload) => {
  const vendor = await Vendor.create({ ...payload, ownerId });
  const { _id, name, phone, status, createdAt, updatedAt } = vendor;
  return { _id, name, phone, status, createdAt, updatedAt };
};

const updateVendorService = async (ownerId, vendorId, payload) => {
  const vendor = await Vendor.findOneAndUpdate(
    { _id: vendorId, ownerId, isActive: true },
    { $set: payload },
    { new: true, runValidators: true }
  )
    .select(VENDOR_FIELDS)
    .lean();
  if (!vendor) {
    throw notFound();
  }

  await cache.del(vendorKey(ownerId, vendorId));
  return vendor;
};

const removeVendorService = async (ownerId, vendorId) => {
  const removed = await Vendor.findOneAndUpdate(
    { _id: vendorId, ownerId, isActive: true },
    { $set: { isActive: false } }
  )
    .select('_id')
    .lean();
  if (!removed) {
    throw notFound();
  }

  await cache.del(vendorKey(ownerId, vendorId));
};

export {
  listVendorsService,
  getVendorService,
  createVendorService,
  updateVendorService,
  removeVendorService,
};
```

## `src/modules/vendor/validations/vendor.schema.js`

```js
import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const vendorIdSchema = z.object({
  vendorId: objectId,
});

export const listVendorsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: z.string().trim().max(20).optional(),
});

export const updateVendorSchema = createVendorSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field');
```

## `src/shared/constant/vendor.js`

```js
export const EVendorStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
});
```
