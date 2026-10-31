import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createEventApi, updateEventApi, type AdminEvent, type EventInput } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { EVENT_CATEGORIES } from '../../api/types';
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
import { MediaPicker } from './MediaPicker';

const noAngle = (v: string) => !/[<>]/.test(v);

const optionalGu = (max: number) => z.string().trim().max(max).refine(noAngle, 'Contains invalid characters');

const schema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150).refine(noAngle, 'Contains invalid characters'),
    titleGu: optionalGu(150),
    category: z.enum(EVENT_CATEGORIES),
    venue: z.string().trim().min(2, 'Venue is required').max(200).refine(noAngle, 'Contains invalid characters'),
    venueGu: optionalGu(200),
    description: z.string().trim().max(4000).refine(noAngle, 'Contains invalid characters'),
    descriptionGu: optionalGu(4000),
    startsAt: z.string().min(1, 'Choose the start date and time'),
    endsAt: z.string(),
    featured: z.boolean(),
    imageMediaId: z.string(),
  })
  .superRefine((v, ctx) => {
    const at = (s: string) => (s ? new Date(`${s}:00+05:30`).getTime() : null);
    const start = at(v.startsAt);
    const end = at(v.endsAt);
    if (start && end && end < start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start' });
  });
type Form = z.infer<typeof schema>;

const blank: Form = {
  title: '',
  titleGu: '',
  category: 'Festival',
  venue: '',
  venueGu: '',
  description: '',
  descriptionGu: '',
  startsAt: '',
  endsAt: '',
  featured: false,
  imageMediaId: '',
};

const fromEvent = (e: AdminEvent): Form => ({
  title: e.title,
  titleGu: e.titleGu ?? '',
  category: e.category as Form['category'],
  venue: e.venue,
  venueGu: e.venueGu ?? '',
  description: e.description ?? '',
  descriptionGu: e.descriptionGu ?? '',
  startsAt: toDateTimeInput(e.startsAt),
  endsAt: toDateTimeInput(e.endsAt),
  featured: e.featured,
  imageMediaId: e.imageMediaId ?? '',
});

const toInput = (v: Form): EventInput => ({
  title: v.title,
  titleGu: v.titleGu,
  category: v.category,
  venue: v.venue,
  venueGu: v.venueGu,
  description: v.description,
  descriptionGu: v.descriptionGu,
  startsAt: fromDateTimeInput(v.startsAt) ?? undefined,
  endsAt: fromDateTimeInput(v.endsAt),
  featured: v.featured,
  imageMediaId: v.imageMediaId || null,
});

/** Create or edit one event. `event` null means "new". */
export function EventFormDrawer({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: AdminEvent | null;
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

  // Load the chosen event (or a blank form) each time the drawer opens.
  useEffect(() => {
    if (open) {
      reset(event ? fromEvent(event) : blank);
    }
  }, [open, event, reset]);

  const onSubmit = async (v: Form) => {
    try {
      if (event) await updateEventApi(event.id, toInput(v));
      else await createEventApi(toInput(v));
      dispatch(showToast(event ? t('Event updated.') : t('Event created as a draft.')));
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
      if (!placed) setError('root', { message: getErrorMessage(err, t('Could not save the event')) });
    }
  };

  return (
    <FormDrawer
      open={open}
      title={event ? t('Edit event') : t('New event')}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={event ? t('Save changes') : t('Create draft')}
      submitting={isSubmitting}
      pristine={Boolean(event) && !isDirty}
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
      <FullWidth>
        <BilingualField
          label="Venue"
          required
          en={register('venue')}
          gu={register('venueGu')}
          enError={errText(errors.venue)}
          guError={errText(errors.venueGu)}
        />
      </FullWidth>
      <SelectField label={t('Category')} error={errText(errors.category)} {...register('category')}>
        {EVENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(c)}
          </option>
        ))}
      </SelectField>
      <MediaPicker label={t('Cover image')} kind="image" error={errText(errors.imageMediaId)} {...register('imageMediaId')} />
      <TextField label={t('Starts (IST)')} type="datetime-local" required error={errText(errors.startsAt)} {...register('startsAt')} />
      <TextField label={t('Ends (IST)')} type="datetime-local" error={errText(errors.endsAt)} {...register('endsAt')} />
      <FullWidth>
        <BilingualField
          label="Description"
          multiline
          rows={5}
          en={register('description')}
          gu={register('descriptionGu')}
          enError={errText(errors.description)}
          guError={errText(errors.descriptionGu)}
        />
      </FullWidth>
      <FullWidth>
        <Toggle label={t('Feature on the home page')} {...register('featured')} />
      </FullWidth>
    </FormDrawer>
  );
}
