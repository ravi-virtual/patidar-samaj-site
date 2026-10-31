import { Link } from 'react-router-dom';
import type { EventItem } from '../../api/types';
import { formatShortDate, formatTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Cover } from '../ui/Media';
import { t } from '../../i18n';

/** Card used in event lists. The whole card is one link, so the event title is its accessible name. */
export function EventCard({ event }: { event: EventItem }) {
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
          <span>{t(event.category)}</span>
        </div>
        <h3 className="text-[17px] font-semibold leading-snug">{event.title}</h3>
        <p className="text-[13px] text-text-muted">{event.venue}</p>
        {event.status === 'cancelled' && (
          <div className="mt-auto pt-2.5">
            <Badge tone="danger">{t('Cancelled')}</Badge>
          </div>
        )}
      </div>
    </Link>
  );
}
