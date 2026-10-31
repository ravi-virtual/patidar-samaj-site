import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label?: ReactNode;
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Styled checkbox. A real `<input type="checkbox">` sits underneath (keyboard, forms and screen
 * readers behave natively); the box and check icon are drawn from its checked/focus/disabled state.
 * Without a `label`, pass `aria-label`.
 */
export function Checkbox({ label, description, className = '', id: idProp, ref, ...rest }: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descId = description ? `${id}-desc` : undefined;
  const disabled = rest.disabled;

  const box = (
    <span className="relative mt-px inline-flex h-[18px] w-[18px] shrink-0">
      <input
        id={id}
        ref={ref}
        type="checkbox"
        aria-describedby={descId}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-[5px] disabled:cursor-not-allowed"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none flex h-full w-full items-center justify-center rounded-[5px] border border-border-strong bg-surface text-primary-foreground transition-colors',
          'peer-hover:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
          'peer-checked:border-accent peer-checked:bg-accent',
          'peer-disabled:border-border peer-disabled:bg-surface-muted',
          'peer-checked:peer-disabled:border-accent-border peer-checked:peer-disabled:bg-accent-soft peer-checked:peer-disabled:text-accent',
          '[&>svg]:scale-50 [&>svg]:opacity-0 [&>svg]:transition peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
        ].join(' ')}
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
      </span>
    </span>
  );

  if (!label && !description) return <span className={`inline-flex ${className}`}>{box}</span>;

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      {box}
      <label htmlFor={id} className={`min-w-0 text-sm leading-snug ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className={`block font-medium ${disabled ? 'text-text-muted' : 'text-text'}`}>{label}</span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs font-normal text-text-muted">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}
