import { Navigate, useParams } from 'react-router-dom';
import { getAnnouncementApi } from '../../api/adminApi';
import { AnnouncementForm } from '../../components/admin/AnnouncementForm';
import { useCan } from '../../components/admin/usePermissions';
import { Async } from '../../components/ui/Async';
import { useFetch } from '../../lib/useFetch';

/** Full-page "New announcement" / "Edit announcement". */
export default function AdminAnnouncementFormPage() {
  const can = useCan();
  const { id } = useParams();
  const query = useFetch(`admin-announcement:${id ?? 'new'}`, () => (id ? getAnnouncementApi(id) : Promise.resolve(null)));

  if (!can(id ? 'announcements.update' : 'announcements.create')) return <Navigate to="/admin/announcements" replace />;

  return (
    <Async data={query.data} loading={query.loading} error={query.error} onRetry={query.retry}>
      {(item) => <AnnouncementForm key={item?.id ?? 'new'} item={item} />}
    </Async>
  );
}
