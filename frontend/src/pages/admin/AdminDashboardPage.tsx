import { Link } from 'react-router-dom';
import { getDashboardApi, type DashboardStats } from '../../api/adminApi';
import { Async } from '../../components/ui/Async';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { describeAction, formatDateTime } from '../../lib/format';
import { roleLabel } from '../../lib/labels';
import { useFetch } from '../../lib/useFetch';
import { useAppSelector } from '../../store/hooks';

interface Tile {
  key: keyof DashboardStats;
  label: string;
  note: string;
  to?: string;
}

const tiles: Tile[] = [
  { key: 'totalMembers', label: 'Active members', note: 'In the directory', to: '/admin/members' },
  { key: 'upcomingEvents', label: 'Upcoming events', note: 'Published', to: '/admin/events' },
  { key: 'publishedAnnouncements', label: 'Announcements', note: 'Live on the site', to: '/admin/announcements' },
  { key: 'unreadContactMessages', label: 'New messages', note: 'Not yet opened', to: '/admin/contacts?status=new' },
];

function Body({ stats }: { stats: DashboardStats }) {
  const shown = tiles.filter((t) => stats[t.key] !== undefined);
  return (
    <div className="space-y-4">
      {shown.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {shown.map((t) => (
            <li key={t.key}>
              <Card className="h-full px-[18px] py-4">
                <p className="text-[13px] text-text-muted">{t.label}</p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight">{String(stats[t.key])}</p>
                <p className="text-xs text-text-muted">
                  {t.to ? (
                    <Link to={t.to} className="text-text-muted underline-offset-2 hover:text-accent">
                      {t.note}
                    </Link>
                  ) : (
                    t.note
                  )}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {stats.recentActivity && (
        <Card>
          <h2 className="mb-2 text-[15px] font-semibold">Recent activity</h2>
          {stats.recentActivity.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {stats.recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 border-t border-surface-muted py-2 text-sm first:border-t-0">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="flex-1">
                    <strong className="font-semibold">{a.actor}</strong> · {describeAction(a.action)}
                  </span>
                  <time dateTime={a.at} className="whitespace-nowrap text-xs text-text-subtle">
                    {formatDateTime(a.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const user = useAppSelector((s) => s.auth.user)!;
  const { data, initialLoading, error, retry } = useFetch('admin-dashboard', getDashboardApi);
  return (
    <>
      <PageHeader title="Dashboard" description={`Signed in as ${roleLabel(user.role)}. Figures show only what your permissions allow.`} />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-40" />}>
        {(stats) => <Body stats={stats} />}
      </Async>
    </>
  );
}
