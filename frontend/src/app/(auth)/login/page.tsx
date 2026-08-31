import React from 'react';
import type { Metadata } from 'next';
import { Zap, ShieldCheck, Lock, Smartphone, Clock, FileCheck } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Consumer Sign In | BSES Delhi Portal',
  description:
    'Sign in to your BSES consumer dashboard to apply for new electricity connections, upload documents, and track live application status.',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Single top Navbar — no duplicate BSES branding inside page */}
      <Navbar />

      {/* ── Mobile-only info/intro panel (md+ uses the left hero instead) ── */}
      <section className="md:hidden bses-gradient-hero text-white relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="page-container relative z-10 py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div className="space-y-0.5">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                <Smartphone className="h-3 w-3" /> BSES Consumer Portal
              </p>
              <h1 className="font-heading text-lg font-extrabold leading-tight text-white">
                Welcome back — power at your fingertips
              </h1>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Sign in to apply for new electricity connections, upload DPDP-compliant documents, and track your application status — anytime, 24×7.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading"><Clock className="h-3 w-3 text-amber-400" />24×7 Portal</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading"><FileCheck className="h-3 w-3 text-amber-400" />Live Status</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading"><ShieldCheck className="h-3 w-3 text-amber-400" />DPDP Safe</p>
            </div>
          </div>
        </div>
      </section>

      {/* Page body: split on md+, stacked on mobile */}
      <main className="flex flex-1 flex-col md:flex-row min-h-0">
        {/* ── Left Hero Panel (md+ only) ── */}
        <div className="hidden md:flex md:basis-[46%] lg:basis-[48%] xl:basis-1/2 shrink-0 flex-col justify-between bses-gradient-hero text-white overflow-hidden relative">
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between h-full px-8 py-10 lg:px-12 lg:py-14">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300">
              <Zap className="h-3 w-3 fill-amber-400" />
              BSES Delhi Discom — BRPL &amp; BYPL
            </span>

            <div className="my-auto py-8 space-y-5 max-w-xs lg:max-w-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
                <Zap className="h-6 w-6 fill-current" />
              </div>
              <div className="space-y-3">
                <h2 className="font-heading text-2xl lg:text-3xl font-extrabold leading-snug text-white">
                  Power your home.<br />
                  <span className="text-amber-400">Power your business.</span>
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Sign in to apply for new electricity connections, upload documents, and track live application status.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-bold text-white font-heading">24×7 Portal</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Instant access, always</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-bold text-white font-heading">DPDP Compliant</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">AES-256 encrypted</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-white/10 pt-4">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              Unofficial Discom Portal · NCT Delhi Government Partner
            </div>
          </div>
        </div>

        {/* ── Right Form Panel ── */}
        <div className="animate-in fade-in duration-200 flex w-full flex-1 flex-col items-center justify-center bg-white px-5 py-10 sm:px-10 md:px-8 lg:px-14">
          <div className="w-full max-w-sm space-y-7">
            <LoginForm />

            {/* Test credentials — helps during development */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 font-heading uppercase tracking-wide">
                <Lock className="h-3 w-3 text-primary" /> Test Credentials
              </p>
              
              <div className="space-y-1 border-b border-slate-200 pb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Consumer Account</p>
                <p className="font-mono text-[11px] text-slate-700">
                  <span className="text-slate-400">user: </span><strong>rajesh_sharma2026</strong>
                </p>
                <p className="font-mono text-[11px] text-slate-700">
                  <span className="text-slate-400">pass: </span><strong>ConsumerPass@2026!</strong>
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <p className="text-[10px] font-bold text-amber-600 uppercase">Admin Account</p>
                <p className="font-mono text-[11px] text-slate-700">
                  <span className="text-slate-400">email/user: </span><strong>admin@bsesdelhi.com</strong>
                </p>
                <p className="font-mono text-[11px] text-slate-700">
                  <span className="text-slate-400">pass: </span><strong>BsesAdmin@2026!</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
