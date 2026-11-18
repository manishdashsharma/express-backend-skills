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
