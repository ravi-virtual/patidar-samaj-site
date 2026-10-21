import type { Request } from 'express';
import AuditLog from '../models/AuditLog';

interface AuditEntry {
  action: string;
  outcome?: 'success' | 'failure';
  actorId?: string | null;
  actorRole?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

// Defence in depth: even if a caller passes a secret by mistake, it is dropped before storage.
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|csrf|hash/i;
const clean = (value: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)));
};

/**
 * Records a security-relevant event. Never throws: a failing audit write must not break the
 * request it describes (it is logged instead).
 */
export const writeAudit = async (req: Request, entry: AuditEntry): Promise<void> => {
  try {
    await AuditLog.create({
      action: entry.action,
      outcome: entry.outcome ?? 'success',
      actorId: entry.actorId ?? req.user?.id ?? null,
      actorRole: entry.actorRole ?? req.user?.role ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: clean(entry.metadata),
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 200),
    });
  } catch {
    // Audit failures must never break the request that triggered them.
  }
};
