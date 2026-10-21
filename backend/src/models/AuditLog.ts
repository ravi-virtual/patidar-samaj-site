import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/constants';

export interface IAuditLog {
  _id: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  outcome: 'success' | 'failure';
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

// Append-only record of security-relevant events. There is deliberately no update or delete API.
// Never put passwords, session tokens, reset tokens or other secrets in `metadata`.
const auditLogSchema = new Schema<IAuditLog>(
  {
    _id: { type: String, default: () => uuidv4() },
    actorId: { type: String, index: true }, // null for anonymous events such as a failed login
    actorRole: { type: String },
    action: { type: String, required: true }, // e.g. "auth.login", "user.role_changed"
    outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
    targetType: { type: String },
    targetId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// Retention: entries are removed automatically after AUDIT_RETENTION_DAYS.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.audit.retentionDays * 86400 });

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
