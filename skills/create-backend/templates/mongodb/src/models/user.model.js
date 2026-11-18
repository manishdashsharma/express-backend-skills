import mongoose from 'mongoose';
import { EUserRole } from '../shared/constant/user.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(EUserRole), default: EUserRole.OWNER },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ email: 1, isActive: 1 });

export default mongoose.models.User || mongoose.model('User', userSchema);
