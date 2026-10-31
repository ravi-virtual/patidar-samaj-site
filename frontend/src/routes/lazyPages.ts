import { lazy } from 'react';

// The admin panel is only needed by staff, so it is loaded on demand and visitors never download it.
export const AdminLayout = lazy(() => import('../components/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })));
export const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
export const AdminEventsPage = lazy(() => import('../pages/admin/AdminEventsPage'));
export const AdminAnnouncementsPage = lazy(() => import('../pages/admin/AdminAnnouncementsPage'));
export const AdminMembersPage = lazy(() => import('../pages/admin/AdminMembersPage'));
export const AdminUserCreatePage = lazy(() => import('../pages/admin/AdminUserCreatePage'));
export const AdminUserEditPage = lazy(() => import('../pages/admin/AdminUserEditPage'));
export const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage'));
export const AdminContactsPage = lazy(() => import('../pages/admin/AdminContactsPage'));
export const AdminContentPage = lazy(() => import('../pages/admin/AdminContentPage'));
export const AdminMediaPage = lazy(() => import('../pages/admin/AdminMediaPage'));
export const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage'));
export const AdminAuditPage = lazy(() => import('../pages/admin/AdminAuditPage'));
