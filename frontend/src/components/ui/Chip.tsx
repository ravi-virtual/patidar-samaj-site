import type { ReactNode } from 'react';

/** Toggle button used for filters. aria-pressed tells screen readers which filter is on. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-[13px] font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** Two or three mutually exclusive options (for example Upcoming / Past). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
