import { useState } from 'react';
import { listEventsApi } from '../api/siteApi';
import { EVENT_CATEGORIES } from '../api/types';
import { EventCard } from '../components/site/EventCard';
import { CardSkeletons } from '../components/ui/Async';
import { Chip, Segmented } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SearchInput } from '../components/ui/SearchInput';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { useDebounced } from '../lib/useDebounced';
import { useFetch } from '../lib/useFetch';
import { useAppSelector } from '../store/hooks';
import { t } from '../i18n';

const PAGE_SIZE = 12;

export default function EventsPage() {
  const signedIn = useAppSelector((s) => Boolean(s.auth.user));
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const { data, error, loading, retry } = useFetch(`events:${signedIn}:${when}:${category}:${term}:${page}`, () =>
    listEventsApi({ when, category: category || undefined, search: term || undefined, page, limit: PAGE_SIZE }),
  );

  const reset = () => {
    setCategory('');
    setSearch('');
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow={t('Events')}
        title={t('Events')}
        description={data ? t('{count} shown', { count: data.totalCount }) : t('Festivals, family gatherings and community service.')}
        actions={
          <Segmented
            label={t('Show')}
            value={when}
            options={[
              { value: 'upcoming', label: t('Upcoming') },
              { value: 'past', label: t('Past') },
            ]}
            onChange={(v) => {
              setWhen(v);
              setPage(1);
            }}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="min-w-60 flex-1">
          <SearchInput
            label={t('Search events')}
            placeholder={t('Search events…')}
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Category')}>
          <Chip active={category === ''} onClick={() => (setCategory(''), setPage(1))}>
            {t('All')}
          </Chip>
          {EVENT_CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => (setCategory(c), setPage(1))}>
              {t(c)}
            </Chip>
          ))}
        </div>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <CardSkeletons count={6} />
      ) : data.events.length === 0 ? (
        <EmptyState
          title={when === 'upcoming' ? t('No upcoming events found') : t('No past events found')}
          description={term || category ? t('Try a different search or category.') : undefined}
          action={
            (term || category) && (
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
              >
                {t('Reset filters')}
              </button>
            )
          }
        />
      ) : (
        <ul
          className={`m-0 grid list-none gap-3.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))] ${loading ? 'opacity-60' : ''}`}
        >
          {data.events.map((e) => (
            <li key={e.id} className="flex">
              <div className="flex flex-1 flex-col">
                <EventCard event={e} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={data.totalCount} onChange={setPage} />}
    </>
  );
}
