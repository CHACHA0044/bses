'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

/** Fields a consumer/owner may correct; mirrors the backend's editable surface. */
const EDITABLE_FIELDS: { key: string; label: string; placeholder?: string; mono?: boolean }[] = [
  { key: 'name', label: 'Full Name', placeholder: 'Full name as printed on document' },
  { key: 'fatherName', label: 'Father / Guardian Name' },
  { key: 'dob', label: 'Date of Birth (DOB)', placeholder: 'DD/MM/YYYY' },
  { key: 'aadhaar', label: 'Aadhaar Number', placeholder: 'Full 12-digit number', mono: true },
  { key: 'pan', label: 'PAN Number', placeholder: 'ABCDE1234F', mono: true },
  { key: 'licenseNumber', label: 'License Number', mono: true },
  { key: 'validity', label: 'Validity / Expiry', placeholder: 'DD/MM/YYYY' },
  { key: 'issueDate', label: 'Issue Date', placeholder: 'DD/MM/YYYY' },
  { key: 'issuingAuthority', label: 'Issuing Authority' },
  { key: 'pinCode', label: 'PIN Code', mono: true },
  { key: 'state', label: 'State' },
  { key: 'district', label: 'District' },
  { key: 'address', label: 'Address' },
];

/**
 * DocumentCard — shared uploaded-document tile used by the consumer and admin
 * connection detail pages. Renders name/type/size, status chips, and the OCR
 * extracted fields when available with review and correction support.
 */
