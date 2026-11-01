import { Navigate, useLocation, useParams } from 'react-router-dom';
import { listBlocksAdminApi, type AdminBlock } from '../../api/adminApi';
import { blocks } from '../../components/admin/contentConfig';
import { BlockForm } from '../../components/admin/BlockForm';
import type { DraftState } from '../../components/admin/ContentPreview';
import { useCan } from '../../components/admin/usePermissions';
import { Async } from '../../components/ui/Async';
import { useFetch } from '../../lib/useFetch';

/** Full-page editor for one fixed text block of the site. */
export default function AdminBlockFormPage() {
  const can = useCan();
  const { key } = useParams();
  const def = blocks.find((b) => b.key === key);
  // Coming back from the preview page the blocks are handed over, so nothing is fetched again.
  const cached = (useLocation().state as DraftState<unknown> | null)?.cache?.blocks as AdminBlock[] | undefined;
  const query = useFetch('admin-blocks', () => (cached ? Promise.resolve(cached) : listBlocksAdminApi()));

  if (!def || !can('content.manage')) return <Navigate to="/admin/content" replace />;

  return (
    <Async data={cached ?? query.data} loading={query.loading} error={query.error} onRetry={query.retry}>
      {(all) => <BlockForm key={def.key} def={def} block={all.find((b) => b.key === def.key)} allBlocks={all} />}
    </Async>
  );
}
