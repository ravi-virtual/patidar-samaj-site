import { useState } from 'react';
import { getCommitteeApi, mediaUrl } from '../api/siteApi';
import { Async } from '../components/ui/Async';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

export default function CommitteePage() {
  // undefined = "the current term", chosen by the server.
  const [termId, setTermId] = useState<string | undefined>(undefined);
  const { data, initialLoading, error, retry } = useFetch(`committee:${termId ?? 'current'}`, () =>
    getCommitteeApi(termId),
  );

  return (
    <>
      <PageHeader
        eyebrow="Committee"
        title={data?.term ? `Committee ${data.term.label}` : 'Committee'}
        description="The volunteers who run the Samaj for the current term."
      />
      <Async
        data={data}
        loading={initialLoading}
        error={error}
        onRetry={retry}
        skeleton={<Skeleton className="h-72" />}
      >
        {(d) =>
          !d.term ? (
            <EmptyState title="Committee not published yet" description="Check back once the new term is announced." />
          ) : (
            <div className="space-y-5">
              {d.terms.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Committee term">
                  {d.terms.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={t.id === d.term?.id}
                      onClick={() => setTermId(t.id)}
                      className={`rounded-md border px-2.5 py-1 text-[13px] font-medium ${
                        t.id === d.term?.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-muted'
                      }`}
                    >
                      {t.label}
                      {t.isCurrent && ' · current'}
                    </button>
                  ))}
                </div>
              )}
              {d.members.length === 0 ? (
                <EmptyState title="No members listed for this term" />
              ) : (
                <ul className="m-0 grid list-none gap-3.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {d.members.map((m) => {
                    const image = mediaUrl(m.imageMediaId);
                    return (
                      <li key={m.id}>
                        <Card className="flex h-full gap-3.5">
                          {image ? (
                            <img src={image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                          ) : (
                            <Avatar name={m.name} size="lg" />
                          )}
                          <div className="min-w-0">
                            <h2 className="text-[15px] font-semibold leading-snug">{m.name}</h2>
                            <div className="mt-0.5">
                              <Badge tone="accent">{m.position}</Badge>
                            </div>
                            {m.bio && <p className="mt-2 text-[13px] text-text-muted">{m.bio}</p>}
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )
        }
      </Async>
    </>
  );
}
