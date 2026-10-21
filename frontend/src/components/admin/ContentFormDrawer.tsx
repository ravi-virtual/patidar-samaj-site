import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { listContentApi, saveContentApi, type ContentRow } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import type { FieldDef, ResourceDef } from './contentConfig';
import { FormDrawer, FullWidth } from './FormDrawer';
import { MediaPicker } from './MediaPicker';

type Values = Record<string, string | boolean>;

const initialValues = (def: ResourceDef, row: ContentRow | null): Values =>
  Object.fromEntries(
    def.fields.map((f) => {
      const raw = row ? (row as unknown as Record<string, unknown>)[f.name] : undefined;
      if (f.type === 'checkbox') return [f.name, Boolean(raw)];
      return [f.name, raw === null || raw === undefined ? (f.type === 'select' ? (f.options?.[0] ?? '') : '') : String(raw)];
    }),
  );

/** Client-side checks that mirror the server's rules, for instant feedback. The server re-checks everything. */
const check = (f: FieldDef, value: string | boolean): string | null => {
  if (f.type === 'checkbox') return null;
  const v = String(value).trim();
  if (f.required && !v) return `${f.label} is required`;
  if (!v) return null;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return `Enter a year between ${f.min} and ${f.max}`;
    return null;
  }
  if (f.type === 'text' || f.type === 'textarea') {
    if (f.min && v.length < f.min) return `${f.label} must be at least ${f.min} characters`;
    if (f.max && v.length > f.max) return `${f.label} must be at most ${f.max} characters`;
    if (/[<>]/.test(v)) return 'Contains invalid characters';
    if (f.name === 'url' && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v)) return 'Enter a full web address starting with http:// or https://';
  }
  return null;
};

const toBody = (def: ResourceDef, v: Values): Record<string, unknown> =>
  Object.fromEntries(
    def.fields.map((f) => {
      const raw = v[f.name];
      if (f.type === 'checkbox') return [f.name, Boolean(raw)];
      if (f.type === 'number') return [f.name, raw === '' ? undefined : Number(raw)];
      if (f.type === 'image' || f.type === 'document') return [f.name, raw === '' ? null : raw];
      return [f.name, String(raw).trim()];
    }),
  );

function Field({ f, form, errors, terms }: { f: FieldDef; form: ReturnType<typeof useForm<Values>>; errors: Record<string, { message?: string } | undefined>; terms: ContentRow[] }) {
  const reg = form.register(f.name);
  const error = errors[f.name]?.message;
  switch (f.type) {
    case 'textarea':
      return <TextAreaField label={f.label} rows={4} required={f.required} hint={f.hint} error={error} {...reg} />;
    case 'select':
      return (
        <SelectField label={f.label} hint={f.hint} error={error} {...reg}>
          {f.options?.map((o) => <option key={o}>{o}</option>)}
        </SelectField>
      );
    case 'term':
      return (
        <SelectField label={f.label} required={f.required} error={error} {...reg}>
          <option value="">Choose a term…</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </SelectField>
      );
    case 'image':
    case 'document':
      return <MediaPicker label={f.label} kind={f.type === 'image' ? 'image' : 'document'} error={error} {...reg} />;
    case 'checkbox':
      return (
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...reg} />
          {f.label}
        </label>
      );
    default:
      return <TextField label={f.label} required={f.required} hint={f.hint} inputMode={f.type === 'number' ? 'numeric' : undefined} error={error} {...reg} />;
  }
}

/** Generic create/edit form for any managed content type, generated from its definition. */
export function ContentFormDrawer({
  def,
  open,
  row,
  onClose,
  onSaved,
}: {
  def: ResourceDef;
  open: boolean;
  row: ContentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const defaults = useMemo(() => initialValues(def, null), [def]);
  const form = useForm<Values>({ defaultValues: defaults });
  const { handleSubmit, reset, setError, formState } = form;
  const needsTerms = def.fields.some((f) => f.type === 'term');
  const terms = useFetch(`terms:${needsTerms}`, () => (needsTerms ? listContentApi('committee-terms', { limit: 100 }) : Promise.resolve(null)));

  useEffect(() => {
    if (open) reset(initialValues(def, row));
  }, [open, def, row, reset]);

  const onSubmit = async (v: Values) => {
    let invalid = false;
    for (const f of def.fields) {
      const message = check(f, v[f.name] ?? '');
      if (message) {
        setError(f.name, { message });
        invalid = true;
      }
    }
    if (invalid) return;
    try {
      await saveContentApi(def.key, row?.id ?? null, toBody(def, v));
      dispatch(showToast(row ? 'Saved.' : `Saved as a draft. Publish it when it is ready.`));
      onSaved();
      onClose();
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && def.fields.some((d) => d.name === f.field)) {
          setError(f.field, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not save') });
    }
  };

  const rootError = formState.errors.root?.message;
  return (
    <FormDrawer
      open={open}
      title={row ? `Edit ${def.singular}` : `New ${def.singular}`}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={row ? 'Save changes' : 'Save draft'}
      submitting={formState.isSubmitting}
      pristine={Boolean(row) && !formState.isDirty}
    >
      {rootError && (
        <FullWidth>
          <Alert tone="danger">{rootError}</Alert>
        </FullWidth>
      )}
      {def.fields.map((f) => {
        const node = <Field f={f} form={form} errors={formState.errors as Record<string, { message?: string } | undefined>} terms={terms.data?.items ?? []} />;
        return f.wide || f.type === 'checkbox' ? <FullWidth key={f.name}>{node}</FullWidth> : <div key={f.name}>{node}</div>;
      })}
    </FormDrawer>
  );
}
