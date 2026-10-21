import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createStaffApi } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { Alert } from '../ui/Alert';
import { SelectField } from '../ui/FormFields';
import { TextField } from '../ui/TextField';
import { FormDrawer, FullWidth } from './FormDrawer';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).refine((v) => !/[<>]/.test(v), 'Contains invalid characters'),
  email: z.string().trim().min(1, 'Email is required').max(254).pipe(z.email('Enter a valid email address')),
  role: z.enum(['admin', 'editor', 'viewer']),
});
type Form = z.infer<typeof schema>;

/** Creates a staff account. It has no password; the one-time setup link returned lets the person choose one. */
export function StaffCreateDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: { url: string; expiresAt: string; name: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', role: 'editor' } });

  useEffect(() => {
    if (open) reset({ name: '', email: '', role: 'editor' });
  }, [open, reset]);

  const onSubmit = async (v: Form) => {
    try {
      const { user, setup } = await createStaffApi(v);
      onCreated({ url: setup.url, expiresAt: setup.expiresAt, name: user.name });
      onClose();
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in v) {
          setError(f.field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not create the account') });
    }
  };

  return (
    <FormDrawer open={open} title="Add staff member" onClose={onClose} onSubmit={handleSubmit(onSubmit)} submitLabel="Create account" submitting={isSubmitting}>
      {errors.root?.message && (
        <FullWidth>
          <Alert tone="danger">{errors.root.message}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <Alert tone="info">
          The account starts without a password. You will get a one-time link to give to the person so they can set their own.
        </Alert>
      </FullWidth>
      <FullWidth>
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
      </FullWidth>
      <FullWidth>
        <TextField label="Email" type="email" required error={errors.email?.message} {...register('email')} />
      </FullWidth>
      <FullWidth>
        <SelectField label="Role" hint="Admins run day-to-day operations, Editors write content, Viewers can only look." error={errors.role?.message} {...register('role')}>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </SelectField>
      </FullWidth>
    </FormDrawer>
  );
}
