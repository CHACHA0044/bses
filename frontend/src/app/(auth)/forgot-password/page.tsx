'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { AuthPending } from '@/components/common/AuthPending';

const forgotSchema = z.object({
  email: z.string().email('Invalid email address format'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const { pending } = useAuthRedirect();
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    setServerError(null);
    try {
      await apiClient.post('/auth/forgot-password', data, { timeout: 8000 });
      setSubmitted(true);
    } catch (err: any) {
      setServerError('An error occurred while requesting password reset. Please try again.');
    }
  };

  if (pending && !submitted) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <AuthPending label="Checking session…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 mb-1">
            <KeyRound className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
          <p className="text-xs text-slate-400">Enter your registered email address to receive password reset instructions</p>
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
            <p className="font-semibold">Reset instructions dispatched!</p>
            <p className="text-xs text-emerald-400/80">If an account matches your email, password reset instructions have been logged to the dev server console.</p>
            <Link href="/login" className="inline-block text-xs font-bold text-amber-400 hover:underline pt-2">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Registered Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="consumer@example.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg transition disabled:opacity-50"
            >
              {isSubmitting ? 'Sending Request...' : 'Send Password Reset Link'}
            </button>
          </form>
        )}

        <div className="text-center pt-2">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
