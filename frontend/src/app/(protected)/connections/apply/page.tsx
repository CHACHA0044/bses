'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/apiClient';
import { CheckCircle2, ArrowRight, ArrowLeft, Upload, FileText, AlertCircle } from 'lucide-react';

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
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    watch,
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', docType);

    try {
      const res = await apiClient.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setUploadedDocs((prev) => [...prev, res.data.data.document]);
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to upload document.');
    }
  };

  const onSubmit = async (data: WizardFormData) => {
    setServerError(null);
    try {
      const res = await apiClient.post('/connections/apply', {
        ...data,
        isDraft: false,
      });
      if (res.data.success) {
        router.push(`/connections/${res.data.data.connection.id}`);
      }
    } catch (err: any) {
      setServerError(err.response?.data?.error?.message || 'Failed to submit application.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Electricity Connection Application</h1>
        <p className="text-xs text-slate-500">Multi-step online service request wizard for BSES Delhi consumers</p>
      </div>

      {/* Wizard Progress Bar with Animated Moving Arrows */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
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
                  className={`flex items-center gap-2 transition-all duration-300 ${
                    isCompleted ? 'cursor-pointer' : ''
                  }`}
                >
                  <span
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
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
                    className={`text-xs sm:text-sm font-bold transition-colors ${
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
                  <div className="flex-1 flex items-center justify-center px-1 sm:px-2">
                    <div className="relative w-full flex items-center justify-center">
                      <div
                        className={`h-0.5 w-full transition-all duration-500 ${
                          step > s.num ? 'bg-emerald-400' : 'bg-slate-200'
                        }`}
                      />
                      <div
                        className={`absolute p-1 rounded-full bg-white border transition-all duration-300 ${
                          step === s.num
                            ? 'border-amber-400 text-amber-600 shadow-md animate-bounce-horizontal scale-110 z-10'
                            : step > s.num
                            ? 'border-emerald-400 text-emerald-500 bg-emerald-50'
                            : 'border-slate-200 text-slate-300'
                        }`}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase">Step 1: Property Location</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Full Property Address *</label>
              <textarea
                {...register('propertyAddress')}
                rows={4}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:border-amber-500"
                placeholder="Flat No, Building Name, Street Name, Landmark, Pin Code, Delhi"
              />
              {errors.propertyAddress && <p className="text-xs text-red-500 mt-1">{errors.propertyAddress.message}</p>}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => propertyAddressVal?.length >= 10 && setStep(2)}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow"
              >
                <span>Next: Connection Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase">Step 2: Connection Type & Required Load</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Connection Category *</label>
                <select {...register('connectionType')} className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900">
                  <option value="DOMESTIC">Domestic Connection</option>
                  <option value="COMMERCIAL">Commercial Connection</option>
                  <option value="INDUSTRIAL">Industrial Connection</option>
                  <option value="AGRICULTURAL">Agricultural Connection</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Required Load (kW) *</label>
                <input
                  {...register('requiredLoad')}
                  type="number"
                  step="0.5"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900"
                />
                {errors.requiredLoad && <p className="text-xs text-red-500 mt-1">{errors.requiredLoad.message}</p>}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600">
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow"
              >
                <span>Next: Upload Documents</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase">Step 3: Upload Mandatory Supporting Documents</h2>
            <p className="text-xs text-slate-500">Upload PDF, JPEG, or PNG files (max 10MB each).</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-dashed border-slate-300 rounded-xl space-y-2 text-center">
                <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Identity Proof (Aadhaar / PAN)</p>
                <input type="file" onChange={(e) => handleFileUpload(e, 'AADHAAR_CARD')} className="text-xs text-slate-500" />
              </div>

              <div className="p-4 border border-dashed border-slate-300 rounded-xl space-y-2 text-center">
                <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Ownership / Lease Proof</p>
                <input type="file" onChange={(e) => handleFileUpload(e, 'OWNERSHIP_PROOF')} className="text-xs text-slate-500" />
              </div>
            </div>

            {uploadedDocs.length > 0 && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <p className="font-bold">Uploaded Documents ({uploadedDocs.length}):</p>
                {uploadedDocs.map((doc, idx) => (
                  <p key={idx} className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{doc.documentName} ({doc.documentType})</span>
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600">
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow"
              >
                <span>Next: Final Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase">Step 4: Application Summary Review</h2>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
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

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600">
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs py-3 px-6 rounded-xl shadow-lg transition disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Submitting Application...' : 'Submit Application'}</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
