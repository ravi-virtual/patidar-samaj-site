import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { saveBlockApi, type AdminBlock } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import type { BlockDef } from './contentConfig';
import { FormDrawer, FullWidth } from './FormDrawer';
import { MediaPicker } from './MediaPicker';
import { BlockPreview, PreviewButton } from './ContentPreview';

interface Values {
  title: string;
  body: string;
  items: Record<string, string>[];
}

const emptyItem = (def: BlockDef) => Object.fromEntries((def.itemFields ?? []).map((f) => [f.name, '']));

const fromBlock = (def: BlockDef, b: AdminBlock | undefined): Values => ({
  title: b?.title ?? '',
  body: b?.body ?? '',
  items: (b?.items ?? []).map((i) => Object.fromEntries((def.itemFields ?? []).map((f) => [f.name, i[f.name] ?? '']))),
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
  const form = useForm<Values>({ defaultValues: { title: '', body: '', items: [] } });
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
    if (def.title) body.title = v.title.trim();
    if (def.body) body.body = v.body.trim();
    if (def.itemFields) {
      body.items = v.items.map((item) => {
        const out: Record<string, string> = {};
        for (const f of def.itemFields ?? []) {
          const val = (item[f.name] ?? '').trim();
          if (val) out[f.name] = val;
        }
        return out;
      });
    }
    try {
      await saveBlockApi(def.key, body);
      dispatch(showToast('Saved. Publish it from the list when it is ready.'));
      onSaved();
      onClose();
    } catch (err) {
      setError('root', { message: getErrorMessage(err, 'Could not save') });
    }
  };

  const canAdd = fields.length < (def.maxItems ?? 0);

  return (
    <FormDrawer
      open
      title={def.label}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel="Save"
      submitting={formState.isSubmitting}
      pristine={!formState.isDirty}
    >
      {formState.errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{formState.errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-text-muted">Appears on: {def.where}.</p>
          <PreviewButton onClick={() => setPreviewing(true)} />
        </div>
      </FullWidth>
      {def.title && (
        <FullWidth>
          <TextField label="Heading" maxLength={150} {...register('title')} />
        </FullWidth>
      )}
      {def.body && (
        <FullWidth>
          <TextAreaField label="Text" rows={6} maxLength={6000} {...register('body')} />
        </FullWidth>
      )}
      {def.itemFields && (
        <FullWidth>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-[13px] font-semibold">{def.itemLabel}s</legend>
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-2.5 rounded-lg border border-border p-3">
                {def.itemFields?.map((f) =>
                  f.type === 'image' ? (
                    <MediaPicker key={f.name} label={f.label} kind="image" {...register(`items.${index}.${f.name}` as const)} />
                  ) : f.type === 'textarea' ? (
                    <TextAreaField key={f.name} label={f.label} rows={2} maxLength={f.max} {...register(`items.${index}.${f.name}` as const)} />
                  ) : (
                    <TextField key={f.name} label={f.label} maxLength={f.max} {...register(`items.${index}.${f.name}` as const)} />
                  ),
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(index)} aria-label={`Delete ${def.itemLabel?.toLowerCase() ?? 'item'} ${index + 1}`}>
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            ))}
            {canAdd && (
              <Button variant="secondary" size="sm" onClick={() => append(emptyItem(def))}>
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Add {def.itemLabel?.toLowerCase()}
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
