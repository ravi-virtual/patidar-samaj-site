import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { resetAdminPasswordApi, type AdminUser } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { generatePassword } from '../../lib/generatePassword';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Modal } from '../overlays/Modal';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { PasswordField } from '../ui/TextField';
import { t } from '../../i18n';

function Body({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    password.length > 0 && password.length < 10
      ? t('Password must be at least 10 characters')
      : password.length > 0 && !(/[A-Za-z]/.test(password) && /\d/.test(password))
        ? t('Password must contain a letter and a number')
        : undefined;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const mail = await resetAdminPasswordApi(user.id, password);
      dispatch(
        mail.delivered
          ? showToast(t('Password reset. The new password was emailed to {email}.', { email: user.email }))
          : showToast(t('Password reset, but the email could not be sent. Share the password with them yourself.'), 'info'),
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t('Could not reset the password')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4 px-5 py-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Alert tone="info">
          {t('{name} is signed out everywhere and receives an email with the new password, and is asked to change it after signing in.', { name: user.name })}
        </Alert>
        <PasswordField
          label={t('New password')}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={t('At least 10 characters with a letter and a number.')}
          error={problem}
        />
        <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
          <Wand2 aria-hidden="true" className="h-4 w-4" />
          {t('Generate a password')}
        </Button>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t('Cancel')}
        </Button>
        <Button onClick={() => void save()} loading={busy} disabled={password.length === 0 || Boolean(problem)}>
          {t('Reset password')}
        </Button>
      </div>
    </>
  );
}

/** Sets a new password for an admin directly. The server emails it to them; no link is passed around. */
export function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? t('Reset password · {name}', { name: user.name }) : t('Reset password')}>
      {user && <Body key={user.id} user={user} onClose={onClose} />}
    </Modal>
  );
}
