import { LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';

/** Right side of the admin header on small screens (the sidebar holds sign-out on large ones). */
export function HeaderActions() {
  const dispatch = useAppDispatch();
  const { user, bootstrapped } = useAppSelector((s) => s.auth);

  if (!bootstrapped || !user) return null;

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
