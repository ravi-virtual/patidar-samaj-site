import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createMemberApi, updateMemberApi, type MemberInput, type StaffMember } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { Toggle } from '../ui/Toggle';
import { FormDrawer, FullWidth } from './FormDrawer';
import { useCan } from './usePermissions';

const noAngle = (v: string) => !/[<>]/.test(v);
const short = (max: number) => z.string().trim().max(max).refine(noAngle, 'Contains invalid characters');

const schema = z.object({
  displayName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).refine(noAngle, 'Contains invalid characters'),
  village: short(80),
  city: short(80),
  country: short(80),
  occupation: short(100),
  joinedYear: z.string().trim().refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2200), 'Enter a four-digit year'),
  membershipStatus: z.enum(['active', 'inactive']),
  visibility: z.enum(['hidden', 'public']),
  highlighted: z.boolean(),
  bio: z.string().trim().max(500).refine(noAngle, 'Contains invalid characters'),
  // Private fields. Only shown to (and sent by) staff allowed to see them.
  phone: z.string().trim().refine((v) => v === '' || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Enter a valid phone number'),
  kul: short(80),
  familySize: z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 40), 'Enter a number from 1 to 40'),
});
type Form = z.infer<typeof schema>;

const blank: Form = {
  displayName: '', village: '', city: '', country: 'India', occupation: '', joinedYear: '',
  membershipStatus: 'active', visibility: 'hidden', highlighted: false, bio: '', phone: '', kul: '', familySize: '',
};

const fromMember = (m: StaffMember): Form => ({
  displayName: m.name,
  village: m.village ?? '',
  city: m.city ?? '',
  country: m.country ?? '',
  occupation: m.occupation ?? '',
  joinedYear: m.joinedYear ? String(m.joinedYear) : '',
  membershipStatus: m.membershipStatus === 'inactive' ? 'inactive' : 'active',
  // A legacy "members" value is shown (and saved) as office only.
  visibility: m.visibility === 'public' ? 'public' : 'hidden',
  highlighted: m.highlighted,
  bio: m.bio ?? '',
  phone: m.phone ?? '',
  kul: m.kul ?? '',
  familySize: m.familySize ? String(m.familySize) : '',
});

/** Add or edit a directory entry. `member` null means "new". */
export function MemberFormDrawer({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const can = useCan();
  const privateAccess = can('members.read.private');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: blank });

  useEffect(() => {
    if (open) reset(member ? fromMember(member) : blank);
  }, [open, member, reset]);

  const onSubmit = async (v: Form) => {
    const body: MemberInput = {
      displayName: v.displayName,
      village: v.village,
      city: v.city,
      country: v.country,
      occupation: v.occupation,
      bio: v.bio,
      joinedYear: v.joinedYear ? Number(v.joinedYear) : null,
      membershipStatus: v.membershipStatus,
      visibility: v.visibility,
      highlighted: v.highlighted,
      ...(privateAccess
        ? { phone: v.phone, kul: v.kul, familySize: v.familySize ? Number(v.familySize) : null }
        : {}),
    };
    try {
      if (member) await updateMemberApi(member.id, body);
      else await createMemberApi(body);
      dispatch(showToast(member ? 'Member updated.' : 'Member added.'));
      onSaved();
      onClose();
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        const field = f.field === 'displayName' || (f.field && f.field in v) ? f.field : undefined;
        if (field) {
          setError(field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not save the member') });
    }
  };

  return (
    <FormDrawer
      open={open}
      title={member ? 'Edit member' : 'Add member'}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={member ? 'Save changes' : 'Add member'}
      submitting={isSubmitting}
      pristine={Boolean(member) && !isDirty}
    >
      {errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <TextField label="Full name" required error={errors.displayName?.message} {...register('displayName')} />
      </FullWidth>
      <TextField label="Village" error={errors.village?.message} {...register('village')} />
      <TextField label="City" error={errors.city?.message} {...register('city')} />
      <TextField label="Country" error={errors.country?.message} {...register('country')} />
      <TextField label="Occupation" error={errors.occupation?.message} {...register('occupation')} />
      <TextField label="Member since (year)" inputMode="numeric" error={errors.joinedYear?.message} {...register('joinedYear')} />
      <SelectField label="Membership" error={errors.membershipStatus?.message} {...register('membershipStatus')}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </SelectField>
      <SelectField label="Who can find this entry" error={errors.visibility?.message} {...register('visibility')}>
        <option value="hidden">Only the office</option>
        <option value="public">Everyone</option>
      </SelectField>
      <Toggle className="self-end pb-2.5" label="Show in “Member highlights”" {...register('highlighted')} />
      {privateAccess && (
        <>
          <TextField label="Phone (private)" type="tel" error={errors.phone?.message} {...register('phone')} />
          <TextField label="Kul (private)" error={errors.kul?.message} {...register('kul')} />
          <TextField label="Family size (private)" inputMode="numeric" error={errors.familySize?.message} {...register('familySize')} />
        </>
      )}
      <FullWidth>
        <TextAreaField label="About" rows={3} error={errors.bio?.message} {...register('bio')} />
      </FullWidth>
    </FormDrawer>
  );
}
