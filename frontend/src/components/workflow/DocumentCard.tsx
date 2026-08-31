'use client';

import React, { useState } from 'react';
import { FileText, Edit3, Check, X, Shield, Sparkles, Loader2 } from 'lucide-react';
import { StatusChip } from '@/components/ui/Badge';
import { OcrStatusChip } from '@/components/ui/OcrStatusChip';
import { OcrLowConfidenceFields } from '@/components/ocr/OcrLowConfidenceFields';
import { formatDate, formatFileSize } from '@/lib/utils';
import { apiClient } from '@/lib/apiClient';
import type { DocumentRecord } from '@/types/workflow';

interface DocumentCardProps {
  doc: DocumentRecord;
  /** consumer = compact single-column card; admin = review-oriented card. */
  variant?: 'consumer' | 'admin';
  /** Optional trailing action slot (e.g. admin "Preview" button). */
  actions?: React.ReactNode;
}

/**
 * DocumentCard — shared uploaded-document tile used by the consumer and admin
 * connection detail pages. Renders name/type/size, status chips, and the OCR
 * extracted fields when available with review and correction support.
 */
export const DocumentCard: React.FC<DocumentCardProps> = ({ doc, variant = 'consumer', actions }) => {
  const isAdmin = variant === 'admin';
  const hasOcr = doc.ocrStatus === 'EXTRACTED' || doc.ocrStatus === 'NEEDS_REVIEW';

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [fields, setFields] = useState({
    name: doc.ocrData?.name || '',
    dob: doc.ocrData?.dob || '',
    aadhaar: doc.ocrData?.aadhaar || '',
    pan: doc.ocrData?.pan || '',
  });

  const ocrFields = [
    { key: 'aadhaar', label: 'Aadhaar', value: doc.ocrData?.aadhaar },
    { key: 'pan', label: 'PAN', value: doc.ocrData?.pan },
    { key: 'licenseNumber', label: 'Licence No', value: doc.ocrData?.licenseNumber },
    { key: 'name', label: 'Name', value: doc.ocrData?.name },
    { key: 'fatherName', label: 'Father / Guardian', value: doc.ocrData?.fatherName },
    { key: 'dob', label: 'DOB', value: doc.ocrData?.dob },
    { key: 'validity', label: 'Validity', value: doc.ocrData?.validity || doc.ocrData?.expiryDate },
    { key: 'issueDate', label: 'Issue Date', value: doc.ocrData?.issueDate },
    { key: 'issuingAuthority', label: 'Issuing Authority', value: doc.ocrData?.issuingAuthority },
    { key: 'pinCode', label: 'PIN Code', value: doc.ocrData?.pinCode },
    { key: 'state', label: 'State', value: doc.ocrData?.state },
    { key: 'district', label: 'District', value: doc.ocrData?.district },
    { key: 'address', label: 'Address', value: doc.ocrData?.address },
  ].filter((f) => !!f.value);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await apiClient.patch(`/documents/${doc.id}/extracted-data`, {
        fields: {
          name: fields.name,
          dob: fields.dob,
          aadhaar: fields.aadhaar,
          pan: fields.pan,
        },
      });

      if (res.data?.success) {
        setSaveSuccess(true);
        setTimeout(() => {
          setIsEditing(false);
          setSaveSuccess(false);
        }, 1200);
      }
    } catch (err: any) {
      setSaveError(err.response?.data?.error?.message || 'Failed to update extracted fields.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 truncate" title={doc.documentName}>
              {doc.documentName}
            </p>
            <p className="text-[11px] text-slate-500">
              {doc.documentType.replaceAll('_', ' ')} · {formatFileSize(doc.fileSize)}
              {isAdmin ? ` · ${formatDate(doc.uploadDate)}` : ''}
            </p>
            {isAdmin && (
              <span className="mt-1 inline-block">
                <StatusChip status={doc.status} showDot={false} />
              </span>
            )}
          </div>
          {isAdmin ? (
            actions
          ) : (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusChip status={doc.status} showDot={false} />
              <OcrStatusChip status={doc.ocrStatus} />
            </div>
          )}
        </div>

        {doc.ocrStatus === 'UNREADABLE' && (
          <p className="text-[11px] text-rose-600 border-t border-slate-200/70 pt-2">
            {isAdmin
              ? 'OCR flagged this document as low quality / unreadable. Review manually.'
              : 'This document could not be read automatically. BSES may contact you for a clearer copy.'}
          </p>
        )}
        {doc.ocrStatus === 'NEEDS_REVIEW' && (
          <p className="text-[11px] text-amber-700 border-t border-slate-200/70 pt-2">
            {isAdmin
              ? 'Low OCR confidence — verify the extracted values below before approving.'
              : 'OCR confidence was low for this document — please double-check the extracted details.'}
          </p>
        )}

        {isAdmin && <OcrLowConfidenceFields fields={doc.ocrLowConfidenceFields} />}

        {hasOcr && (
          <div className="border-t border-slate-200/70 pt-2 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Extracted Data
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Review &amp; Edit
              </button>
            </div>

            {ocrFields.length > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {ocrFields.map((f) => (
                  <span key={f.label} className="text-slate-500">
                    {f.label}: <strong className="font-mono font-bold text-slate-800">{f.value}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic">Click "Review &amp; Edit" to verify extracted details.</p>
            )}
          </div>
        )}

        {isAdmin && hasOcr && doc.ocrConfidence != null && (
          <p className="text-[10px] text-slate-400 border-t border-slate-200/70 pt-2">
            OCR confidence: {doc.ocrConfidence}%
            {doc.ocrData?.rawText ? ' · Raw text available below' : ''}
          </p>
        )}

        {isAdmin && doc.ocrData?.rawText && (
          <details className="text-[11px] text-slate-500 cursor-pointer">
            <summary className="font-semibold hover:text-slate-800">View Raw OCR Text Snippet</summary>
            <pre className="mt-1 p-2 bg-slate-100 rounded text-[10px] whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {doc.ocrData.rawText}
            </pre>
          </details>
        )}
      </div>

      {/* Review & Edit OCR Data Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-500" /> Review Extracted Document Info
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{doc.documentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2 font-bold">
                <Check className="w-4 h-4 text-emerald-600" /> Extracted details updated successfully!
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold">
                {saveError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Extracted Full Name</label>
                <input
                  type="text"
                  value={fields.name}
                  onChange={(e) => setFields({ ...fields, name: e.target.value })}
                  placeholder="Full name as printed on document"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Date of Birth (DOB)</label>
                <input
                  type="text"
                  value={fields.dob}
                  onChange={(e) => setFields({ ...fields, dob: e.target.value })}
                  placeholder="DD/MM/YYYY"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Aadhaar Number (Extracted)</label>
                <input
                  type="text"
                  value={fields.aadhaar}
                  onChange={(e) => setFields({ ...fields, aadhaar: e.target.value })}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono text-slate-900 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PAN Number (Extracted)</label>
                <input
                  type="text"
                  value={fields.pan}
                  onChange={(e) => setFields({ ...fields, pan: e.target.value })}
                  placeholder="ABCDE1234F"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono text-slate-900 uppercase focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{saving ? 'Saving...' : 'Save Correction'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
