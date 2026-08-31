import { extractedToLabel } from '@/lib/ocrFields';

interface OcrLowConfidenceFieldsProps {
  /** `DocumentRecord.ocrLowConfidenceFields` — keys like `extractedDob`. */
  fields?: string[];
}

/**
 * Renders a per-field list of OCR fields flagged as low confidence / manually
 * verified. Renders nothing when there is nothing to flag, so it can be placed
 * unconditionally in document cards. Shared by the admin connection detail
 * page and reuses the same label mapping as the consumer profile view.
 */
export function OcrLowConfidenceFields({ fields }: OcrLowConfidenceFieldsProps) {
  if (!fields || fields.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 border-t border-slate-200/70 pt-2 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-amber-700">Verify manually:</span>
      {fields.map((key) => (
        <span
          key={key}
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800"
        >
          {extractedToLabel(key)}
        </span>
      ))}
    </p>
  );
}
