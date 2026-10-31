import { getLinksApi } from '../api/siteApi';
import { LinkCard } from '../components/site/ContentViews';
import { Async } from '../components/ui/Async';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';
import { t } from '../i18n';

export default function LinksPage() {
  const { data, initialLoading, error, retry } = useFetch('links', getLinksApi);
  return (
    <>
      <PageHeader
        eyebrow={t('Links')}
        title={t('Important links')}
        description={t('Forms, documents and services the community uses.')}
      />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-48" />}>
        {(links) => {
          if (links.length === 0) return <EmptyState title={t('No links yet')} />;
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

