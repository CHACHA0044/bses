/**
 * Central decision engine for document extraction.
 *
 * Zero dependencies on Prisma / the extractor registry so it can be unit-tested
 * in isolation. Turns raw signals (OCR fields+confidence, QR fields+verification
 * status, image quality, checksums, secondary-OCR agreement, declared-vs-detected
 * type) into one explainable decision:
 *
 *   status     EXTRACTED | PARTIAL | NEEDS_REVIEW | UNREADABLE | FAILED
 *   confidence aggregate 0..1 (weighted, not a raw average)
 *   conflicts  per-field disagreements between independent sources
 *   risks      fraud/tamper-ish signals (as signals, not accusations)
 *
 * Rules:
 *   - Verified QR (SIGNED_VERIFIED) is near-trustworthy but still cross-checked.
 *   - Unverified QR is EVIDENCE ONLY: it participates in confidence but never
 *     clears needsReview by itself; disagreement with OCR => NEEDS_REVIEW.
 *   - OCR engine confidence and document trust are separate concepts.
 */

export type DecisionStatus = 'EXTRACTED' | 'PARTIAL' | 'NEEDS_REVIEW' | 'UNREADABLE' | 'FAILED';

export interface FieldDecision {
  key: string;
  value?: string | undefined;
  /** Aggregate confidence 0..1 for this field across all sources. */
  confidence: number;
  /** Provenance: 'qr' | 'ocr' | 'secondary' | 'api' | 'manual'. */
  sources: string[];
  conflicts: string[];
}

export interface RiskSignal {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface DocumentDecision {
  status: DecisionStatus;
  /** Aggregate document confidence 0..1. */
  confidence: number;
  /** Aggregate fraud/tamper risk 0..1 (higher = more suspicious). */
  riskScore: number;
  needsReview: boolean;
  unreadable: boolean;
  partial: boolean;
  fields: Record<string, FieldDecision>;
  conflicts: string[];
  risks: RiskSignal[];
  warnings: string[];
  reasons: string[];
}

export interface DecisionInput {
  declaredType: string | null;
  detectedType: string | null;
  /** QrVerificationStatus from `qrSignature`. */
  qrStatus?: string | null;
  qrFields?: Record<string, string | undefined> | null;
  ocrFields?: Record<string, string | undefined> | null;
  /** Per-field extractor confidences (0..100). */
  fieldConfidences?: Record<string, number> | undefined;
  /** Overall OCR engine confidence (0..100). */
  ocrConfidence: number;
  expectedKeys: readonly string[];
  imageQuality?: { overall?: number; issues?: string[] } | null;
  checksumValid?: Record<string, boolean> | undefined;
  secondaryAgreement?: Record<string, boolean> | undefined;
  extraRisks?: RiskSignal[];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Order-insensitive, format-insensitive value comparison (dates, IDs). */
const valuesAgree = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  const na = a.replace(/[\s-]|[/.]/g, '').toUpperCase();
  const nb = b.replace(/[\s-]|[/.]/g, '').toUpperCase();
  if (!na || !nb) return false;
  return na === nb;
};

const normalizedTypeName = (t: string): string => t.replace(/[^a-z0-9]/gi, '').toUpperCase();

/** True when two type names refer to the same physical document. */
export const typesEquivalent = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  const na = normalizedTypeName(a);
  const nb = normalizedTypeName(b);
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
};

const FIELD_KEY_RE = /^extracted[A-Z]/;

