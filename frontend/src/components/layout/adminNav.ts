import { LayoutDashboard } from 'lucide-react';
import type { NavItem } from './AppShell';

// Admin modules are registered here as they are built (members, events, announcements,
// content, contact inbox, users and roles, settings, audit log). Navigation is filtered
// by the signed-in user's permissions once authentication exists.
export const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
];
