import { useId, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'children'> {
  label?: ReactNode;
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/**
 * On/off switch for a single setting. A real `<input type="checkbox" role="switch">` sits under
 * the track, so it announces as a switch, toggles with Space (and Enter), submits with forms and
 * works with react-hook-form's `register`. The track and knob are drawn from its checked, focus
 * and disabled state. Without a `label`, pass `aria-label`.
 */
export function Toggle({ label, description, className = '', id: idProp, ref, onKeyDown, ...rest }: ToggleProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descId = description ? `${id}-desc` : undefined;
  const disabled = rest.disabled;

  // Space already toggles a checkbox; Enter should too, without submitting the surrounding form.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

  const control = (
    <span className="relative inline-flex h-6 w-11 shrink-0">
      <input
        id={id}
        ref={ref}
        type="checkbox"
        role="switch"
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-0 rounded-full border border-border-strong bg-surface-muted transition-colors',
          'peer-hover:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
          'peer-checked:border-accent peer-checked:bg-accent',
          'peer-disabled:opacity-50',
        ].join(' ')}
      />
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-text-subtle shadow-sm transition-all',
          'peer-checked:left-[23px] peer-checked:bg-primary-foreground',
          'peer-disabled:opacity-50',
        ].join(' ')}
      />
    </span>
  );

  if (!label && !description) return <span className={`inline-flex ${className}`}>{control}</span>;

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0 text-sm leading-snug">
        <label htmlFor={id} className={`block font-medium ${disabled ? 'cursor-not-allowed text-text-muted' : 'cursor-pointer text-text'}`}>
          {label}
        </label>
        {description && (
          <p id={descId} className="m-0 mt-0.5 text-xs font-normal text-text-muted">
            {description}
          </p>
        )}
      </div>
      {control}
    </div>
  );
}
