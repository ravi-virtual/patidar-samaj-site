import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2 } from 'lucide-react';
import { z } from 'zod';
import { createAdminApi } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { PermissionPicker } from '../../components/admin/PermissionPicker';
import { useCan } from '../../components/admin/usePermissions';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { PasswordField, TextField } from '../../components/ui/TextField';
import { generatePassword } from '../../lib/generatePassword';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).refine((v) => !/[<>]/.test(v), 'Contains invalid characters'),
  email: z.string().trim().min(1, 'Email is required').max(254).pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain a letter and a number'),
  permissions: z.array(z.string()),
});
type Form = z.infer<typeof schema>;

/**
 * Full-page "Add admin" form (Super Admin only): name, email, a password the Super Admin chooses
 * and the permissions to give. The server emails the new admin their sign-in details.
 */
export default function AdminUserCreatePage() {
  const can = useCan();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', permissions: [] } });
  const permissions = useWatch({ control, name: 'permissions' });

  if (!can('users.manage')) return <Navigate to="/admin" replace />;

  const onSubmit = async (v: Form) => {
    try {
      const { user, email } = await createAdminApi(v);
      dispatch(
        email.delivered
          ? showToast(`${user.name} was created and the sign-in details were emailed to ${user.email}.`)
          : showToast(`${user.name} was created, but the email could not be sent. Share the password with them yourself.`, 'info'),
      );
      navigate('/admin/users');
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in v) {
          setError(f.field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not create the admin') });
    }
  };

  return (
    <>
      <PageHeader
        title="Add admin"
        description="Set the sign-in details and choose exactly what this admin can do."
        actions={
          <Link
            to="/admin/users"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-3.5 text-sm font-medium text-text hover:bg-surface-muted"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to admins
          </Link>
        }
      />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {errors.root?.message && <Alert tone="danger">{errors.root.message}</Alert>}

        <section aria-labelledby="account-heading" className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 id="account-heading" className="text-base font-semibold text-text">
            Account
          </h2>
          <Alert tone="info">
            The new admin receives an email with their email address and this password, and is asked to change the password after signing in.
          </Alert>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Full name" required autoComplete="off" error={errors.name?.message} {...register('name')} />
            <TextField label="Email" type="email" required autoComplete="off" error={errors.email?.message} {...register('email')} />
            <div className="space-y-2 md:col-span-2 md:max-w-[calc(50%-0.5rem)]">
              <PasswordField
                label="Password"
                required
                autoComplete="new-password"
                hint="At least 10 characters with a letter and a number."
                error={errors.password?.message}
                {...register('password')}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setValue('password', generatePassword(), { shouldValidate: true, shouldDirty: true })}
              >
                <Wand2 aria-hidden="true" className="h-4 w-4" />
                Generate a password
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="perm-heading" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 id="perm-heading" className="sr-only">
            Permissions
          </h2>
          <PermissionPicker layout="page" value={permissions} onChange={(next) => setValue('permissions', next, { shouldDirty: true })} />
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/users')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Create admin
          </Button>
        </div>
      </form>
    </>
  );
}
