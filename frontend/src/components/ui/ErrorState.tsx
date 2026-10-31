import { TriangleAlert } from 'lucide-react';
import { t } from '../../i18n';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Actionable error: says what failed and offers a retry. role="alert" announces it. */
export function ErrorState({ title = t('Something went wrong'), message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-danger-border bg-danger-soft p-4"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-danger">{title}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            {t('Try again')}
          </Button>
        )}
      </div>
    </div>
  );
}
