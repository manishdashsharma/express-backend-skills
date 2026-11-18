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
