import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { saveBlockApi, type AdminBlock } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { t } from '../../i18n';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import type { BlockDef } from './contentConfig';
import { BilingualField, errText } from './BilingualField';
import { FormDrawer, FullWidth } from './FormDrawer';
import { MediaPicker } from './MediaPicker';
import { BlockPreview, PreviewButton } from './ContentPreview';

interface Values {
  title: string;
  titleGu: string;
  body: string;
  bodyGu: string;
  items: Record<string, string>[];
}

/** Item fields that also have a Gujarati twin, saved as `<name>Gu`. */
const TRANSLATABLE_ITEM_FIELDS = ['title', 'text', 'label'];
const hasGu = (name: string) => TRANSLATABLE_ITEM_FIELDS.includes(name);

/** Every key of one item row: its own fields plus the Gujarati twins. */
const itemKeys = (def: BlockDef) => (def.itemFields ?? []).flatMap((f) => (hasGu(f.name) && f.type !== 'image' ? [f.name, `${f.name}Gu`] : [f.name]));

const emptyItem = (def: BlockDef) => Object.fromEntries(itemKeys(def).map((k) => [k, '']));

const fromBlock = (def: BlockDef, b: AdminBlock | undefined): Values => ({
  title: b?.title ?? '',
  titleGu: b?.titleGu ?? '',
  body: b?.body ?? '',
  bodyGu: b?.bodyGu ?? '',
  items: (b?.items ?? []).map((i) => {
    const row = i as unknown as Record<string, string | null | undefined>;
    return Object.fromEntries(itemKeys(def).map((k) => [k, row[k] ?? '']));
  }),
});

/** Edit one fixed text block of the site (the home welcome, about sections, …). */
export function BlockDrawer({
  def,
  block,
  allBlocks,
  onClose,
  onSaved,
}: {
  def: BlockDef | null;
  block: AdminBlock | undefined;
  /** All saved blocks, so a page preview can show the edited block among its neighbours. */
  allBlocks: AdminBlock[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const form = useForm<Values>({ defaultValues: { title: '', titleGu: '', body: '', bodyGu: '', items: [] } });
  const { register, handleSubmit, reset, setError, control, formState } = form;
  const values = useWatch({ control }) as Values;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (def) reset(fromBlock(def, block));
  }, [def, block, reset]);

  if (!def) return null;

  const onSubmit = async (v: Values) => {
    const body: Parameters<typeof saveBlockApi>[1] = {};
    if (def.title) {
      body.title = v.title.trim();
      body.titleGu = v.titleGu.trim();
    }
    if (def.body) {
      body.body = v.body.trim();
      body.bodyGu = v.bodyGu.trim();
    }
    if (def.itemFields) {
      body.items = v.items.map((item) => {
        const out: Record<string, string> = {};
        for (const key of itemKeys(def)) {
          const val = (item[key] ?? '').trim();
          if (val) out[key] = val;
        }
        return out;
      });
    }
    try {
      await saveBlockApi(def.key, body);
      dispatch(showToast(t('Saved. Publish it from the list when it is ready.')));
      onSaved();
      onClose();
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        const path = f.field?.replace(/\[(\d+)\]/g, '.$1');
        if (path && ['title', 'titleGu', 'body', 'bodyGu'].includes(path)) {
          setError(path as 'title' | 'titleGu' | 'body' | 'bodyGu', { message: f.message });
          placed = true;
        } else if (path && /^items\.\d+\.\w+$/.test(path)) {
          setError(path as `items.${number}.${string}`, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, t('Could not save')) });
    }
  };

  const canAdd = fields.length < (def.maxItems ?? 0);
  const itemName = t(def.itemLabel ?? 'item').toLowerCase();
  const errors = formState.errors;

  return (
    <FormDrawer
      open
      title={t(def.label)}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={t('Save')}
      submitting={formState.isSubmitting}
      pristine={!formState.isDirty}
    >
      {errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-text-muted">{t('Appears on: {where}.', { where: t(def.where) })}</p>
          <PreviewButton onClick={() => setPreviewing(true)} />
        </div>
      </FullWidth>
      {def.title && (
        <FullWidth>
          <BilingualField
            label="Heading"
            maxLength={150}
            en={register('title')}
            gu={register('titleGu')}
            enError={errText(errors.title)}
            guError={errText(errors.titleGu)}
          />
        </FullWidth>
      )}
      {def.body && (
        <FullWidth>
          <BilingualField
            label="Text"
            multiline
            rows={6}
            maxLength={6000}
            en={register('body')}
            gu={register('bodyGu')}
            enError={errText(errors.body)}
            guError={errText(errors.bodyGu)}
          />
        </FullWidth>
      )}
      {def.itemFields && (
        <FullWidth>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-[13px] font-semibold">{t(def.itemPlural ?? `${def.itemLabel}s`)}</legend>
            {fields.map((field, index) => {
              const rowErrors = errors.items?.[index] as Record<string, { message?: string } | undefined> | undefined;
              return (
                <div key={field.id} className="space-y-2.5 rounded-lg border border-border p-3">
                  {def.itemFields?.map((f) => {
                    if (f.type === 'image') {
                      return <MediaPicker key={f.name} label={t(f.label)} kind="image" {...register(`items.${index}.${f.name}` as const)} />;
                    }
                    if (hasGu(f.name)) {
                      return (
                        <BilingualField
                          key={f.name}
                          label={f.label}
                          multiline={f.type === 'textarea'}
                          rows={2}
                          maxLength={f.max}
                          en={register(`items.${index}.${f.name}` as const)}
                          gu={register(`items.${index}.${f.name}Gu` as const)}
                          enError={errText(rowErrors?.[f.name])}
                          guError={errText(rowErrors?.[`${f.name}Gu`])}
                        />
                      );
                    }
                    const reg = register(`items.${index}.${f.name}` as const);
                    return f.type === 'textarea' ? (
                      <TextAreaField key={f.name} label={t(f.label)} rows={2} maxLength={f.max} {...reg} />
                    ) : (
                      <TextField key={f.name} label={t(f.label)} maxLength={f.max} {...reg} />
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    aria-label={t('Delete {item} {number}', { item: itemName, number: index + 1 })}
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('Delete')}
                  </Button>
                </div>
              );
            })}
            {canAdd && (
              <Button variant="secondary" size="sm" onClick={() => append(emptyItem(def))}>
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {t('Add {item}', { item: itemName })}
              </Button>
            )}
          </fieldset>
        </FullWidth>
      )}
      <BlockPreview
        open={previewing}
        onClose={() => setPreviewing(false)}
        def={def}
        values={values}
        others={allBlocks}
        status={block && block.status !== 'empty' ? block.status : 'draft'}
      />
    </FormDrawer>
  );
}
