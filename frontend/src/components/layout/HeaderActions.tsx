import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';

const linkButton =
  'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium transition-colors';

/** Right side of the header: sign-in links for visitors, name and sign-out for members and staff. */
export function HeaderActions() {
  const dispatch = useAppDispatch();
  const { user, bootstrapped } = useAppSelector((s) => s.auth);

  if (!bootstrapped) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link to="/register" className={`${linkButton} border border-border text-text hover:bg-surface-muted`}>
          Join
        </Link>
        <Link to="/login" className={`${linkButton} bg-primary text-primary-foreground hover:bg-primary-hover`}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 lg:hidden">
      <span className="hidden max-w-[10rem] truncate text-[13px] text-text-secondary sm:inline" title={user.email}>
        {user.name}
      </span>
      <Button variant="secondary" size="sm" onClick={() => void dispatch(logout())} aria-label={`Sign out ${user.name}`}>
        <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
