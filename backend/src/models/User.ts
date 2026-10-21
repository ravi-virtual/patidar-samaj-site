import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  AccountStatus,
  Roles,
  ThemePreferences,
  type AccountStatusValue,
  type Role,
  type ThemePreference,
} from '../config/constants';
import { GRANTABLE_PERMISSIONS } from '../config/permissions';

export interface IUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash?: string | null;
  passwordChangedAt?: Date;
  role: Role;
  extraPermissions: string[];
  status: AccountStatusValue;
  themePreference: ThemePreference;
  membershipAcknowledgedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  suspendedAt?: Date;
  suspendedBy?: string;
  suspensionReason?: string;
  lastLoginAt?: Date;
  failedLoginCount: number;
  lockUntil?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, default: () => uuidv4() },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 20 },

    // Argon2id hash. Never returned: select:false here and stripped in toJSON.
    // Null for staff accounts that have not yet set a password from their setup link.
    passwordHash: { type: String, select: false, default: null },
    passwordChangedAt: { type: Date },

    role: { type: String, enum: Object.values(Roles), default: Roles.MEMBER, required: true },
    // Permissions granted individually on top of the role (see GRANTABLE_PERMISSIONS).
    extraPermissions: {
      type: [{ type: String, enum: [...GRANTABLE_PERMISSIONS] }],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.PENDING,
      required: true,
    },

    // Per-user theme. "system" follows the device; restored on every login and device.
    themePreference: { type: String, enum: [...ThemePreferences], default: 'system' },

    membershipAcknowledgedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: String },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    suspendedAt: { type: Date },
    suspendedBy: { type: String },
    suspensionReason: { type: String, maxlength: 500 },

    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date },

    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    _id: false, // UUID supplied via default above
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.failedLoginCount;
        delete ret.lockUntil;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IUser>('User', userSchema);
