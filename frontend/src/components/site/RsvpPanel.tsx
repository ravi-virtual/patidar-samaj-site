import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cancelRsvpApi, rsvpApi } from '../../api/siteApi';
import { getErrorMessage } from '../../api/axiosInstance';
import type { EventItem } from '../../api/types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/FormFields';

const notices: Partial<Record<EventItem['registrationState'], string>> = {
  not_yet_open: 'Registration has not opened yet.',
  closed: 'Registration for this event has closed.',
  full: 'This event is full.',
  past: 'This event has ended.',
  cancelled: 'This event was cancelled.',
  unavailable: 'Registration is not available for this event.',
};

/**
 * Registration box on the event page. It only decides what to offer; the server re-checks
 * capacity, timing and permissions on every request, so a stale page can never overbook an event.
 */
export function RsvpPanel({ event, onChanged }: { event: EventItem; onChanged: () => void }) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);
  const [attendees, setAttendees] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const going = event.myRegistration;
  const maxAttendees = Math.min(10, event.spotsLeft ?? 10);

  const register = async () => {
    setBusy(true);
    try {
      await rsvpApi(event.id, attendees);
      dispatch(showToast('You are registered. See you there!'));
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not register'), 'error'));
    } finally {
      setBusy(false);
      onChanged(); // refresh either way: the event may have filled up in the meantime
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelRsvpApi(event.id);
      dispatch(showToast('Your registration has been cancelled.', 'info'));
      setConfirmCancel(false);
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not cancel'), 'error'));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  if (going) {
    return (
      <div className="space-y-3">
        <Alert tone="success">
          You’re registered{going.attendees > 1 ? ` for ${going.attendees} people` : ''}.
        </Alert>
        {event.registrationState !== 'past' && event.registrationState !== 'cancelled' && (
          <>
            <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)}>
              Cancel registration
            </Button>
            <ConfirmDialog
              open={confirmCancel}
              title="Cancel your registration?"
              confirmLabel="Cancel registration"
              tone="danger"
              busy={busy}
              onConfirm={() => void cancel()}
              onCancel={() => setConfirmCancel(false)}
            >
              Your {going.attendees === 1 ? 'place is' : `${going.attendees} places are`} released for other families.
              You can register again while places remain.
            </ConfirmDialog>
          </>
        )}
      </div>
    );
  }

  if (event.registrationState !== 'open') {
    return <Alert tone="info">{notices[event.registrationState]}</Alert>;
  }

  if (!user) {
    return (
      <div className="space-y-2">
        <Link
          to="/login"
          state={{ from: location.pathname }}
          className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Log in to RSVP
        </Link>
        <p className="text-center text-xs text-text-muted">Only approved members can register for events.</p>
      </div>
    );
  }

  if (!user.permissions.includes('events.rsvp')) {
    return <Alert tone="info">Your account cannot register for events yet.</Alert>;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void register();
      }}
    >
      <SelectField
        label="Number of people"
        value={attendees}
        onChange={(e) => setAttendees(Number(e.target.value))}
        hint={event.spotsLeft !== null ? `${event.spotsLeft} places left` : undefined}
      >
        {Array.from({ length: maxAttendees }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </SelectField>
      <Button type="submit" className="w-full" loading={busy}>
        RSVP
      </Button>
    </form>
  );
}
