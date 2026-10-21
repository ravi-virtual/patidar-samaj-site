import { Link, useParams } from 'react-router-dom';
import { getMemberApi } from '../api/siteApi';
import { Async } from '../components/ui/Async';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { place } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { usePageTitle } from '../lib/usePageTitle';

export default function MemberDetailPage() {
  const { id = '' } = useParams();
  const { data, initialLoading, error, retry } = useFetch(`member:${id}`, () => getMemberApi(id));
  usePageTitle(data?.name);

  const notFound = error?.toLowerCase().includes('not found');
  if (notFound) {
    return (
      <EmptyState
        title="Member not found"
        description="This entry does not exist or is not visible to you."
        action={<Link to="/members">Back to directory</Link>}
      />
    );
  }

  return (
    <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-72" />}>
      {(m) => (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Card>
            <Avatar name={m.name} size="xl" />
            <h1 className="mb-0.5 mt-3.5 text-[26px] font-semibold leading-tight tracking-tight">{m.name}</h1>
            {m.occupation && <p className="text-text-muted">{m.occupation}</p>}
            {m.bio && <p className="mt-3.5 text-text-secondary">{m.bio}</p>}
          </Card>
          <Card padded={false}>
            <h2 className="border-b border-border px-5 py-3.5 font-semibold">Details</h2>
            <dl className="m-0 grid grid-cols-[minmax(110px,170px)_1fr]">
              {[
                ['Village', m.village],
                ['Location', place(m.city, m.country)],
                ['Member since', m.joinedYear ? String(m.joinedYear) : null],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="border-b border-surface-muted px-5 py-3 text-text-muted last:border-b-0">{label}</dt>
                  <dd className="m-0 border-b border-surface-muted px-5 py-3 font-medium last:border-b-0">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-border px-5 py-3 text-xs text-text-muted">
              Phone, email and family details are private. To reach this family, <Link to="/contact">ask the Samaj office</Link>.
            </p>
          </Card>
          <p className="md:col-span-2">
            <Link to="/members">← Back to directory</Link>
          </p>
        </div>
      )}
    </Async>
  );
}
