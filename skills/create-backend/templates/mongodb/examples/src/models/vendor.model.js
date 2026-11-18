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
