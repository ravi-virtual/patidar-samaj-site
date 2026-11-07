import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { listContentApi, saveContentApi, type ContentRow } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { t } from '../../i18n';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { Toggle } from '../ui/Toggle';
import { BilingualField, errText } from './BilingualField';
import type { FieldDef, ResourceDef } from './contentConfig';
import { FormPage, FullWidth } from './FormPage';
import { MediaPicker } from './MediaPicker';
import { PreviewButton, type DraftState, type PreviewState } from './ContentPreview';

type Values = Record<string, string | boolean>;

/** The Gujarati twin of a translatable field is saved under `<name>Gu`. */
const guName = (f: FieldDef) => `${f.name}Gu`;

const initialValues = (def: ResourceDef, row: ContentRow | null): Values =>
  Object.fromEntries(
    def.fields.flatMap((f): [string, string | boolean][] => {
      const record = row ? (row as unknown as Record<string, unknown>) : undefined;
      const raw = record?.[f.name];
      if (f.type === 'checkbox') return [[f.name, Boolean(raw)]];
      const entries: [string, string | boolean][] = [
        [
          f.name,
          raw === null || raw === undefined
            ? f.type === 'select'
              ? (f.options?.[0] ?? '')
              : ''
            : String(raw),
        ],
      ];
      if (f.translatable) {
        const gu = record?.[guName(f)];
        entries.push([guName(f), gu === null || gu === undefined ? '' : String(gu)]);
      }
      return entries;
    }),
  );

/** Client-side checks that mirror the server's rules, for instant feedback. The server re-checks everything. */
const check = (f: FieldDef, value: string | boolean): string | null => {
  if (f.type === 'checkbox') return null;
  const v = String(value).trim();
  const label = t(f.label);
  if (f.required && !v) return t('{label} is required', { label });
  if (!v) return null;
  if (f.type === 'number') {
    const n = Number(v);
    if (
      !Number.isInteger(n) ||
      (f.min !== undefined && n < f.min) ||
      (f.max !== undefined && n > f.max)
    ) {
      return t('Enter a year between {min} and {max}', { min: f.min ?? '', max: f.max ?? '' });
    }
    return null;
  }
  if (f.type === 'text' || f.type === 'textarea') {
    if (f.min && v.length < f.min)
      return t('{label} must be at least {min} characters', { label, min: f.min });
    if (f.max && v.length > f.max)
      return t('{label} must be at most {max} characters', { label, max: f.max });
    if (/[<>]/.test(v)) return t('Contains invalid characters');
    if (f.name === 'url' && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v))
      return t('Enter a full web address starting with http:// or https://');
  }
  return null;
};

/** The Gujarati input is optional and has no minimum, but keeps the same maximum and character rules. */
const checkGu = (f: FieldDef, value: string | boolean): string | null =>
  check({ ...f, required: false, min: undefined }, value);

const toBody = (def: ResourceDef, v: Values): Record<string, unknown> =>
  Object.fromEntries(
    def.fields.flatMap((f): [string, unknown][] => {
      const raw = v[f.name];
      if (f.type === 'checkbox') return [[f.name, Boolean(raw)]];
      if (f.type === 'number') return [[f.name, raw === '' ? undefined : Number(raw)]];
      if (f.type === 'image' || f.type === 'document') return [[f.name, raw === '' ? null : raw]];
      const entries: [string, unknown][] = [[f.name, String(raw).trim()]];
      if (f.translatable) entries.push([guName(f), String(v[guName(f)] ?? '').trim()]);
      return entries;
    }),
  );

function Field({
  f,
  form,
  errors,
  terms,
}: {
  f: FieldDef;
  form: ReturnType<typeof useForm<Values>>;
  errors: Record<string, { message?: string } | undefined>;
  terms: ContentRow[];
}) {
  const reg = form.register(f.name);
  const error = errText(errors[f.name]);
  if (f.translatable && (f.type === 'text' || f.type === 'textarea')) {
    return (
      <BilingualField
        label={f.label}
        required={f.required}
        multiline={f.type === 'textarea'}
        rows={4}
        hint={f.hint}
        en={reg}
        gu={form.register(guName(f))}
        enError={error}
        guError={errText(errors[guName(f)])}
      />
    );
  }
  const label = t(f.label);
  const hint = f.hint ? t(f.hint) : undefined;
  switch (f.type) {
    case 'textarea':
      return (
        <TextAreaField
          label={label}
          rows={4}
          required={f.required}
          hint={hint}
          error={error}
          {...reg}
        />
      );
    case 'select':
      return (
        <SelectField label={label} hint={hint} error={error} {...reg}>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {t(o)}
            </option>
          ))}
        </SelectField>
      );
    case 'term':
      return (
        <SelectField label={label} required={f.required} error={error} {...reg}>
          <option value="">{t('Choose a term…')}</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.label}
            </option>
          ))}
        </SelectField>
      );
    case 'image':
    case 'document':
      return (
        <MediaPicker
          label={label}
          kind={f.type === 'image' ? 'image' : 'document'}
          error={error}
          {...reg}
        />
      );
    case 'checkbox':
      return <Toggle label={label} {...reg} />;
    default:
      return (
        <TextField
          label={label}
          required={f.required}
          hint={hint}
          inputMode={f.type === 'number' ? 'numeric' : undefined}
          error={error}
          {...reg}
        />
      );
  }
}

