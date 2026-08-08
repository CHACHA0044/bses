import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function GlobalLoading() {
  return (
    <LoadingSpinner
      variant="fullPage"
      size="lg"
      label="Loading BSES Delhi Consumer Portal..."
      delayMs={0}
    />
  );
}
