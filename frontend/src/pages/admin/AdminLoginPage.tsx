import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard } from '../../components/layout/AuthCard';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/TextField';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { adminLogin, clearLoginError } from '../../store/slices/authSlice';
import { loginSchema, type LoginForm } from '../../utils/validation';
import { t } from '../../i18n';

/** The only sign-in: the Super Admin and admins. Not linked from the public site. */
export default function AdminLoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, bootstrapped, loginStatus, loginError, loginErrorCode } = useAppSelector((s) => s.auth);
  const from = (location.state as { from?: string } | null)?.from;
  const target = from?.startsWith('/admin') && from !== '/admin/login' ? from : '/admin';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  useEffect(() => () => void dispatch(clearLoginError()), [dispatch]);

  if (bootstrapped && user) return <Navigate to={target} replace />;

  const onSubmit = async (values: LoginForm) => {
    const result = await dispatch(adminLogin(values));
    if (adminLogin.fulfilled.match(result)) navigate(target, { replace: true });
  };

  const accountNotice = loginErrorCode === 'ACCOUNT_NOT_ACTIVE';

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <AuthCard
        title={t('Admin sign in')}
        description={t('For the Samaj Super Admin and admins.')}
        footer={
          <Link to="/" className="font-medium text-accent hover:underline">
            {t('Back to the site')}
          </Link>
        }
      >
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {loginError && <Alert tone={accountNotice ? 'warning' : 'danger'}>{loginError}</Alert>}
          <TextField
            label={t('Email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          <PasswordField
            label={t('Password')}
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
              {t('Forgot password?')}
            </Link>
          </div>
          <Button type="submit" className="w-full" loading={loginStatus === 'loading'}>
            {loginStatus === 'loading' ? t('Signing in…') : t('Sign in')}
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
