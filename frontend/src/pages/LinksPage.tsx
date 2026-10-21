import { ExternalLink, FileText } from 'lucide-react';
import { getLinksApi, mediaUrl } from '../api/siteApi';
import type { ImportantLink } from '../api/types';
import { Async } from '../components/ui/Async';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

function LinkCard({ link }: { link: ImportantLink }) {
  const file = mediaUrl(link.fileMediaId);
  const href = file ?? link.url ?? undefined;
  const external = !file && href;
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
      >
        {file ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium">{link.label}</span>
        {link.description && <span className="mt-0.5 block text-[13px] text-text-muted">{link.description}</span>}
        <span className="mt-1 block font-mono text-xs text-text-subtle">
          {file ? 'PDF download' : 'External link'}
        </span>
      </span>
    </>
  );
  const cls = 'flex gap-3 rounded-xl border border-border bg-surface p-3.5 text-text hover:bg-bg';
  // External addresses open in a new tab without leaking the referrer or giving the target window access to ours.
  return href ? (
    <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function LinksPage() {
  const { data, initialLoading, error, retry } = useFetch('links', getLinksApi);
  return (
    <>
      <PageHeader eyebrow="Links" title="Important links" description="Forms, documents and services the community uses." />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-48" />}>
        {(links) => {
          if (links.length === 0) return <EmptyState title="No links yet" />;
          const categories = [...new Set(links.map((l) => l.category))];
          return (
            <div className="space-y-6">
              {categories.map((c) => (
                <section key={c} aria-labelledby={`cat-${c}`}>
                  <h2 id={`cat-${c}`} className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-text-subtle">
                    {c}
                  </h2>
                  <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    {links
                      .filter((l) => l.category === c)
                      .map((l) => (
                        <li key={l.id}>
                          <LinkCard link={l} />
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </Async>
    </>
  );
}

