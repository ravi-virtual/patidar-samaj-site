import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { t } from '../../i18n';

/** A titled card, optionally with a "view all" link. Used for the home page and dashboards. */
export function Section({
  title,
  to,
  linkLabel,
  children,
  className = '',
}: {
  title: string;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{t(title)}</h2>
        {to && (
          <Link to={to} className="text-[13px] text-accent hover:text-accent-strong">
            {t(linkLabel ?? 'View all')}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

/** Short row with a leading date tile, used for upcoming events. */
export function DateTile({ month, day }: { month: string; day: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-border py-1 leading-tight"
    >
      <span className="font-mono text-[10px] uppercase text-text-muted">{month}</span>
      <span className="font-semibold">{day}</span>
    </span>
  );
}
