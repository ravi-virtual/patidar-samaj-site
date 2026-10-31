import { getLanguage, t, type Language } from '../i18n';

// All dates are shown in India Standard Time: the community's events happen there, and one fixed
// zone means every member sees the same time no matter where their device is set.
const ZONE = 'Asia/Kolkata';

const LOCALES: Record<Language, string> = { en: 'en-IN', gu: 'gu-IN' };

// One formatter per (language, options) pair, created on first use so a language switch just works.
const cache = new Map<string, Intl.DateTimeFormat>();
const fmt = (options: Intl.DateTimeFormatOptions) => ({
  format: (date: Date): string => {
    const locale = LOCALES[getLanguage()];
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = cache.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { timeZone: ZONE, ...options });
      cache.set(key, formatter);
    }
    return formatter.format(date);
  },
});

const shortDate = fmt({ day: 'numeric', month: 'short' });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const mediumDate = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const monthOnly = fmt({ month: 'short' });
const dayOnly = fmt({ day: 'numeric' });
const timeOnly = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

export const formatShortDate = (v: string | Date) => shortDate.format(toDate(v));
export const formatLongDate = (v: string | Date) => longDate.format(toDate(v));
export const formatMediumDate = (v: string | Date) => mediumDate.format(toDate(v));
export const formatMonth = (v: string | Date) => monthOnly.format(toDate(v)).toUpperCase();
export const formatDay = (v: string | Date) => dayOnly.format(toDate(v));
export const formatTime = (v: string | Date) => timeOnly.format(toDate(v)).replace(/\s/g, ' ');

export const formatTimeRange = (start: string, end: string | null) =>
  `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''} IST`;

export const formatDateTime = (v: string | Date) => `${formatMediumDate(v)}, ${formatTime(v)} IST`;

const COLORS = ['#4338ca', '#0f766e', '#b45309', '#be185d', '#334155', '#7c3aed'];

/** A stable colour per name, so the same person always gets the same avatar. */
export const avatarColor = (seed: string): string => {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const place = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(', ');

const inputParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO timestamp → value for <input type="datetime-local">, expressed in IST. Empty for no date. */
export const toDateTimeInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const p = Object.fromEntries(inputParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

/** Value of <input type="datetime-local"> (entered as IST) → ISO timestamp. India has no daylight saving. */
export const fromDateTimeInput = (value: string): string | null =>
  value ? new Date(`${value}:00+05:30`).toISOString() : null;

const ACTION_LABELS: Record<string, string> = {
  'auth.admin_login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_blocked': 'Sign-in blocked',
  'auth.login_locked': 'Account locked after failed sign-ins',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Changed password',
  'auth.password_change_failed': 'Failed password change',
  'auth.password_reset_requested': 'Requested a password reset',
  'auth.password_reset_completed': 'Completed a password reset',
  'member.created': 'Added a directory entry',
  'member.updated': 'Edited a directory entry',
  'member.anonymized': 'Anonymised a member',
  'member.visibility_changed': 'Changed directory visibility',
  'members.exported': 'Exported member data',
  'user.admin_created': 'Created an admin',
  'user.admin_updated': 'Edited an admin',
  'user.deleted': 'Deleted an admin',
  'user.suspended': 'Marked an account inactive',
  'user.reactivated': 'Marked an account active',
  'user.sessions_revoked': 'Signed an admin out everywhere',
  'user.password_reset_issued': 'Created a password reset link',
  'user.password_reset': 'Reset an admin password',
  'event.created': 'Created an event',
  'event.updated': 'Edited an event',
  'event.published': 'Published an event',
  'event.unpublished': 'Unpublished an event',
  'event.cancelled': 'Cancelled an event',
  'event.archived': 'Archived an event',
  'event.deleted': 'Deleted an event',
  'announcement.created': 'Created an announcement',
  'announcement.updated': 'Edited an announcement',
  'announcement.published': 'Published an announcement',
  'announcement.unpublished': 'Unpublished an announcement',
  'announcement.archived': 'Archived an announcement',
  'announcement.deleted': 'Deleted an announcement',
  'announcement.pinned': 'Pinned an announcement',
  'announcement.unpinned': 'Unpinned an announcement',
  'contact.updated': 'Updated a contact message',
  'contact.note_added': 'Added a note to a message',
  'contact.spam_blocked': 'Blocked a spam message',
  'contact.throttled': 'Throttled repeated messages',
  'media.uploaded': 'Uploaded a file',
  'media.updated': 'Edited a file',
  'media.deleted': 'Deleted a file',
  'settings.updated': 'Changed site settings',
  'bootstrap.super_admin_created': 'Created the first Super Admin',
};

/** Plain-language name for an audit action. Unknown actions fall back to a readable form of the code. */
export const describeAction = (action: string): string => {
  const known = ACTION_LABELS[action];
  if (known) return t(known);
  const parts = action.split('.');
  // content.<type>.<verb> and similar generated names
  const text = (parts.length > 2 ? [parts[parts.length - 1], parts[1]] : parts).join(' ').replace(/[_]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
