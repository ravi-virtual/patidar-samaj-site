import { getBlocksApi, getMilestonesApi } from '../api/siteApi';
import { HistoryIntro, MilestoneEntry } from '../components/site/ContentViews';
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
      <HistoryIntro intro={intro} />

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
              {items.map((m) => (
                <MilestoneEntry key={m.id} m={m} />
              ))}
            </ol>
          )
        }
      </Async>
    </div>
  );
}
