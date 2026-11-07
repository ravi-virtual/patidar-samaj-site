import { listMediaApi } from '../../api/adminApi';
import { useFetch } from '../../lib/useFetch';
import { SelectField } from '../ui/FormFields';
import type { Ref, SelectHTMLAttributes } from 'react';
import { t } from '../../i18n';

interface MediaPickerProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  kind: 'image' | 'document';
  error?: string;
  ref?: Ref<HTMLSelectElement>;
}

/** Keeps dropdown rows short enough to scan; the full text is in the option's tooltip. */
const MAX_LABEL_LENGTH = 60;
const truncate = (s: string) =>
  s.length > MAX_LABEL_LENGTH ? `${s.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…` : s;

/**
 * Chooses a file from the media library by its description (falling back to the file name when
 * none is set). Uploading happens in the Media library page,
 * so a picture is always checked (type, size) before it can be attached to anything.
 */
export function MediaPicker({ label, kind, error, ref, ...rest }: MediaPickerProps) {
  const { data, error: loadError } = useFetch(`media-picker:${kind}`, () =>
    listMediaApi({ kind, limit: 100 }),
  );
  return (
    <SelectField
      // The options arrive after mount; remounting once they are there lets the form re-apply
      // the saved value, which a select without the matching <option> would have dropped.
      key={data ? 'loaded' : 'loading'}
      label={label}
      ref={ref}
      error={error ?? loadError}
      hint={
        data && data.media.length === 0
          ? kind === 'image'
            ? t('No images uploaded yet. Add one in the Media library.')
            : t('No documents uploaded yet. Add one in the Media library.')
          : undefined
      }
      {...rest}
    >
      <option value="">{t('None')}</option>
      {data?.media.map((m) => {
        const text = m.altText?.trim() || m.name;
        return (
          <option key={m.id} value={m.id} title={text}>
            {truncate(text)}
          </option>
        );
      })}
    </SelectField>
  );
}
