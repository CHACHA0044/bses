import React from 'react';
import type { Metadata } from 'next';
import { PageTransition } from '@/components/ui/PageTransition';

export const metadata: Metadata = {
  title: {
    default: 'Consumer Account | BSES Delhi Online Portal',
    template: '%s | BSES Delhi Online Portal',
  },
  description:
    'Sign in to your BSES consumer account, register for a new electricity connection, or recover your password for BSES Rajdhani Power Limited & BSES Yamuna Power Limited.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
