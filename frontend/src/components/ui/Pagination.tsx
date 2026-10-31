import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../../i18n';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
}

/** Previous / next with a plain "Page x of y" label. Renders nothing when everything fits on one page. */
export function Pagination({ page, pageSize, totalCount, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t('Pagination')} className="mt-4 flex items-center justify-between gap-3">
      <p className="text-sm text-text-muted" aria-live="polite">
        {t('Page {page} of {pages}', { page, pages })}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          {t('Previous')}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          {t('Next')}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
