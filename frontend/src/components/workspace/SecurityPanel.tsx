import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import {
  changePasswordApi,
  listMySessionsApi,
  revokeMySessionApi,
  type MySession,
} from '../../api/workspaceApi';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PasswordField } from '../ui/TextField';
import { useFetch } from '../../lib/useFetch';
import { formatDateTime } from '../../lib/format';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../utils/validation';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH)
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain a letter and a number'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
type Form = z.infer<typeof schema>;

/** Short, human description of a browser from its user-agent string. Purely informational. */
const describeAgent = (ua: string | null): string => {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown system';
  return `${browser} on ${os}`;
};

function PasswordForm() {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const onSubmit = async (v: Form) => {
    setFormError(null);
    try {
      const message = await changePasswordApi(v);
      reset();
      dispatch(showToast(message));
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in v) {
          setError(f.field as keyof Form, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setFormError(getErrorMessage(err, 'Could not change your password'));
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <PasswordField label="Current password" autoComplete="current-password" required error={errors.currentPassword?.message} {...register('currentPassword')} />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <PasswordField label="Confirm new password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      <Button type="submit" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}

function SessionRow({ session, onRevoked }: { session: MySession; onRevoked: () => void }) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const revoke = async () => {
    setBusy(true);
    try {
      await revokeMySessionApi(session.id);
      dispatch(showToast('Device signed out.', 'info'));
      onRevoked();
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not sign out that device'), 'error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-muted py-2.5 first:border-t-0">
      <div>
        <p className="text-sm font-medium">
          {describeAgent(session.userAgent)} {session.current && <Badge tone="accent">This device</Badge>}
        </p>
        <p className="text-xs text-text-muted">Last active {formatDateTime(session.lastSeenAt)}</p>
      </div>
      {!session.current && (
        <Button variant="secondary" size="sm" onClick={() => void revoke()} loading={busy}>
          Sign out
        </Button>
      )}
    </li>
  );
}

/** Password change and the list of devices that are currently signed in. */
export function SecurityPanel() {
  const sessions = useFetch('my-sessions', listMySessionsApi);
  return (
    <div className="grid items-start gap-3.5 lg:grid-cols-2">
      <Card>
        <h2 className="mb-0.5 font-semibold">Change password</h2>
        <p className="mb-4 text-[13px] text-text-muted">Changing it signs out your other devices.</p>
        <PasswordForm />
      </Card>
      <Card>
        <h2 className="mb-0.5 font-semibold">Signed-in devices</h2>
        <p className="mb-2 text-[13px] text-text-muted">If you do not recognise one, sign it out and change your password.</p>
        {sessions.error && !sessions.data ? (
          <Alert tone="danger">{sessions.error}</Alert>
        ) : (
          <ul className="m-0 list-none p-0">
            {sessions.data?.map((s) => <SessionRow key={s.id} session={s} onRevoked={sessions.retry} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
