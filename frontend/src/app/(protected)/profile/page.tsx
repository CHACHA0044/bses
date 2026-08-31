import { fetchApiData } from '@/lib/server';
import { ProfileView, type ProfilePayload } from './profile-view';

export default async function ProfilePage() {
  const initialData = await fetchApiData<ProfilePayload>('/users/profile');

  return <ProfileView initialData={initialData} />;
}
