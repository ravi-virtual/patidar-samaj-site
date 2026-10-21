import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { updateMyProfileApi, type OwnProfile } from '../../api/workspaceApi';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

const noAngle = (v: string) => !/[<>]/.test(v);

const schema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Enter a valid phone number'),
  village: z.string().trim().max(80).refine(noAngle, 'Contains invalid characters'),
  city: z.string().trim().max(80).refine(noAngle, 'Contains invalid characters'),
  country: z.string().trim().max(80).refine(noAngle, 'Contains invalid characters'),
  occupation: z.string().trim().max(100).refine(noAngle, 'Contains invalid characters'),
  kul: z.string().trim().max(80).refine(noAngle, 'Contains invalid characters'),
  familySize: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 40), 'Enter a number from 1 to 40'),
  bio: z.string().trim().max(500, 'Keep it under 500 characters').refine(noAngle, 'Contains invalid characters'),
  visibility: z.enum(['hidden', 'members', 'public']),
});
type Form = z.infer<typeof schema>;

const toForm = (p: OwnProfile): Form => ({
  phone: p.phone ?? '',
  village: p.village ?? '',
  city: p.city ?? '',
  country: p.country ?? '',
  occupation: p.occupation ?? '',
  kul: p.kul ?? '',
  familySize: p.familySize ? String(p.familySize) : '',
  bio: p.bio ?? '',
  visibility: p.visibility,
});

const visibilityHints: Record<Form['visibility'], string> = {
  hidden: 'Only the Samaj office can see your entry.',
  members: 'Signed-in members can find you in the directory. Visitors cannot.',
  public: 'Anyone can find you in the directory (name, village, city and occupation only).',
};

/** Own profile editor. Phone, family size and kul are private: they are never shown in the directory. */
export function ProfileForm({ profile, onSaved }: { profile: OwnProfile; onSaved: (p: OwnProfile) => void }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(profile) });

  const visibility = useWatch({ control, name: 'visibility' });

  const onSubmit = async (v: Form) => {
    setFormError(null);
    try {
      const saved = await updateMyProfileApi({
        phone: v.phone,
        village: v.village,
        city: v.city,
        country: v.country,
        occupation: v.occupation,
        kul: v.kul,
        familySize: v.familySize === '' ? null : Number(v.familySize),
        bio: v.bio,
        visibility: v.visibility,
      });
      reset(toForm(saved));
      onSaved(saved);
      dispatch(showToast('Profile saved.'));
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in v) {
          setError(f.field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setFormError(getErrorMessage(err, 'Could not save your profile'));
    }
  };

  return (
    <Card padded={false}>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Profile</h2>
          <p className="text-[13px] text-text-muted">
            Name and email are managed by the Samaj office. Phone, family size and kul stay private.
          </p>
        </div>
        <div className="grid gap-4 p-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {formError && (
            <div className="col-span-full">
              <Alert tone="danger">{formError}</Alert>
            </div>
          )}
          <TextField label="Village" autoComplete="off" error={errors.village?.message} {...register('village')} />
          <TextField label="City" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
          <TextField label="Country" autoComplete="country-name" error={errors.country?.message} {...register('country')} />
          <TextField label="Occupation" error={errors.occupation?.message} {...register('occupation')} />
          <TextField label="Kul" hint="Private" error={errors.kul?.message} {...register('kul')} />
          <TextField
            label="Family size"
            inputMode="numeric"
            hint="Private"
            error={errors.familySize?.message}
            {...register('familySize')}
          />
          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            hint="Private"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <SelectField
            label="Who can find me in the directory"
            hint={visibilityHints[visibility]}
            error={errors.visibility?.message}
            {...register('visibility')}
          >
            <option value="hidden">Only the office</option>
            <option value="members">Signed-in members</option>
            <option value="public">Everyone</option>
          </SelectField>
          <div className="col-span-full">
            <TextAreaField label="About me" rows={3} error={errors.bio?.message} {...register('bio')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t border-border bg-bg px-5 py-3.5">
          <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(toForm(profile))}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty} loading={isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
