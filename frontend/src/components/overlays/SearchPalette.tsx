import { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchApi } from '../../api/siteApi';
import type { SearchHit, SearchResults } from '../../api/types';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { formatShortDate } from '../../lib/format';
import { isTabOn } from '../../lib/publicTabs';
import { useAppSelector } from '../../store/hooks';
import type { PublicTabKey } from '../../api/types';
import { SearchInput } from '../ui/SearchInput';
import { Modal } from './Modal';
import { t } from '../../i18n';

interface Group {
  key: keyof SearchResults;
  label: string;
  /** The public tab the results belong to. Hidden while that tab is switched off. */
  tab: PublicTabKey;
  to: (hit: SearchHit) => string;
}

const groups: Group[] = [
  { key: 'events', label: 'Events', tab: 'events', to: (h) => `/events/${h.id}` },
  { key: 'announcements', label: 'News', tab: 'news', to: (h) => `/news/${h.id}` },
  { key: 'members', label: 'Directory', tab: 'directory', to: (h) => `/members/${h.id}` },
  { key: 'faqs', label: 'FAQ', tab: 'faq', to: () => '/faq' },
  { key: 'links', label: 'Links', tab: 'links', to: () => '/links' },
];

/** Site-wide search. Opened from the sidebar, the header or Ctrl/⌘+K. Results respect visibility rules on the server. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const settings = useAppSelector((s) => s.site.settings);
  const term = useDebounced(query.trim(), 250);
  const active = open && term.length >= 2;
  const { data, error, loading } = useFetch(`search:${active ? term : ''}`, () =>
    active ? searchApi(term) : Promise.resolve(null),
  );

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={t('Search')} hideTitle variant="top">
      <div className="border-b border-border p-3">
        <SearchInput
          size="lg"
          autoFocus
          label={t('Search members, events, news and pages')}
          placeholder={t('Search members, events, news…')}
          value={query}
          onChange={setQuery}
          hint={t('ESC')}
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-2" aria-live="polite">
        {term.length < 2 && <p className="px-3 py-4 text-sm text-text-muted">{t('Type at least two letters.')}</p>}
        {active && error && <p className="px-3 py-4 text-sm text-danger">{error}</p>}
        {active && loading && !data && <p className="px-3 py-4 text-sm text-text-muted">{t('Searching…')}</p>}
        {active && data && data.totalCount === 0 && !loading && (
          <p className="px-3 py-4 text-sm text-text-muted">{t('Nothing found for “{term}”.', { term })}</p>
        )}
        {active &&
          data &&
          groups.map((g) => {
            const hits = data.results[g.key];
            if (!hits.length || !isTabOn(settings, g.tab)) return null;
            return (
              <section key={g.key} aria-label={t(g.label)} className="mb-1">
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                  {t(g.label)}
                </h3>
                <ul className="m-0 list-none p-0">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <Link
                        to={g.to(hit)}
                        onClick={close}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-text hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{hit.title}</span>
                          {hit.snippet && <span className="block truncate text-xs text-text-muted">{hit.snippet}</span>}
                        </span>
                        {hit.date && (
                          <span className="shrink-0 font-mono text-[11px] text-text-subtle">
                            {formatShortDate(hit.date)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </div>
    </Modal>
  );
}
