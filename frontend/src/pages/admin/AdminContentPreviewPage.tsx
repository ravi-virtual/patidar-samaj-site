import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { resources } from '../../components/admin/contentConfig';
import { ResourcePreview, type PreviewState } from '../../components/admin/ContentPreview';

type Values = Parameters<typeof ResourcePreview>[0]['values'];

/** Full-page preview of an unsaved FAQ, link, milestone or committee entry. */
export default function AdminContentPreviewPage() {
  const { resource, id } = useParams();
  const navigate = useNavigate();
  const state = useLocation().state as PreviewState<Values> | null;
  const def = resources.find((r) => r.key === resource);
  const editPath = id ? `/admin/content/${resource}/${id}/edit` : `/admin/content/${resource}/new`;

  // Opened directly (or refreshed): there are no typed values to show, so go back to the editor.
  if (!def || !state) return <Navigate to={def ? editPath : '/admin/content'} replace />;

  return (
    <ResourcePreview
      onBack={() => navigate(editPath, { state: { draft: state.values, cache: state.cache } })}
      def={def}
      values={state.values}
      termLabel={state.termLabel}
      status={state.status}
    />
  );
}
