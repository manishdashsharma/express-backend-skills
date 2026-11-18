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
