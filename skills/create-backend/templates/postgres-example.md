# PostgreSQL example module

A complete reference feature module ("vendor") for PostgreSQL. It is a pattern: copy it once per entity and rename `vendor` / `Vendor` / `vendors` / `VENDOR`. `prisma/vendor.prisma` is appended to `prisma/schema.prisma`, never written as its own file. Never ship it as is.

Files in this bundle: 7.

## `prisma/vendor.prisma`

```prisma
enum VendorStatus {
  ACTIVE
  PAUSED
}

model Vendor {
  id        String       @id @default(cuid())
  ownerId   String
  name      String       @db.VarChar(100)
  phone     String?      @db.VarChar(20)
  status    VendorStatus @default(ACTIVE)
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  owner User @relation(fields: [ownerId], references: [id])

  @@index([ownerId, isActive])
  @@index([ownerId, isActive, createdAt])
  @@map("vendors")
}
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
import { getReadDB, getWriteDB } from '../../../config/databases.js';
import { CacheManager } from '../../../config/redis.js';

const cache = new CacheManager();

const VENDOR_SELECT = {
  id: true,
  name: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};
const VENDOR_TTL_SECONDS = 300;

const vendorKey = (ownerId, vendorId) => `vendor:${ownerId}:${vendorId}`;

const notFound = () => {
  const error = new Error('Vendor not found');
  error.statusCode = 404;
  return error;
};

const listVendorsService = async (ownerId, { page, limit, search }) => {
  const db = getReadDB();
  const where = {
    ownerId,
    isActive: true,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [total, items] = await Promise.all([
    db.vendor.count({ where }),
    db.vendor.findMany({
      where,
      select: VENDOR_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
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

  const vendor = await getReadDB().vendor.findFirst({
    where: { id: vendorId, ownerId, isActive: true },
    select: VENDOR_SELECT,
  });
  if (!vendor) {
    throw notFound();
  }

  await cache.set(vendorKey(ownerId, vendorId), vendor, VENDOR_TTL_SECONDS);
  return vendor;
};

const createVendorService = async (ownerId, payload) => getWriteDB().vendor.create({
  data: { ...payload, ownerId },
  select: VENDOR_SELECT,
});

const updateVendorService = async (ownerId, vendorId, payload) => {
  const db = getWriteDB();
  const { count } = await db.vendor.updateMany({
    where: { id: vendorId, ownerId, isActive: true },
    data: payload,
  });
  if (count === 0) {
    throw notFound();
  }

  await cache.del(vendorKey(ownerId, vendorId));
  return db.vendor.findUnique({ where: { id: vendorId }, select: VENDOR_SELECT });
};

const removeVendorService = async (ownerId, vendorId) => {
  const { count } = await getWriteDB().vendor.updateMany({
    where: { id: vendorId, ownerId, isActive: true },
    data: { isActive: false },
  });
  if (count === 0) {
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

const recordId = z.string().min(1).max(64);

export const vendorIdSchema = z.object({
  vendorId: recordId,
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
