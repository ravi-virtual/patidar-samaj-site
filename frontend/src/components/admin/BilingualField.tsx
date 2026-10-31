import type { UseFormRegisterReturn } from 'react-hook-form';
import { t } from '../../i18n';
import { TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';

/** The hint under every Gujarati input. */
export const GUJARATI_HINT = 'Optional. Shown to visitors who choose Gujarati; English is used when empty.';

/** Translates a validation message for display: the schemas keep English text, the screen shows the chosen language. */
export const errText = (error?: { message?: string }): string | undefined => (error?.message ? t(error.message) : undefined);

interface BilingualFieldProps {
  /** English name of the field, such as "Title". The visible labels become "Title (English)" and "Title (Gujarati)". */
  label: string;
  /** `register('title')` */
  en: UseFormRegisterReturn;
  /** `register('titleGu')` */
  gu: UseFormRegisterReturn;
  required?: boolean;
  /** A multi-line box instead of a single line. */
  multiline?: boolean;
  rows?: number;
  /** Applies to both languages. */
  maxLength?: number;
  /** Extra hint for the English input. */
  hint?: string;
  enError?: string;
  guError?: string;
}

/**
 * The English input with its Gujarati twin directly beneath it. English keeps its required rule;
 * Gujarati is always optional (the public site falls back to English when it is empty).
 */
export function BilingualField({ label, en, gu, required, multiline, rows, maxLength, hint, enError, guError }: BilingualFieldProps) {
  const enLabel = `${t(label)} (${t('English')})`;
  const guLabel = `${t(label)} (${t('Gujarati')})`;
  const guHint = t(GUJARATI_HINT);
  const enHint = hint ? t(hint) : undefined;
  return (
    <div className="space-y-3">
      {multiline ? (
        <>
          <TextAreaField label={enLabel} rows={rows} required={required} maxLength={maxLength} hint={enHint} error={enError} {...en} />
          <TextAreaField label={guLabel} lang="gu" rows={rows} maxLength={maxLength} hint={guHint} error={guError} {...gu} />
        </>
      ) : (
        <>
          <TextField label={enLabel} required={required} maxLength={maxLength} hint={enHint} error={enError} {...en} />
          <TextField label={guLabel} lang="gu" maxLength={maxLength} hint={guHint} error={guError} {...gu} />
        </>
      )}
    </div>
  );
}
