import { useId, useState, type InputHTMLAttributes, type Ref } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '../../i18n';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

const inputClass =
  'h-10 w-full rounded-md border bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60';

/**
 * Label + input + hint + error in one accessible unit. The label is programmatically tied to the
 * input and the error/hint are announced through aria-describedby.
 */
export function TextField({ label, error, hint, className = '', ref, required, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      <input
        id={id}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`${inputClass} ${error ? 'border-danger' : 'border-border-strong'} ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">
          {t(hint)}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, error, hint, ref, required, ...rest }: Omit<TextFieldProps, 'type'>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={`${inputClass} pr-10 ${error ? 'border-danger' : 'border-border-strong'}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t('Hide password') : t('Show password')}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded text-text-muted hover:text-text"
        >
          {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">
          {t(hint)}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function CheckboxField({ label, error, ref, ...rest }: CheckboxFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          ref={ref}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 h-4 w-4 rounded border-border-strong accent-[var(--accent)]"
          {...rest}
        />
        <label htmlFor={id} className="text-[13px] leading-snug text-text-secondary">
          {label}
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}
