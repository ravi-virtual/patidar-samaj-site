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
    registrationOpensAt: z.string(),
    registrationClosesAt: z.string(),
    capacity: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) <= 100000, 'Enter 0 (unlimited) or a number'),
    featured: z.boolean(),
    imageMediaId: z.string(),
  })
  .superRefine((v, ctx) => {
    const at = (s: string) => (s ? new Date(`${s}:00+05:30`).getTime() : null);
    const start = at(v.startsAt);
    const end = at(v.endsAt);
    const opens = at(v.registrationOpensAt);
    const closes = at(v.registrationClosesAt);
    if (start && end && end < start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start' });
    if (opens && closes && closes <= opens) ctx.addIssue({ code: 'custom', path: ['registrationClosesAt'], message: 'Registration must close after it opens' });
    if (start && closes && closes > start) ctx.addIssue({ code: 'custom', path: ['registrationClosesAt'], message: 'Registration must close before the event starts' });
  });
type Form = z.infer<typeof schema>;

const blank: Form = {
  title: '',
  category: 'Festival',
  venue: '',
  description: '',
  startsAt: '',
  endsAt: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  capacity: '0',
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
  registrationOpensAt: toDateTimeInput(e.registrationOpensAt),
  registrationClosesAt: toDateTimeInput(e.registrationClosesAt),
  capacity: String(e.capacity),
  featured: e.featured,
  imageMediaId: e.imageMediaId ?? '',
});

const toInput = (v: Form, creating: boolean): EventInput => ({
  title: v.title,
  category: v.category,
  venue: v.venue,
  description: v.description,
  startsAt: fromDateTimeInput(v.startsAt) ?? undefined,
  endsAt: fromDateTimeInput(v.endsAt),
  registrationOpensAt: fromDateTimeInput(v.registrationOpensAt),
  // When left empty on a new event the server closes registration when the event starts.
  registrationClosesAt: fromDateTimeInput(v.registrationClosesAt) ?? (creating ? undefined : null),
  capacity: Number(v.capacity),
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
      if (event) await updateEventApi(event.id, toInput(v, false));
      else await createEventApi(toInput(v, true));
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
      <TextField
        label="Registration opens (IST)"
        type="datetime-local"
        hint="Optional. Empty means open now."
        error={errors.registrationOpensAt?.message}
        {...register('registrationOpensAt')}
      />
      <TextField
        label="Registration closes (IST)"
        type="datetime-local"
        hint="Optional. Empty means when the event starts."
        error={errors.registrationClosesAt?.message}
        {...register('registrationClosesAt')}
      />
      <TextField
        label="Capacity"
        inputMode="numeric"
        hint="0 means unlimited. Cannot go below the people already registered."
        error={errors.capacity?.message}
        {...register('capacity')}
      />
      <MediaPicker label="Cover image" kind="image" error={errors.imageMediaId?.message} {...register('imageMediaId')} />
      <FullWidth>
        <TextAreaField label="Description" rows={5} error={errors.description?.message} {...register('description')} />
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
