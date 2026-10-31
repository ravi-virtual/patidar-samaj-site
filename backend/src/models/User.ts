import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import {
  AccountStatus,
  Roles,
  ThemePreferences,
  type AccountStatusValue,
  type Role,
  type ThemePreference,
} from '../config/constants';
import { SELECTABLE_PERMISSIONS } from '../config/permissions';

// A sign-in account: the Super Admin or an admin created by the Super Admin. The public site has no
// accounts, so there is no registration, approval or member data here.
export interface IUser {
  _id: string;
  name: string;
  email: string;
  passwordHash?: string | null;
  passwordChangedAt?: Date;
  role: Role;
  /** Admin only: exactly the permissions the Super Admin selected. The Super Admin always has all. */
  permissions: string[];
  status: AccountStatusValue;
  themePreference: ThemePreference;
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
    // Unique across ALL accounts, deleted ones included: a deleted admin keeps its email reserved.
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    // Argon2id hash. Never returned: select:false here and stripped in toJSON.
    // Null for admin accounts that have not yet set a password from their setup link.
    passwordHash: { type: String, select: false, default: null },
    passwordChangedAt: { type: Date },

    role: { type: String, enum: Object.values(Roles), default: Roles.ADMIN, required: true },
    permissions: {
      type: [{ type: String, enum: [...SELECTABLE_PERMISSIONS] }],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
      required: true,
    },

    // Per-user theme. "system" follows the device; restored on every login and device.
    themePreference: { type: String, enum: [...ThemePreferences], default: 'system' },

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

export default mongoose.model<IUser>('User', userSchema);
