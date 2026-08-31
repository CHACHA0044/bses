/**
 * Base interface and shared utilities for document-type-specific extractors.
 *
 * Each extractor implements `detect()` + `extract()` for a single document
 * category (Aadhaar, DL, PAN, …). The router in `index.ts` calls them in
 * priority order; the first extractor whose `detect()` returns `true` handles
 * the text. Generic fallback always matches last.
 */

// ─── Field confidence ────────────────────────────────────────────────────────

export interface FieldResult {
  value: string;
  confidence: number; // 0–100
  source: 'label' | 'positional' | 'regex' | 'qr';
}

export interface ExtractionResult {
  /** Document type detected by the extractor (informational). */
  detectedType: string;
  fields: Record<string, FieldResult>;
  /** Overall document confidence (weighted average of field confidences). */
  overallConfidence: number;
  /** Keys of fields whose confidence is below the review threshold. */
  lowConfidenceFields: string[];
  isUnreadable: boolean;
  needsReview: boolean;
}

// ─── Extractor contract ──────────────────────────────────────────────────────

export interface DocumentExtractor {
  /** Human-readable name of the extractor. */
  readonly name: string;
  /** Returns `true` when the text looks like this document type. */
  detect(text: string): boolean;
  /** Runs the full extraction against the given text. */
  extract(text: string, rawOcrConfidence?: number): ExtractionResult;
}

// ─── Shared utilities ────────────────────────────────────────────────────────

/** Normalizes OCR noise: line endings, dashes, smart quotes, excess whitespace. */
export const normalize = (text: string): string =>
  text
    .replace(/\r/g, '\n')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Strict DD-MM-YYYY (or DD/MM/YYYY or DD.MM.YYYY) matcher. */
export const DATE_RE = /(\d{2})[/\-.](\d{2})[/\-.](\d{4})/;

/**
 * Label-aware value extractor: finds `label : value` patterns on a single
 * line and returns the trimmed value portion. Handles tabs, colons, and
 * variable whitespace between label and value.
 */
export const labelValue = (text: string, labelRe: RegExp): string | undefined => {
  const match = text.match(labelRe);
  return match?.[1]?.trim() || undefined;
};

/**
 * Multi-line label-value extractor: when the label and value span separate
 * lines (common in DigiLocker PDFs and OCR), accumulates continuation lines
 * until the next known label or blank line.
 */
export const multiLineLabelValue = (
  lines: string[],
  labelIndex: number,
  valuePortion: string,
  stopRe: RegExp,
): string => {
  const parts: string[] = [];
  if (valuePortion.trim()) parts.push(valuePortion.trim());
  for (let i = labelIndex + 1; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line || stopRe.test(line)) break;
    // Stop if a new label:value pair starts (contains a colon preceded by text)
    if (/^[A-Za-z].*\s*:/.test(line) && !line.startsWith(':')) break;
    // Continuation line starting with ":" is a split label-value (e.g. "Permanent\nAddress\n: ...")
    if (line.startsWith(':')) {
      parts.push(line.slice(1).trim());
      continue;
    }
    parts.push(line);
  }
  return parts.join(', ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
};

/** Collapses consecutive whitespace inside a captured value. */
export const tidy = (value: string): string => value.replace(/\s{2,}/g, ' ').trim();

/** Validates a date string as a plausible DOB (1930 – today-18yr). */
export const validateDob = (value: string): boolean => {
  const match = value.match(DATE_RE);
  if (!match) return false;
  const year = Number(match[3]);
  if (year < 1930 || year > new Date().getFullYear() - 18) return false;
  const month = Number(match[2]);
  const day = Number(match[1]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

/** Validates a date string as a plausible document date (1990 – 2060). */
export const validateDocDate = (value: string): boolean => {
  const match = value.match(DATE_RE);
  if (!match) return false;
  const year = Number(match[3]);
  return year >= 1990 && year <= 2060;
};

/** Validates an Indian PIN code (6 digits, first digit 1-9). */
export const validatePin = (pin: string): boolean => /^[1-9]\d{5}$/.test(pin);

/**
 * Calculates field-level confidence (0–100) based on:
 * - Whether the value was found via a label match (vs. positional/regex)
 * - Whether the value passes format validation
 * - The raw OCR confidence (when available)
 */
export const fieldConfidence = (opts: {
  labelMatched: boolean;
  formatValid: boolean;
  rawConfidence?: number;
}): number => {
  let score = opts.rawConfidence ?? 80;
  if (opts.labelMatched) score = Math.min(100, score + 10);
  if (opts.formatValid) score = Math.min(100, score + 5);
  if (!opts.formatValid) score = Math.max(10, score - 20);
  return Math.round(score);
};

/** Review threshold: fields below this confidence are flagged. */
export const REVIEW_THRESHOLD = 60;

/** Builds an ExtractionResult from a map of field results. */
export const buildResult = (
  detectedType: string,
  fields: Record<string, FieldResult>,
): ExtractionResult => {
  const entries = Object.entries(fields).filter(([, f]) => f.value);
  const lowConfidenceFields = entries
    .filter(([, f]) => f.confidence < REVIEW_THRESHOLD)
    .map(([k]) => k);

  const overallConfidence =
    entries.length > 0
      ? Math.round(entries.reduce((sum, [, f]) => sum + f.confidence, 0) / entries.length)
      : 0;

  return {
    detectedType,
    fields,
    overallConfidence,
    lowConfidenceFields,
    isUnreadable: entries.length === 0,
    needsReview: lowConfidenceFields.length > 0 || overallConfidence < REVIEW_THRESHOLD,
  };
};
