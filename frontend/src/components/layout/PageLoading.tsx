import { SkeletonText } from '../ui/Skeleton';

/** Shown while a lazily loaded part of the app (the admin panel) is being fetched. */
export function PageLoading() {
  return (
    <div className="mx-auto max-w-md py-16">
      <SkeletonText lines={3} />
    </div>
  );
}
