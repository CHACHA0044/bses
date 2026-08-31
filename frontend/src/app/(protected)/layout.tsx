import React from 'react';
import { AuthGuard } from '@/components/common/AuthGuard';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { PrefetchProvider } from '@/components/providers/PrefetchProvider';
import { PageTransition } from '@/components/ui/PageTransition';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PrefetchProvider>
        <div className="flex flex-col h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-slate-50" style={{ scrollbarGutter: 'stable' }}>
          <Navbar />
          {/* This row must fill the remaining viewport height */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar: hidden on mobile, full-height on md+ */}
            <div className="hidden md:flex flex-col shrink-0">
              <Sidebar />
            </div>
            {/*
              overflow-y-scroll (not auto) keeps the scrollbar gutter reserved at
              all times — prevents horizontal layout shift when tall vs short pages
              alternate during navigation.
            */}
            <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-scroll p-4 sm:p-6 lg:p-8">
              {/* Content-only transition — the Navbar/Sidebar stay mounted and static. */}
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </PrefetchProvider>
    </AuthGuard>
  );
}
