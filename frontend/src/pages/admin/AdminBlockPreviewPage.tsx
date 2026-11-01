import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { AdminBlock } from '../../api/adminApi';
import { blocks } from '../../components/admin/contentConfig';
import { BlockPreview, type PreviewState } from '../../components/admin/ContentPreview';

type Values = Parameters<typeof BlockPreview>[0]['values'];

/**
 * Full-page preview of an unsaved text block. Everything it shows (the typed values and the
 * neighbouring blocks) is handed over by the editor, so it makes no request of its own.
 */
export default function AdminBlockPreviewPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const state = useLocation().state as PreviewState<Values> | null;
  const def = blocks.find((b) => b.key === key);
  const editPath = `/admin/content/blocks/${key}/edit`;

  // Opened directly (or refreshed): there are no typed values to show, so go back to the editor.
  if (!def || !state) return <Navigate to={def ? editPath : '/admin/content'} replace />;

  return (
    <BlockPreview
      onBack={() => navigate(editPath, { state: { draft: state.values, cache: state.cache } })}
      def={def}
      values={state.values}
      others={(state.cache?.blocks as AdminBlock[] | undefined) ?? []}
      status={state.status}
    />
  );
}
