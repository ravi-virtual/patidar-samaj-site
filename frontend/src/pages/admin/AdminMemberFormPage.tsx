import { Navigate, useParams } from 'react-router-dom';
import { getMemberApi } from '../../api/adminApi';
import { MemberForm } from '../../components/admin/MemberForm';
import { useCan } from '../../components/admin/usePermissions';
import { Async } from '../../components/ui/Async';
import { useFetch } from '../../lib/useFetch';

/** Full-page "Add member" / "Edit member". */
export default function AdminMemberFormPage() {
  const can = useCan();
  const { id } = useParams();
  const query = useFetch(`admin-member:${id ?? 'new'}`, () => (id ? getMemberApi(id) : Promise.resolve(null)));

  if (!can(id ? 'members.update' : 'members.create')) return <Navigate to="/admin/members" replace />;

  return (
    <Async data={query.data} loading={query.loading} error={query.error} onRetry={query.retry}>
      {(member) => <MemberForm key={member?.id ?? 'new'} member={member} />}
    </Async>
  );
}
