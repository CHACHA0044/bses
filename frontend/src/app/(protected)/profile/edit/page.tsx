'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/apiClient';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const editProfileSchema = z.object({
  email: z.string().email('Invalid email address format'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  aadhaar: z.string().optional(),
});

type EditProfileFormData = z.infer<typeof editProfileSchema>;

export default function EditProfilePage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileSchema),
  });

  useEffect(() => {
    async function loadCurrentProfile() {
      try {
        const res = await apiClient.get('/users/profile');
        if (res.data.success) {
          const p = res.data.data.profile;
          setValue('email', p.email || '');
          setValue('mobile', p.mobile || '');
          setValue('aadhaar', p.aadhaar || '');
        }
      } catch (err) {
        console.error('Failed to load profile for editing', err);
      }
    }
    loadCurrentProfile();
  }, [setValue]);

  const onSubmit = async (data: EditProfileFormData) => {
    setServerError(null);
    try {
      await apiClient.put('/users/profile', data);
      router.push('/profile');
    } catch (err: any) {
      setServerError(err.response?.data?.error?.message || 'Failed to update profile.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-2">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="p-2 rounded-lg hover:bg-slate-200 transition">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Profile</h1>
          <p className="text-xs text-slate-500">Update contact and identity information</p>
        </div>
      </div>

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Email Address</label>
          <input
            {...register('email')}
            type="email"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Mobile Number</label>
          <div className="flex rounded-xl border border-slate-300 bg-slate-50 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500">
            <span className="flex items-center justify-center px-3.5 bg-slate-200/80 border-r border-slate-300 text-xs font-extrabold text-slate-700 select-none shrink-0">
              +91
            </span>
            <input
              {...register('mobile')}
              placeholder="Enter number"
              className="w-full bg-transparent p-2.5 text-sm text-slate-900 outline-none"
            />
          </div>
          {errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Aadhaar Number (Optional)</label>
          <input
            {...register('aadhaar')}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            placeholder="12-digit Aadhaar"
          />
          {errors.aadhaar && <p className="text-xs text-red-500 mt-1">{errors.aadhaar.message}</p>}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <Link href="/profile" className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
