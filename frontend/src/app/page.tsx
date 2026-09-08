import React from 'react';
import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import HomeMotionContent from '@/components/home/HomeMotionContent';
import { ResetLogoutState } from '@/components/common/ResetLogoutState';

export const metadata: Metadata = {
  title: 'BSES Delhi Online Portal | Apply for New Electricity Connection',
  description:
    'Apply online for a new electricity connection with BSES Rajdhani Power Limited (BRPL) & BSES Yamuna Power Limited (BYPL). Register, track application status, upload documents, and manage your consumer profile 24x7.',
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50">
      <Navbar />
      <ResetLogoutState />
      <HomeMotionContent />
      <Footer />
    </div>
  );
}
