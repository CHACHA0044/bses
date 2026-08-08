'use client';

import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { ShieldCheck, User, Bell, Lock } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-xs text-slate-500">Manage security preferences and privacy settings</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <Lock className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Security & Authentication</h2>
            <p className="text-xs text-slate-500">256-bit AES encryption active for personal data</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <Bell className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
            <p className="text-xs text-slate-500">SMS & WhatsApp status alerts enabled for application updates</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">DPDP Act 2023 Compliance</h2>
            <p className="text-xs text-slate-500">Active consent recorded (Privacy Policy v1.0)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
