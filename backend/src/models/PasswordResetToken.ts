import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IPasswordResetToken {
  _id: string;
  userId: string;
  tokenHash: string;
  purpose: 'reset' | 'setup';
  issuedBy?: string;
  expiresAt: Date;
  usedAt?: Date | null;
}

// Single-use, short-lived token for password reset or first-time password setup.
// Only the hash is stored. Expired tokens are removed by the TTL index.
const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    _id: { type: String, default: () => uuidv4() },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['reset', 'setup'], default: 'reset' },
    issuedBy: { type: String }, // staff user id when an administrator issued it
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true, _id: false },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);
