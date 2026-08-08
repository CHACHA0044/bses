'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useApiResource } from '@/hooks/useApiResource';
import { apiClient } from '@/lib/apiClient';
import { User, Edit, ShieldCheck, Mail, Phone, Hash, Zap, X, Save, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { ProfileSkeleton } from '@/components/ui/Skeleton';

import { createPortal } from 'react-dom';

/* ── Types ────────────────────────────────────────────────────────── */
type FieldKey = 'caNumber' | 'meterNumber' | 'mobile';

interface FieldConfig {
  key: FieldKey;
  label: string;
  placeholder: string;
  type: string;
  hint?: string;
  pattern?: RegExp;
  patternMsg?: string;
}

const FIELD_CONFIG: Record<FieldKey, FieldConfig> = {
  caNumber: {
    key: 'caNumber',
    label: 'CA Number',
    placeholder: 'Enter your CA Number',
    type: 'text',
    hint: 'CA Number is printed on your electricity bill.',
  },
  meterNumber: {
    key: 'meterNumber',
    label: 'Meter Number',
    placeholder: 'Enter your Meter Number',
    type: 'text',
    hint: 'Meter Number is found on the physical meter installed at your premises.',
  },
  mobile: {
    key: 'mobile',
    label: 'Mobile Number',
    placeholder: 'Enter number',
    type: 'tel',
    hint: 'Must be a valid 10-digit number starting with 6–9.',
    pattern: /^[6-9]\d{9}$/,
    patternMsg: 'Enter a valid 10-digit mobile number',
  },
};

/* ── Inline Edit Modal ──────────────────────────────────────────── */
interface EditModalProps {
  fieldKey: FieldKey;
  currentValue: string;
  onClose: () => void;
  onSaved: (key: FieldKey, value: string) => void;
}

function EditModal({ fieldKey, currentValue, onClose, onSaved }: EditModalProps) {
  const cfg = FIELD_CONFIG[fieldKey];
  const [value, setValue] = useState(currentValue || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    setError('');
    if (!value.trim()) { setError('This field cannot be empty.'); return; }
    if (cfg.pattern && !cfg.pattern.test(value)) { setError(cfg.patternMsg!); return; }
    setSaving(true);
    try {
      await apiClient.put('/users/profile', { [fieldKey]: value });
      setDone(true);
      setTimeout(() => { onSaved(fieldKey, value); onClose(); }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-label={`Update ${cfg.label}`}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{cfg.label}</p>
            <h2 className="text-sm font-extrabold text-slate-900">Update {cfg.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {cfg.hint && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              {cfg.hint}
            </p>
          )}

          {fieldKey === 'mobile' ? (
            <div className="flex rounded-xl border border-slate-300 bg-slate-50 overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition">
              <span className="flex items-center justify-center px-3.5 bg-slate-200/80 border-r border-slate-300 text-xs font-extrabold text-slate-700 select-none shrink-0">
                +91
              </span>
              <input
                ref={inputRef}
                type={cfg.type}
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder={cfg.placeholder}
                disabled={saving || done}
                className="w-full bg-transparent px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-60"
              />
            </div>
          ) : (
            <input
              ref={inputRef}
              type={cfg.type}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder={cfg.placeholder}
              disabled={saving || done}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition disabled:opacity-60"
            />
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Saved successfully!
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="min-w-[100px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || done}
            className="min-w-[100px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow transition disabled:opacity-50"
          >
            {done ? (
              <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</>
            ) : saving ? (
              <><Save className="h-3.5 w-3.5 animate-pulse" /> Saving…</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Save</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Consumer ID Copy Card ────────────────────────────────────────── */
function ConsumerIdCard({ id }: { id: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-primary/40 hover:shadow-md p-4 space-y-1 transition-all duration-150 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
      title="Click to copy Consumer ID"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-primary transition-colors">
          Consumer ID
        </span>
        <span
          className={`text-[10px] font-medium transition-all duration-150 flex items-center gap-1 ${
            copied
              ? 'text-emerald-600 font-bold opacity-100'
              : 'text-slate-400 group-hover:text-primary opacity-100 md:opacity-0 md:group-hover:opacity-100'
          }`}
        >
          {copied ? (
            <><Check className="w-3 h-3" /> Copied!</>
          ) : (
            <><Copy className="w-2.5 h-2.5" /> click to copy</>
          )}
        </span>
      </div>
      <p className="text-xs sm:text-sm font-extrabold text-slate-800 break-all">
        {id || '—'}
      </p>
    </button>
  );
}

/* ── Clickable info card ─────────────────────────────────────────── */
interface InfoCardProps {
  label: string;
  value: string | null | undefined;
  emptyText: string;
  onClick?: () => void;
}

function InfoCard({ label, value, emptyText, onClick }: InfoCardProps) {
  const filled = !!value;

  return (
    <button
      onClick={onClick}
      className="group w-full text-left cursor-pointer bg-white rounded-2xl border border-slate-200 hover:border-primary/40 hover:shadow-md shadow-sm p-4 space-y-1 transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
      title={`Click to update ${label}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-primary transition-colors">
          {label}
        </span>
        <span className="text-[10px] font-medium text-slate-400 group-hover:text-primary transition-all duration-150 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <Edit className="w-2.5 h-2.5" /> click to edit
        </span>
      </div>
      <p className={`text-sm font-extrabold ${filled ? 'text-slate-800' : 'text-slate-400 italic'}`}>
        {value || emptyText}
      </p>
    </button>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function ProfilePage() {
  const { user } = useAuthStore();
  const [activeModal, setActiveModal] = useState<FieldKey | null>(null);
  const [localProfile, setLocalProfile] = useState<any | null>(null);

  // SWR-backed profile — warmed by the dashboard PrefetchLink / idle provider,
  // so the page renders instantly with cached data.
  const { data: serverData, loading, revalidate } = useApiResource<{ profile?: any }>('/users/profile');
  const serverProfile = serverData?.profile;

  // Optimistic overlay for quick-edit fields (CA / meter / mobile).
  const profile = localProfile ?? serverProfile;
  const data = profile || user;

  const handleSaved = (key: FieldKey, value: string) => {
    setLocalProfile((prev: any) => ({ ...(prev || serverProfile || user), [key]: value }));
    // Refresh the shared cache so the value survives a page reload.
    void revalidate();
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  const maskedMobile = data?.mobile
    ? `•••• •• ${String(data.mobile).slice(-4)} (Encrypted)`
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-2">
      {/* Active modal */}
      {activeModal && (
        <EditModal
          fieldKey={activeModal}
          currentValue={data?.[activeModal] || ''}
          onClose={() => setActiveModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Header — responsive layout for mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Consumer Profile</h1>
          <p className="text-xs text-slate-500">View registered personal identity and electricity service information</p>
        </div>
        <Link
          href="/profile/edit"
          className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow transition shrink-0 self-start sm:self-auto"
        >
          <Edit className="w-4 h-4" />
          <span>Edit Profile</span>
        </Link>
      </div>

      {/* Quick-edit identity cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <ConsumerIdCard id={data?.id} />
        <InfoCard
          label="CA Number"
          value={data?.caNumber}
          emptyText="Unassigned"
          onClick={() => setActiveModal('caNumber')}
        />
        <InfoCard
          label="Meter Number"
          value={data?.meterNumber}
          emptyText="Unassigned"
          onClick={() => setActiveModal('meterNumber')}
        />
        <InfoCard
          label="Mobile Number"
          value={maskedMobile}
          emptyText="Not Provided"
          onClick={() => setActiveModal('mobile')}
        />
      </div>

      {/* Profile detail card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-6">
        {/* Avatar row */}
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center text-lg sm:text-xl font-bold shrink-0">
            {data?.firstName?.[0]}{data?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {data?.firstName} {data?.middleName} {data?.lastName}
            </h2>
            <p className="text-xs text-slate-500 truncate">Username: @{data?.username}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {data?.status || 'ACTIVE'}
            </span>
          </div>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-sm">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase">Email Address</span>
            <p className="font-semibold text-slate-800 flex items-center gap-2 break-all">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              {data?.email}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase">Mobile Number (Encrypted)</span>
            <p className="font-semibold text-slate-800 flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              {maskedMobile || 'Not Provided'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase">Gender</span>
            <p className="font-semibold text-slate-800">{data?.gender}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase">Aadhaar (Encrypted)</span>
            <p className="font-semibold text-slate-800">
              {data?.aadhaar ? `•••• •••• ${data.aadhaar.slice(-4)} (Encrypted)` : 'Not Provided'}
            </p>
          </div>
        </div>

        {/* Compliance note */}
        <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Sensitive Personal Information is encrypted with 256-bit AES algorithms in compliance with the DPDP Act 2023.</span>
        </div>
      </div>
    </div>
  );
}
