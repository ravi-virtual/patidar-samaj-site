import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Title block used at the top of every page. The single <h1> of the page lives here. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-xs uppercase tracking-wide text-accent">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
