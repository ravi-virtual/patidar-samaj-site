import { CalendarDays, Camera, FileText } from 'lucide-react';
import { mediaUrl } from '../../api/siteApi';

/**
 * Picture for an event or milestone. When none was uploaded a calm gradient with an icon is shown
 * instead, so cards keep their shape and nothing looks broken.
 */
export function Cover({
  mediaId,
  alt = '',
  className = '',
  icon = 'event',
}: {
  mediaId: string | null | undefined;
  alt?: string;
  className?: string;
  icon?: 'event' | 'photo' | 'document';
}) {
  const src = mediaUrl(mediaId);
  if (src) {
    return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  const Icon = icon === 'photo' ? Camera : icon === 'document' ? FileText : CalendarDays;
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-gradient-to-br from-accent-soft to-surface-muted text-accent ${className}`}
    >
      <Icon className="h-8 w-8 opacity-60" />
    </div>
  );
}

/** Thin progress bar for event capacity. Purely visual: the numbers beside it carry the meaning. */
export function Meter({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div aria-hidden="true" className={`h-1.5 overflow-hidden rounded-full bg-surface-muted ${className}`}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}
