import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard } from '../components/layout/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PasswordField } from '../components/ui/TextField';
import { resetPasswordApi } from '../api/authApi';
import { getErrorMessage, getFieldErrors } from '../api/axiosInstance';
import { resetPasswordSchema, type ResetPasswordForm } from '../utils/validation';
import { t } from '../i18n';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Take the token from the link once, then remove it from the address bar so it does not linger
  // in history or get copied along when the page is shared or sent in a Referer header.
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetPasswordForm) => {
    setError(null);
    try {
      setDone(await resetPasswordApi({ token, ...values }));
    } catch (err) {
      const field = getFieldErrors(err).find((f) => f.field === 'password');
      if (field) setFieldError('password', { message: field.message });
      else setError(getErrorMessage(err));
    }
  };

  if (!token) {
    return (
      <AuthCard title={t('Reset link needed')} footer={<Link to="/forgot-password" className="font-medium text-accent hover:underline">{t('Request a new link')}</Link>}>
        <Alert tone="warning">{t('This page needs a valid reset link. Open the link you were given, or request a new one.')}</Alert>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title={t('Password updated')}>
        <Alert tone="success">{done}</Alert>
        <Link
          to="/admin/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {t('Go to sign in')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('Choose a new password')} description={t('Use at least 10 characters, with a letter and a number.')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <PasswordField label={t('New password')} autoComplete="new-password" required error={errors.password?.message} {...register('password')} />
        <PasswordField
          label={t('Confirm new password')}
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('Saving…') : t('Update password')}
        </Button>
      </form>
    </AuthCard>
  );
}
