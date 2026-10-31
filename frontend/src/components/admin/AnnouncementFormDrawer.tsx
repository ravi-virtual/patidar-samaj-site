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
import { t } from '../../i18n';
import { fromDateTimeInput, toDateTimeInput } from '../../lib/format';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { Toggle } from '../ui/Toggle';
import { BilingualField, errText } from './BilingualField';
import { FormDrawer, FullWidth } from './FormDrawer';

const noAngle = (v: string) => !/[<>]/.test(v);

const optionalGu = (max: number) => z.string().trim().max(max).refine(noAngle, 'Contains invalid characters');

const schema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150).refine(noAngle, 'Contains invalid characters'),
  titleGu: optionalGu(150),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  summary: z.string().trim().max(300, 'Keep the summary under 300 characters').refine(noAngle, 'Contains invalid characters'),
  summaryGu: optionalGu(300),
  body: z.string().trim().min(1, 'Write the announcement').max(8000).refine(noAngle, 'Contains invalid characters'),
  bodyGu: optionalGu(8000),
  publishAt: z.string(),
  featured: z.boolean(),
});
type Form = z.infer<typeof schema>;

const blank: Form = {
  title: '',
  titleGu: '',
  category: 'Notice',
  summary: '',
  summaryGu: '',
  body: '',
  bodyGu: '',
  publishAt: '',
  featured: false,
};

const fromItem = (a: AdminAnnouncement): Form => ({
  title: a.title,
  titleGu: a.titleGu ?? '',
  category: a.category as Form['category'],
  summary: a.summary ?? '',
  summaryGu: a.summaryGu ?? '',
  body: a.body,
  bodyGu: a.bodyGu ?? '',
  publishAt: toDateTimeInput(a.publishAt),
  featured: a.featured,
});

const toInput = (v: Form): AnnouncementInput => ({
  title: v.title,
  titleGu: v.titleGu,
  category: v.category,
  summary: v.summary,
  summaryGu: v.summaryGu,
  body: v.body,
  bodyGu: v.bodyGu,
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
      dispatch(showToast(item ? t('Announcement updated.') : t('Announcement saved as a draft.')));
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
      if (!placed) setError('root', { message: getErrorMessage(err, t('Could not save the announcement')) });
    }
  };

  return (
    <FormDrawer
      open={open}
      title={item ? t('Edit announcement') : t('New announcement')}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={item ? t('Save changes') : t('Save draft')}
      submitting={isSubmitting}
      pristine={Boolean(item) && !isDirty}
    >
      {errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <BilingualField
          label="Title"
          required
          en={register('title')}
          gu={register('titleGu')}
          enError={errText(errors.title)}
          guError={errText(errors.titleGu)}
        />
      </FullWidth>
      <SelectField label={t('Category')} error={errText(errors.category)} {...register('category')}>
        {ANNOUNCEMENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(c)}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('Show from (IST)')}
        type="datetime-local"
        hint={t('Optional. Schedule it for later; empty means as soon as it is published.')}
        error={errText(errors.publishAt)}
        {...register('publishAt')}
      />
      <FullWidth>
        <BilingualField
          label="Summary"
          multiline
          rows={2}
          hint="Shown in lists. Leave empty to use the start of the text."
          en={register('summary')}
          gu={register('summaryGu')}
          enError={errText(errors.summary)}
          guError={errText(errors.summaryGu)}
        />
      </FullWidth>
      <FullWidth>
        <BilingualField
          label="Announcement"
          required
          multiline
          rows={8}
          en={register('body')}
          gu={register('bodyGu')}
          enError={errText(errors.body)}
          guError={errText(errors.bodyGu)}
        />
      </FullWidth>
      <FullWidth>
        <Toggle label={t('Feature on the home page')} {...register('featured')} />
      </FullWidth>
    </FormDrawer>
  );
}
