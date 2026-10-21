import { Link, useParams } from 'react-router-dom';
import { getAnnouncementApi } from '../api/siteApi';
import { Async } from '../components/ui/Async';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { formatLongDate } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { usePageTitle } from '../lib/usePageTitle';

export default function NewsDetailPage() {
  const { id = '' } = useParams();
  const { data, initialLoading, error, retry } = useFetch(`news-item:${id}`, () => getAnnouncementApi(id));
  usePageTitle(data?.title);

  if (error?.toLowerCase().includes('not found')) {
    return (
      <EmptyState
        title="Announcement not found"
        description="It may have been removed or is not published yet."
        action={<Link to="/news">Back to news</Link>}
      />
    );
  }

  return (
    <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-64" />}>
      {(a) => (
        <article className="max-w-3xl">
          <Card className="space-y-3 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <time dateTime={a.publishedAt} className="font-mono">
                {formatLongDate(a.publishedAt)}
              </time>
              <Badge>{a.category}</Badge>
              {a.pinned && <Badge tone="accent">Pinned</Badge>}
              {a.archived && <Badge tone="warning">Archived</Badge>}
            </div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{a.title}</h1>
            <div className="whitespace-pre-line text-[16px] leading-relaxed text-text-secondary">{a.body ?? a.summary}</div>
          </Card>
          <p className="mt-4">
            <Link to="/news">← All announcements</Link>
          </p>
        </article>
      )}
    </Async>
  );
}
