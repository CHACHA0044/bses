import { fetchApiData } from '@/lib/server';
import { ConnectionsView, type ConnectionsPayload } from './connections-view';

export default async function ConnectionsPage() {
  const initialData = await fetchApiData<ConnectionsPayload>('/connections');

  return <ConnectionsView initialData={initialData} />;
}
