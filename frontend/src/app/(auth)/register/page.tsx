'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  User,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  FileCheck,
  Phone,
  Building2,
  RefreshCw,
  Zap,
  UserPlus,
  ListChecks,
  Copy,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { apiClient } from '@/lib/apiClient';
import { warmPostLogin } from '@/lib/prefetch';
import { useAuthStore } from '@/store/authStore';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { AuthPending } from '@/components/common/AuthPending';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { FormField, fieldInputClass } from '@/components/ui/FormField';
import { CustomSelect, SelectOption } from '@/components/ui/CustomSelect';

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

/* ────────── Zod schema ────────── */
const schema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    middleName: z.string().optional(),
    lastName: z.string().min(1, 'Last name is required'),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
    email: z.string().email('Enter a valid email address'),
    mobile: z
      .string()
      .min(1)
      .transform((v) => v.replace(/^\+91/, '')) // Strip +91 prefix if present
      .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number'),
    username: z
      .string()
      .min(4, 'Min 4 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
    password: z
      .string()
      .min(8, 'Min 8 characters')
      .regex(/[A-Z]/, 'Needs uppercase')
      .regex(/[a-z]/, 'Needs lowercase')
      .regex(/[0-9]/, 'Needs a number')
      .regex(/[$&+,:;=?@#|'<>.^*()%!-]/, 'Needs a special char'),
    confirmPassword: z.string(),
    aadhaar: z.string().optional(),
    caNumber: z.string().optional(),
    meterNumber: z.string().optional(),
    dpdpConsent: z.boolean().refine((v) => v, 'DPDP consent is required'),
    privacyPolicyAccepted: z.boolean().refine((v) => v, 'Privacy Policy acceptance is required'),
    captchaToken: z.string().min(1, 'CAPTCHA token is required'),
    captchaInput: z.string().trim().min(1, 'Please enter the CAPTCHA code shown in the image'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

/* ────────── Step definitions ────────── */
const STEPS = [
  { n: 1, label: 'Personal Information', icon: User, accent: 'bg-primary/10 text-primary' },
  {
    n: 2,
    label: 'Credentials & Contact',
    icon: KeyRound,
    accent: 'bg-amber-500/10 text-amber-700',
  },
  {
    n: 3,
    label: 'Connection & Consent',
    icon: ShieldCheck,
    accent: 'bg-emerald-500/10 text-emerald-700',
  },
];

/* ────────── Inline dot-progress indicator ────────── */
function StepProgress({ current }: { current: number }) {
  return (
    <div className="space-y-2.5">
      {/* Numbered dots with connecting track */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done = current > s.n;
          const active = current === s.n;
          return (
            <React.Fragment key={s.n}>
              {/* Dot */}
              <div
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold font-heading transition-all duration-300 ${
                  active
                    ? 'bg-primary text-white ring-4 ring-primary/20 shadow-md'
                    : done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </div>
              {/* Track segment between dots */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-1 mx-1 rounded-full overflow-hidden bg-slate-200">
                  <div
                    className="h-full bg-emerald-500 transition-[width] duration-[400ms] ease-in-out"
                    style={{ width: done ? '100%' : '0%' }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Current step label — full text, never truncated */}
      <p className="text-xs font-semibold text-slate-500">
        Step {current} of 3 —{' '}
        <span className="font-bold text-primary">{STEPS[current - 1].label}</span>
      </p>
    </div>
  );
}

/* ────────── Main page ────────── */
export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const { pending } = useAuthRedirect();
  const [currentStep, setCurrentStep] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [captcha, setCaptcha] = React.useState<{ captchaToken: string; captchaSvg: string } | null>(
    null,
  );
  const [captchaLoading, setCaptchaLoading] = React.useState(false);
  const [captchaError, setCaptchaError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      dpdpConsent: false,
      privacyPolicyAccepted: false,
      captchaToken: '',
      captchaInput: '',
    },
    mode: 'onTouched',
  });

  const fetchCaptcha = React.useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError(null);
    try {
      const res = await apiClient.get('/auth/captcha');
      if (res.data?.success) {
        setCaptcha(res.data.data);
        setValue('captchaToken', res.data.data.captchaToken, { shouldValidate: true });
        setValue('captchaInput', '');
        setCaptchaError(null);
      } else {
        setCaptchaError('Failed to load CAPTCHA. Please try again.');
      }
    } catch {
      setCaptchaError('Failed to load CAPTCHA. Please check your connection and try again.');
    } finally {
      setCaptchaLoading(false);
    }
  }, [setValue]);

  // Fetch the CAPTCHA only when the user actually reaches the final
  // registration step that needs it — not on page load. This stops us firing
  // auth requests while a viewer is merely looking at the page, and prevents
  // the gateway's global per-IP rate limiter from being exhausted by repeated
  // mounts, StrictMode double-invocation, or Fast Refresh cycles.
  // The ref guard also avoids double-fetching when StrictMode re-runs effects.
  const captchaRequestedRef = React.useRef(false);
  React.useEffect(() => {
    if (currentStep === 3 && !captchaRequestedRef.current) {
      captchaRequestedRef.current = true;
      fetchCaptcha();
    }
  }, [currentStep, fetchCaptcha]);

  const goNext = async () => {
    const fields: Record<number, (keyof FormData)[]> = {
      1: ['firstName', 'lastName', 'gender'],
      2: ['email', 'mobile', 'username', 'password', 'confirmPassword'],
    };
    const ok = await trigger(fields[currentStep] ?? []);
    if (ok) {
      setCurrentStep((s) => Math.min(s + 1, 3));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const res = await apiClient.post('/auth/register', data, { timeout: 8000 });
      if (res.data.success) {
        setIsRedirecting(true);
        setUser(res.data.data.user);
        warmPostLogin(res.data.data.user.role);
        setSuccess(true);
        router.replace('/dashboard');
      }
    } catch (err: any) {
      setServerError(
        err?.response?.data?.error?.message || 'Registration failed. Please try again.',
      );
      fetchCaptcha();
    }
  };

  /* ── Session unknown / already authenticated — never flash the form ── */
  if (pending && !success) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <AuthPending />
        </div>
        <Footer />
      </div>
    );
  }

  /* ── Success screen ── */
  if (success) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <div className="flex flex-1 items-center justify-center p-6 py-20">
          <div className="animate-in fade-in zoom-in-95 duration-200 max-w-sm w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-5">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="font-heading text-2xl font-extrabold text-slate-900">
              Account Created!
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Redirecting you to your consumer dashboard…
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ── Section icon helper ── */
  function SectionHeader({ step, title, desc }: { step: number; title: string; desc: string }) {
    const s = STEPS[step - 1];
    const Icon = s.icon;
    return (
      <div className="flex items-center gap-4 pb-5 border-b border-slate-200 mb-6">
        <div className={`p-3 rounded-2xl ${s.accent} shrink-0`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-heading font-extrabold text-slate-900 text-lg sm:text-xl">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Single global Navbar — no duplicate branding inside page */}
      <Navbar />

      {/* ── Navy hero band — brand anchor ── */}
      <section className="w-full bses-gradient-hero text-white relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="page-container relative z-10 py-6 sm:py-8 lg:py-14 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                <Zap className="h-3 w-3 fill-amber-400" /> BSES Consumer Portal
              </p>
              <h1 className="font-heading text-lg sm:text-2xl lg:text-3xl font-extrabold leading-tight text-white">
                New Consumer Registration
              </h1>
            </div>
          </div>
          <p className="text-slate-300 text-xs sm:text-sm lg:text-base max-w-2xl leading-relaxed">
            Apply for a power connection in 3 easy steps. Your documents and PII are AES-256
            encrypted under DPDP Act 2023.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-0.5 max-w-lg">
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading">
                <ListChecks className="h-3 w-3 text-amber-400" />3 Easy Steps
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading">
                <Lock className="h-3 w-3 text-amber-400" />
                AES-256 Safe
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-bold text-white font-heading">
                <Phone className="h-3 w-3 text-amber-400" />
                19123 Help
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main grid ── */}
      <main className="page-container flex-1 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* ── Left sidebar (lg+) ── */}
          <aside className="lg:col-span-3 xl:col-span-4 space-y-5">
            {/* Step progress card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
              <p className="font-heading font-extrabold text-slate-900 text-sm border-b border-slate-100 pb-3">
                Registration Progress
              </p>
              <StepProgress current={currentStep} />
            </div>

            {/* Assurance card (only lg+) */}
            <div className="hidden lg:block rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <p className="font-heading font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Data Protection
              </p>
              <ul className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AES-256 PII encryption
                  under DPDP Act 2023
                </li>
                <li className="flex items-start gap-2">
                  <FileCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /> GridFS isolated
                  document vault
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-surface-dark shrink-0 mt-0.5" /> 24×7 helpline:{' '}
                  <strong className="text-slate-900">19123</strong>
                </li>
              </ul>
            </div>
          </aside>

          {/* ── Right form panel ── */}
          <div className="lg:col-span-9 xl:col-span-8 space-y-4">
            {/* space-y-4 = 16px gap; AlertSlot matches it so the form never snaps. */}
            <AlertSlot show={!!serverError} gap={16}>
              {serverError && (
                <Alert type="error" onClose={() => setServerError(null)}>
                  {serverError}
                </Alert>
              )}
            </AlertSlot>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* ── STEP 1 ── */}
              {currentStep === 1 && (
                <div
                  key="s1"
                  className="animate-in fade-in duration-200 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm"
                >
                  <SectionHeader
                    step={1}
                    title="Personal Details"
                    desc="Enter your legal name as it appears on your identity document"
                  />
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                      <FormField
                        label="First Name"
                        htmlFor="firstName"
                        required
                        error={errors.firstName?.message}
                      >
                        <input
                          id="firstName"
                          {...register('firstName')}
                          className={fieldInputClass(!!errors.firstName)}
                          placeholder="Rajesh"
                        />
                      </FormField>
                      <FormField label="Middle Name" htmlFor="middleName">
                        <input
                          id="middleName"
                          {...register('middleName')}
                          className={fieldInputClass()}
                          placeholder="Kumar"
                        />
                      </FormField>
                      <FormField
                        label="Last Name"
                        htmlFor="lastName"
                        required
                        error={errors.lastName?.message}
                      >
                        <input
                          id="lastName"
                          {...register('lastName')}
                          className={fieldInputClass(!!errors.lastName)}
                          placeholder="Sharma"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <FormField
                        label="Gender"
                        htmlFor="gender"
                        required
                        error={errors.gender?.message}
                      >
                        <CustomSelect
                          id="gender"
                          options={GENDER_OPTIONS}
                          value={watch('gender')}
                          onChange={(val) =>
                            setValue('gender', val as any, {
                              shouldValidate: true,
                              shouldTouch: true,
                            })
                          }
                          placeholder="Select gender"
                          hasError={!!errors.gender}
                        />
                      </FormField>
                      <FormField
                        label="Aadhaar Number"
                        htmlFor="aadhaar"
                        hint="Optional — encrypted at rest under DPDP 2023"
                      >
                        <input
                          id="aadhaar"
                          {...register('aadhaar')}
                          className={fieldInputClass()}
                          placeholder="12-digit Aadhaar"
                        />
                      </FormField>
                    </div>
                    <div className="flex justify-center pt-4 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="cta"
                        size="lg"
                        onClick={goNext}
                        rightIcon={<ArrowRight className="h-5 w-5" />}
                      >
                        Continue to Step 2
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2 ── */}
              {currentStep === 2 && (
                <div
                  key="s2"
                  className="animate-in fade-in duration-200 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm"
                >
                  <SectionHeader
                    step={2}
                    title="Credentials & Contact Info"
                    desc="Set up your login details and contact information for SMS updates"
                  />
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <FormField
                        label="Email Address"
                        htmlFor="email"
                        required
                        error={errors.email?.message}
                      >
                        <input
                          id="email"
                          {...register('email')}
                          type="email"
                          className={fieldInputClass(!!errors.email)}
                          placeholder="rajesh@example.com"
                        />
                      </FormField>
                      <FormField
                        label="Mobile Number"
                        htmlFor="mobile"
                        required
                        error={errors.mobile?.message}
                        hint="10-digit mobile number"
                      >
                        <input
                          id="mobile"
                          {...register('mobile')}
                          className={fieldInputClass(!!errors.mobile)}
                          placeholder="9876543210"
                        />
                      </FormField>
                    </div>
                    <FormField
                      label="Username"
                      htmlFor="username"
                      required
                      error={errors.username?.message}
                      hint="4+ chars (letters, numbers, underscores)"
                    >
                      <input
                        id="username"
                        {...register('username')}
                        className={fieldInputClass(!!errors.username)}
                        placeholder="rajesh_sharma2026"
                      />
                    </FormField>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <FormField
                        label="Password"
                        htmlFor="password"
                        required
                        error={errors.password?.message}
                        hint="8+ chars with uppercase, number & special char"
                      >
                        <input
                          id="password"
                          {...register('password')}
                          type="password"
                          className={fieldInputClass(!!errors.password)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                      </FormField>
                      <FormField
                        label="Confirm Password"
                        htmlFor="confirmPassword"
                        required
                        error={errors.confirmPassword?.message}
                      >
                        <input
                          id="confirmPassword"
                          {...register('confirmPassword')}
                          type="password"
                          className={fieldInputClass(!!errors.confirmPassword)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                      </FormField>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={goBack}
                        leftIcon={<ArrowLeft className="h-5 w-5" />}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="cta"
                        size="lg"
                        onClick={goNext}
                        rightIcon={<ArrowRight className="h-5 w-5" />}
                      >
                        Continue to Step 3
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3 ── */}
              {currentStep === 3 && (
                <div key="s3" className="animate-in fade-in duration-200 space-y-5">
                  {/* Optional connection info */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
                    <SectionHeader
                      step={3}
                      title="Existing BSES Connection"
                      desc="Optional — provide if you already have an active BSES meter"
                    />
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <FormField
                        label="CA Number"
                        htmlFor="caNumber"
                        hint="11-digit Contract Account Number"
                      >
                        <input
                          id="caNumber"
                          {...register('caNumber')}
                          className={fieldInputClass()}
                          placeholder="10002345678"
                        />
                      </FormField>
                      <FormField label="Meter Number" htmlFor="meterNumber">
                        <input
                          id="meterNumber"
                          {...register('meterNumber')}
                          className={fieldInputClass()}
                          placeholder="MTR998877"
                        />
                      </FormField>
                    </div>
                  </div>

                  {/* CAPTCHA Verification */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <label className="font-heading font-extrabold text-slate-900 text-sm">
                        CAPTCHA Verification <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={fetchCaptcha}
                        disabled={captchaLoading}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${captchaLoading ? 'animate-spin' : ''}`}
                        />{' '}
                        Refresh Code
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      {captchaError ? (
                        <div className="flex items-center gap-2 text-sm font-bold text-error">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 text-xs font-semibold">
                            {captchaError}
                          </span>
                          <button
                            type="button"
                            onClick={fetchCaptcha}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Retry
                          </button>
                        </div>
                      ) : captcha?.captchaSvg ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: captcha.captchaSvg }}
                          className="shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-40 rounded-xl bg-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-400 font-bold">
                          Loading CAPTCHA...
                        </div>
                      )}
                      {!captchaError && (
                        <div className="flex-1 w-full">
                          <input
                            id="captchaInput"
                            {...register('captchaInput')}
                            className={fieldInputClass(!!errors.captchaInput)}
                            placeholder="Enter 5-character code"
                            autoCapitalize="characters"
                          />
                        </div>
                      )}
                    </div>
                    {errors.captchaInput && (
                      <p className="text-xs font-bold text-error">{errors.captchaInput.message}</p>
                    )}
                  </div>

                  {/* Consent */}
                  <div className="rounded-3xl border border-emerald-300 bg-emerald-50/50 p-6 sm:p-8 shadow-sm space-y-5">
                    <div className="flex items-center gap-2.5 font-heading font-extrabold text-emerald-900 text-sm">
                      <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      DPDP Act 2023 — Statutory Consent
                    </div>
                    <label className="flex items-start gap-3.5 cursor-pointer">
                      <input
                        {...register('dpdpConsent')}
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary shrink-0"
                      />
                      <span className="text-sm text-slate-700 leading-relaxed">
                        I explicitly consent to BSES collecting and processing my personal data for
                        electricity services under the{' '}
                        <Link
                          href="/dpdp-act"
                          className="text-primary underline font-bold"
                          target="_blank"
                        >
                          DPDP Act 2023
                        </Link>
                        .
                      </span>
                    </label>
                    {errors.dpdpConsent && (
                      <p className="text-xs font-bold text-error pl-8">
                        {errors.dpdpConsent.message}
                      </p>
                    )}
                    <label className="flex items-start gap-3.5 cursor-pointer">
                      <input
                        {...register('privacyPolicyAccepted')}
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary shrink-0"
                      />
                      <span className="text-sm text-slate-700 leading-relaxed">
                        I accept the BSES Delhi{' '}
                        <Link
                          href="/privacy-policy"
                          className="text-primary underline font-bold"
                          target="_blank"
                        >
                          Privacy Policy
                        </Link>{' '}
                        and Terms of Service.
                      </span>
                    </label>
                    {errors.privacyPolicyAccepted && (
                      <p className="text-xs font-bold text-error pl-8">
                        {errors.privacyPolicyAccepted.message}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      onClick={goBack}
                      leftIcon={<ArrowLeft className="h-5 w-5" />}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="cta"
                      size="lg"
                      isLoading={isSubmitting}
                      rightIcon={<ArrowRight className="h-5 w-5" />}
                    >
                      Submit Registration
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
