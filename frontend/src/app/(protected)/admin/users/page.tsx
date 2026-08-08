'use client';

import React, { useState } from 'react';
import { useApiResource } from '@/hooks/useApiResource';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Search, Users } from 'lucide-react';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');

  // Search is keyed by the query string — the SWR cache keeps each result
  // warm while typing, and the page never refetches unless the query changes.
  const url = `/admin/users?search=${encodeURIComponent(committedSearch)}`;
  const { data, loading } = useApiResource<{ users: any[] }>(url);
  const users = data?.users || [];

  const runSearch = () => setCommittedSearch(search.trim());

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Consumer Directory</h1>
        <p className="text-xs text-slate-500">Search and manage registered BSES Delhi consumers</p>
      </div>

      <form
        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        role="search"
      >
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, username, CA or Meter number..."
          className="w-full text-sm text-slate-900 focus:outline-none bg-transparent"
        />
        <button
          type="submit"
          className="bg-slate-900 text-white font-bold text-xs py-2 px-4 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          Search
        </button>
      </form>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Mobile</th>
                <th className="p-3">CA Number</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No consumers found.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-semibold text-slate-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.mobile || '—'}</td>
                  <td className="p-3 font-mono">{u.caNumber || '—'}</td>
                  <td className="p-3 text-xs font-bold text-slate-700">{u.role}</td>
                  <td className="p-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      {u.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
