import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function LoginLoading() {
  return <LoadingSpinner label="Loading sign-in page..." delayMs={0} variant="inline" size="md" />;
}
