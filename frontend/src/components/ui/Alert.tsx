import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<Tone, string> = {
  info: 'border-accent-border bg-accent-soft text-accent-strong',
  success: 'border-transparent bg-success-soft text-success',
  warning: 'border-transparent bg-warning-soft text-warning',
  danger: 'border-danger-border bg-danger-soft text-danger',
};

const icons = { info: Info, success: CircleCheck, warning: CircleAlert, danger: CircleAlert } as const;

/** Inline feedback. Danger and warning interrupt screen readers (alert); the rest are polite (status). */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${styles[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-text-secondary">{children}</div>
    </div>
  );
}
