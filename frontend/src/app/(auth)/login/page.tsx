'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Lock, User, KeyRound, Zap, Eye, EyeOff } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Alert, AlertType } from '@/components/ui/Alert';
import { FormField, fieldInputClass } from '@/components/ui/FormField';

const schema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface ServerAlert { type: AlertType; message: string; }

function classifyError(err: any): ServerAlert {
  const status = err?.response?.status;
  const message: string = err?.response?.data?.error?.message || '';
  if (!err?.response) return { type: 'network', message: 'Unable to reach the server. Please check your connection.' };
  if (status === 401 || message.toLowerCase().includes('credentials')) return { type: 'credentials', message: 'Incorrect username or password. Please try again.' };
  if (status === 423 || message.toLowerCase().includes('locked')) return { type: 'warning', message: message || 'Account temporarily locked.' };
  return { type: 'error', message: message || 'Something went wrong. Please try again.' };
}

/** Safe `next` return path — internal paths only, never protocol-relative. */
function getReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return null;
  if (next.startsWith('//') || next.startsWith('/login') || !next.startsWith('/')) return null;
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { rememberMe: false },
  });

  const onSubmit = async (data: FormData) => {
    setServerAlert(null);
    try {
      const res = await apiClient.post('/auth/login', data);
      if (res.data.success) {
        setIsRedirecting(true);
        setUser(res.data.data.user);
        const role = res.data.data.user.role;
        const dest =
          getReturnPath() ??
          (role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard');
        router.replace(dest);
      }
    } catch (err: any) {
      setServerAlert(classifyError(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Single top Navbar — no duplicate BSES branding inside page */}
      <Navbar />

      {/* Page body: split on md+, stacked on mobile */}
      <main className="flex flex-1 flex-col md:flex-row min-h-0">

        {/* ── Left Hero Panel (md+ only) ── */}
        <div className="hidden md:flex md:basis-[46%] lg:basis-[48%] xl:basis-1/2 shrink-0 flex-col justify-between bses-gradient-hero text-white overflow-hidden relative">
          {/* Subtle grid */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          {/* Glow accents */}
          <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

          {/* Content — constrained so nothing clips */}
          <div className="relative z-10 flex flex-col justify-between h-full px-8 py-10 lg:px-12 lg:py-14">
            {/* Top badge */}
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300">
              <Zap className="h-3 w-3 fill-amber-400" />
              BSES Delhi Discom — BRPL &amp; BYPL
            </span>

            {/* Headline — capped at 3xl so it never clips in a narrow panel */}
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

            {/* Footer compliance note */}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-white/10 pt-4">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              Official Discom Portal · NCT Delhi Government Partner
            </div>
          </div>
        </div>

        {/* ── Right Form Panel ── */}
        <div className="animate-in fade-in duration-200 flex w-full flex-1 flex-col items-center justify-center bg-white px-5 py-10 sm:px-10 md:px-8 lg:px-14">
          <div className="w-full max-w-sm space-y-7">
            {/* Page title — no duplicate BSES badge here, Navbar handles it */}
            <div className="space-y-1">
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
                Consumer Sign In
              </h1>
              <p className="text-sm text-slate-500">
                Sign in to your BSES consumer dashboard
              </p>
            </div>

            {serverAlert && (
              <Alert type={serverAlert.type} onClose={() => setServerAlert(null)}>
                {serverAlert.message}
                {serverAlert.type === 'credentials' && (
                  <p className="mt-1 text-[11px] opacity-80">
                    <Link href="/forgot-password" className="underline font-bold">Reset password</Link>
                  </p>
                )}
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField label="Username or Email" htmlFor="identifier" required error={errors.identifier?.message}>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="identifier"
                    {...register('identifier')}
                    type="text"
                    placeholder="rajesh_sharma2026"
                    autoComplete="username"
                    className={`${fieldInputClass(!!errors.identifier)} pl-10`}
                  />
                </div>
              </FormField>

              <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="password"
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`${fieldInputClass(!!errors.password)} pl-10 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {showPassword ? 'Hide password' : 'Show password'}
                  </button>
                  <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </FormField>

              <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-slate-600">
                <input {...register('rememberMe')} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                Remember me for 30 days
              </label>

              <Button
                type="submit"
                variant="cta"
                size="lg"
                fullWidth
                isLoading={isSubmitting || isRedirecting}
                disabled={isSubmitting || isRedirecting}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {isRedirecting ? 'Redirecting…' : 'Sign In to Dashboard'}
              </Button>
            </form>

            {/* Test credentials — helps during development */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 font-heading uppercase tracking-wide">
                <Lock className="h-3 w-3 text-primary" /> Test Credentials
              </p>
              <p className="font-mono text-[11px] text-slate-700">
                <span className="text-slate-400">user: </span><strong>rajesh_sharma2026</strong>
              </p>
              <p className="font-mono text-[11px] text-slate-700">
                <span className="text-slate-400">pass: </span><strong>ConsumerPass@2026!</strong>
              </p>
            </div>

            <p className="text-center text-sm text-slate-500">
              New to BSES?{' '}
              <Link href="/register" className="font-bold text-primary hover:underline">
                Register consumer account →
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
