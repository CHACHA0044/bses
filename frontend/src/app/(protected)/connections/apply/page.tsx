'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/apiClient';
import { Alert } from '@/components/ui/Alert';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { validateDocumentFile, uploadGuidanceText, ACCEPT_ATTR } from '@/lib/documentUpload';
import { LocationPickerModal } from '@/components/common/LocationPickerModal';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  MapPin,
} from 'lucide-react';

const wizardSchema = z.object({
  connectionType: z.enum(['DOMESTIC', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL']),
  requiredLoad: z.coerce.number().positive('Required load must be greater than 0').max(1000),
  propertyAddress: z.string().min(10, 'Property address must be at least 10 characters'),
  isDraft: z.boolean().optional(),
});

type WizardFormData = z.infer<typeof wizardSchema>;

export default function ApplyConnectionPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [optimizingFile, setOptimizingFile] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  // Local submit guard. `isSubmitting` from react-hook-form can flicker if a
  // validation check fires after submission starts; this ref guarantees that
  // even if the user double-clicks Submit, the network call is fired ONCE.
  const submittingRef = useRef(false);
  // Last server-side attempt id — lets the frontend tell the backend "this is
  // the same submission" so retries become idempotent at the API layer too.
  const submitAttemptIdRef = useRef<string>('');

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      connectionType: 'DOMESTIC',
      requiredLoad: 5,
    },
  });

  const connectionTypeVal = watch('connectionType');
  const requiredLoadVal = watch('requiredLoad');
  const propertyAddressVal = watch('propertyAddress');

  const handleStep1Next = async () => {
    setServerError(null);
    const isValid = await trigger('propertyAddress');
    if (isValid) {
      setStep(2);
    } else {
      setServerError(
        'Please enter your complete property address (at least 10 characters) before continuing.',
      );
    }
  };

  const handleStep2Next = async () => {
    setServerError(null);
    const isValid = await trigger(['connectionType', 'requiredLoad']);
    if (isValid) {
      setStep(3);
    } else {
      setServerError(
        'Please specify a valid connection category and load requirement (greater than 0 kW).',
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadWarning(null);
    setOptimizingFile(true);
    try {
      // Large photos are optimized in-browser first (Canvas → ≤2000px JPEG) so
      // the 2 MB limit is rarely hit and no oversized file wastes an OCR cycle.
      // imageCompressor is loaded on demand so its code never sits in the
      // initial route chunk.
      const { prepareUploadFile } = await import('@/lib/imageCompressor');
      const { file: uploadFile } = await prepareUploadFile(file);

      // Reject/warn on the client before anything reaches the server: file
      // type, size, and basic image quality are checked here with specific
      // guidance so a bad file never wastes an OCR cycle.
      const check = await validateDocumentFile(uploadFile);
      if (!check.ok) {
        setUploadError(
          check.errors[0] ?? 'This file cannot be uploaded. Please try a different file.',
        );
        setUploadWarning(null);
        e.target.value = '';
        return;
      }
      if (check.warnings.length > 0) {
        setUploadWarning(check.warnings[0]);
      } else {
        setUploadWarning(null);
      }
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('documentType', docType);

      try {
        // Do NOT set Content-Type manually: axios lets the browser generate the
        // full `multipart/form-data; boundary=...` header. Hard-coding
        // `multipart/form-data` without a boundary (or the instance's JSON
        // default) drops the boundary/part framing, which the gateway forwards
        // as-is and busboy rejects ("Unexpected end of form"). withCredentials
        // is also set explicitly so the auth cookie is never dropped on the
        // multipart request.
        const res = await apiClient.post('/documents/upload', formData, {
          withCredentials: true,
          timeout: 60_000,
          headers: { 'Content-Type': null },
        });
        setUploadError(null);
        if (res.data.success) {
          const newDoc = res.data.data.document;
          // Prevent duplicate document cards: only add if not already in state by id
          setUploadedDocs((prev) => {
            if (prev.some((d) => d.id === newDoc.id)) return prev;
            return [...prev, newDoc];
          });
          setUploadWarning(null);
        }
      } catch (err: any) {
        setUploadError(err.response?.data?.error?.message || 'Failed to upload document.');
      }
    } finally {
      setOptimizingFile(false);
    }
  };

  // Local submission state machine: idle → submitting → submitted → navigating
  // Using a ref guard for the network call (to prevent double-submits) and a
  // separate state for the button label so the UI shows "Submitted ✓" clearly
  // BEFORE the navigation transition happens (otherwise the button briefly
  // reverts to "Submit Application" and the user thinks the request failed).
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const navigatingRef = useRef<string | null>(null);

  const onSubmit = async (data: WizardFormData) => {
    // Guard against double-submission using a ref (more reliable than isSubmitting
    // which can flicker if validation fires after submission starts)
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitState('submitting');
    setServerError(null);
    try {
      const res = await apiClient.post('/connections/apply', {
        ...data,
        isDraft: false,
        documentIds: uploadedDocs.map((doc) => doc.id),
        submitAttemptId: submitAttemptIdRef.current,
      });
      if (res.data.success) {
        // Mark submitted BEFORE navigating, so the user sees a clear success
        // indicator on the button (prevents the "did my click register?"
        // confusion where the button briefly reverts to its idle label).
        const targetId = res.data.data.connection.id;
        setSubmitState('submitted');
        navigatingRef.current = targetId;
        // Brief delay so the user can perceive the success state. 800ms is
        // long enough to register visually but short enough not to feel slow.
        await new Promise((r) => setTimeout(r, 800));
        router.push(`/connections/${targetId}`);
      }
    } catch (err: any) {
      // Preserve user's data on failure - do NOT clear form state
      setSubmitState('idle');
      setServerError(
        err.response?.data?.error?.message ||
          'Failed to submit application. Your data has been preserved.',
      );
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-4 py-2 sm:py-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
          New Electricity Connection Application
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Multi-step online service request wizard for BSES Delhi consumers
        </p>
      </div>

      {/* Wizard Progress Bar with Animated Moving Arrows */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {[
            { num: 1, label: 'Property' },
            { num: 2, label: 'Load & Type' },
            { num: 3, label: 'Documents' },
            { num: 4, label: 'Review' },
          ].map((s, idx, arr) => {
            const isCompleted = step > s.num;
            const isActive = step === s.num;

            return (
              <React.Fragment key={s.num}>
                {/* Step Pill */}
                <div
                  onClick={() => isCompleted && setStep(s.num)}
                  className={`flex items-center gap-1.5 sm:gap-2 transition-all duration-300 shrink-0 ${
                    isCompleted ? 'cursor-pointer' : ''
                  }`}
                >
                  <span
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20 shadow-md scale-105'
                        : isCompleted
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-4 h-4 text-white" /> : s.num}
                  </span>
                  <span
                    className={`text-xs sm:text-sm font-bold transition-colors hidden sm:inline ${
                      isActive
                        ? 'text-amber-600 font-extrabold'
                        : isCompleted
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>

                {/* Animated Arrow Connector between steps */}
                {idx < arr.length - 1 && (
                  <div className="flex-1 flex items-center justify-center px-0.5 sm:px-2 min-w-[12px] sm:min-w-0">
                    <div className="relative w-full flex items-center justify-center">
                      <div
                        className={`h-0.5 w-full transition-all duration-500 ${
                          step > s.num ? 'bg-emerald-400' : 'bg-slate-200'
                        }`}
                      />
                      <div
                        className={`absolute p-0.5 sm:p-1 rounded-full bg-white border transition-all duration-300 ${
                          step === s.num
                            ? 'border-amber-400 text-amber-600 shadow-md animate-bounce-horizontal scale-110 z-10'
                            : step > s.num
                              ? 'border-emerald-400 text-emerald-500 bg-emerald-50'
                              : 'border-slate-200 text-slate-300'
                        }`}
                      >
                        <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Mobile Active Step Indicator */}
        <div className="sm:hidden mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Step {step} of 4</span>
          <span className="text-amber-600 font-extrabold uppercase tracking-wide">
            {['Property', 'Load & Type', 'Documents', 'Review'][step - 1]}
          </span>
        </div>
      </div>

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3.5 sm:p-4 rounded-xl text-xs sm:text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <AlertSlot show={!!uploadError}>
        {uploadError && (
          <Alert type="error" onClose={() => setUploadError(null)}>
            {uploadError}
          </Alert>
        )}
      </AlertSlot>

      <AlertSlot show={!!uploadWarning}>
        {uploadWarning && (
          <Alert type="warning" onClose={() => setUploadWarning(null)}>
            {uploadWarning}
          </Alert>
        )}
      </AlertSlot>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 sm:space-y-6"
      >
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Step 1: Property Location
            </h2>
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  Full Property Address *
                </label>
                <button
                  type="button"
                  onClick={() => setIsMapOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3.5 py-2 transition cursor-pointer active:scale-95 shadow-sm"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                  <span>Choose / Pin Location on Map</span>
                </button>
              </div>
              <textarea
                {...register('propertyAddress')}
                rows={3}
                className={`w-full bg-slate-50 border rounded-xl p-3 text-xs sm:text-sm text-slate-900 focus:outline-none transition ${
                  errors.propertyAddress
                    ? 'border-red-500 focus:border-red-500 ring-2 ring-red-500/20'
                    : 'border-slate-300 focus:border-amber-500'
                }`}
                placeholder="Flat No, Building Name, Street Name, Landmark, Pin Code, Delhi"
              />
              {errors.propertyAddress && (
                <p className="text-xs font-semibold text-red-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.propertyAddress.message}
                </p>
              )}
            </div>

            <LocationPickerModal
              isOpen={isMapOpen}
              onClose={() => setIsMapOpen(false)}
              onSelectAddress={(addr) =>
                setValue('propertyAddress', addr, { shouldValidate: true })
              }
              initialAddress={propertyAddressVal}
            />

            <div className="flex flex-col-reverse sm:flex-row justify-center items-stretch sm:items-center gap-2.5 pt-2 w-full">
              <button
                type="button"
                onClick={handleStep1Next}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-3 sm:py-2.5 px-6 rounded-xl shadow cursor-pointer active:scale-95 transition"
              >
                <span>Next: Connection Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Step 2: Connection Type & Required Load
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Connection Category *
                </label>
                <select
                  {...register('connectionType')}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs sm:text-sm text-slate-900"
                >
                  <option value="DOMESTIC">Domestic Connection</option>
                  <option value="COMMERCIAL">Commercial Connection</option>
                  <option value="INDUSTRIAL">Industrial Connection</option>
                  <option value="AGRICULTURAL">Agricultural Connection</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Required Load (kW) *
                </label>
                <input
                  {...register('requiredLoad')}
                  type="number"
                  step="0.5"
                  className={`w-full bg-slate-50 border rounded-xl p-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none transition ${
                    errors.requiredLoad
                      ? 'border-red-500 ring-2 ring-red-500/20'
                      : 'border-slate-300 focus:border-amber-500'
                  }`}
                />
                {errors.requiredLoad && (
                  <p className="text-xs font-semibold text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.requiredLoad.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-center items-stretch sm:items-center gap-2.5 pt-2 w-full">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 text-center cursor-pointer transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleStep2Next}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-3 sm:py-2.5 px-6 rounded-xl shadow cursor-pointer active:scale-95 transition"
              >
                <span>Next: Upload Documents</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Step 3: Upload Mandatory Supporting Documents
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">{uploadGuidanceText()}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Identity Proof - Styled as a proper button */}
              <div className="p-3.5 sm:p-4 border border-dashed border-slate-300 rounded-xl space-y-2 text-center bg-slate-50/50 hover:bg-slate-50 transition">
                <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Identity Proof (Aadhaar / PAN)</p>
                <label className="inline-flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm cursor-pointer transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                  <input
                    type="file"
                    accept={ACCEPT_ATTR}
                    onChange={(e) => handleFileUpload(e, 'AADHAAR_CARD')}
                    className="sr-only"
                    aria-label="Upload Identity Proof document"
                  />
                </label>
              </div>

              {/* Ownership Proof - Styled as a proper button */}
              <div className="p-3.5 sm:p-4 border border-dashed border-slate-300 rounded-xl space-y-2 text-center bg-slate-50/50 hover:bg-slate-50 transition">
                <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Ownership / Lease Proof</p>
                <label className="inline-flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm cursor-pointer transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                  <input
                    type="file"
                    accept={ACCEPT_ATTR}
                    onChange={(e) => handleFileUpload(e, 'OWNERSHIP_PROOF')}
                    className="sr-only"
                    aria-label="Upload Ownership or Lease Proof document"
                  />
                </label>
              </div>
            </div>

            {optimizingFile && (
              <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Optimizing image… large
                photos are compressed in your browser before upload.
              </p>
            )}

            {uploadedDocs.length > 0 && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <p className="font-bold">Uploaded Documents ({uploadedDocs.length}):</p>
                {uploadedDocs.map((doc, idx) => (
                  <p key={idx} className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      {doc.documentName} ({doc.documentType})
                    </span>
                  </p>
                ))}
              </div>
            )}

            {/* Check if both required documents are uploaded */}
            {(() => {
              const hasIdentity = uploadedDocs.some(
                (d) => d.documentType === 'AADHAAR_CARD' || d.documentType === 'PAN_CARD',
              );
              const hasOwnership = uploadedDocs.some((d) => d.documentType === 'OWNERSHIP_PROOF');
              const bothDocsUploaded = hasIdentity && hasOwnership;

              return (
                <div className="flex flex-col-reverse sm:flex-row justify-center items-stretch sm:items-center gap-2.5 pt-2 w-full">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 text-center cursor-pointer transition"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    disabled={!bothDocsUploaded}
                    title={
                      !bothDocsUploaded
                        ? 'Please upload both Identity Proof and Ownership/Lease Proof before continuing'
                        : undefined
                    }
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold text-xs py-3 sm:py-2.5 px-6 rounded-xl shadow transition ${
                      bothDocsUploaded
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer active:scale-95'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>
                      {bothDocsUploaded
                        ? 'Next: Final Review'
                        : 'Upload Both Documents to Continue'}
                    </span>
                    {bothDocsUploaded && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Step 4: Application Summary Review
            </h2>
            <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
              <p>
                <span className="font-bold">Connection Type:</span> {connectionTypeVal}
              </p>
              <p>
                <span className="font-bold">Required Load:</span> {requiredLoadVal} kW
              </p>
              <p>
                <span className="font-bold">Property Address:</span> {propertyAddressVal}
              </p>
              <p>
                <span className="font-bold">Attached Documents:</span> {uploadedDocs.length} file(s)
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-center items-stretch sm:items-center gap-2.5 pt-2 w-full">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 text-center cursor-pointer transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitState !== 'idle'}
                aria-live="polite"
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold text-xs py-3 px-6 rounded-xl shadow-lg transition cursor-pointer active:scale-95 ${
                  submitState === 'submitted'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-600 text-white'
                    : submitState === 'submitting'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 cursor-wait'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950'
                } disabled:opacity-90`}
              >
                {submitState === 'submitting' && (
                  <svg
                    className="animate-spin w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="3"
                    />
                    <path
                      d="M22 12a10 10 0 0 1-10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {submitState === 'submitted' && (
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span>
                  {submitState === 'submitting'
                    ? 'Submitting Application...'
                    : submitState === 'submitted'
                      ? 'Submitted'
                      : 'Submit Application'}
                </span>
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
