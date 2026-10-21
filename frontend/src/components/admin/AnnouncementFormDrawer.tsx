import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createAnnouncementApi,
  updateAnnouncementApi,
  type AdminAnnouncement,
  type AnnouncementInput,
} from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { ANNOUNCEMENT_CATEGORIES } from '../../api/types';
import { fromDateTimeInput, toDateTimeInput } from '../../lib/format';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { FormDrawer, FullWidth } from './FormDrawer';

const noAngle = (v: string) => !/[<>]/.test(v);

const schema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150).refine(noAngle, 'Contains invalid characters'),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  summary: z.string().trim().max(300, 'Keep the summary under 300 characters').refine(noAngle, 'Contains invalid characters'),
  body: z.string().trim().min(1, 'Write the announcement').max(8000).refine(noAngle, 'Contains invalid characters'),
  publishAt: z.string(),
  featured: z.boolean(),
});
type Form = z.infer<typeof schema>;

const blank: Form = { title: '', category: 'Notice', summary: '', body: '', publishAt: '', featured: false };

const fromItem = (a: AdminAnnouncement): Form => ({
  title: a.title,
  category: a.category as Form['category'],
  summary: a.summary ?? '',
  body: a.body,
  publishAt: toDateTimeInput(a.publishAt),
  featured: a.featured,
});

const toInput = (v: Form): AnnouncementInput => ({
  title: v.title,
  category: v.category,
  summary: v.summary,
  body: v.body,
  publishAt: fromDateTimeInput(v.publishAt),
  featured: v.featured,
});

/** Create or edit one announcement. `item` null means "new". New items start as drafts. */
export function AnnouncementFormDrawer({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: AdminAnnouncement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: blank });

  useEffect(() => {
    if (open) reset(item ? fromItem(item) : blank);
  }, [open, item, reset]);

  const onSubmit = async (v: Form) => {
    try {
      if (item) await updateAnnouncementApi(item.id, toInput(v));
      else await createAnnouncementApi(toInput(v));
      dispatch(showToast(item ? 'Announcement updated.' : 'Announcement saved as a draft.'));
      onSaved();
      onClose();
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in v) {
          setError(f.field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not save the announcement') });
    }
  };

  return (
    <FormDrawer
      open={open}
      title={item ? 'Edit announcement' : 'New announcement'}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={item ? 'Save changes' : 'Save draft'}
      submitting={isSubmitting}
      pristine={Boolean(item) && !isDirty}
    >
      {errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <TextField label="Title" required error={errors.title?.message} {...register('title')} />
      </FullWidth>
      <SelectField label="Category" error={errors.category?.message} {...register('category')}>
        {ANNOUNCEMENT_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </SelectField>
      <TextField
        label="Show from (IST)"
        type="datetime-local"
        hint="Optional. Schedule it for later; empty means as soon as it is published."
        error={errors.publishAt?.message}
        {...register('publishAt')}
      />
      <FullWidth>
        <TextAreaField label="Summary" rows={2} hint="Shown in lists. Leave empty to use the start of the text." error={errors.summary?.message} {...register('summary')} />
      </FullWidth>
      <FullWidth>
        <TextAreaField label="Announcement" rows={8} required error={errors.body?.message} {...register('body')} />
      </FullWidth>
      <FullWidth>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...register('featured')} />
          Feature on the home page
        </label>
      </FullWidth>
    </FormDrawer>
  );
}
