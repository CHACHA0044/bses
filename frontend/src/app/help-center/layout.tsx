import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1 w-full py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
