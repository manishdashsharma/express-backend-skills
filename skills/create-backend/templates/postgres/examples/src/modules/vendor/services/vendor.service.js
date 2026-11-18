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
