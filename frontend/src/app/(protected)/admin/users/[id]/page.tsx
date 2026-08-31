'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApiResource } from '@/hooks/useApiResource';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { 
  User, FileText, Zap, Shield, Download, Edit3, 
  CheckCircle, AlertTriangle, XCircle, ArrowLeft, RefreshCw 
} from 'lucide-react';

import { apiClient } from '@/lib/apiClient';

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const router = useRouter();

  const url = `/admin/users/${userId}`;
  const { data, loading, error, revalidate } = useApiResource<{
    user: any;
    documents: any[];
    applications: any[];
  }>(url);

  const [activeTab, setActiveTab] = useState<'profile' | 'documents' | 'applications'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', mobile: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <TableSkeleton rows={8} />;
  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">User Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">Unable to load the specified consumer profile.</p>
        <button
          onClick={() => router.push('/admin/users')}
          className="mt-4 inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </button>
      </div>
    );
  }

  const { user, documents, applications } = data;

  const handleStatusToggle = async () => {
    setActionLoading(true);
    setActionError(null);
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiClient.post(`/admin/users/${userId}/status`, { status: newStatus });
      revalidate();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv' = 'json') => {
    setActionError(null);
    try {
      const res = await apiClient.get(`/admin/users/${userId}/export`);
      const exportData = res.data?.data || res.data;

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `user-export-${user.id}.json`;
        a.click();
      } else {
        // Convert to CSV string
        const u = exportData.user || {};
        const rows = [
          ['Field', 'Value'],
          ['ID', u.id],
          ['First Name', u.firstName],
          ['Last Name', u.lastName],
          ['Email', u.email],
          ['Mobile', u.mobile || ''],
          ['Username', u.username],
          ['CA Number', u.caNumber || ''],
          ['Meter Number', u.meterNumber || ''],
          ['Role', u.role],
          ['Status', u.status],
          ['Created At', u.createdAt],
        ];
        const csvContent = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `user-export-${user.id}.csv`;
        a.click();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to export user data');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.put(`/admin/users/${userId}`, editForm);
      setIsEditing(false);
      revalidate();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to update user profile');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-2">
      {/* Header / Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/admin/users')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Consumers Directory
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-400" /> Export JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-400" /> Export CSV
          </button>
          <button
            onClick={handleStatusToggle}
            disabled={actionLoading}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition ${
              user.status === 'ACTIVE'
                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {user.status === 'ACTIVE' ? 'Deactivate Account' : 'Reactivate Account'}
          </button>
        </div>
      </div>

      <AlertSlot show={!!actionError} gap={24}>
        {actionError && (
          <Alert type="error" title="Action failed" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}
      </AlertSlot>

      {/* Profile Summary Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xl">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {user.firstName} {user.middleName || ''} {user.lastName}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {user.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Registered Consumer · CA Number: <span className="font-mono font-bold text-slate-700">{user.caNumber || 'Not assigned'}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditForm({ firstName: user.firstName, lastName: user.lastName, mobile: user.mobile || '' });
            setIsEditing(true);
          }}
          className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-slate-800 transition"
        >
          <Edit3 className="h-3.5 w-3.5" /> Edit Basic Details
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'profile'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="h-4 w-4" /> Consumer Overview
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'documents'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileText className="h-4 w-4" /> Uploaded Documents ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`pb-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'applications'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Zap className="h-4 w-4" /> Connection Applications ({applications.length})
        </button>
      </div>

      {/* Tab 1: Profile View */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Identity & Contact Info</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-400 font-medium">Email Address</p>
                <p className="font-semibold text-slate-800 mt-0.5">{user.email}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Mobile Number</p>
                <p className="font-semibold text-slate-800 mt-0.5">{user.mobile || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Username</p>
                <p className="font-semibold text-slate-800 mt-0.5">{user.username}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Gender</p>
                <p className="font-semibold text-slate-800 mt-0.5">{user.gender}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Meter & Account Metadata</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-400 font-medium">CA Number</p>
                <p className="font-mono font-bold text-slate-800 mt-0.5">{user.caNumber || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Meter Number</p>
                <p className="font-mono font-bold text-slate-800 mt-0.5">{user.meterNumber || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Registration Date</p>
                <p className="font-semibold text-slate-800 mt-0.5">{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Last Login</p>
                <p className="font-semibold text-slate-800 mt-0.5">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Per-User Documents & Extracted OCR Data */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-slate-400">
              No documents uploaded by this user yet.
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-amber-500" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{doc.documentName}</h4>
                      <p className="text-[11px] text-slate-400">Type: {doc.documentType} · Uploaded: {new Date(doc.uploadDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    doc.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {doc.status}
                  </span>
                </div>

                {/* OCR Structured Extracted Data Display */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                      <Shield className="h-4 w-4 text-amber-500" /> Extracted OCR Structured Fields
                    </p>
                    {doc.isUnreadable ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        <XCircle className="h-3.5 w-3.5" /> Flagged: Low Quality / Unreadable
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-500">
                        OCR Confidence: <strong className="text-slate-800">{doc.ocrConfidence ? `${doc.ocrConfidence}%` : 'Pending'}</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      <p className="text-slate-400 font-medium">Extracted Aadhaar</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{doc.ocrData?.aadhaar || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Extracted PAN</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{doc.ocrData?.pan || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Extracted Name</p>
                      <p className="font-bold text-slate-800 mt-0.5">{doc.ocrData?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Extracted DOB</p>
                      <p className="font-bold text-slate-800 mt-0.5">{doc.ocrData?.dob || '—'}</p>
                    </div>
                  </div>

                  {doc.ocrData?.rawText && (
                    <details className="text-[11px] text-slate-500 cursor-pointer">
                      <summary className="font-semibold hover:text-slate-800">View Raw OCR Text Snippet</summary>
                      <pre className="mt-2 p-2 bg-slate-100 rounded text-[10px] whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                        {doc.ocrData.rawText}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Per-User Applications */}
      {activeTab === 'applications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-slate-400">
              No connection applications submitted by this user yet.
            </div>
          ) : (
            applications.map((app) => (
              <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-400">#{app.applicationNumber}</span>
                    <h4 className="text-sm font-bold text-slate-900 mt-0.5">{app.connectionType} Electricity Connection</h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    {app.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-slate-400 font-medium">Property Address</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{app.propertyAddress}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-medium">Required Load</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{app.requiredLoad} kW</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-medium">Submission Date</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : 'Draft'}</p>
                  </div>
                </div>

                {app.timeline && app.timeline.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-[11px] font-bold text-slate-600 uppercase">Recent Status Timeline</p>
                    <div className="space-y-1.5 text-[11px]">
                      {app.timeline.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-slate-600 border-b border-slate-200/50 pb-1 last:border-0">
                          <span><strong>{item.action}</strong> — {item.notes}</span>
                          <span className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Edit Consumer Information</h3>
            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">First Name</label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:border-slate-900"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Last Name</label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:border-slate-900"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={editForm.mobile}
                  onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-slate-100 text-slate-600 font-bold px-4 py-2 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
