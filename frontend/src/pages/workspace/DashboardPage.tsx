import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { listAnnouncementsApi } from '../../api/siteApi';
import { listMyRegistrationsApi } from '../../api/workspaceApi';
import { isStaff } from '../../components/layout/workspaceNav';
import { DateTile, Section } from '../../components/site/Section';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDay, formatMonth, formatShortDate, formatTime } from '../../lib/format';
import { roleLabel } from '../../lib/labels';
import { useFetch } from '../../lib/useFetch';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAppSelector } from '../../store/hooks';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

export default function DashboardPage() {
  usePageTitle('My workspace');
  const user = useAppSelector((s) => s.auth.user)!;
  const regs = useFetch('my-regs', listMyRegistrationsApi);
  const news = useFetch('dash-news', () => listAnnouncementsApi({ limit: 3 }));

  const upcoming = regs.data?.filter((r) => r.upcoming) ?? [];
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Signed in as ${roleLabel(user.role)} · ${user.email}`}
      />
      {user.role === 'viewer' && (
        <div className="mb-4">
          <Alert tone="info">
            <strong>Read-only access.</strong> Create, edit and delete actions are hidden for Viewer accounts.
          </Alert>
        </div>
      )}

      <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <Card className="px-[18px] py-4">
          <p className="text-[13px] text-text-muted">Upcoming RSVPs</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{regs.data ? upcoming.length : '–'}</p>
        </Card>
        <Card className="px-[18px] py-4">
          <p className="text-[13px] text-text-muted">People registered</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {regs.data ? upcoming.reduce((n, r) => n + r.attendees, 0) : '–'}
          </p>
        </Card>
        <Card className="px-[18px] py-4">
          <p className="text-[13px] text-text-muted">Account</p>
          <p className="text-lg font-semibold">{user.status === 'active' ? 'Active' : user.status}</p>
        </Card>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <Section title="Quick actions">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {[
              { to: '/events', label: 'Find an event' },
              { to: '/members', label: 'Browse the directory' },
              { to: '/app/settings', label: 'Update my profile' },
              ...(isStaff(user) ? [{ to: '/admin', label: 'Open the admin panel' }] : []),
            ].map((q) => (
              <li key={q.to}>
                <Link
                  to={q.to}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text hover:bg-bg"
                >
                  {q.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="My RSVPs" to="/app/rsvps" className="lg:col-span-2">
          {regs.error && !regs.data ? (
            <ErrorState message={regs.error} onRetry={regs.retry} />
          ) : !regs.data ? (
            <Skeleton className="h-24" />
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-text-muted">
              No upcoming RSVPs. <Link to="/events">Find an event</Link>
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {upcoming.slice(0, 4).map((r) => (
                <li key={r.id} className="border-t border-surface-muted first:border-t-0">
                  <Link to={`/events/${r.event.id}`} className="flex items-center gap-3 py-2.5 text-text">
                    <DateTile month={formatMonth(r.event.startsAt)} day={formatDay(r.event.startsAt)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.event.title}</span>
                      <span className="text-xs text-text-muted">
                        {formatTime(r.event.startsAt)} · {r.event.venue}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-text-muted">× {r.attendees}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Latest notices" to="/news" linkLabel="All news" className="lg:col-span-3">
          {!news.data ? (
            <Skeleton className="h-16" />
          ) : news.data.announcements.length === 0 ? (
            <p className="text-sm text-text-muted">No announcements yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {news.data.announcements.map((a) => (
                <li key={a.id} className="border-t border-surface-muted first:border-t-0">
                  <Link to={`/news/${a.id}`} className="flex items-baseline gap-3 py-2 text-text">
                    <span className="font-mono text-xs text-text-muted">{formatShortDate(a.publishedAt)}</span>
                    <span className="text-sm font-medium">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
