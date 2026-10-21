import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard } from '../components/layout/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { CheckboxField, PasswordField, TextField } from '../components/ui/TextField';
import { registerApi } from '../api/authApi';
import { getErrorMessage, getFieldErrors } from '../api/axiosInstance';
import { registerSchema, type RegisterForm } from '../utils/validation';

export default function RegisterPage() {
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', confirmPassword: '', acknowledge: false },
  });

  const onSubmit = async (values: RegisterForm) => {
    setFormError(null);
    try {
      const message = await registerApi({ ...values, phone: values.phone || undefined });
      setDone(message);
    } catch (err) {
      const fields = getFieldErrors(err);
      const known = new Set(['name', 'email', 'phone', 'password', 'confirmPassword', 'acknowledge']);
      let placed = false;
      for (const f of fields) {
        if (f.field && known.has(f.field)) {
          setError(f.field as keyof RegisterForm, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setFormError(getErrorMessage(err, 'Could not complete your registration'));
    }
  };

  if (done) {
    return (
      <AuthCard title="Registration received" footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}>
        <Alert tone="success">{done}</Alert>
        <p className="text-sm text-text-muted">
          Your account status is <strong className="text-text">Pending approval</strong>. You can sign in once an
          administrator approves it.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Register to RSVP to events and use the member directory. The Samaj office reviews every application."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField label="Full name" autoComplete="name" required error={errors.name?.message} {...register('name')} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          hint="Kept private. Only the Super Admin can see it."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          hint="At least 10 characters, with a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <CheckboxField
          label="I confirm that I belong to the Uttar Gujarat Kadva Patidar Samaj community and agree to the portal being used for Samaj members only."
          error={errors.acknowledge?.message}
          {...register('acknowledge')}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
