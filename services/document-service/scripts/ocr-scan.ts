/**
 * One-off OCR pipeline scan against real-world ID document photos.
 *
 * Runs the EXISTING extraction pipeline directly (QR-first):
 *   qr.ts (decodeQrFromImage) -> qrPayload.ts (parseQrPayload)   [authoritative]
 *   preprocess.ts (prepareImage) -> tesseract.js recognize       [gap filling]
 *   qrMerge.ts (mergeQrAndOcr)  per-field, QR wins on conflict
 *
 * It does NOT touch the HTTP upload flow, MongoDB/GridFS, Postgres, or auth.
 * Per-image failures are logged and skipped; the run never aborts.
 *
 * Usage (from services/document-service):
 *   node -r ..\..\node_modules\ts-node-dev\node_modules\ts-node\register scripts/ocr-scan.ts
 *
 * Output: scripts/ocr-scan-report.md + console summary.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { DocumentType } from '@prisma/client';
import { prepareImage } from '../src/services/ocr/preprocess';
import {
  buildExtractedResult,
  selectBestCandidate,
  ExtractedData,
  EXPECTED_FIELD_KEYS,
} from '../src/services/ocr/extractors';
import { decodeQrFromImage } from '../src/services/ocr/qr';
import { parseQrPayload, QrPayloadFormat } from '../src/services/ocr/qrPayload';
import { mergeQrAndOcr, TRACKED_FIELD_KEYS } from '../src/services/ocr/qrMerge';

// ---------------------------------------------------------------------------
// Image roster
// ---------------------------------------------------------------------------
const IMAGES: Array<{ file: string; docType: DocumentType; note: string }> = [
  { file: 'Aadhaar_example_3.webp', docType: DocumentType.AADHAAR_CARD, note: '' },
  { file: 'aadhar_example.webp', docType: DocumentType.AADHAAR_CARD, note: '' },
  { file: 'aadhar_example_2.webp', docType: DocumentType.AADHAAR_CARD, note: '' },
  { file: 'DL_example.jpg', docType: DocumentType.ADDRESS_PROOF, note: 'driving licence' },
  { file: 'DL_example_2.jpg', docType: DocumentType.ADDRESS_PROOF, note: 'driving licence' },
  { file: 'pan_example.jpg', docType: DocumentType.PAN_CARD, note: '' },
  { file: 'pan_example_2.webp', docType: DocumentType.PAN_CARD, note: '' },
];

const IMAGE_DIR = path.resolve(process.cwd(), '..', '..'); // repo root (project images live here)
const LANG_PATH = path.join(process.cwd(), 'assets');
const REPORT_PATH = path.join(__dirname, 'ocr-scan-report.md');

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------
interface ImageReport {
  file: string;
  docType: DocumentType;
  note: string;
  meta?: { format: string; width: number; height: number };
  preprocess?: {
    width: number;
    height: number;
    skewAngle: number;
    atBoundary: boolean;
    inkRatio: number;
    issues: string[];
  };
  qr?: {
    format: QrPayloadFormat | 'none';
    hasPhoto: boolean;
    fields: ExtractedData;
    errors: string[];
    raw?: string;
  };
  fieldSources?: Record<string, 'qr' | 'ocr'>;
  ocrSkipped?: boolean;
  candidatePicks?: string;
  confidence?: number;
  text?: string;
  unreadable: boolean;
  needsReview: boolean;
  lowConfidenceFields: string[];
  extracted: ExtractedData;
  error?: string;
}

const EXTRACTED_LABELS: Array<[keyof ExtractedData, string]> = [
  ['extractedName', 'Name'],
  ['extractedDob', 'DOB'],
  ['extractedYearOfBirth', 'YOB'],
  ['extractedGender', 'Gender'],
  ['extractedAadhaar', 'Aadhaar'],
  ['extractedPan', 'PAN'],
  ['extractedFatherName', "Father's name"],
  ['extractedAddress', 'Address'],
  ['extractedLicenseNumber', 'Licence number'],
  ['extractedValidity', 'Validity'],
];

const extractNonEmpty = (d: ExtractedData): Array<[string, string]> =>
  EXTRACTED_LABELS.filter(([k]) => d[k]).map(([k, label]) => [label, String(d[k])]);

const renderReport = (reports: ImageReport[]): string => {
  const lines: string[] = [
    '# OCR pipeline scan — real-world ID documents',
    '',
    `Generated: ${new Date().toISOString()}`,
    'Run method: direct call into the QR-first pipeline (`decodeQrFromImage` → `parseQrPayload`; `prepareImage` → tesseract.js `recognize`; `mergeQrAndOcr` per-field, QR wins on conflict) — no upload / DB / auth.',
    '',
    '| File | Detected type | QR | Confidence | Unreadable | Needs review | Fields extracted |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of reports) {
    const fields = extractNonEmpty(r.extracted).map(([label]) => label).join(', ') || '(none)';
    const low = r.lowConfidenceFields.length > 0 ? ` (low-conf: ${r.lowConfidenceFields.join(', ')})` : '';
    const qrLabel = r.qr ? (r.qr.format === 'none' ? 'none' : r.qr.format) : '—';
    lines.push(
      `| ${r.file} | ${r.docType} | ${qrLabel} | ${r.confidence !== undefined ? r.confidence.toFixed(1) : '—'} | ${r.unreadable ? 'yes' : 'no'} | ${r.needsReview ? 'yes' : 'no'} | ${fields}${low} |`,
    );
  }

  lines.push('');
  for (const r of reports) {
    lines.push(`## ${r.file}`);
    lines.push('');
    lines.push(`- **Detected document type:** ${r.docType}${r.note ? ` (${r.note})` : ''}`);
    if (r.error) {
      lines.push(`- **ERROR:** ${r.error}`);
    }
    if (r.meta) {
      lines.push(`- **Image:** ${r.meta.format}, ${r.meta.width}x${r.meta.height}`);
    }
    if (r.preprocess) {
      const p = r.preprocess;
      lines.push(
        `- **Preprocess:** resized to ${p.width}x${p.height}, ` +
          `skew estimate ${p.skewAngle.toFixed(1)}°, at scan boundary ${p.atBoundary ? 'yes' : 'no'}, ` +
          `ink ratio ${(p.inkRatio * 100).toFixed(2)}%`,
      );
      if (p.issues.length) {
        lines.push(`- **Preprocess issues:** ${p.issues.join('; ')}`);
      }
    }
    if (r.qr) {
      const q = r.qr;
      if (q.format === 'none') {
        lines.push(`- **QR:** none found`);
      } else {
        lines.push(`- **QR:** ${q.format}${q.hasPhoto ? ' (contains photo — omitted from report)' : ''}`);
        if (q.errors.length > 0) lines.push(`- **QR parse notes:** ${q.errors.join('; ')}`);
        const qrFields = extractNonEmpty(q.fields);
        if (qrFields.length > 0) {
          lines.push(`- **QR fields:**`);
          for (const [label, value] of qrFields) lines.push(`  - **${label}:** ${value}`);
        }
      }
    }
    if (r.ocrSkipped) lines.push(`- **OCR skipped:** QR covered every expected field`);
    if (r.candidatePicks) lines.push(`- **OCR variant selection:** ${r.candidatePicks}`);
    lines.push(`- **OCR confidence:** ${r.confidence !== undefined ? r.confidence.toFixed(1) : '—'}`);
    lines.push(`- **Flagged unreadable:** ${r.unreadable ? 'yes' : 'no'}`);
    lines.push(`- **Needs manual review:** ${r.needsReview ? 'yes' : 'no'}`);
    if (r.lowConfidenceFields.length > 0) {
      lines.push(`- **Low-confidence fields:** ${r.lowConfidenceFields.join(', ')}`);
    }
    lines.push(`- **Fields extracted (source):**`);
    const present = EXTRACTED_LABELS.filter(([k]) => r.extracted[k]);
    if (present.length === 0) {
      lines.push('  - (none)');
    } else {
      for (const [key, label] of present) {
        const source = r.fieldSources?.[key] ? r.fieldSources[key] : '—';
        lines.push(`  - **${label}:** ${String(r.extracted[key])} \`[${source}]\``);
      }
    }
    if (r.text !== undefined) {
      const max = 1500;
      const excerpt = r.text.length > max ? `${r.text.slice(0, max)}\n…(truncated ${r.text.length - max} chars)` : r.text;
      lines.push('');
      lines.push(`**Raw OCR text (${r.text.length} chars):**`);
      lines.push('');
      lines.push('```');
      lines.push(excerpt);
      lines.push('```');
    }
    if (r.qr?.raw) {
      const max = 1200;
      const excerpt = r.qr.raw.length > max ? `${r.qr.raw.slice(0, max)}\n…(truncated ${r.qr.raw.length - max} chars)` : r.qr.raw;
      lines.push('');
      lines.push(`**Raw QR payload (${r.qr.raw.length} chars):**`);
      lines.push('');
      lines.push('```');
      lines.push(excerpt);
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const run = async (): Promise<void> => {
  console.log(`OCR scan: ${IMAGES.length} images, langPath=${LANG_PATH}`);
  const reports: ImageReport[] = [];

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker('eng', 1, {
      langPath: LANG_PATH,
      cacheMethod: 'none',
      gzip: true,
      logger: () => {},
    });
    console.log('Tesseract worker ready');

    for (const { file, docType, note } of IMAGES) {
      const imagePath = path.join(IMAGE_DIR, file);
      const report: ImageReport = {
        file,
        docType,
        note,
        unreadable: true,
        needsReview: false,
        lowConfidenceFields: [],
        extracted: { isUnreadable: true },
      };

      try {
        console.log(`\n=== ${file} (${docType}) ===`);
        const input = fs.readFileSync(imagePath);
        const meta = await sharp(input, { failOn: 'none' }).metadata();
        report.meta = {
          format: meta.format ?? 'unknown',
          width: meta.width ?? 0,
          height: meta.height ?? 0,
        };
        console.log(`  meta: ${report.meta.format} ${report.meta.width}x${report.meta.height}`);

        const prep = await prepareImage(input);
        const issues: string[] = [];
        if (prep.inkRatio < 0.005) issues.push('binarized ink ratio very low — likely blank/blurred, Otsu may have flattened text');
        if (prep.inkRatio > 0.5) issues.push('binarized ink ratio very high — dark image, Otsu threshold may be wrong');
        if (Math.abs(prep.skewAngle) > 6) issues.push(`large rotation applied: ${prep.skewAngle.toFixed(1)}°`);
        if (prep.atBoundary) issues.push('skew estimate at scan boundary — trying flat AND deskewed OCR variants');
        report.preprocess = {
          width: prep.width,
          height: prep.height,
          skewAngle: prep.skewAngle,
          atBoundary: prep.atBoundary,
          inkRatio: prep.inkRatio,
          issues,
        };
        console.log(
          `  preprocess: ${prep.width}x${prep.height} skew=${prep.skewAngle.toFixed(1)}° boundary=${prep.atBoundary} ink=${(prep.inkRatio * 100).toFixed(2)}%`,
        );

        // ── QR-first ────────────────────────────────────────────────────────
        const qrCandidates = [input, prep.deskewedBuffer];
        if (prep.atBoundary) qrCandidates.push(prep.flatBuffer);
        const qrRaw = await decodeQrFromImage(qrCandidates);
        const qr = qrRaw ? parseQrPayload(qrRaw) : null;
        const qrFields = qr && TRACKED_FIELD_KEYS.some((k) => qr.fields[k]) ? qr.fields : null;
        const qrComplete = qrFields !== null && EXPECTED_FIELD_KEYS[docType].every((k) => qrFields[k]);
        report.qr = {
          format: qr ? qr.format : 'none',
          hasPhoto: qr?.hasPhoto ?? false,
          fields: qr?.fields ?? { isUnreadable: true },
          errors: qr?.errors ?? [],
          ...(qr ? { raw: qr.raw } : {}),
        };
        console.log(
          `  QR: ${qr ? `${qr.format} (${extractNonEmpty(qr.fields).map(([l]) => l).join(', ') || 'no fields'})` : 'none found'}`,
        );

        let text: string;
        let confidence: number;
        let merged;
        if (qrComplete) {
          // QR authoritative + complete → no OCR cycle.
          text = qr?.raw ?? '';
          confidence = 99;
          merged = mergeQrAndOcr({ qr: qrFields, ocr: null, docType });
          report.ocrSkipped = true;
          console.log(`  QR covers all expected fields — OCR skipped`);
        } else {
          const candidates: Buffer[] = [prep.deskewedBuffer];
          if (prep.atBoundary) candidates.push(prep.flatBuffer);
          const results = [];
          for (const candidate of candidates) {
            const { data } = await worker!.recognize(candidate);
            results.push({
              text: data.text ?? '',
              confidence: data.confidence ?? 0,
              variant: candidate === prep.deskewedBuffer ? 'deskewed' : 'flat',
            });
          }
          const winner = selectBestCandidate(
            results.map((r) => ({
              text: r.text,
              confidence: r.confidence,
              extracted: buildExtractedResult(r.text, r.confidence, docType),
            })),
          );
          const winnerVariant = results.find((r) => r.text === winner.text)?.variant ?? 'deskewed';
          if (candidates.length > 1) {
            report.candidatePicks =
              `compared ${candidates.length} variants; picked ${winnerVariant} ` +
              `(fields=${extractNonEmpty(winner.extracted).length}, conf=${winner.confidence.toFixed(1)})`;
            console.log(`  variants compared; picked ${winnerVariant}`);
          }

          text = winner.text;
          confidence = winner.confidence;
          merged = mergeQrAndOcr({ qr: qrFields, ocr: winner.extracted, docType });
          console.log(`  OCR confidence=${confidence.toFixed(1)} text=${text.length} chars`);
        }

        report.confidence = confidence;
        report.text = text;
        report.unreadable = merged.isUnreadable;
        report.needsReview = merged.needsReview ?? false;
        report.lowConfidenceFields = merged.lowConfidenceFields ?? [];
        report.fieldSources = merged.fieldSources ?? {};
        report.extracted = merged;
        console.log(
          `  extracted: ${extractNonEmpty(merged).map(([l, v]) => `${l}=${v}`).join(' | ') || '(none)'}` +
            `${merged.needsReview ? '  [NEEDS REVIEW]' : ''}` +
            `${report.lowConfidenceFields.length ? `  [low-conf: ${report.lowConfidenceFields.join(', ')}]` : ''}`,
        );
      } catch (err) {
        report.error = err instanceof Error ? err.stack ?? err.message : String(err);
        console.error(`  ERROR for ${file}: ${err instanceof Error ? err.message : err}`);
      }

      reports.push(report);
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, renderReport(reports), 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
};

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