export const decideDocument = (input: DecisionInput): DocumentDecision => {
  const {
    declaredType,
    detectedType,
    qrStatus,
    qrFields,
    ocrFields,
    fieldConfidences,
    ocrConfidence,
    expectedKeys,
    imageQuality,
    checksumValid,
    secondaryAgreement,
    extraRisks,
  } = input;

  const conflicts: string[] = [];
  const risks: RiskSignal[] = [];
  const reasons: string[] = [];
  const fields: Record<string, FieldDecision> = {};
  const warnings: string[] = [];

  const pushRisk = (code: string, severity: RiskSignal['severity'], message: string): void => {
    risks.push({ code, severity, message });
    if (severity === 'warning' || severity === 'critical') warnings.push(message);
  };

  const qrClean = qrFields ?? {};
  const ocrClean = ocrFields ?? {};
  const keySet = new Set<string>();
  for (const k of Object.keys(qrClean)) if (FIELD_KEY_RE.test(k)) keySet.add(k);
  for (const k of Object.keys(ocrClean)) if (FIELD_KEY_RE.test(k)) keySet.add(k);

  for (const key of keySet) {
    const qv = qrClean[key];
    const ov = ocrClean[key];
    const sources: string[] = [];
    if (qv) sources.push('qr');
    if (ov) sources.push('ocr');

    const hasQr = !!qv;
    const hasOcr = !!ov;
    const agree = hasQr && hasOcr ? valuesAgree(qv, ov) : false;

    if (hasQr && hasOcr && !agree) conflicts.push(`${key}_CONFLICT`);

    const ocrScore = (fieldConfidences?.[key] ?? ocrConfidence) / 100;
    const qrVerified = qrStatus === 'SIGNED_VERIFIED';
    const qrScore = qrVerified ? 0.99 : 0.7; // unverified QR: evidence, not truth

    let score = 0;
    if (hasQr && hasOcr) {
      score = agree || qrVerified ? Math.max(ocrScore, qrScore) * 1.05 : Math.min(ocrScore, 0.4);
    } else if (hasQr) {
      score = qrScore * (qrVerified ? 1 : 0.9);
    } else if (hasOcr) {
      score = ocrScore;
    }

    if (agree && hasQr && hasOcr) score += 0.1;
    if (secondaryAgreement?.[key]) score += 0.12;
    if (checksumValid?.[key]) score += 0.05;
    if (hasQr && hasOcr && !agree) score -= 0.25;

    const confidence = Math.round(clamp01(score) * 100) / 100;
    const value = qv && (!ov || agree || qrVerified) ? qv : ov;

    fields[key] = {
      key,
      value: value ? String(value) : undefined,
      confidence,
      sources,
      conflicts: hasQr && hasOcr && !agree ? [`${key}_CONFLICT`] : [],
    };
  }
  const values = Object.values(fields);
  const hasAnyField = values.length > 0;
  const aggregate =
    values.length > 0
      ? Math.round((values.reduce((acc, f) => acc + f.confidence, 0) / values.length) * 100) / 100
      : 0;

  // ── QR trust / risk signals ─────────────────────────────────────────────
  const qrHasFields = Object.keys(qrClean).some((k) => FIELD_KEY_RE.test(k) && !!qrClean[k]);
  if (qrHasFields) {
    if (qrStatus === 'SIGNATURE_INVALID') {
      pushRisk('QR_SIGNATURE_INVALID', 'critical', 'Aadhaar secure QR signature failed verification — do not trust QR-derived fields');
    } else if (qrStatus === 'UNVERIFIABLE') {
      pushRisk('QR_DECODED_BUT_NOT_VERIFIED', 'info', 'Aadhaar secure QR present but could not be cryptographically verified (no UIDAI public key configured)');
    } else if (qrStatus === 'DECODED_UNVERIFIED' || qrStatus == null) {
      pushRisk('QR_DECODED_BUT_NOT_VERIFIED', 'info', 'QR payload decoded but not cryptographically verified — treated as evidence only');
    }
  }

  // ── Document-type consistency ───────────────────────────────────────────
  const typeMismatch =
    !!declaredType &&
    !!detectedType &&
    declaredType !== 'OTHER' &&
    detectedType !== 'GENERIC' &&
    !typesEquivalent(declaredType, detectedType);
  if (typeMismatch) {
    pushRisk('DOCUMENT_TYPE_MISMATCH', 'warning', `Declared ${declaredType} but detected ${detectedType}`);
  }

  // ── Image quality ───────────────────────────────────────────────────────
  const qualityOverall = imageQuality?.overall;
  const qualityIssues = imageQuality?.issues ?? [];
  if (qualityOverall != null && qualityOverall < 0.35) {
    pushRisk('LOW_IMAGE_QUALITY', 'warning', `Image quality too low (${qualityOverall.toFixed(2)}) — OCR unreliable: ${qualityIssues.join(', ')}`);
  }

  // ── Checksums ───────────────────────────────────────────────────────────
  if (checksumValid) {
    for (const [key, valid] of Object.entries(checksumValid)) {
      if (key === 'extractedAadhaar' && !valid) {
        pushRisk('AADHAAR_CHECKSUM_INVALID', 'critical', 'Extracted Aadhaar number fails the Verhoeff checksum');
      }
    }
  }

  // ── Extra risks (e.g. PAN ambiguity) ────────────────────────────────────
  for (const r of extraRisks ?? []) pushRisk(r.code, r.severity, r.message);

  const hasConflicts = conflicts.length > 0;
  const critical = risks.some((r) => r.severity === 'critical');

  let needsReview =
    critical || hasConflicts || typeMismatch || (qualityOverall != null && qualityOverall < 0.35) || aggregate < 0.5;
  if (needsReview) {
    if (hasConflicts) reasons.push('conflicting values between independent sources');
    if (critical) reasons.push('critical risk signal present');
    if (typeMismatch) reasons.push('declared document type does not match detected type');
    if (qualityOverall != null && qualityOverall < 0.35) reasons.push('image quality below acceptable threshold');
    if (aggregate < 0.5) reasons.push(`aggregate field confidence ${aggregate.toFixed(2)} below 0.50`);
  }

  const unreadable =
    !hasAnyField || ((!fieldConfidences || Object.keys(fieldConfidences).length === 0) && ocrConfidence < 30 && !qrHasFields);

  let status: DecisionStatus;
  if (unreadable) {
    status = 'UNREADABLE';
    needsReview = false;
  } else if (needsReview) {
    status = 'NEEDS_REVIEW';
  } else if (values.length < expectedKeys.length) {
    status = 'PARTIAL';
  } else {
    status = 'EXTRACTED';
  }

  const riskScore =
    Math.round(
      Math.min(
        1,
        (hasConflicts ? Math.min(0.5, conflicts.length * 0.25) : 0) +
          (critical ? 0.4 : 0) +
          (typeMismatch ? 0.15 : 0) +
          (qualityOverall != null && qualityOverall < 0.35 ? 0.15 : 0) +
          (aggregate < 0.5 ? 0.2 : 0) +
          (qrHasFields && qrStatus !== 'SIGNED_VERIFIED' ? 0.1 : 0),
      ) * 100,
    ) / 100;

  return {
    status,
    confidence: aggregate,
    riskScore,
    needsReview,
    unreadable,
    partial: status === 'PARTIAL',
    fields,
    conflicts,
    risks,
    warnings,
    reasons: reasons.filter(Boolean),
  };
};