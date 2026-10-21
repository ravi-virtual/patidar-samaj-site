import { useAppSelector } from '../../store/hooks';

/**
 * `can('events.publish')` is true when the signed-in user holds every listed permission.
 * Used only to hide controls the server would refuse anyway; it is never a security check.
 */
export function useCan() {
  const permissions = useAppSelector((s) => s.auth.user?.permissions) ?? [];
  return (...needed: string[]) => needed.every((p) => permissions.includes(p));
}

/** True when the user holds at least one of the permissions. */
export function useCanAny() {
  const permissions = useAppSelector((s) => s.auth.user?.permissions) ?? [];
  return (...options: string[]) => options.some((p) => permissions.includes(p));
}
