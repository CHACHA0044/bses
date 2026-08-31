'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { AuthPending } from '@/components/common/AuthPending';

const resetSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Needs uppercase')
    .regex(/[a-z]/, 'Needs lowercase')
    .regex(/[0-9]/, 'Needs number')
    .regex(/[$&+,:;=?@#|'<>.^*()%!-]/, 'Needs special char'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ResetFormData = z.infer<typeof resetSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const { pending } = useAuthRedirect();

  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    setServerError(null);
    try {
      await apiClient.post('/auth/reset-password', {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      }, { timeout: 8000 });
      setSubmitted(true);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Invalid or expired password reset token.';
      setServerError(msg);
    }
  };

  if (pending && !submitted) {
    return <AuthPending label="Checking session…" />;
  }

  return (
    <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl p-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 mb-1">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Create New Password</h1>
        <p className="text-xs text-slate-400">Please enter and confirm your new password</p>
      </div>

      {/* space-y-6 = 24px gap; AlertSlot matches it so the card never snaps. */}
      <AlertSlot show={!!serverError} gap={24}>
        {serverError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}
      </AlertSlot>

      {submitted ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-5 rounded-xl text-sm text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="font-semibold">Password updated successfully!</p>
          <p className="text-xs text-emerald-400/80">Your password has been changed. You can now login with your new password.</p>
          <Link href="/login" className="inline-block text-xs font-bold text-amber-400 hover:underline pt-2">
            Proceed to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">New Password</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Confirm New Password</label>
            <input
              {...register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !token}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg transition disabled:opacity-50"
          >
            {isSubmitting ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-400">Loading reset screen...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
