import React from 'react';
import { PageTransition } from '@/components/ui/PageTransition';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
