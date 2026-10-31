import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getMemberFiltersApi, listMembersApi } from '../api/siteApi';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SearchInput } from '../components/ui/SearchInput';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { place } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { useFetch } from '../lib/useFetch';
import { t } from '../i18n';

const PAGE_SIZE = 20;

export default function DirectoryPage() {
  const [search, setSearch] = useState('');
  const [village, setVillage] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const filters = useFetch('member-filters', getMemberFiltersApi);
  const list = useFetch(`members:${term}:${village}:${page}`, () =>
    listMembersApi({ search: term || undefined, village: village || undefined, page, limit: PAGE_SIZE }),
  );

  const reset = () => {
    setSearch('');
    setVillage('');
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow={t('Directory')}
        title={t('Community directory')}
        description={
          list.data
            ? list.data.totalCount === 1
              ? t('1 family listed. Contact details are never shown here.')
              : t('{count} families listed. Contact details are never shown here.', { count: list.data.totalCount })
            : t('Find families by name, village or city.')
        }
        actions={
          <div className="w-full sm:w-72">
            <SearchInput
              label={t('Search the directory')}
              placeholder={t('Search name, city, village…')}
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
          </div>
        }
      />

      {filters.data && filters.data.villages.length > 0 && (
        <div className="mb-3.5 flex flex-wrap gap-1.5" role="group" aria-label={t('Filter by village')}>
          <Chip active={village === ''} onClick={() => (setVillage(''), setPage(1))}>
            {t('All villages')}
          </Chip>
          {filters.data.villages.map((v) => (
            <Chip key={v} active={village === v} onClick={() => (setVillage(v), setPage(1))}>
              {v}
            </Chip>
          ))}
        </div>
      )}

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : !list.data ? (
        <Skeleton className="h-80" />
      ) : list.data.members.length === 0 ? (
        <EmptyState
          title={t('No families found')}
          description={term ? t('Nothing matches “{term}”.', { term }) : t('No directory entries are visible yet.')}
          action={
            (term || village) && (
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
              >
                {t('Clear filters')}
              </button>
            )
          }
        />
      ) : (
        <Card padded={false} className={`overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">{t('Community directory')}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Name')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Village')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Location')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Occupation')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Since')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.members.map((m) => (
                <tr key={m.id} className="border-b border-surface-muted last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Link to={`/members/${m.id}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium text-text">
                      <Avatar name={m.name} size="sm" />
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{m.village ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{place(m.city, m.country) || '—'}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{m.occupation ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-text-muted">{m.joinedYear ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}
    </>
  );
}
