import { Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { PageLoading } from '../components/layout/PageLoading';
import { PublicLayout } from '../components/layout/PublicLayout';
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
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import NotFoundPage from '../pages/NotFoundPage';
import DashboardPage from '../pages/workspace/DashboardPage';
import MyRsvpsPage from '../pages/workspace/MyRsvpsPage';
import SettingsPage from '../pages/workspace/SettingsPage';
import { PublicOnly, RequireAuth, RequireStaff } from './guards';
import {
  AdminLayout,
  AdminDashboardPage,
  AdminEventsPage,
  AdminAnnouncementsPage,
  AdminMembersPage,
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
      { path: 'about', element: <AboutPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'committee', element: <CommitteePage /> },
      { path: 'faq', element: <FaqPage /> },
      { path: 'links', element: <LinksPage /> },
      { path: 'members', element: <DirectoryPage /> },
      { path: 'members/:id', element: <MemberDetailPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:id', element: <EventDetailPage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'news/:id', element: <NewsDetailPage /> },
      { path: 'contact', element: <ContactPage /> },
      {
        element: <PublicOnly />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        path: 'app',
        element: <RequireAuth />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'rsvps', element: <MyRsvpsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      // The reset link works whether or not the visitor is signed in.
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'admin',
    element: (
      <Suspense fallback={<PageLoading />}>
        <RequireStaff />
      </Suspense>
    ),
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'members', element: <AdminMembersPage /> },
          { path: 'users', element: <AdminUsersPage /> },
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
