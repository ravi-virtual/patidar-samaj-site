import { Badge, type BadgeTone } from '../ui/Badge';

const tones: Record<string, BadgeTone> = {
  // publishing
  published: 'success',
  draft: 'warning',
  archived: 'neutral',
  cancelled: 'danger',
  // accounts
  active: 'success',
  pending: 'warning',
  rejected: 'danger',
  suspended: 'neutral',
  inactive: 'neutral',
  // contact inbox
  new: 'warning',
  in_progress: 'accent',
  resolved: 'success',
  // audit
  success: 'success',
  failure: 'danger',
};

const labels: Record<string, string> = { in_progress: 'In progress', suspended: 'Inactive' };

/** The status is always spelled out, so colour is never the only signal. */
export function StatusBadge({ status }: { status: string }) {
  const text = labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge tone={tones[status] ?? 'neutral'}>{text}</Badge>;
}
