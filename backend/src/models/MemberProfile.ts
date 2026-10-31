import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import {
  MemberVisibility,
  MembershipStatus,
  type MemberVisibilityValue,
  type MembershipStatusValue,
} from '../config/constants';

export interface IMemberProfile {
  _id: string;
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

// A directory entry added and maintained by the office. Entries are plain records: there are no
// member accounts or sign-ins. Private fields (phone, familySize, kul) are never part of any public response — see utils/memberView.ts.
const memberProfileSchema = new Schema<IMemberProfile>(
  {
    _id: { type: String, default: () => uuidv4() },
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
      default: MembershipStatus.ACTIVE,
    },
    // Privacy-first default: only the office sees an entry until an admin makes it public.
    // (A legacy "members" value in old data is treated as hidden: only "public" is ever shown.)
    visibility: { type: String, enum: Object.values(MemberVisibility), default: MemberVisibility.HIDDEN },
    highlighted: { type: Boolean, default: false },
    anonymizedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

memberProfileSchema.index({ membershipStatus: 1, visibility: 1, displayName: 1 });
memberProfileSchema.index({ village: 1 });
memberProfileSchema.index({ city: 1 });

export default mongoose.model<IMemberProfile>('MemberProfile', memberProfileSchema);
