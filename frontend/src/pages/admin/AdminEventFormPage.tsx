import { Navigate, useParams } from 'react-router-dom';
import { getEventApi } from '../../api/adminApi';
import { EventForm } from '../../components/admin/EventForm';
import { useCan } from '../../components/admin/usePermissions';
import { Async } from '../../components/ui/Async';
import { useFetch } from '../../lib/useFetch';

/** Full-page "New event" / "Edit event". */
export default function AdminEventFormPage() {
  const can = useCan();
  const { id } = useParams();
  const query = useFetch(`admin-event:${id ?? 'new'}`, () =>
    id ? getEventApi(id) : Promise.resolve(null),
  );

  if (!can(id ? 'events.update' : 'events.create')) return <Navigate to="/admin/events" replace />;

  return (
    <Async data={query.data} loading={query.loading} error={query.error} onRetry={query.retry}>
      {(event) => <EventForm key={event?.id ?? 'new'} event={event} />}
    </Async>
  );
}
