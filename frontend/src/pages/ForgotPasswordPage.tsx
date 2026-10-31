import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard } from '../components/layout/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { forgotPasswordApi } from '../api/authApi';
import { getErrorMessage } from '../api/axiosInstance';
import { forgotPasswordSchema, type ForgotPasswordForm } from '../utils/validation';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }: ForgotPasswordForm) => {
    setError(null);
    try {
      setMessage(await forgotPasswordApi(email));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your admin account email. If email delivery is available you will receive a reset link; otherwise the Super Admin can issue one for you."
      footer={
        <Link to="/admin/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {message ? (
        <Alert tone="info">{message}</Alert>
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset instructions'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
