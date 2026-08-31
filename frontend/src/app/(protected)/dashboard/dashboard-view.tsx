'use client';

import React from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useApiResource } from '@/hooks/useApiResource';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import {
  Zap,
  User,
  FilePlus,
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ArrowRight,
  ShieldCheck,
  Sun,
  ShieldAlert,
  HelpCircle,
  Phone,
  BarChart3,
  Flame,
} from 'lucide-react';

export interface DashboardPayload {
  dashboard?: {
    consumer?: any;
    stats?: { totalApplications: number; pendingCount: number; approvedCount: number; rejectedCount: number };
    recentConnections?: any[];
  };
}

/**
 * WelcomeBanner — the dashboard hero. Renders from the auth store during the
 * initial data load so the greeting appears together with the navbar (no flash
 * where the name is ready but the page is still a bare skeleton).
 */
function getGreeting(firstName?: string | null) {
  const hour = new Date().getHours();
  let timePrefix = 'Good morning';
  if (hour >= 12 && hour < 17) {
    timePrefix = 'Good afternoon';
  } else if (hour >= 17) {
    timePrefix = 'Good evening';
  }
  const name = firstName?.trim();
  return name ? `${timePrefix}, ${name}!` : `${timePrefix}!`;
}

function WelcomeBanner({
  firstName,
  lastName,
  status,
  children,
}: {
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bses-gradient-hero p-6 md:p-8 text-white shadow-xl">
      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3.5 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
            <Zap className="w-3.5 h-3.5 fill-amber-400" />
            <span>BSES Rajdhani & Yamuna Consumer Services</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {getGreeting(firstName)}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-2">
            <span>Account Status:</span>
            <StatusChip status={status} />
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}

export function DashboardView({ initialData }: { initialData?: DashboardPayload }) {
  const { user } = useAuthStore();

  // Server-resolved initialData renders the dashboard with data instantly (no
  // skeleton, no network); SWR revalidates quietly in the background after
  // the fresh window. On later client navigations the idle PrefetchProvider
  // has already warmed this URL into the shared cache.
  const { data, loading } = useApiResource<DashboardPayload>('/users/dashboard', { initialData });

  if (loading) {
    return (
      <div className="space-y-8 p-2 max-w-7xl mx-auto">
        <WelcomeBanner firstName={user?.firstName} lastName={user?.lastName} status={user?.status || 'ACTIVE'} />
        <DashboardSkeleton />
      </div>
    );
  }

  const dashboard = data?.dashboard ?? {};
  const consumer = dashboard.consumer || user;
  const stats = dashboard.stats || { totalApplications: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 };
  const recentConnections = dashboard.recentConnections || [];

  return (
    <div className="space-y-8 p-2 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <WelcomeBanner firstName={consumer?.firstName} lastName={consumer?.lastName} status={consumer?.status || 'ACTIVE'}>
        {/* Buttons — PrefetchLink warms the destination on hover/focus/touch
            so the click itself feels instant. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <PrefetchLink href="/connections/apply" className="w-full sm:w-auto">
            <Button variant="amber" size="md" fullWidth leftIcon={<FilePlus className="w-4 h-4" />}>
              Apply New Connection
            </Button>
          </PrefetchLink>
          <PrefetchLink href="/profile" dataUrls={['/users/profile']} className="w-full sm:w-auto">
            <Button variant="ghost-white" size="md" fullWidth leftIcon={<User className="w-4 h-4" />}>
              View Profile
            </Button>
          </PrefetchLink>
        </div>
      </WelcomeBanner>

      {/* Cyber Safety Warning Alert */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-extrabold text-amber-950 uppercase tracking-wide flex items-center gap-2">
            <span>Cyber Fraud Alert — Stay Vigilant!</span>
          </p>
          <p className="leading-relaxed text-amber-800">
            BSES never asks consumers to download unknown APK apps or make power bill payments via personal WhatsApp numbers. Bill payments are accepted only through this portal or BSES channels.
          </p>
        </div>
      </div>

      {/* Application Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Applications" value={stats.totalApplications} icon={FileText} iconWrap="bg-slate-100 text-slate-700" href="/connections" />
        <StatCard label="Pending Review" value={stats.pendingCount} icon={Clock} iconWrap="bg-amber-50 text-amber-600" href="/connections" />
        <StatCard label="Approved" value={stats.approvedCount} icon={CheckCircle2} iconWrap="bg-emerald-50 text-emerald-600" href="/connections" />
        <StatCard label="Rejected" value={stats.rejectedCount} icon={AlertCircle} iconWrap="bg-red-50 text-red-600" href="/connections" />
      </div>

      {/* BSES Discom Network Operational Highlights */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span>BSES Discom Operational Snapshot (FY 2024-25)</span>
            </h2>
            <p className="text-xs text-slate-500">Powering 31.89+ Lakh consumers across 700 sq. km in Delhi</p>
          </div>
          <Link href="/about" className="group text-xs font-bold text-primary hover:underline hidden sm:inline-flex items-center gap-1">
            <span>Full Profile</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-0.5 transition-all duration-150 ease-out hover:border-slate-300 hover:shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registered Consumers</span>
            <p className="text-lg font-extrabold text-slate-900">31.89 Lakhs</p>
            <p className="text-[10px] text-emerald-600 font-bold">+229% since privatization</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-0.5 transition-all duration-150 ease-out hover:border-slate-300 hover:shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AT&amp;C Losses Record</span>
            <p className="text-lg font-extrabold text-emerald-600">6.13%</p>
            <p className="text-[10px] text-slate-500 font-semibold">Down from 51.5% in 2002</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-0.5 transition-all duration-150 ease-out hover:border-slate-300 hover:shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peak Load Capacity</span>
            <p className="text-lg font-extrabold text-amber-600">3,809 MW</p>
            <p className="text-[10px] text-slate-500 font-semibold">114 EHV Grid Stations</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-0.5 transition-all duration-150 ease-out hover:border-slate-300 hover:shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Power Transformers</span>
            <p className="text-lg font-extrabold text-slate-900">293 Units</p>
            <p className="text-[10px] text-slate-500 font-semibold">11,161 Dist. Transformers</p>
          </div>
        </div>
      </Card>

      {/* Quick Digital Consumer Services */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Solar Rooftop Net-Metering */}
        <a
          href="https://bsesdelhi.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group block bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent rounded-2xl border border-amber-200/80 p-5 space-y-3 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl font-bold">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Solar Rooftop Net-Metering</h3>
              <p className="text-[11px] text-slate-500">PM Surya Ghar Subsidy Portal</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Express interest or apply online for Solar Rooftop Net-Metering installation and claim government subsidies.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 underline">
            <span>Express Solar Interest</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </a>

        {/* Private EV Charger Registration */}
        <a
          href="https://bsesdelhi.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group block bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-2xl border border-blue-200/80 p-5 space-y-3 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-surface-dark text-white rounded-xl font-bold">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">EV Charger Booking</h3>
              <p className="text-[11px] text-slate-500">Private &amp; Semi-Public Locations</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Request single-window connection setup for Electric Vehicle (EV) charging stations at residential &amp; commercial spots.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 underline">
            <span>Apply for EV Connection</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </a>

        {/* E-Lok Adalat & Dispute Resolution */}
        <Link
          href="/help-center"
          className="group block bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent rounded-2xl border border-emerald-200/80 p-5 space-y-3 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">E-Permanent Lok Adalat</h3>
              <p className="text-[11px] text-slate-500">E-PLA Fast-Track Settlement</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Download E-PLA forms and file billing dispute applications online for amicable out-of-court settlements.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 underline">
            <span>View E-PLA Details</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      {/* Recent Applications Table */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">Recent Service Applications</h2>
          <PrefetchLink
            href="/connections"
            dataUrls={['/connections']}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>View All Applications</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </PrefetchLink>
        </div>

        {recentConnections.length === 0 ? (
          <div className="text-center py-10 space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <FolderOpen className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No electricity connection requests found</p>
            <p className="text-xs text-slate-400">Apply for a new domestic, commercial, or industrial connection online.</p>
            <PrefetchLink href="/connections/apply">
              <Button variant="secondary" size="sm" className="mt-2">
                Start New Application
              </Button>
            </PrefetchLink>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Application No.</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Load (kW)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentConnections.map((conn: any) => (
                  <tr key={conn.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-slate-900">{conn.applicationNumber}</td>
                    <td className="p-3">{conn.connectionType}</td>
                    <td className="p-3">{conn.requiredLoad} kW</td>
                    <td className="p-3">
                      <StatusChip status={conn.status} />
                    </td>
                    <td className="p-3 text-xs text-slate-400">{new Date(conn.updatedAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <PrefetchLink
                        href={`/connections/${conn.id}`}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Track Details
                      </PrefetchLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
