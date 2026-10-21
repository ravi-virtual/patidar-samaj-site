import { LayoutDashboard, ShieldCheck, Settings2, Ticket } from 'lucide-react';
import type { SessionUser } from '../../api/authApi';
import type { NavSection } from './AppShell';

/** Staff are every role except the plain member. The server enforces this again on every request. */
export const isStaff = (user: Pick<SessionUser, 'role'>): boolean => user.role !== 'member';

/** Signed-in navigation: the member workspace for everyone, plus a way into the admin panel for staff. */
export const workspaceSections = (user: SessionUser): NavSection[] => {
  const sections: NavSection[] = [
    {
      heading: 'My workspace',
      items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/rsvps', label: 'My RSVPs', icon: Ticket },
        { to: '/app/settings', label: 'Profile & settings', icon: Settings2 },
      ],
    },
  ];
  if (isStaff(user)) {
    sections.push({
      heading: 'Administration',
      items: [{ to: '/admin', label: 'Admin panel', icon: ShieldCheck }],
    });
  }
  return sections;
};
