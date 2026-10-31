import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listAnnouncementsApi } from '../api/siteApi';
import { ANNOUNCEMENT_CATEGORIES } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SearchInput } from '../components/ui/SearchInput';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { formatMediumDate } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { useFetch } from '../lib/useFetch';

const PAGE_SIZE = 10;

export default function NewsPage() {
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const { data, error, loading, retry } = useFetch(`news:${category}:${term}:${page}`, () =>
    listAnnouncementsApi({ category: category || undefined, search: term || undefined, page, limit: PAGE_SIZE }),
  );

  const choose = (c: string) => {
    setCategory(c);
    setPage(1);
  };

  return (
    <>
      <PageHeader eyebrow="News" title="Announcements" description="Notices and news from the Samaj office." />
      <div className="flex flex-wrap items-start gap-6">
        <nav aria-label="Category" className="flex w-full flex-wrap gap-1 md:w-44 md:flex-col md:gap-0.5">
          <p className="hidden px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-subtle md:block">
            Category
          </p>
          {['', ...ANNOUNCEMENT_CATEGORIES].map((c) => (
            <button
              key={c || 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => choose(c)}
              className={`rounded-md px-2.5 py-1.5 text-left text-sm font-medium ${
                category === c ? 'bg-surface-muted text-text' : 'text-text-muted hover:bg-surface-muted hover:text-text'
              }`}
            >
              {c || 'All'}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 basis-96 space-y-3">
          <SearchInput
            label="Search announcements"
            placeholder="Search announcements…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          {error && !data ? (
            <ErrorState message={error} onRetry={retry} />
          ) : !data ? (
            <Skeleton className="h-72" />
          ) : data.announcements.length === 0 ? (
            <EmptyState title="No announcements found" description={term || category ? 'Try a different search or category.' : undefined} />
          ) : (
            <ul className={`m-0 flex list-none flex-col gap-2.5 p-0 ${loading ? 'opacity-60' : ''}`}>
              {data.announcements.map((a) => (
                <li key={a.id}>
                  <Card className="px-[18px] py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <time dateTime={a.publishedAt} className="font-mono">
                        {formatMediumDate(a.publishedAt)}
                      </time>
                      <Badge>{a.category}</Badge>
                      {a.pinned && <Badge tone="accent">Pinned</Badge>}
                      {a.archived && <Badge tone="warning">Archived</Badge>}
                    </div>
                    <h2 className="mb-1 mt-1.5 text-[17px] font-semibold">
                      <Link to={`/news/${a.id}`} className="text-text hover:text-accent">
                        {a.title}
                      </Link>
                    </h2>
                    <p className="m-0 text-text-secondary">{a.summary}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={data.totalCount} onChange={setPage} />}
        </div>
      </div>
    </>
  );
}
