import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  MemberVisibility,
  MembershipStatus,
  type MemberVisibilityValue,
  type MembershipStatusValue,
} from '../config/constants';

export interface IMemberProfile {
  _id: string;
  userId?: string | null;
  displayName: string;
  village?: string;
  city?: string;
  country: string;
  occupation?: string;
  familySize?: number;
  kul?: string;
  bio?: string;
  joinedYear?: number;
  phone?: string;
  membershipStatus: MembershipStatusValue;
  visibility: MemberVisibilityValue;
  highlighted: boolean;
  anonymizedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// A directory entry. Usually linked to a sign-in account (userId), but the office can also add
// people who never registered (userId empty). `displayName` is copied from the account name so the
// directory can be searched and sorted without a join; it is re-synced whenever the name changes.
// `phone` here is only for entries without an account; for account holders the phone lives on User.
// Private fields (phone, familySize, kul) are never part of any public response — see utils/memberView.ts.
const memberProfileSchema = new Schema<IMemberProfile>(
  {
    _id: { type: String, default: () => uuidv4() },
    userId: { type: String, default: null },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    village: { type: String, trim: true, maxlength: 80 },
    city: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80, default: 'India' },
    occupation: { type: String, trim: true, maxlength: 100 },
    familySize: { type: Number, min: 1, max: 40 },
    kul: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500 },
    joinedYear: { type: Number, min: 1900, max: 2200 },
    phone: { type: String, trim: true, maxlength: 20 },
    membershipStatus: {
      type: String,
      enum: Object.values(MembershipStatus),
      default: MembershipStatus.PENDING,
    },
    // Privacy-first default: only signed-in members see an entry until its owner or an admin opens it up.
    visibility: { type: String, enum: Object.values(MemberVisibility), default: MemberVisibility.MEMBERS },
    highlighted: { type: Boolean, default: false },
    anonymizedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

// One profile per account; entries without an account are not constrained.
memberProfileSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
);
memberProfileSchema.index({ membershipStatus: 1, visibility: 1, displayName: 1 });
memberProfileSchema.index({ village: 1 });
memberProfileSchema.index({ city: 1 });

export default mongoose.model<IMemberProfile>('MemberProfile', memberProfileSchema);
