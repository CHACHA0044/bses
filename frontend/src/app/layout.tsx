import React from 'react';
import type { Metadata } from 'next';
import { fontInter, fontRoboto } from '@/lib/fonts';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ScrollToTop } from '@/components/common/ScrollToTop';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { getServerSession } from '@/lib/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSES Consumer Registration & Service Management Portal',
  description:
    'Unofficial online electricity consumer portal for BSES Rajdhani Power Limited and BSES Yamuna Power Limited. Apply for new connections, track status, and manage your profile.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the session on the server so the store is seeded synchronously on
  // hydration — no client round-trip to /auth/session, no logged-out flash on
  // protected pages. Guests (no cookies) short-circuit with zero network.
  const session = await getServerSession();

  return (
    <html lang="en" className={`${fontInter.variable} ${fontRoboto.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
        {/*
          Anti-FOUC scroll guard — runs before the first paint so every page
          load starts at the very top:
           1. Disable the browser's automatic scroll restoration, so a reload or
              back/forward navigation can never land mid-page.
           2. Force scrollTop = 0 on every scrollable element. On a fresh load
              this is a no-op; on a reload mid-page it resets to the top BEFORE
              the first paint — no visible jump.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(typeof history!=='undefined'&&'scrollRestoration' in history){history.scrollRestoration='manual';}}catch(e){}try{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;}catch(e){}})();`,
          }}
        />
        <SessionProvider initialSession={session}>
          <ScrollToTop />
          <React.Suspense fallback={null}>
            <TopProgressBar />
          </React.Suspense>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
