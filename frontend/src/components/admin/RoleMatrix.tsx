import { Check, Minus } from 'lucide-react';
import { getRolesApi } from '../../api/adminApi';
import { roleLabel } from '../../lib/labels';
import { useFetch } from '../../lib/useFetch';
import { Async } from '../ui/Async';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

/** Read-only view of what each role can do, taken from the server's own rules. */
export function RoleMatrix() {
  const { data, initialLoading, error, retry } = useFetch('role-matrix', getRolesApi);
  return (
    <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-72" />}>
      {(m) => (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Permissions granted by each role</caption>
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Permission
                </th>
                {m.roles.map((r) => (
                  <th key={r.role} scope="col" className="px-3 py-2.5 text-center font-medium">
                    {roleLabel(r.role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.permissions.map((p) => (
                <tr key={p} className="border-b border-surface-muted last:border-b-0">
                  <th scope="row" className="px-4 py-2 text-left font-mono text-[13px] font-normal text-text-secondary">
                    {p}
                    {m.grantable.includes(p) && (
                      <span className="ml-2 rounded border border-border px-1 font-sans text-[10px] text-text-muted">can be granted</span>
                    )}
                  </th>
                  {m.roles.map((r) => {
                    const has = r.permissions.includes(p);
                    return (
                      <td key={r.role} className="px-3 py-2 text-center">
                        {has ? (
                          <>
                            <Check aria-hidden="true" className="mx-auto h-4 w-4 text-accent" />
                            <span className="sr-only">Yes</span>
                          </>
                        ) : (
                          <>
                            <Minus aria-hidden="true" className="mx-auto h-4 w-4 text-text-subtle" />
                            <span className="sr-only">No</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Async>
  );
}
