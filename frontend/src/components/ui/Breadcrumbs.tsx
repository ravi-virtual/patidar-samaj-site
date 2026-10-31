import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Omit for the current page (or a level with no page of its own). */
  to?: string;
}

/** Trail such as "Admin > Admins > Create admin". Earlier levels link back; the last is the current page. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="m-0 flex list-none items-center gap-1.5 p-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-subtle" />}
              <li className={`min-w-0 ${last ? '' : 'hidden sm:block'}`}>
                {c.to && !last ? (
                  <Link to={c.to} className="truncate rounded text-text-muted hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={`truncate ${last ? 'font-medium text-text' : 'text-text-muted'}`}>
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
