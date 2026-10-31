import { useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  /** Accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  /** Taller, larger-text variant (used by the global search palette). */
  size?: 'md' | 'lg';
  /** Subtle keyboard badge shown while the field is empty, e.g. "ESC". */
  hint?: string;
  className?: string;
}

/** Search field: leading icon, clear button while there is text, optional keyboard hint. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength = 100,
  size = 'md',
  hint,
  className = '',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lg = size === 'lg';
  return (
    <div className={`relative w-full ${className}`}>
      <Search
        aria-hidden="true"
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle ${lg ? 'h-5 w-5' : 'h-4 w-4'}`}
      />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-border-strong bg-surface pl-10 pr-10 text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--focus-ring)] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none ${
          lg ? 'h-12 text-base' : 'h-10 text-sm'
        }`}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : (
        hint && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-subtle sm:block">
            {hint}
          </kbd>
        )
      )}
    </div>
  );
}
