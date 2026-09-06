/**
 * Golden accuracy harness for the BSES OCR pipeline.
 *
 * Runs the REAL extraction path (pdf-parse render → prepareImage →
 * tesseract.js recognize → buildExtractedResult) against fixtures with
 * hand-curated ground truth and reports per-field accuracy.
 *
 * Ground truth is curated MANUALLY from the authoritative source (e.g. the
 * text layer of the source document); it is never auto-recorded from OCR.
 *
 * Usage (from services/document-service):
 *   node -r ..\..\node_modules\ts-node-dev\node_modules\ts-node\register scripts/ocr-golden.ts
 *
 * Environment:
 *   GOLDEN_MIN_ACCURACY   overall pass threshold (default 0.6)
 *
 * Output: scripts/ocr-golden-report.md + console summary; exit code 1 when
 * overall accuracy is below the threshold.
 */

import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { PDFParse } from 'pdf-parse';
import { DocumentType } from '@prisma/client';
import { prepareImage } from '../src/services/ocr/preprocess';
import {
  buildExtractedResult,
  selectBestCandidate,
  ExtractedData,
  EXPECTED_FIELD_KEYS,
} from '../src/services/ocr/extractors';

// ---------------------------------------------------------------------------
// Golden set (hand-curated ground truth)
// ---------------------------------------------------------------------------

interface GoldenField {
  key: string;
  /** expected printed value exactly as it appears on the document */
  golden: string;
  /** 'exact' after normalization; 'contains' for values OCR may garble */
  mode?: 'exact' | 'contains';
}

interface GoldenFixture {
  id: string;
  path: string;
  docType: DocumentType;
  detectedType: string;
  /** 'pdf': rasterize page 1 like the production path; 'image': raw file */
  kind: 'pdf' | 'image';
  fields: GoldenField[];
  note?: string;
}

const FIXTURES: GoldenFixture[] = [
  {
    id: 'adhar.pdf',
    path: path.resolve(__dirname, '..', 'test', 'fixtures', 'ADHAR.pdf'),
    docType: DocumentType.AADHAAR_CARD,
    detectedType: 'AADHAAR',
    kind: 'pdf',
    note: 'e-Aadhaar printout (text layer + Devanagari layout). Masked card: Aadhaar shortfall is expected by design.',
    fields: [
      { key: 'extractedName', golden: 'Pranav Dembla', mode: 'contains' },
      { key: 'extractedDob', golden: '05-04-2004', mode: 'contains' },
      { key: 'extractedAadhaar', golden: '8299', mode: 'contains' },
      { key: 'extractedPinCode', golden: '226017', mode: 'contains' },
    ],
  },
  {
    id: 'dl.pdf',
    path: path.resolve(__dirname, '..', 'test', 'fixtures', 'dl.pdf'),
    docType: DocumentType.ADDRESS_PROOF,
    detectedType: 'DRIVING_LICENSE',
    kind: 'pdf',
    note: 'DigiLocker driving licence (RTO Lucknow).',
    fields: [
      { key: 'extractedName', golden: 'PRANAV DEMBLA', mode: 'contains' },
      { key: 'extractedDob', golden: '05-04-2004', mode: 'contains' },
      { key: 'extractedLicenseNumber', golden: 'UP32 20220046117', mode: 'contains' },
      { key: 'extractedFatherName', golden: 'AJAY DEMBLA', mode: 'contains' },
      { key: 'extractedIssuingAuthority', golden: 'RTO', mode: 'contains' },
      { key: 'extractedIssueDate', golden: '05-11-2022', mode: 'contains' },
      { key: 'extractedValidity', golden: '04-04-2044', mode: 'contains' },
    ],
  },
];

