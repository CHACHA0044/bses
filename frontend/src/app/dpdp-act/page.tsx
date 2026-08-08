import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ShieldCheck, UserCheck, Lock, FileCheck, HelpCircle } from 'lucide-react';

export const metadata = {
  title: 'DPDP Compliance | BSES Delhi Electricity Consumer Portal',
  description: 'Learn how BSES Delhi protects consumer data rights under the Digital Personal Data Protection Act 2023.',
};

export default function DpdpActPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 w-full">
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-dark/10 px-3.5 py-1 text-xs font-bold text-surface-dark border border-surface-dark/20">
            <ShieldCheck className="h-4 w-4 text-surface-dark" />
            <span>Statutory Compliance Notice</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-heading">
            Digital Personal Data Protection (DPDP) Act 2023
          </h1>
          <p className="text-sm text-slate-500">
            Learn how BSES Delhi protects consumer data rights, enforces purpose limitation, and maintains secure data vaults.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 text-sm text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
              <UserCheck className="h-6 w-6 text-primary" />
              <h3 className="font-bold text-slate-900 text-base font-heading">Explicit Consumer Consent</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Consent is explicitly requested during consumer registration and stored with timestamped audit trails. Consumers can inspect consent records anytime.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
              <Lock className="h-6 w-6 text-surface-dark" />
              <h3 className="font-bold text-slate-900 text-base font-heading">Cryptographic Vault Architecture</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                All PII data fields are protected using AES-256-CBC encryption algorithms. Blind indexing ensures searchability without decrypting databases.
              </p>
            </div>
          </div>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 font-heading">
              Key DPDP Principles Enforced in BSES Digital Portal
            </h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 text-xs">
                <FileCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-heading">Purpose Limitation &amp; Minimization</h3>
                  <p className="text-slate-600 leading-relaxed mt-0.5">
                    We collect only the minimum required data necessary to process electricity connection requests and render utility billing services.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 text-xs">
                <HelpCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-heading">Right to Correction &amp; Erasure</h3>
                  <p className="text-slate-600 leading-relaxed mt-0.5">
                    Consumers can update profile details at any time. Outdated draft connection requests are purged according to statutory retention schedules.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