/** Generic create/edit page for any managed content type, generated from its definition. */
export function ContentForm({ def, row }: { def: ResourceDef; row: ContentRow | null }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const back = `/admin/content?tab=${def.key}`;
  const defaults = useMemo(() => initialValues(def, row), [def, row]);
  const form = useForm<Values>({ defaultValues: defaults });
  const { handleSubmit, setError, formState, control, reset } = form;
  const values = useWatch({ control }) as Values;
  const editPath = row
    ? `/admin/content/${def.key}/${row.id}/edit`
    : `/admin/content/${def.key}/new`;

  // Coming back from the preview page: put the typed values back, still compared with the saved ones.
  const draft = (location.state as DraftState<Values> | null)?.draft;
  useEffect(() => {
    if (draft) reset(draft, { keepDefaultValues: true });
  }, [draft, reset]);
  const needsTerms = def.fields.some((f) => f.type === 'term');
  // Coming back from the preview page the terms are handed over, so nothing is fetched again.
  const cachedTerms = (location.state as DraftState<Values> | null)?.cache?.terms as
    Awaited<ReturnType<typeof listContentApi>> | undefined;
  const terms = useFetch(`terms:${needsTerms}`, () =>
    needsTerms
      ? cachedTerms
        ? Promise.resolve(cachedTerms)
        : listContentApi('committee-terms', { limit: 100 })
      : Promise.resolve(null),
  );

  const onSubmit = async (v: Values) => {
    let invalid = false;
    for (const f of def.fields) {
      const message = check(f, v[f.name] ?? '');
      if (message) {
        setError(f.name, { message });
        invalid = true;
      }
      if (f.translatable) {
        const guMessage = checkGu(f, v[guName(f)] ?? '');
        if (guMessage) {
          setError(guName(f), { message: guMessage });
          invalid = true;
        }
      }
    }
    if (invalid) return;
    try {
      await saveContentApi(def.key, row?.id ?? null, toBody(def, v));
      dispatch(showToast(row ? t('Saved.') : t('Saved as a draft. Publish it when it is ready.')));
      navigate(back);
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (
          f.field &&
          def.fields.some((d) => d.name === f.field || (d.translatable && guName(d) === f.field))
        ) {
          setError(f.field, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, t('Could not save')) });
    }
  };

  const rootError = formState.errors.root?.message;

  const openPreview = () => {
    const state: PreviewState<Values> = {
      values,
      status: row?.status ?? 'draft',
      termLabel: terms.data?.items.find((term) => term.id === values.termId)?.label ?? undefined,
      cache: { row, terms: terms.data },
    };
    navigate(`${editPath.replace(/\/edit$/, '')}/preview`, { state });
  };

  return (
    <FormPage
      title={
        row
          ? t('Edit {item}', { item: t(def.singular) })
          : t('New {item}', { item: t(def.singular) })
      }
      description={t('Nothing appears on the site until it is published.')}
      backTo={back}
      backLabel={t('Back to {items}', { items: t(def.plural) })}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={row ? t('Save changes') : t('Save draft')}
      submitting={formState.isSubmitting}
      pristine={Boolean(row) && !formState.isDirty}
    >
      <FullWidth>
        <div className="flex justify-end">
          <PreviewButton onClick={openPreview} />
        </div>
      </FullWidth>
      {rootError && (
        <FullWidth>
          <Alert tone="danger">{rootError}</Alert>
        </FullWidth>
      )}
      {def.fields.map((f) => {
        const node = (
          <Field
            f={f}
            form={form}
            errors={formState.errors as Record<string, { message?: string } | undefined>}
            terms={terms.data?.items ?? []}
          />
        );
        return f.wide || f.type === 'checkbox' ? (
          <FullWidth key={f.name}>{node}</FullWidth>
        ) : (
          <div key={f.name}>{node}</div>
        );
      })}
    </FormPage>
  );
}
