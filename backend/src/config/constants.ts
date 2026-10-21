import { resolve } from 'node:path';

// ─── Environment validation (fail fast on startup) ───────────────────────────
// Rule: process.env is only read in this file. Everything else imports from here.
const requiredEnvVars = ['PORT', 'MONGO_URI', 'SESSION_SECRET', 'CLIENT_ORIGIN'] as const;

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required env var(s): ${missing.join(', ')}`);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ─── Production safety checks ────────────────────────────────────────────────
if (isProduction) {
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32 || /change[-_ ]?me/i.test(sessionSecret)) {
    console.error('FATAL: SESSION_SECRET must be a random value of at least 32 characters in production.');
    process.exit(1);
  }
  if (process.env.ENABLE_DEV_SEED === 'true') {
    console.error('FATAL: ENABLE_DEV_SEED must not be enabled in production.');
    process.exit(1);
  }
}

// ─── Environment config ──────────────────────────────────────────────────────
export const config = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  clientOrigin: process.env.CLIENT_ORIGIN as string,
  trustProxy: process.env.TRUST_PROXY === 'true',
  mongo: {
    uri: process.env.MONGO_URI as string,
    serverSelectionTimeoutMs: toInt(process.env.MONGO_TIMEOUT_MS, 5000),
  },
  session: {
    secret: process.env.SESSION_SECRET as string,
    cookieName: process.env.SESSION_COOKIE_NAME ?? 'samaj.sid',
    csrfCookieName: process.env.CSRF_COOKIE_NAME ?? 'samaj.csrf',
    ttlHours: toInt(process.env.SESSION_TTL_HOURS, 12),
    idleMinutes: toInt(process.env.SESSION_IDLE_MINUTES, 60),
  },
  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 300),
    authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 10),
  },
  auth: {
    // Argon2id. Production uses the OWASP-recommended minimum (19 MiB, t=2, p=1);
    // tests use a tiny cost so suites stay fast.
    argon: {
      memoryCost: nodeEnv === 'test' ? 1024 : 19456,
      timeCost: nodeEnv === 'test' ? 1 : 2,
      parallelism: 1,
    },
    maxFailedLogins: toInt(process.env.AUTH_MAX_FAILED_LOGINS, 5),
    lockMinutes: toInt(process.env.AUTH_LOCK_MINUTES, 15),
    resetTokenMinutes: toInt(process.env.RESET_TOKEN_MINUTES, 60),
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  uploads: {
    // Outside any web root. Files are served only through GET /api/media/:id after checks.
    dir: resolve(process.env.UPLOAD_DIR ?? 'uploads'),
    maxImageBytes: 5 * 1024 * 1024,
    maxDocumentBytes: 10 * 1024 * 1024,
  },
  audit: {
    retentionDays: toInt(process.env.AUDIT_RETENTION_DAYS, 365),
  },
  mail: {
    // "outbox" writes messages to backend/.outbox for local development only.
    // "none" (the production default) sends nothing; see docs/security.md for account recovery.
    driver: (process.env.MAIL_DRIVER ?? (isProduction ? 'none' : 'outbox')) as 'outbox' | 'none',
  },
  // Development-only helpers. Both are refused in production above.
  devSeedEnabled: !isProduction && process.env.ENABLE_DEV_SEED === 'true',
} as const;

// ─── HTTP response codes ─────────────────────────────────────────────────────
export const ResponseCodes = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ─── Roles ───────────────────────────────────────────────────────────────────
// Public visitors are not a stored role. Staff roles can only be granted by a Super Admin.
export const Roles = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  MEMBER: 'member',
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];

export const StaffRoles: readonly Role[] = [
  Roles.SUPER_ADMIN,
  Roles.ADMIN,
  Roles.EDITOR,
  Roles.VIEWER,
];

// ─── Account lifecycle ───────────────────────────────────────────────────────
export const AccountStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;
export type AccountStatusValue = (typeof AccountStatus)[keyof typeof AccountStatus];

export const ThemePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof ThemePreferences)[number];

// ─── Content and business enums ──────────────────────────────────────────────
export const PublishStatus = { DRAFT: 'draft', PUBLISHED: 'published', ARCHIVED: 'archived' } as const;
export type PublishStatusValue = (typeof PublishStatus)[keyof typeof PublishStatus];

export const EventStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
} as const;
export type EventStatusValue = (typeof EventStatus)[keyof typeof EventStatus];

export const RegistrationStatus = { CONFIRMED: 'confirmed', CANCELLED: 'cancelled' } as const;
export type RegistrationStatusValue = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const ContactStatus = { NEW: 'new', IN_PROGRESS: 'in_progress', RESOLVED: 'resolved' } as const;
export type ContactStatusValue = (typeof ContactStatus)[keyof typeof ContactStatus];

/** Who may see a directory entry: nobody but staff, signed-in members, or everyone. */
export const MemberVisibility = { HIDDEN: 'hidden', MEMBERS: 'members', PUBLIC: 'public' } as const;
export type MemberVisibilityValue = (typeof MemberVisibility)[keyof typeof MemberVisibility];

export const MembershipStatus = { PENDING: 'pending', ACTIVE: 'active', INACTIVE: 'inactive' } as const;
export type MembershipStatusValue = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const EventCategories = ['Festival', 'Family', 'Seva', 'Education', 'Meeting', 'Sports', 'Other'] as const;
export const AnnouncementCategories = ['Notice', 'Event', 'Education', 'Seva', 'Achievement'] as const;
export const LinkCategories = ['Forms', 'Documents', 'Services', 'Community', 'Other'] as const;
export const ContactTopics = ['General enquiry', 'Membership', 'Patidar Samaj Bhavan booking', 'Scholarships'] as const;

// ─── Error codes ─────────────────────────────────────────────────────────────
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  DUPLICATE: 'DUPLICATE_ERROR',
  INVALID_ID: 'INVALID_ID',
  INVALID_SESSION: 'INVALID_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CSRF_INVALID: 'CSRF_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  EVENT_FULL: 'EVENT_FULL',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  HAS_DEPENDENCIES: 'HAS_DEPENDENCIES',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
