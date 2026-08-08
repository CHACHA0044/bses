import React from 'react';
import type { Metadata } from 'next';
import { fontInter, fontRoboto } from '@/lib/fonts';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ScrollToTop } from '@/components/common/ScrollToTop';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { PageTransition } from '@/components/ui/PageTransition';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSES Consumer Registration & Service Management Portal',
  description:
    'Official online electricity consumer portal for BSES Rajdhani Power Limited and BSES Yamuna Power Limited. Apply for new connections, track status, and manage your profile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontInter.variable} ${fontRoboto.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
        <SessionProvider>
          <ScrollToTop />
          <React.Suspense fallback={null}>
            <TopProgressBar />
          </React.Suspense>
          <PageTransition>{children}</PageTransition>
        </SessionProvider>
      </body>
    </html>
  );
}
