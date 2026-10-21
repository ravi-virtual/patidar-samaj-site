import { Link } from 'react-router-dom';
import type { EventItem } from '../../api/types';
import { registrationStateLabel } from '../../lib/labels';
import { formatShortDate, formatTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Cover, Meter } from '../ui/Media';

/** Card used in event lists. The whole card is one link, so the event title is its accessible name. */
export function EventCard({ event }: { event: EventItem }) {
  const going = event.myRegistration;
  const state = registrationStateLabel[event.registrationState];
  const taken = event.spotsLeft === null ? 0 : event.capacity - event.spotsLeft;
  return (
    <Link
      to={`/events/${event.id}`}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-text transition-colors hover:border-border-strong"
    >
      <Cover mediaId={event.imageMediaId} className="h-36 w-full" />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span className="font-mono">
            {formatShortDate(event.startsAt)} · {formatTime(event.startsAt)}
          </span>
          <span>{event.category}</span>
        </div>
        <h3 className="text-[17px] font-semibold leading-snug">{event.title}</h3>
        <p className="text-[13px] text-text-muted">{event.venue}</p>
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          {event.capacity > 0 ? (
            <>
              <Meter value={taken} max={event.capacity} className="flex-1" />
              <span className="font-mono text-xs text-text-muted">
                {taken}/{event.capacity}
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">Open to all</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {going && <span className="text-xs font-medium text-success">✓ You’re going</span>}
          {event.registrationState !== 'open' && <Badge tone={state.tone}>{state.text}</Badge>}
        </div>
      </div>
    </Link>
  );
}
