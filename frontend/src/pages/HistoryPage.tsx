import { getBlocksApi, getMilestonesApi, mediaUrl } from '../api/siteApi';
import { Async } from '../components/ui/Async';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

export default function HistoryPage() {
  const blocks = useFetch('blocks', getBlocksApi);
  const milestones = useFetch('milestones', getMilestonesApi);
  const intro = blocks.data?.['history.intro'];

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="lg:sticky lg:top-20">
        <p className="font-mono text-xs uppercase tracking-wide text-accent">History</p>
        <h1 className="mb-3.5 mt-1.5 text-4xl font-semibold leading-tight tracking-tight">
          {intro?.title ?? 'From legend to today'}
        </h1>
        {intro?.body && <p className="text-text-secondary">{intro.body}</p>}
        <p className="mt-4 text-xs text-text-muted">
          Each entry names where it is recorded. Where the records disagree, we say so.
        </p>
      </div>

      <Async
        data={milestones.data}
        loading={milestones.initialLoading}
        error={milestones.error}
        onRetry={milestones.retry}
        skeleton={<Skeleton className="h-96" />}
      >
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="History coming soon" description="The Samaj office has not published any milestones yet." />
          ) : (
            <ol className="m-0 list-none p-0">
              {items.map((m) => {
                const image = mediaUrl(m.imageMediaId);
                return (
                  <li key={m.id} className="grid grid-cols-[72px_1fr] gap-4 pb-7">
                    <p className="pt-0.5 font-mono text-[13px] text-text-muted">{m.periodLabel}</p>
                    <div className="relative border-l border-border pl-5">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[5px] top-2 h-[9px] w-[9px] rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-soft)]"
                      />
                      <h2 className="text-[17px] font-semibold">{m.title}</h2>
                      <p className="mb-2.5 mt-0.5 text-text-muted">{m.text}</p>
                      {image && (
                        <img
                          src={image}
                          alt=""
                          loading="lazy"
                          className="h-36 w-full max-w-md rounded-lg border border-border object-cover"
                        />
                      )}
                      {m.sourceRef && <p className="mt-1.5 text-xs text-text-subtle">Source: {m.sourceRef}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )
        }
      </Async>
    </div>
  );
}
