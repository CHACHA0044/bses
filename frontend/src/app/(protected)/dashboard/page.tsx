import { fetchApiData } from '@/lib/server';
import { DashboardView, type DashboardPayload } from './dashboard-view';

export default async function DashboardPage() {
  // Best-effort server prefetch (session is resolved by the root layout).
  // When it returns data, the client view renders instantly with it and
  // issues zero network requests; when it fails, the hook fetches as before.
  const initialData = await fetchApiData<DashboardPayload>('/users/dashboard');

  return <DashboardView initialData={initialData} />;
}
