'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Lock, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { warmPostLogin } from '@/lib/prefetch';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Alert, AlertType } from '@/components/ui/Alert';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { FormField, fieldInputClass } from '@/components/ui/FormField';
import { AuthPending } from '@/components/common/AuthPending';
import { useAuthRedirect, getSafeReturnPath, roleDashboard } from '@/hooks/useAuthRedirect';

const schema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface ServerAlert { type: AlertType; message: string; }

function classifyError(err: any): ServerAlert {
  const status = err?.response?.status;
  const data: any = err?.response?.data;
  // Vercel protects preview/branch deployments with its own SSO gate. The
  // upstream response is JSON like
  // `{ protection: { vercel_auth_enabled: true, ... }, error: { code: '401',
  // message: 'Protected deployment' } }`. Surface a clear, actionable message
  // instead of a generic "Connection Error" — otherwise operators waste time
  // chasing a backend that is actually fine.
  const vercelAuthEnabled = !!data?.protection?.vercel_auth_enabled;
  const vercelProtectedMessage =
    typeof data?.error?.message === 'string' && /protected deployment/i.test(data.error.message);
  if (vercelAuthEnabled || vercelProtectedMessage) {
    return {
      type: 'error',
      message:
        'This Vercel preview deployment is protected by Vercel Authentication. ' +
        'Open the deployment URL in the Vercel dashboard, go to Settings → Deployment Protection, ' +
        'and disable Vercel Authentication (or use the production URL bses-gateway.vercel.app).',
    };
  }
  const message: string = data?.error?.message || '';
  if (!err?.response) {
    return {
      type: 'network',
      message: 'Unable to reach the server. Please check your connection.',
    };
  }
  if (status === 401 || message.toLowerCase().includes('credentials')) return { type: 'credentials', message: 'Incorrect username or password. Please try again.' };
  if (status === 423 || message.toLowerCase().includes('locked')) return { type: 'warning', message: message || 'Account temporarily locked.' };
  return { type: 'error', message: message || 'Something went wrong. Please try again.' };
}

export const LoginForm: React.FC = () => {
  const { pending } = useAuthRedirect();
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
    // [LOGIN_FLOW] — surface every step in the browser console so we can
    // trace exactly where a stuck or failed login is happening from
    // remote debugging alone (no SSH into Render required).
    // eslint-disable-next-line no-console
    console.log('[LOGIN_FLOW] step=submit identifier=', data.identifier, 'rememberMe=', !!data.rememberMe, 't=', new Date().toISOString());
    try {
      // Hard timeout: tolerate Render free-tier cold starts (~25-30s).
      // [LOGIN_FLOW] step=posting
      // eslint-disable-next-line no-console
      console.log('[LOGIN_FLOW] step=posting url=/auth/login timeout=35000ms t=', new Date().toISOString());
      const res = await apiClient.post('/auth/login', data, { timeout: 35000 });
      // [LOGIN_FLOW] step=response-received
      // eslint-disable-next-line no-console
      console.log('[LOGIN_FLOW] step=response-received success=', res.data?.success, 'hasUser=', !!res.data?.data?.user, 'role=', res.data?.data?.user?.role, 't=', new Date().toISOString());
      if (res.data.success) {
        setIsRedirecting(true);
        setUser(res.data.data.user);
        const role = res.data.data.user.role;
        const dest = getSafeReturnPath() ?? roleDashboard(role);
        // [LOGIN_FLOW] step=redirecting
        // eslint-disable-next-line no-console
        console.log('[LOGIN_FLOW] step=redirecting dest=', dest, 'role=', role, 't=', new Date().toISOString());
        warmPostLogin(role);
        // Use full page document location assign to ensure HTTP-only cookies are fully committed
        // in browser cookie store before Next.js middleware evaluates the destination route.
        if (typeof window !== 'undefined') {
          window.location.assign(dest);
        } else {
          router.replace(dest);
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[LOGIN_FLOW] step=response-no-success payload=', res.data);
        setServerAlert({ type: 'error', message: 'Unexpected response from server.' });
      }
    } catch (err: any) {
      setIsRedirecting(false);
      // [LOGIN_FLOW] step=error
      // eslint-disable-next-line no-console
      console.error('[LOGIN_FLOW] step=error', {
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        statusText: err?.response?.statusText,
        responseData: err?.response?.data,
        isAxiosError: err?.isAxiosError,
        isTimeout: err?.code === 'ECONNABORTED',
        t: new Date().toISOString(),
      });
      setServerAlert(classifyError(err));
    }
  };

  // Session unknown — never render the form for a session we haven't resolved.
  // Once the user has just submitted successfully (`isRedirecting`), keep the
  // form visible with the "Redirecting…" button instead of flashing the
  // AuthPending spinner for the brief moment between setUser() and the
  // redirect — that flash is the "login flicker".
  if (pending && !isRedirecting) return <AuthPending />;

  return (
    <div className="w-full max-w-sm space-y-7">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">
          Consumer Sign In
        </h1>
        <p className="text-sm text-slate-500">
          Sign in to your BSES consumer dashboard
        </p>
      </div>

      <AlertSlot show={!!serverAlert}>
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
      </AlertSlot>

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

      <p className="text-center text-sm text-slate-500">
        New to BSES?{' '}
        <Link href="/register" className="font-bold text-primary hover:underline">
          Register consumer account →
        </Link>
      </p>
    </div>
  );
};
