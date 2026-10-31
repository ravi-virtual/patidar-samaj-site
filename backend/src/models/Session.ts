import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';

export interface ISession {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Server-side session. The browser holds an opaque random token in an HTTP-only cookie;
// only its SHA-256 hash is stored here, so a database leak cannot be replayed as a login.
// System record: expires through the TTL index below rather than soft delete.
const sessionSchema = new Schema<ISession>(
  {
    _id: { type: String, default: () => uuidv4() },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 200 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true, _id: false },
);

// MongoDB removes the document once expiresAt has passed.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISession>('Session', sessionSchema);
