import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelRsvpApi } from '../../api/siteApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { listMyRegistrationsApi, type MyRegistration } from '../../api/workspaceApi';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Async } from '../../components/ui/Async';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatLongDate, formatTimeRange } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

function Row({ reg, onCancel }: { reg: MyRegistration; onCancel?: () => void }) {
  return (
    <li>
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">
            <Link to={`/events/${reg.event.id}`} className="text-text hover:text-accent">
              {reg.event.title}
            </Link>
          </h3>
          <p className="text-[13px] text-text-muted">
            {formatLongDate(reg.event.startsAt)} · {formatTimeRange(reg.event.startsAt, reg.event.endsAt)}
          </p>
          <p className="text-[13px] text-text-muted">
            {reg.event.venue} · {reg.attendees} {reg.attendees === 1 ? 'person' : 'people'}
          </p>
        </div>
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel RSVP
          </Button>
        )}
      </Card>
    </li>
  );
}

export default function MyRsvpsPage() {
  usePageTitle('My RSVPs');
  const dispatch = useAppDispatch();
  const { data, initialLoading, error, retry } = useFetch('my-regs', listMyRegistrationsApi);
  const [target, setTarget] = useState<MyRegistration | null>(null);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await cancelRsvpApi(target.event.id);
      dispatch(showToast('Your registration has been cancelled.', 'info'));
      setTarget(null);
      retry();
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not cancel'), 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My RSVPs" description="Events you have registered for." />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-40" />}>
        {(regs) => {
          const upcoming = regs.filter((r) => r.upcoming);
          const past = regs.filter((r) => !r.upcoming).reverse();
          if (regs.length === 0) {
            return (
              <EmptyState
                title="No RSVPs yet"
                description="When you register for an event it appears here."
                action={<Link to="/events">Find an event</Link>}
              />
            );
          }
          return (
            <div className="space-y-6">
              <section aria-labelledby="up-h">
                <h2 id="up-h" className="mb-2.5 text-base font-semibold">
                  Upcoming
                </h2>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-text-muted">Nothing upcoming.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {upcoming.map((r) => (
                      <Row key={r.id} reg={r} onCancel={() => setTarget(r)} />
                    ))}
                  </ul>
                )}
              </section>
              {past.length > 0 && (
                <section aria-labelledby="past-h">
                  <h2 id="past-h" className="mb-2.5 text-base font-semibold">
                    Past
                  </h2>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {past.map((r) => (
                      <Row key={r.id} reg={r} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          );
        }}
      </Async>
      <ConfirmDialog
        open={target !== null}
        title="Cancel your registration?"
        confirmLabel="Cancel registration"
        tone="danger"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setTarget(null)}
      >
        {target ? `Your places at “${target.event.title}” will be released for other families.` : ''}
      </ConfirmDialog>
    </>
  );
}
