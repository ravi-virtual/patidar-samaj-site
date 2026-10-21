import { useId, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-md border bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60';

function Frame({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint && !error ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({ label, error, hint, required, className = '', children, ref, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <Frame id={id} label={label} required={required} hint={hint} error={error}>
      <select
        id={id}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`h-10 ${control} ${error ? 'border-danger' : 'border-border-strong'} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </Frame>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({ label, error, hint, required, className = '', ref, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <Frame id={id} label={label} required={required} hint={hint} error={error}>
      <textarea
        id={id}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`min-h-24 py-2 ${control} ${error ? 'border-danger' : 'border-border-strong'} ${className}`}
        {...rest}
      />
    </Frame>
  );
}

/** Compact search box for filter bars. The visible label is the placeholder; the accessible name is `label`. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={100}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 ${control} border-border-strong`}
    />
  );
}
