import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getContentApi, type ContentRow } from '../../api/adminApi';
import type { DraftState } from '../../components/admin/ContentPreview';
import { resources } from '../../components/admin/contentConfig';
import { ContentForm } from '../../components/admin/ContentForm';
import { useCan } from '../../components/admin/usePermissions';
import { Async } from '../../components/ui/Async';
import { useFetch } from '../../lib/useFetch';

/** Full-page "New …" / "Edit …" for one kind of managed content (FAQs, links, milestones, committee). */
export default function AdminContentFormPage() {
  const can = useCan();
  const { resource, id } = useParams();
  const def = resources.find((r) => r.key === resource);
  // Coming back from the preview page the row is handed over, so nothing is fetched again.
  const cached = (useLocation().state as DraftState<unknown> | null)?.cache?.row as
    ContentRow | null | undefined;
  const query = useFetch(`admin-content:${resource}:${id ?? 'new'}`, () =>
    cached !== undefined
      ? Promise.resolve(cached)
      : def && id
        ? getContentApi(def.key, id)
        : Promise.resolve(null),
  );

  if (!def || !can('content.manage')) return <Navigate to="/admin/content" replace />;

  return (
    <Async
      data={cached !== undefined ? cached : query.data}
      loading={query.loading}
      error={query.error}
      onRetry={query.retry}
    >
      {(row) => <ContentForm key={row?.id ?? 'new'} def={def} row={row} />}
    </Async>
  );
}
