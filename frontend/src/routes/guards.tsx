import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
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
 */

/** Signed-in users only. Anyone else is sent to the login page and returned afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (!bootstrapped) return <Pending />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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

/** Login and registration pages are pointless once signed in. */
export function PublicOnly({ children }: { children?: ReactNode }) {
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  if (!bootstrapped) return <Pending />;
  if (user) return <Navigate to="/" replace />;
  return children ?? <Outlet />;
}

/** Staff roles only (everyone except the plain member). The server checks each permission again. */
export function RequireStaff({ children }: { children?: ReactNode }) {
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (!bootstrapped) return <Pending />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.role === 'member') {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          title="You don’t have access"
          description="The admin panel is for Samaj office staff."
          action={<Link to="/" className="text-sm font-medium">Back to the site</Link>}
        />
      </div>
    );
  }
  return children ?? <Outlet />;
}
