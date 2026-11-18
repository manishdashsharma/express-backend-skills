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
