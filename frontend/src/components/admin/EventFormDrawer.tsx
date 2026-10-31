import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createEventApi, updateEventApi, type AdminEvent, type EventInput } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { EVENT_CATEGORIES } from '../../api/types';
import { fromDateTimeInput, toDateTimeInput } from '../../lib/format';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { Toggle } from '../ui/Toggle';
import { FormDrawer, FullWidth } from './FormDrawer';
import { MediaPicker } from './MediaPicker';

const noAngle = (v: string) => !/[<>]/.test(v);

const schema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150).refine(noAngle, 'Contains invalid characters'),
    category: z.enum(EVENT_CATEGORIES),
    venue: z.string().trim().min(2, 'Venue is required').max(200).refine(noAngle, 'Contains invalid characters'),
    description: z.string().trim().max(4000).refine(noAngle, 'Contains invalid characters'),
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
  category: 'Festival',
  venue: '',
  description: '',
  startsAt: '',
  endsAt: '',
  featured: false,
  imageMediaId: '',
};

const fromEvent = (e: AdminEvent): Form => ({
  title: e.title,
  category: e.category as Form['category'],
  venue: e.venue,
  description: e.description ?? '',
  startsAt: toDateTimeInput(e.startsAt),
  endsAt: toDateTimeInput(e.endsAt),
  featured: e.featured,
  imageMediaId: e.imageMediaId ?? '',
});

const toInput = (v: Form): EventInput => ({
  title: v.title,
  category: v.category,
  venue: v.venue,
  description: v.description,
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
      dispatch(showToast(event ? 'Event updated.' : 'Event created as a draft.'));
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
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not save the event') });
    }
  };

  return (
    <FormDrawer
      open={open}
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={event ? 'Save changes' : 'Create draft'}
      submitting={isSubmitting}
      pristine={Boolean(event) && !isDirty}
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
        {EVENT_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </SelectField>
      <TextField label="Venue" required error={errors.venue?.message} {...register('venue')} />
      <TextField label="Starts (IST)" type="datetime-local" required error={errors.startsAt?.message} {...register('startsAt')} />
      <TextField label="Ends (IST)" type="datetime-local" error={errors.endsAt?.message} {...register('endsAt')} />
      <MediaPicker label="Cover image" kind="image" error={errors.imageMediaId?.message} {...register('imageMediaId')} />
      <FullWidth>
        <TextAreaField label="Description" rows={5} error={errors.description?.message} {...register('description')} />
      </FullWidth>
      <FullWidth>
        <Toggle label="Feature on the home page" {...register('featured')} />
      </FullWidth>
    </FormDrawer>
  );
}