export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  variant = 'consumer',
  actions,
}) => {
  const isAdmin = variant === 'admin';
  const hasOcr =
    doc.ocrStatus === 'EXTRACTED' ||
    doc.ocrStatus === 'NEEDS_REVIEW' ||
    doc.ocrStatus === 'PARTIAL';

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Fields state: always use the OCR data directly — NO masking, NO truncation.
  // The user sees exactly what was extracted so they can verify and correct.
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      const raw =
        (doc.ocrData as Record<string, string | null | undefined> | undefined)?.[f.key] ?? '';
      init[f.key] = typeof raw === 'string' ? raw : '';
    }
    return init;
  });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Sync fields when OCR data changes (e.g., after save)
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      const raw =
        (doc.ocrData as Record<string, string | null | undefined> | undefined)?.[f.key] ?? '';
      init[f.key] = typeof raw === 'string' ? raw : '';
    }
    setFields(init);
  }, [doc.ocrData]);

  // Build the displayed OCR fields list — show ALL non-empty values with
  // full text. No masking, no partial display.
  const ocrFields = [
    { key: 'name', label: 'Full Name', value: doc.ocrData?.name },
    { key: 'fatherName', label: 'Father / Guardian', value: doc.ocrData?.fatherName },
    { key: 'dob', label: 'DOB', value: doc.ocrData?.dob },
    { key: 'aadhaar', label: 'Aadhaar', value: doc.ocrData?.aadhaar },
    { key: 'pan', label: 'PAN', value: doc.ocrData?.pan },
    { key: 'licenseNumber', label: 'Licence No', value: doc.ocrData?.licenseNumber },
    { key: 'validity', label: 'Validity', value: doc.ocrData?.validity || doc.ocrData?.expiryDate },
    { key: 'issueDate', label: 'Issue Date', value: doc.ocrData?.issueDate },
    { key: 'issuingAuthority', label: 'Issuing Authority', value: doc.ocrData?.issuingAuthority },
    { key: 'pinCode', label: 'PIN Code', value: doc.ocrData?.pinCode },
    { key: 'state', label: 'State', value: doc.ocrData?.state },
    { key: 'district', label: 'District', value: doc.ocrData?.district },
    { key: 'address', label: 'Address', value: doc.ocrData?.address },
  ].filter((f) => typeof f.value === 'string' && f.value.length > 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Only send non-empty fields — let the backend handle what was actually edited.
      const payload: Record<string, string> = {};
      for (const f of EDITABLE_FIELDS) {
        const value = fields[f.key] ?? '';
        if (value.trim().length > 0) {
          payload[f.key] = value;
        }
      }

      const res = await apiClient.patch(`/documents/${doc.id}/extracted-data`, {
        fields: payload,
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

  const openModal = () => {
    // Reset fields to current OCR data before opening
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      const raw =
        (doc.ocrData as Record<string, string | null | undefined> | undefined)?.[f.key] ?? '';
      init[f.key] = typeof raw === 'string' ? raw : '';
    }
    setFields(init);
    setSaveSuccess(false);
    setSaveError(null);
    setIsEditing(true);
  };

  const closeModal = () => {
    setIsEditing(false);
    setSaveSuccess(false);
    setSaveError(null);
  };

  // Lock body scroll while editing modal is open
  useEffect(() => {
    if (!isEditing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isEditing]);

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

        {doc.ocrStatus === 'FAILED' && (
          <p className="text-[11px] text-rose-600 border-t border-slate-200/70 pt-2">
            {isAdmin
              ? `OCR failed after ${doc.ocrAttempts ? `${doc.ocrAttempts} attempt(s) ` : ''}— review manually.`
              : 'This document could not be processed automatically. BSES may contact you for a clearer copy.'}
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
                onClick={openModal}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Review & Edit
              </button>
            </div>

            {ocrFields.length > 0 ? (
              <div className="grid grid-cols-1 gap-1">
                {ocrFields.map((f) => (
                  <div key={f.key} className="flex gap-2">
                    <span className="text-slate-500 shrink-0 min-w-[80px]">{f.label}:</span>
                    {/* Full value, no masking, no truncation. Long values wrap naturally. */}
                    <span className="text-slate-800 font-medium break-words word-break-break-word">
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic">
                Click &ldquo;Review & Edit&rdquo; to verify extracted details.
              </p>
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
            <summary className="font-semibold hover:text-slate-800">
              View Raw OCR Text Snippet
            </summary>
            <pre className="mt-1 p-2 bg-slate-100 rounded text-[10px] whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {doc.ocrData.rawText}
            </pre>
          </details>
        )}
      </div>

      {/* ── Review & Edit Modal ──────────────────────────────────────────────
          Rendered via React portal to document.body so it sits ABOVE the
          sidebar, navbar, and all other page content regardless of the
          component's position in the DOM tree.
          
          Stacking context strategy:
            - Outer div: position:fixed, inset:0, z-[9998] — backdrop layer
            - Inner div: position:fixed, inset:0, z-[9999] — dialog layer
            - This ensures the modal is always above everything else in the app.
      ──────────────────────────────────────────────────────────────────────── */}
      {isEditing &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            {/* Full-viewport dark backdrop — covers navbar + sidebar + page content */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-0" aria-hidden="true" />

            {/* Modal dialog — above the backdrop, wide enough for form fields,
              max-height capped so the footer stays accessible on all viewports. */}
            <div
              className={[
                'relative z-10 w-full bg-white rounded-2xl shadow-2xl border border-slate-200',
                'flex flex-col',
                // Desktop: wider modal so all fields are readable
                'max-w-2xl max-h-[90vh]',
                // Mobile: full-width with rounded top corners (slide-up feel)
                'sm:max-w-2xl',
              ].join(' ')}
            >
              {/* Fixed header — document name + close button always visible */}
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
                <div className="min-w-0">
                  <h3
                    id="review-modal-title"
                    className="text-base font-extrabold text-slate-900 flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                    Review Extracted Document Info
                  </h3>
                  <p
                    className="text-[11px] text-slate-500 mt-0.5 truncate"
                    title={doc.documentName}
                  >
                    {doc.documentName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1.5 transition active:scale-90 cursor-pointer shrink-0"
                  aria-label="Close review modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Success / error banners */}
              {saveSuccess && (
                <div className="mx-6 mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2 font-bold shrink-0">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  Extracted details updated successfully!
                </div>
              )}

              {saveError && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold shrink-0">
                  {saveError}
                </div>
              )}

              {/* Scrollable form body — all fields visible and accessible */}
              <form id="review-form" onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3">
                    Verify and correct the values extracted from your document. All detected values
                    are shown in full so you can review and edit them accurately.
                  </p>

                  <div className="grid grid-cols-1 gap-4">
                    {EDITABLE_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <label
                          htmlFor={`field-${f.key}`}
                          className="text-xs font-semibold text-slate-700 block"
                        >
                          {f.label}
                        </label>
                        <input
                          id={`field-${f.key}`}
                          type="text"
                          inputMode={f.mono ? 'text' : 'text'}
                          autoComplete="off"
                          spellCheck={false}
                          value={fields[f.key] ?? ''}
                          onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          className={[
                            'w-full bg-white border border-slate-300 rounded-xl p-3',
                            'text-sm text-slate-900',
                            'focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20',
                            'transition placeholder:text-slate-400',
                            'resize-none', // Prevent textarea-like resize on text inputs
                            f.mono ? 'font-mono uppercase tracking-wider' : '',
                          ].join(' ')}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fixed footer — Cancel and Save Correction always accessible */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0 rounded-b-2xl">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-600 hover:bg-white transition active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="review-form"
                    disabled={saving}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm px-5 py-2.5 rounded-xl shadow transition disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{saving ? 'Saving...' : 'Save Correction'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