const RENDER_DIMENSION = 1500;
const LANG_PATH = path.join(process.cwd(), 'assets');
const LANG = process.env.OCR_LANGUAGES ?? 'eng+hin';
const MIN_ACCURACY = Number(process.env.GOLDEN_MIN_ACCURACY ?? 0.6);
const REPORT_PATH = path.join(__dirname, 'ocr-golden-report.md');

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const normalize = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const compare = (field: GoldenField, actual: string | null | undefined): boolean => {
  if (actual == null || actual.length === 0) return false;
  const hay = normalize(actual);
  const needle = normalize(field.golden);
  if (needle.length === 0) return false;
  return field.mode === 'contains' ? hay.includes(needle) : hay === needle;
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface FieldScore {
  key: string;
  golden: string;
  actual: string;
  match: boolean;
}

interface FixtureScore {
  id: string;
  docType: DocumentType;
  expectedDetectedType: string;
  detectedTypeActual: string | null;
  detectedTypeOk: boolean;
  confidence: number | null;
  unreadable: boolean;
  needsReview: boolean;
  errors: string[];
  note: string | undefined;
  text: string;
  fields: FieldScore[];
}

const renderReport = (scores: FixtureScore[]): string => {
  const lines: string[] = [
    '# OCR golden accuracy report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Run method: production extraction path — pdf-parse getScreenshot (desiredWidth=${RENDER_DIMENSION}) → prepareImage → tesseract.js (lang=${LANG}) → buildExtractedResult. No upload / DB / auth / QR.`,
    `Threshold: ${MIN_ACCURACY * 100}%` + ` (override with GOLDEN_MIN_ACCURACY)`,
    '',
    '| Fixture | Detected | Conf | Unreadable | Review | Field score |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  const allFields = scores.flatMap((s) =>
    s.fields.map((f) => ({ ...f, fixture: s.id })),
  );
  const fieldAccuracy = new Map<string, { ok: number; total: number }>();
  for (const f of allFields) {
    const bucket = fieldAccuracy.get(f.key) ?? { ok: 0, total: 0 };
    bucket.total += 1;
    if (f.match) bucket.ok += 1;
    fieldAccuracy.set(f.key, bucket);
  }

  for (const s of scores) {
    const total = s.fields.length;
    const ok = s.fields.filter((f) => f.match).length;
    lines.push(
      `| ${s.id} | ${s.detectedTypeActual ?? '(none)'}${s.detectedTypeOk ? '' : ' ❌'} | ${s.confidence?.toFixed(1) ?? '—'} | ${s.unreadable ? 'yes' : 'no'} | ${s.needsReview ? 'yes' : 'no'} | ${ok}/${total} |`,
    );
  }

  lines.push('');
  lines.push('## Per-field accuracy');
  lines.push('');
  lines.push('| Field | Score |');
  lines.push('| --- | --- |');
  for (const [key, { ok, total }] of [...fieldAccuracy.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${ok}/${total} (${((ok / total) * 100).toFixed(0)}%) |`);
  }

  for (const s of scores) {
    lines.push('');
    lines.push(`## ${s.id}`);
    lines.push('');
    if (s.note) lines.push(`> ${s.note}`);
    if (s.errors.length > 0) {
      lines.push('- **Errors:**');
      for (const e of s.errors) lines.push(`  - \`${e}\``);
    }
    lines.push(`- **Detected type:** ${s.detectedTypeActual ?? '(none)'} (expected ${s.expectedDetectedType}, match=${s.detectedTypeOk})`);
    lines.push(`- **OCR confidence:** ${s.confidence?.toFixed(1) ?? '—'}`);
    lines.push(`- **Flagged unreadable:** ${s.unreadable}`);
    lines.push(`- **Needs manual review:** ${s.needsReview}`);
    lines.push('- **Field-by-field:**');
    lines.push('  | Field | Expected | Got | Match |');
    lines.push('  | --- | --- | --- | --- |');
    for (const f of s.fields) {
      lines.push(`  | ${f.key} | \`${f.golden}\` | \`${f.actual || '(missing)'}\` | ${f.match ? '✅' : '❌'} |`);
    }
    if (s.text) {
      const max = 1200;
      const excerpt = s.text.length > max ? `${s.text.slice(0, max)}\n…(truncated ${s.text.length - max} chars)` : s.text;
      lines.push('');
      lines.push('  **Raw OCR text (winner candidate):**');
      lines.push('');
      lines.push('  ```');
      for (const line of excerpt.split('\n')) lines.push(`  ${line}`);
      lines.push('  ```');
    }
  }

  const overall = allFields.length;
  const overallOk = allFields.filter((f) => f.match).length;
  const overallRate = overall === 0 ? 0 : overallOk / overall;
  lines.push('');
  lines.push(`## Overall: ${overallOk}/${overall} (${(overallRate * 100).toFixed(1)}%) — ${overallRate >= MIN_ACCURACY ? 'PASS' : 'FAIL'}`);
  lines.push('');

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface ScoredRaw {
  text: string;
  confidence: number;
  unreadable: boolean;
  needsReview: boolean;
  lowConfidenceFields: string[];
  extracted: ExtractedData;
}

const runFixture = async (
  worker: Awaited<ReturnType<typeof createWorker>>,
  fx: GoldenFixture,
): Promise<ScoredRaw> => {
  let raw: Buffer;
  if (fx.kind === 'pdf') {
    const parser = new PDFParse({
      data: fs.readFileSync(fx.path),
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: false,
    });
    const shot = await parser.getScreenshot({
      partial: [1],
      desiredWidth: RENDER_DIMENSION,
      imageDataUrl: false,
      imageBuffer: true,
    });
    await parser.destroy();
    const data = shot.pages[0]?.data;
    raw = Buffer.from(data ?? new Uint8Array());
  } else {
    raw = fs.readFileSync(fx.path);
  }

  const prep = await prepareImage(raw);
  const candidates: Buffer[] = [prep.deskewedBuffer];
  if (prep.atBoundary) candidates.push(prep.flatBuffer);

  const results = [];
  for (const candidate of candidates) {
    const { data } = await worker.recognize(candidate);
    results.push({
      text: data.text ?? '',
      confidence: data.confidence ?? 0,
      extracted: buildExtractedResult(data.text ?? '', data.confidence ?? 0, fx.docType),
    });
  }
  const winner = selectBestCandidate(results);

  const merged = { ...winner.extracted };
  return {
    text: winner.text,
    confidence: winner.confidence,
    unreadable: merged.isUnreadable ?? false,
    needsReview: (merged as { needsReview?: boolean }).needsReview ?? false,
    lowConfidenceFields: (merged as { lowConfidenceFields?: string[] }).lowConfidenceFields ?? [],
    extracted: merged,
  };
};

const getField = (d: ExtractedData, key: string): string | null | undefined =>
  (d as unknown as Record<string, string | null | undefined>)[key];

const run = async (): Promise<void> => {
  console.log(`Golden run: ${FIXTURES.length} fixtures, lang=${LANG}, min accuracy=${MIN_ACCURACY}`);
  const scores: FixtureScore[] = [];

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(LANG, 1, {
      langPath: LANG_PATH,
      cacheMethod: 'none',
      gzip: true,
      logger: () => {},
    });
    console.log('Tesseract worker ready');

    for (const fx of FIXTURES) {
      const score: FixtureScore = {
        id: fx.id,
        docType: fx.docType,
        expectedDetectedType: fx.detectedType,
        detectedTypeActual: null,
        detectedTypeOk: false,
        confidence: null,
        unreadable: true,
        needsReview: false,
        errors: [],
        note: fx.note ?? undefined,
        text: '',
        fields: [],
      };
      try {
        const r = await runFixture(worker, fx);
        score.confidence = r.confidence;
        score.unreadable = r.unreadable;
        score.needsReview = r.needsReview;
        score.text = r.text;
        score.detectedTypeActual = r.extracted.detectedType ?? null;
        score.detectedTypeOk = (r.extracted.detectedType ?? '') === fx.detectedType;
        score.fields = fx.fields.map((g) => ({
          key: g.key,
          golden: g.golden,
          actual: String(getField(r.extracted, g.key) ?? ''),
          match: compare(g, getField(r.extracted, g.key)),
        }));
        console.log(
          `  [${fx.kind}] ${fx.id}: conf=${r.confidence.toFixed(1)}, detected=${r.extracted.detectedType}, ` +
            `fields=${score.fields.filter((f) => f.match).length}/${score.fields.length}`,
        );
      } catch (err) {
        score.errors.push(err instanceof Error ? (err.stack ?? err.message) : String(err));
        console.error(`  ERROR ${fx.id}: ${err instanceof Error ? err.message : err}`);
      }
      scores.push(score);
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

  const all = scores.flatMap((s) => s.fields);
  const overall = all.length === 0 ? 0 : all.filter((f) => f.match).length / all.length;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, renderReport(scores), 'utf8');
  console.log(`\nOverall accuracy: ${(overall * 100).toFixed(1)}%`);
  console.log(`Report written to ${REPORT_PATH}`);
  if (overall < MIN_ACCURACY) {
    console.error(`Below threshold ${MIN_ACCURACY * 100}% — FAIL`);
    process.exit(1);
  }
  console.log(`At/above threshold ${MIN_ACCURACY * 100}% — PASS`);
};

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});