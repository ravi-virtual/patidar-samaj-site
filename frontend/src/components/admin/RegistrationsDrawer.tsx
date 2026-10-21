import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  downloadCsv,
  listRegistrationsApi,
  removeRegistrationApi,
  type AdminEvent,
  type AdminRegistration,
} from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { Modal } from '../overlays/Modal';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { Skeleton } from '../ui/Skeleton';
import { StatusBadge } from './StatusBadge';
import { useCan } from './usePermissions';

function Body({ event, onChanged }: { event: AdminEvent; onChanged: () => void }) {
  const dispatch = useAppDispatch();
  const can = useCan();
  const { data, error, retry } = useFetch(`regs:${event.id}`, () => listRegistrationsApi(event.id, { limit: 100 }));
  const [target, setTarget] = useState<AdminRegistration | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await removeRegistrationApi(event.id, target.id);
      dispatch(showToast('Registration removed.', 'info'));
      setTarget(null);
      retry();
      onChanged();
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not remove the registration'), 'error'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadCsv(`/admin/events/${event.id}/registrations/export`, undefined, 'registrations.csv');
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not export'), 'error'));
    }
  };

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {event.registeredCount} {event.registeredCount === 1 ? 'person' : 'people'} registered
          {event.capacity > 0 ? ` of ${event.capacity}` : ''}
        </p>
        {can('registrations.export') && (
          <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>
      {error && !data ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : data.registrations.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">No registrations yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {data.registrations.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-surface-muted py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.name} <span className="font-mono text-xs text-text-muted">× {r.attendees}</span>
                </p>
                <p className="text-xs text-text-muted">
                  {r.email ?? ''} · {formatDateTime(r.registeredAt)}
                </p>
              </div>
              <StatusBadge status={r.status === 'confirmed' ? 'active' : 'cancelled'} />
              {r.status === 'confirmed' && can('registrations.manage') && (
                <Button variant="secondary" size="sm" onClick={() => setTarget(r)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        title="Remove this registration?"
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setTarget(null)}
      >
        {target ? `${target.name}'s ${target.attendees === 1 ? 'place is' : `${target.attendees} places are`} released.` : ''}
      </ConfirmDialog>
    </div>
  );
}

/** Attendee list for one event, with removal and CSV export (each behind its own permission). */
export function RegistrationsDrawer({
  event,
  onClose,
  onChanged,
}: {
  event: AdminEvent | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal open={event !== null} onClose={onClose} title={event ? `Registrations · ${event.title}` : 'Registrations'} variant="drawer">
      {event && <Body event={event} onChanged={onChanged} />}
    </Modal>
  );
}
