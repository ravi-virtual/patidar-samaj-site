import type { ReactNode } from 'react';
import { SearchInput } from '../ui/FormFields';

/** Search box, filters and the primary action of a list page, in one wrapping row. */
export function Toolbar({
  search,
  onSearch,
  searchLabel,
  children,
  actions,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchLabel: string;
  /** Filter controls (selects, chips). */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="min-w-56 max-w-sm flex-1">
        <SearchInput label={searchLabel} placeholder={`${searchLabel}…`} value={search} onChange={onSearch} />
      </div>
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Compact select used inside a Toolbar. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-text"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
