import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function RegisterLoading() {
  return <LoadingSpinner label="Preparing registration..." delayMs={0} variant="inline" size="md" />;
}
