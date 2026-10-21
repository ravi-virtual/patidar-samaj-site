import type { ReactNode } from 'react';
import { Card } from '../ui/Card';

/** Centered card used by every sign-in / registration / recovery screen. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-10">
      <Card className="space-y-5 p-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-text-muted">{description}</p>}
        </div>
        {children}
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-text-muted">{footer}</div>}
    </div>
  );
}
