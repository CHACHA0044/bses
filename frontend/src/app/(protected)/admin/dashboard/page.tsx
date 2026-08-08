'use client';

import React from 'react';
import Link from 'next/link';
import { useApiResource } from '@/hooks/useApiResource';
import { AdminDashboardSkeleton } from '@/components/ui/Skeleton';
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

export default function AdminDashboardPage() {
  const { data, loading } = useApiResource<{ analytics: AdminAnalytics }>('/admin/dashboard');
  const analytics = data?.analytics;
  const consumers = analytics?.consumers || { totalActive: 0 };
  const requests = analytics?.connectionRequests || {};
  const officers = analytics?.officers || { totalActive: 0 };

  if (loading) {
    return <AdminDashboardSkeleton />;
  }

  const stats = [
    {
      label: 'Active Consumers',
      value: consumers.totalActive ?? 0,
      icon: Users,
      iconWrap: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Active Officers',
      value: officers.totalActive ?? 0,
      icon: UserCheck,
      iconWrap: 'bg-violet-50 text-violet-600',
    },
    {
      label: 'Total Applications',
      value: requests.totalApplications ?? 0,
      icon: FileText,
      iconWrap: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Pending Review',
      value: requests.pendingCount ?? 0,
      icon: Clock,
      iconWrap: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'In Progress',
      value: requests.inProgressCount ?? 0,
      icon: Loader2,
      iconWrap: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Approved',
      value: requests.approvedCount ?? 0,
      icon: CheckCircle2,
      iconWrap: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Installations Scheduled',
      value: requests.scheduledCount ?? 0,
      icon: CalendarClock,
      iconWrap: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Completed',
      value: requests.completedCount ?? 0,
      icon: CheckCircle2,
      iconWrap: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Rejected',
      value: requests.rejectedCount ?? 0,
      icon: XCircle,
      iconWrap: 'bg-red-50 text-red-600',
    },
  ];

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
          <div key={stat.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">{stat.label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.iconWrap}`}>
              <stat.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/admin/users"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 hover:shadow-md transition-all duration-150 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Registered Consumer Directory</h2>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-xs text-slate-500">View, search, filter, and inspect registered consumers.</p>
        </Link>

        <Link
          href="/admin/connections"
          className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 hover:shadow-md transition-all duration-150 space-y-2"
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
