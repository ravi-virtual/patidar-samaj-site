import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SkeletonText } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { useAppSelector } from '../store/hooks';

function Pending() {
  return (
    <div className="mx-auto max-w-md py-10">
      <SkeletonText lines={3} />
    </div>
  );
}

/**
 * Convenience only: these guards decide what to show, they do not protect data. Every API call is
 * authorized again on the server, so bypassing a guard in the browser gains nothing.
 *
 * The public site has no sign-in. The only account holders are admins and the Super Admin, so every
 * guard sends signed-out visitors to /admin/login (and back afterwards).
 */

/** Signed-in users only. Anyone else is sent to the admin sign-in page and returned afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (!bootstrapped) return <Pending />;
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children ?? <Outlet />;
}

/** Signed-in users that hold every listed permission. */
export function RequirePermission({
  permissions,
  children,
}: {
  permissions: string[];
  children?: ReactNode;
}) {
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (!bootstrapped) return <Pending />;
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!permissions.every((p) => user.permissions.includes(p))) {
    return (
      <EmptyState
        title="You don’t have access"
        description="Your account does not have permission to open this page."
      />
    );
  }
  return children ?? <Outlet />;
}
