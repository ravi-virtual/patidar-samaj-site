import { getBlocksApi } from '../api/siteApi';
import { AboutContent } from '../components/site/ContentViews';
import { Async } from '../components/ui/Async';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

export default function AboutPage() {
  const { data, initialLoading, error, retry } = useFetch('blocks', getBlocksApi);
  return (
    <Async
      data={data}
      loading={initialLoading}
      error={error}
      onRetry={retry}
      skeleton={<Skeleton className="h-96" />}
    >
      {(blocks) => <AboutContent blocks={blocks} />}
    </Async>
  );
}
