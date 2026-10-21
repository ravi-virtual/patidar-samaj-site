import type { RegistrationState } from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';

const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  member: 'Member',
};

export const roleLabel = (role: string): string => roleLabels[role] ?? role;

export const registrationStateLabel: Record<RegistrationState, { text: string; tone: BadgeTone }> = {
  open: { text: 'Registration open', tone: 'success' },
  not_yet_open: { text: 'Opens soon', tone: 'neutral' },
  closed: { text: 'Registration closed', tone: 'warning' },
  full: { text: 'Full', tone: 'warning' },
  past: { text: 'Ended', tone: 'neutral' },
  cancelled: { text: 'Cancelled', tone: 'danger' },
  unavailable: { text: 'Unavailable', tone: 'neutral' },
};
