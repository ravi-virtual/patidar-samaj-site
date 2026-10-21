import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchApi } from '../../api/siteApi';
import type { SearchHit, SearchResults } from '../../api/types';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { formatShortDate } from '../../lib/format';
import { Modal } from './Modal';

interface Group {
  key: keyof SearchResults;
  label: string;
  to: (hit: SearchHit) => string;
}

const groups: Group[] = [
  { key: 'events', label: 'Events', to: (h) => `/events/${h.id}` },
  { key: 'announcements', label: 'News', to: (h) => `/news/${h.id}` },
  { key: 'members', label: 'Directory', to: (h) => `/members/${h.id}` },
  { key: 'faqs', label: 'FAQ', to: () => '/faq' },
  { key: 'history', label: 'History', to: () => '/history' },
  { key: 'links', label: 'Links', to: () => '/links' },
];

/** Site-wide search. Opened from the sidebar, the header or Ctrl/⌘+K. Results respect visibility rules on the server. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
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
    <Modal open={open} onClose={close} title="Search" hideTitle variant="top">
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search aria-hidden="true" className="h-4 w-4 text-text-subtle" />
        <input
          type="search"
          autoFocus
          aria-label="Search members, events, news and pages"
          placeholder="Search members, events, news…"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 flex-1 bg-transparent text-base text-text placeholder:text-text-subtle focus:outline-none"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-subtle">ESC</kbd>
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-2" aria-live="polite">
        {term.length < 2 && <p className="px-3 py-4 text-sm text-text-muted">Type at least two letters.</p>}
        {active && error && <p className="px-3 py-4 text-sm text-danger">{error}</p>}
        {active && loading && !data && <p className="px-3 py-4 text-sm text-text-muted">Searching…</p>}
        {active && data && data.totalCount === 0 && !loading && (
          <p className="px-3 py-4 text-sm text-text-muted">Nothing found for “{term}”.</p>
        )}
        {active &&
          data &&
          groups.map((g) => {
            const hits = data.results[g.key];
            if (!hits.length) return null;
            return (
              <section key={g.key} aria-label={g.label} className="mb-1">
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                  {g.label}
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
