import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Skeleton } from '../ui/Skeleton';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Extra classes for the cell, e.g. "whitespace-nowrap font-mono text-[13px]". */
  className?: string;
  /** Hide the header text visually but keep it for screen readers (action columns). */
  srOnlyHeader?: boolean;
}

interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  empty?: ReactNode;
  minWidth?: number;
}

/**
 * Standard admin table: real <table> semantics (caption, column headers), a skeleton on first load,
 * a dimmed table while a new filter loads, an error with retry, and a helpful empty state.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  minWidth = 720,
}: DataTableProps<T>) {
  if (error && !rows) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows) return <Skeleton className="h-72" />;
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  return (
    <Card padded={false} className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-text-muted">
            {columns.map((c) => (
              <th key={c.header} scope="col" className="px-4 py-2.5 font-medium">
                {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-surface-muted last:border-b-0">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-2.5 align-middle text-text-secondary ${c.className ?? ''}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
