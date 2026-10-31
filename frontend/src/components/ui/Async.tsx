import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { ErrorState } from './ErrorState';
import { Skeleton, SkeletonText } from './Skeleton';

interface AsyncProps<T> {
  data: T | undefined;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  error?: string;
  onRetry: () => void;
  /** What to show while loading. Defaults to a few text lines. */
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

/** The three states every data page has: loading skeleton, actionable error, content. */
export function Async<T>({ data, loading, error, onRetry, skeleton, children }: AsyncProps<T>) {
  if (data !== undefined) return <>{children(data)}</>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <>{skeleton ?? <SkeletonText lines={4} />}</>;
  return null;
}

/** A grid of card-shaped placeholders for list pages. */
export function CardSkeletons({ count = 6, className = 'h-56' }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      <span className="sr-only">{t('Loading…')}</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}
