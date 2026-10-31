import { Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { PageLoading } from '../components/layout/PageLoading';
import { PublicLayout } from '../components/layout/PublicLayout';
import { TabGate } from '../components/layout/TabGate';
import HomePage from '../pages/HomePage';
import AboutPage from '../pages/AboutPage';
import HistoryPage from '../pages/HistoryPage';
import CommitteePage from '../pages/CommitteePage';
import FaqPage from '../pages/FaqPage';
import LinksPage from '../pages/LinksPage';
import DirectoryPage from '../pages/DirectoryPage';
import MemberDetailPage from '../pages/MemberDetailPage';
import EventsPage from '../pages/EventsPage';
import EventDetailPage from '../pages/EventDetailPage';
import NewsPage from '../pages/NewsPage';
import NewsDetailPage from '../pages/NewsDetailPage';
import ContactPage from '../pages/ContactPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import NotFoundPage from '../pages/NotFoundPage';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import { RequireAuth } from './guards';
import {
  AdminLayout,
  AdminDashboardPage,
  AdminEventsPage,
  AdminAnnouncementsPage,
  AdminMembersPage,
  AdminUserCreatePage,
  AdminUserEditPage,
  AdminUsersPage,
  AdminContactsPage,
  AdminContentPage,
  AdminMediaPage,
  AdminSettingsPage,
  AdminAuditPage,
} from './lazyPages';


export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      // Each public tab sits behind a TabGate: Not found while an administrator has it switched off.
      { path: 'about', element: <TabGate tab="about" />, children: [{ index: true, element: <AboutPage /> }] },
      { path: 'history', element: <TabGate tab="history" />, children: [{ index: true, element: <HistoryPage /> }] },
      { path: 'committee', element: <TabGate tab="committee" />, children: [{ index: true, element: <CommitteePage /> }] },
      { path: 'faq', element: <TabGate tab="faq" />, children: [{ index: true, element: <FaqPage /> }] },
      { path: 'links', element: <TabGate tab="links" />, children: [{ index: true, element: <LinksPage /> }] },
      {
        path: 'members',
        element: <TabGate tab="directory" />,
        children: [
          { index: true, element: <DirectoryPage /> },
          { path: ':id', element: <MemberDetailPage /> },
        ],
      },
      {
        path: 'events',
        element: <TabGate tab="events" />,
        children: [
          { index: true, element: <EventsPage /> },
          { path: ':id', element: <EventDetailPage /> },
        ],
      },
      {
        path: 'news',
        element: <TabGate tab="news" />,
        children: [
          { index: true, element: <NewsPage /> },
          { path: ':id', element: <NewsDetailPage /> },
        ],
      },
      { path: 'contact', element: <TabGate tab="contact" />, children: [{ index: true, element: <ContactPage /> }] },
      // Reached only from the admin sign-in page; there is no public or member sign-in.
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      // Setup and reset links work whether or not the visitor is signed in.
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: 'admin/login', element: <AdminLoginPage /> },
  {
    path: 'admin',
    element: (
      <Suspense fallback={<PageLoading />}>
        <RequireAuth />
      </Suspense>
    ),
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'members', element: <AdminMembersPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'users/new', element: <AdminUserCreatePage /> },
          { path: 'users/:id/edit', element: <AdminUserEditPage /> },
          { path: 'events', element: <AdminEventsPage /> },
          { path: 'announcements', element: <AdminAnnouncementsPage /> },
          { path: 'content', element: <AdminContentPage /> },
          { path: 'media', element: <AdminMediaPage /> },
          { path: 'contacts', element: <AdminContactsPage /> },
          { path: 'settings', element: <AdminSettingsPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
