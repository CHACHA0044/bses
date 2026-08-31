'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useApiResource } from '@/hooks/useApiResource';
import { AdminDashboardSkeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { MiniBarChart } from '@/components/ui/MiniBarChart';
import {
  Users,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  Shield,
  Loader2,
  CalendarClock,
  UserCheck,
} from 'lucide-react';
import type { AdminAnalytics } from '@/types/workflow';

export interface AdminDashboardPayload {
  analytics: AdminAnalytics;
}

export function AdminDashboardView() {
  // Data loads entirely client-side via the SWR cache. The PrefetchProvider
  // warms /admin/dashboard in the background so this usually renders instantly.
  const { data, loading } = useApiResource<AdminDashboardPayload>('/admin/dashboard');
  const analytics = data?.analytics;
  const consumers = useMemo(() => analytics?.consumers || { totalActive: 0 }, [analytics]);
  const requests = useMemo(() => analytics?.connectionRequests || {}, [analytics]);
  const officers = useMemo(() => analytics?.officers || { totalActive: 0 }, [analytics]);

  const stats = useMemo(
    () => [
      {
        label: 'Active Consumers',
        value: consumers.totalActive ?? 0,
        icon: Users,
        iconWrap: 'bg-slate-100 text-slate-700',
        href: '/admin/users',
      },
      {
        label: 'Active Officers',
        value: officers.totalActive ?? 0,
        icon: UserCheck,
        iconWrap: 'bg-violet-50 text-violet-600',
        href: '/admin/users',
      },
      {
        label: 'Total Applications',
        value: requests.totalApplications ?? 0,
        icon: FileText,
        iconWrap: 'bg-slate-100 text-slate-700',
        href: '/admin/connections',
      },
      {
        label: 'Pending Review',
        value: requests.pendingCount ?? 0,
        icon: Clock,
        iconWrap: 'bg-amber-50 text-amber-600',
        href: '/admin/connections',
      },
      {
        label: 'In Progress',
        value: requests.inProgressCount ?? 0,
        icon: Loader2,
        iconWrap: 'bg-blue-50 text-blue-600',
        href: '/admin/connections',
      },
      {
        label: 'Approved',
        value: requests.approvedCount ?? 0,
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 text-emerald-600',
        href: '/admin/connections',
      },
      {
        label: 'Installations Scheduled',
        value: requests.scheduledCount ?? 0,
        icon: CalendarClock,
        iconWrap: 'bg-sky-50 text-sky-600',
        href: '/admin/connections',
      },
      {
        label: 'Completed',
        value: requests.completedCount ?? 0,
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 text-emerald-600',
        href: '/admin/connections',
      },
      {
        label: 'Rejected',
        value: requests.rejectedCount ?? 0,
        icon: XCircle,
        iconWrap: 'bg-red-50 text-red-600',
        href: '/admin/connections',
      },
    ],
    [consumers, officers, requests]
  );

  if (loading) {
    return <AdminDashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-2">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-amber-400 mb-2">
          <Shield className="w-3.5 h-3.5" />
          <span>BSES Administration Portal</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Executive Overview & Analytics</h1>
        <p className="text-xs text-slate-500 mt-1">Live snapshot of consumers and connection applications.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconWrap={stat.iconWrap}
            href={stat.href}
            size="lg"
          />
        ))}
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Consumer Registrations */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Monthly Registrations</h2>
              <p className="text-xs text-slate-500">New consumer accounts created over the past 6 months</p>
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              Past 6 Months
            </span>
          </div>

          <MiniBarChart
            items={(consumers.monthlyRegistrations || []).map((m: any) => ({
              label: String(m.month).split(' ')[0],
              count: m.count,
            }))}
            barClassName="bg-gradient-to-t from-slate-900 to-amber-500"
            barMinHeight={6}
          />
        </div>

        {/* Chart 2: Daily Consumer Registrations */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Daily Registrations Trend</h2>
              <p className="text-xs text-slate-500">Daily registration activity (Past 14 Days)</p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              14-Day Window
            </span>
          </div>

          <MiniBarChart
            items={(consumers.dailyRegistrations || []).map((d: any) => ({
              label: String(d.day).split(' ')[1] || String(d.day),
              count: d.count,
            }))}
            barClassName="bg-emerald-500"
            barHoverClassName="group-hover:bg-emerald-400"
            barMinHeight={4}
            className="gap-1 px-1"
            labelClassName="text-[9px] text-slate-400"
            valueClassName="text-[9px]"
          />
        </div>

        {/* Chart 3: Gender Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Gender Demographics</h2>
              <p className="text-xs text-slate-500">Distribution of registered consumer accounts</p>
            </div>
          </div>

          {(() => {
            const dist = consumers.genderDistribution || { MALE: 0, FEMALE: 0, OTHER: 0, PREFER_NOT_TO_SAY: 0 };
            const total = (dist.MALE || 0) + (dist.FEMALE || 0) + (dist.OTHER || 0) + (dist.PREFER_NOT_TO_SAY || 0);
            const items = [
              { label: 'Male', count: dist.MALE || 0, color: 'bg-blue-600', text: 'text-blue-600' },
              { label: 'Female', count: dist.FEMALE || 0, color: 'bg-emerald-500', text: 'text-emerald-500' },
              { label: 'Other', count: dist.OTHER || 0, color: 'bg-amber-500', text: 'text-amber-500' },
              { label: 'Unspecified', count: dist.PREFER_NOT_TO_SAY || 0, color: 'bg-slate-400', text: 'text-slate-400' },
            ];

            return (
              <div className="space-y-4 pt-2">
                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  {items.map((it) => {
                    const pct = total > 0 ? (it.count / total) * 100 : 0;
                    return pct > 0 ? (
                      <div key={it.label} className={`${it.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                    ) : null;
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {items.map((it) => {
                    const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
                    return (
                      <div key={it.label} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${it.color}`} />
                          <span className="font-semibold text-slate-700">{it.label}</span>
                        </div>
                        <span className="font-bold text-slate-900">{it.count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Chart 4: Connection Request Trends */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Connection Request Trends</h2>
              <p className="text-xs text-slate-500">Applications breakdown by supply category</p>
            </div>
          </div>

          {(() => {
            const trends = requests.trends || [];
            const total = trends.reduce((acc: number, t: any) => acc + (t.count || 0), 0);
            const categories = [
              { key: 'DOMESTIC', label: 'Domestic Supply', color: 'bg-primary' },
              { key: 'COMMERCIAL', label: 'Commercial Power', color: 'bg-amber-500' },
              { key: 'INDUSTRIAL', label: 'Industrial High-Tension', color: 'bg-violet-600' },
              { key: 'AGRICULTURAL', label: 'Agricultural / Tube-well', color: 'bg-emerald-600' },
            ];

            return (
              <div className="space-y-3 pt-1">
                {categories.map((cat) => {
                  const match = trends.find((t: any) => t.category === cat.key);
                  const count = match ? match.count : 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

                  return (
                    <div key={cat.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{cat.label}</span>
                        <span className="font-bold text-slate-900">{count} app(s) ({pct}%)</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`${cat.color} h-full transition-all duration-300`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/admin/users"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 hover:shadow-md active:scale-[0.98] transition-all duration-150 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Registered Consumer Directory</h2>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-xs text-slate-500">View, search, filter, and inspect registered consumers.</p>
        </Link>

        <Link
          href="/admin/connections"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 hover:shadow-md active:scale-[0.98] transition-all duration-150 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Review Connection Requests</h2>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-xs text-slate-500">Approve, reject, or request additional documents for applications.</p>
        </Link>
      </div>
    </div>
  );
}
