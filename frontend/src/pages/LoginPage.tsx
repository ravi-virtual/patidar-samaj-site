import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthCard } from '../components/layout/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PasswordField, TextField } from '../components/ui/TextField';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearLoginError, login } from '../store/slices/authSlice';
import { loginSchema, type LoginForm } from '../utils/validation';

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStatus, loginError, loginErrorCode } = useAppSelector((s) => s.auth);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  useEffect(() => () => void dispatch(clearLoginError()), [dispatch]);

  const onSubmit = async (values: LoginForm) => {
    const result = await dispatch(login(values));
    if (login.fulfilled.match(result)) navigate(from, { replace: true });
  };

  // Account states (pending, rejected, suspended) are informational, not "wrong password".
  const accountNotice = loginErrorCode === 'ACCOUNT_NOT_ACTIVE';

  return (
    <AuthCard
      title="Sign in to Patidar Samaj"
      description="Members and staff sign in here."
      footer={
        <>
          New to the portal?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {loginError && <Alert tone={accountNotice ? 'warning' : 'danger'}>{loginError}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loginStatus === 'loading'}>
          {loginStatus === 'loading' ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
