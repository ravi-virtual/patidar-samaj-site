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

/**
 * Chooses a file from the media library by name. Uploading happens in the Media library page,
 * so a picture is always checked (type, size) before it can be attached to anything.
 */
export function MediaPicker({ label, kind, error, ref, ...rest }: MediaPickerProps) {
  const { data, error: loadError } = useFetch(`media-picker:${kind}`, () => listMediaApi({ kind, limit: 100 }));
  return (
    <SelectField
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
      {data?.media.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </SelectField>
  );
}
