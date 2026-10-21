import { Link, useParams } from 'react-router-dom';
import { getEventApi, listEventsApi } from '../api/siteApi';
import { RsvpPanel } from '../components/site/RsvpPanel';
import { Alert } from '../components/ui/Alert';
import { Async } from '../components/ui/Async';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Cover, Meter } from '../components/ui/Media';
import { Skeleton } from '../components/ui/Skeleton';
import { formatLongDate, formatShortDate, formatTimeRange } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { usePageTitle } from '../lib/usePageTitle';
import { useAppSelector } from '../store/hooks';

export default function EventDetailPage() {
  const { id = '' } = useParams();
  const signedIn = useAppSelector((s) => Boolean(s.auth.user));
  const { data, initialLoading, error, retry } = useFetch(`event:${id}:${signedIn}`, () => getEventApi(id));
  usePageTitle(data?.title);
  const more = useFetch('events-more', () => listEventsApi({ when: 'upcoming', limit: 4 }));

  if (error?.toLowerCase().includes('not found')) {
    return (
      <EmptyState
        title="Event not found"
        description="It may have been removed or is not published."
        action={<Link to="/events">Back to events</Link>}
      />
    );
  }

  return (
    <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-96" />}>
      {(e) => {
        const taken = e.spotsLeft === null ? 0 : e.capacity - e.spotsLeft;
        const others = more.data?.events.filter((x) => x.id !== e.id).slice(0, 3) ?? [];
        return (
          <div className="space-y-8">
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Cover
                  mediaId={e.imageMediaId}
                  alt=""
                  className="h-[clamp(200px,28vw,320px)] w-full rounded-xl border border-border"
                />
                <p className="mt-5 font-mono text-xs uppercase text-accent">{e.category}</p>
                <h1 className="mb-2.5 mt-1 text-[32px] font-semibold leading-tight tracking-tight">{e.title}</h1>
                {e.status === 'cancelled' && (
                  <Alert tone="danger">
                    This event was cancelled{e.cancellationReason ? `: ${e.cancellationReason}` : '.'}
                  </Alert>
                )}
                {e.description && (
                  <p className="mt-3 whitespace-pre-line text-[17px] text-text-secondary">{e.description}</p>
                )}
              </div>

              <Card className="space-y-4 lg:sticky lg:top-20">
                <dl className="m-0 space-y-3">
                  <div>
                    <dt className="text-xs text-text-muted">Date</dt>
                    <dd className="m-0 font-medium">{formatLongDate(e.startsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Time</dt>
                    <dd className="m-0 font-medium">{formatTimeRange(e.startsAt, e.endsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Venue</dt>
                    <dd className="m-0 font-medium">{e.venue}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Places</dt>
                    <dd className="m-0 font-medium">
                      {e.spotsLeft === null ? 'Open to all' : `${taken} going · ${e.spotsLeft} left`}
                    </dd>
                    {e.spotsLeft !== null && <Meter value={taken} max={e.capacity} className="mt-1.5" />}
                  </div>
                  {e.registrationState === 'open' && (
                    <div>
                      <dt className="text-xs text-text-muted">Register by</dt>
                      <dd className="m-0 font-medium">{formatShortDate(e.registrationClosesAt)}</dd>
                    </div>
                  )}
                </dl>
                <RsvpPanel event={e} onChanged={retry} />
              </Card>
            </div>

            {others.length > 0 && (
              <section aria-labelledby="more-h">
                <h2 id="more-h" className="mb-2.5 text-base font-semibold">
                  More upcoming
                </h2>
                <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  {others.map((o) => (
                    <li key={o.id}>
                      <Link to={`/events/${o.id}`} className="block rounded-xl border border-border bg-surface p-3.5 text-text hover:border-border-strong">
                        <span className="font-mono text-xs text-text-muted">{formatShortDate(o.startsAt)}</span>
                        <span className="mt-0.5 block font-medium">{o.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p>
              <Link to="/events">← All events</Link>
            </p>
          </div>
        );
      }}
    </Async>
  );
}
