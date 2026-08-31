import React from 'react';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'BSES Delhi Online Portal | Apply for New Electricity Connection',
  description:
    'Apply online for a new electricity connection with BSES Rajdhani Power Limited (BRPL) & BSES Yamuna Power Limited (BYPL). Register, track application status, upload documents, and manage your consumer profile 24x7.',
};

// Defer Framer Motion loading so it's not part of the initial critical JS bundle,
// while preserving all hero, step-journey, and FAQ collapse animations intact.
const HomeMotionContent = dynamic(
  () => import('@/components/home/HomeMotionContent'),
  { ssr: false }
);

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50">
      <Navbar />
      <HomeMotionContent />
      <Footer />
    </div>
  );
}
