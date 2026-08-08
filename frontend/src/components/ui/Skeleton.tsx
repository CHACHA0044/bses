import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-xl skeleton-shimmer ${className}`} />
);

export const CardSkeleton: React.FC = () => (
  <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-sm">
    <Skeleton className="h-6 w-1/3" />
    <Skeleton className="h-4 w-2/3" />
    <div className="space-y-2 pt-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-7xl mx-auto p-4 animate-in fade-in duration-200">
    {/* Hero banner */}
    <Skeleton className="h-36 w-full rounded-3xl" />
    {/* Info cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
    {/* Stat cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
    {/* Table */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-sm animate-in fade-in duration-200">
    <Skeleton className="h-8 w-1/4" />
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

export const ProfileSkeleton: React.FC = () => (
  <div className="max-w-4xl mx-auto space-y-6 p-2 animate-in fade-in duration-200">
    {/* Header row — title + Edit Profile button */}
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <Skeleton className="h-9 w-28 rounded-xl" />
    </div>

    {/* 4 identity cards */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>

    {/* Profile detail card */}
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Avatar row */}
      <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
        <Skeleton className="h-16 w-16 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      {/* 2-column field grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-5 w-40" />
          </div>
        ))}
      </div>
      {/* Compliance note */}
      <div className="pt-4 border-t border-slate-100">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

export const ConnectionsSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-7xl mx-auto p-4 animate-in fade-in duration-200">
    {/* Header */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-36 rounded-xl" />
    </div>
    {/* Filter row */}
    <div className="flex gap-3">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
    {/* Table card */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
      <Skeleton className="h-10 w-full rounded-lg" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

export const FormSkeleton: React.FC<{ fields?: number }> = ({ fields = 6 }) => (
  <div className="space-y-5 animate-in fade-in duration-200">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    ))}
    <Skeleton className="h-12 w-full rounded-xl mt-2" />
  </div>
);

export const AdminDashboardSkeleton: React.FC = () => (
  <div className="space-y-8 max-w-7xl mx-auto p-4 animate-in fade-in duration-200">
    <div className="space-y-2">
      <Skeleton className="h-4 w-48 rounded-full" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-3.5 w-96" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  </div>
);

export const ConnectionDetailSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-4xl mx-auto p-4 animate-in fade-in duration-200">
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-8 w-32 rounded-full" />
    </div>
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
    <Skeleton className="h-32 w-full rounded-2xl" />
  </div>
);
