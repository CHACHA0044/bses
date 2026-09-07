import path from 'path';
import { createWorker, setLogging, OEM, PSM } from 'tesseract.js';
import pLimit from 'p-limit';
import { ObjectId } from 'mongodb';
import type { PDFParse } from 'pdf-parse';
import { getGridFSBucket } from '../db/mongo.client';
import { getPrismaClient } from '../db/db.client';
import { encryptionService, createLogger } from '@bses/shared';
import { DocumentType, Prisma, OcrJobStatus } from '@prisma/client';
import { buildExtractedResult, selectBestCandidate, OcrCandidateResult, ExtractedData, EXPECTED_FIELD_KEYS } from './ocr/extractors';
import type { PreparedImage } from './ocr/preprocess';
import { parseQrPayload } from './ocr/qrPayload';
import { mergeQrAndOcr, MergedExtraction, TRACKED_FIELD_KEYS } from './ocr/qrMerge';
import { notificationClient } from './notification.client';
import { config } from '../config';

const logger = createLogger({ service: 'ocr-service' });

// ── Tuning (bounded in-memory queue; DB is the durable job store) ──────────
const MAX_PDF_PAGES = config.OCR_PDF_MAX_PAGES;
const WORKER_COUNT = config.OCR_WORKERS;
const MAX_ATTEMPTS = config.OCR_MAX_ATTEMPTS;
const RETRY_BACKOFF_MS = config.OCR_RETRY_BACKOFF_MS;
const LANGUAGES = config.OCR_LANGUAGES;
const RENDER_DIMENSION = config.OCR_PDF_RENDER_DIMENSION;
const RECOVERY_BATCH = config.OCR_RECOVERY_BATCH;
const ENGINE_IDLE_TIMEOUT_MS = config.OCR_ENGINE_IDLE_TIMEOUT_MS;

/**
 * In-memory, bounded work queue. `enqueue` returns quickly (after persistence)
 * and `start` consumes at most `WORKER_COUNT` concurrent jobs. If the process
 * is restarted mid-queue, every row left in PROCESSING (or enqueued but not
 * seen) is re-queued by the boot-time recovery sweep. This is therefore an
 * optimization, not the source of truth — the database is.
 */
const limiter = pLimit(WORKER_COUNT);

// ── Lazy Tesseract engine pool ─────────────────────────────────────────────
// Workers are created only on first image/PDF-raster OCR run (never for a
// syntactic PDF text pull) and torn down on graceful shutdown, so a service
// that only ever handles born-digital PDFs holds zero engine memory.
//
// The engine is also released after ENGINE_IDLE_TIMEOUT_MS of inactivity: the
// Tesseract WASM heap can be large, and on the 512 MB free tier an OCR worker
// that sits warm between sparse uploads wastes memory for no benefit. Any use
// (job start) refreshes the idle deadline before acquire.
const langPath = path.resolve(__dirname, '..', '..', 'assets');

// Lazy importers for heavy modules — sharp (~40 MB) and pdf-parse/pdfjs (~30 MB)
// are only loaded when an actual image or PDF job runs, keeping the idle baseline
// low enough for the 512 MB free-tier budget.

let PDFParseCtor: typeof PDFParse | null = null;
const getPdfParse = async (): Promise<typeof PDFParse> => {
  if (!PDFParseCtor) {
    const mod = await import('pdf-parse');
    PDFParseCtor = ((mod as any).PDFParse ?? (mod as any).default?.PDFParse ?? (mod as any).default) as typeof PDFParse;
  }
  return PDFParseCtor as typeof PDFParse;
};

let prepareImageFn: ((input: Buffer) => Promise<PreparedImage>) | null = null;
const getPrepareImage = async (): Promise<(input: Buffer) => Promise<PreparedImage>> => {
  if (!prepareImageFn) {
    const mod = await import('./ocr/preprocess');
    prepareImageFn = mod.prepareImage;
  }
  return prepareImageFn;
};

let decodeQrFn: ((inputs: Buffer[]) => Promise<string | null>) | null = null;
const getDecodeQr = async (): Promise<(inputs: Buffer[]) => Promise<string | null>> => {
  if (!decodeQrFn) {
    const mod = await import('./ocr/qr');
    decodeQrFn = mod.decodeQrFromImage;
  }
  return decodeQrFn;
};
let workers: Tesseract.Worker[] = [];
let engineReady = false;
let engineStarting: Promise<void> | null = null;
let lastEngineUseAt = 0;
let idleTimer: NodeJS.Timeout | null = null;

const refreshEngineDeadline = (): void => {
  lastEngineUseAt = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void shutdownOcrEngine();
  }, ENGINE_IDLE_TIMEOUT_MS);
  idleTimer.unref();
};

const ensureEngine = async (): Promise<void> => {
  if (engineReady) {
    refreshEngineDeadline();
    return;
  }
  if (engineStarting) {
    await engineStarting;
    refreshEngineDeadline();
    return;
  }
  engineStarting = (async () => {
    try {
      setLogging(false);
      const langs = LANGUAGES || 'eng';
      workers = [];
      for (let i = 0; i < WORKER_COUNT; i++) {
        const w = await createWorker(langs, OEM.LSTM_ONLY, {
          langPath,
          cacheMethod: 'none',
          gzip: true,
          logger: (m) => logger.debug('Tesseract Progress', m),
        });
        workers.push(w);
      }
      engineReady = true;
      logger.info(`OCR engine ready: ${WORKER_COUNT} workers, langs=${langs}`);
    } finally {
      engineStarting = null;
    }
    refreshEngineDeadline();
  })();
  return engineStarting;
};

/** Reliably get a worker (selected round-robin) once the pool is up. */
const acquireWorker = async (index: number): Promise<Tesseract.Worker> => {
  await ensureEngine();
  refreshEngineDeadline();
  return workers[index % workers.length]!;
};

export const shutdownOcrEngine = async (): Promise<void> => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  limiter.clearQueue();
  const pending = workers.splice(0);
  workers = [];
  engineReady = false;
  if (pending.length) {
    await Promise.allSettled(pending.map((w) => w.terminate()));
    logger.info(`OCR engine released (${pending.length} worker(s) terminated)`);
  }
};

// ── Per-page PDF metadata (no field values — never raw PII) ────────────────
export interface OcrPageResult {
  page: number;
  kind: 'syntactic' | 'raster' | 'empty';
  status: 'ok' | 'failed' | 'empty';
  confidence?: number;
  textLength?: number;
}

const today = (): Date => new Date();

/** Draws nothing — an OCR result with zero usable extraction. */
const emptyMeta = (): ExtractedDataWithMeta => {
  const extracted = {
    isUnreadable: true,
    needsReview: false,
    lowConfidenceFields: [] as string[],
    fieldSources: {} as Record<string, string>,
  } as ExtractedData;
  return { extracted, ocrConfidence: 0, text: '' };
};

const asJsonOrNull = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => {
  if (v == null) return Prisma.DbNull;
  if (Array.isArray(v)) return v.length > 0 ? (v as Prisma.InputJsonValue) : Prisma.DbNull;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return Prisma.DbNull;
  return v as Prisma.InputJsonValue | typeof Prisma.DbNull;
};

/**
 * Builds the extraction result for a single OCR pass (unreadable-aware).
 */
const buildCandidateResult = (
  text: string,
  confidence: number,
  docType: DocumentType,
): OcrCandidateResult => ({
  text,
  confidence,
  extracted: buildExtractedResult(text, confidence, docType),
});

/**
 * A confident QR read that covers every expected field for the document type
 * is authoritative — the image is not sent through the (much slower) OCR pass
 * at all. Confidence 99 reflects that the data was read deterministically from
 * the card's own encoding rather than inferred from pixels.
 */
const QR_CONFIDENCE = 99;

export interface ExtractedDataWithMeta {
  extracted: ExtractedData;
  ocrConfidence: number;
  text: string;
}

/** Page segmentation mode per document type: ID cards are roughly one block
 *  of fixed-layout text, whereas bills/affidavits are free-flowing columns. */
const PAGE_SEG_MODE: Partial<Record<DocumentType, Tesseract.PSM>> = {
  AADHAAR_CARD: PSM.SINGLE_BLOCK,
  PAN_CARD: PSM.SINGLE_BLOCK,
  ADDRESS_PROOF: PSM.SINGLE_BLOCK,
  OWNERSHIP_PROOF: PSM.AUTO,
  AFFIDAVIT: PSM.AUTO,
  OTHER: PSM.AUTO,
};

/**
 * OCR a single rendered image (rasterized PDF page or standalone photo).
 * `page`/`kind` are metadata only and are never stored as field values.
 */
const recognizeBuffer = async (
  candidate: Buffer,
  docType: DocumentType,
  workerIndex: number,
): Promise<OcrCandidateResult> => {
  const worker = await acquireWorker(workerIndex);
  const psm = PAGE_SEG_MODE[docType];
  if (psm) {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
    } catch (err) {
      logger.debug(`setParameters(PSM=${psm}) failed for ${docType}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const { data } = await worker.recognize(candidate);
  return buildCandidateResult(data.text ?? '', data.confidence ?? 0, docType);
};

/**
 * Deterministic, honest confidence for a born-digital PDF. Never hardcoded.
 * Starts from Greek-letter/quadratic-grade baseline and is scaled down by:
 *   - how empty the extracted text is, and
 *   - how many expected fields are still missing.
 */
const computePdfConfidence = (text: string, extracted: ExtractedData, docType: DocumentType): number => {
  const textLength = text.trim().length;
  const expected = EXPECTED_FIELD_KEYS[docType] ?? [];
  const present = expected.filter((k) => extracted[k as keyof ExtractedData]).length;
  const coverage = expected.length ? present / expected.length : 1;
  const grammarBase = textLength >= 300 ? 88 : textLength >= 120 ? 84 : textLength >= 40 ? 78 : 60;
  return Math.max(0, Math.min(99, Math.round(grammarBase * (0.4 + 0.6 * coverage))));
};

export class OcrService {
  private get prisma() {
    return getPrismaClient();
  }

  /**
   * Fires the "Document verification pending" notification the first time a
   * document reaches a manual-attention state (UNREADABLE / NEEDS_REVIEW /
   * FAILED). `previousStatus` is the durable state captured BEFORE the current
   * update, so a retried job that lands back on the same terminal state does
   * not re-notify (no spam). Never throws — a notification failure must not
   * fail the OCR job.
   */
  private async notifyIfNeeded(
    documentId: string,
    previousStatus: string | null | undefined,
    newStatus: OcrJobStatus,
  ): Promise<void> {
    const needed = newStatus === 'UNREADABLE' || newStatus === 'NEEDS_REVIEW' || newStatus === 'FAILED';
    if (!needed) return;
    if (previousStatus === newStatus) return;
    try {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
        include: {
          connectionRequest: { select: { applicationNumber: true } },
          user: { select: { mobileEncrypted: true } },
        },
      });
      if (!doc || !doc.user?.mobileEncrypted || !doc.connectionRequest) return;
      const mobile = encryptionService.decrypt(doc.user.mobileEncrypted);
      if (!mobile) return;
      await notificationClient.notifyDocumentVerificationPending(
        mobile,
        doc.connectionRequest.applicationNumber,
        doc.userId,
      );
    } catch (err) {
      logger.error(`Notification dispatch failed after OCR for ${documentId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Job lifecycle (DB-backed) ────────────────────────────────────────────

  /** Marks a document PENDING and schedules it for processing. Idempotent. */
  public async enqueue(documentId: string): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { ocrStatus: OcrJobStatus.PENDING, ocrNextAttemptAt: today() },
    });
    void this.processNow(documentId).catch(() => {
      /* fire-and-forget: the recovery sweep re-queues if the process dies */
    });
  }

  /**
   * Runs the full durable OCR pipeline for one document and awaits its
   * completion. Used by the recovery sweep and available to tests/backfills.
   */
  public async processNow(documentId: string): Promise<void> {
    await limiter(async () => this.runJob(documentId));
  }

  /**
   * Re-queues rows that are PENDING, or PROCESSING/started and never reached a
   * terminal state (crashed/restarted mid-job). Rows that already finished OCR
   * (`ocr_confidence` set, e.g. legacy rows before the job-state migration) are
   * left alone.
   *
   * Batch-bounded: only `RECOVERY_BATCH` documents are re-queued per sweep so a
   * large interrupted backlog cannot flood the in-memory queue (and therefore
   * memory) on a 512 MB container. Remaining rows are picked up by subsequent
   * sweeps (the 5-minute recovery interval re-scans everything).
   */
  public async recoverInterruptedJobs(): Promise<number> {
    let recovered = 0;
    const stale = await this.prisma.document.findMany({
      where: {
        OR: [
          { ocrStatus: OcrJobStatus.PENDING },
          { ocrStatus: OcrJobStatus.PROCESSING, ocrStartedAt: { lt: today() } },
        ],
      },
      select: { id: true, ocrStatus: true, ocrConfidence: true },
      orderBy: { ocrStartedAt: 'asc' },
      take: RECOVERY_BATCH,
    });
    const jobs: Promise<void>[] = [];
    for (const d of stale) {
      if (d.ocrConfidence != null && d.ocrStatus === OcrJobStatus.PENDING) continue;
      recovered++;
      // A stale PROCESSING row can never be re-run while it still says
      // PROCESSING (runJob bails on those) — reset it to PENDING so the retry
      // actually happens instead of silently skipping every recovered row.
      if (d.ocrStatus === OcrJobStatus.PROCESSING) {
        await this.prisma.document.update({
          where: { id: d.id },
          data: { ocrStatus: OcrJobStatus.PENDING, ocrStartedAt: null },
        });
      }
      jobs.push(
        this.processNow(d.id).catch(() => {
          /* recovery is best-effort */
        }),
      );
    }
    // Wait for this batch before returning so the next sweep can't overlap it
    // (prevents unbounded concurrent recovery queues).
    if (jobs.length) await Promise.allSettled(jobs);
    return recovered;
  }

  // ── Single document pipeline ─────────────────────────────────────────────

  /**
   * Runs the OCR pipeline for one document. Bounded retries: infrastructure
   * failures (engine down, decode error) mark the row FAILED once MAX_ATTEMPTS
   * is reached — which is NOT the same as an unreadable document (that stays
   * `isUnreadable` true but is a quality verdict).
   */
  private async runJob(documentId: string): Promise<void> {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
      });
      if (!doc) return;
      if (doc.ocrStatus === 'PROCESSING') return;
      const previousStatus = doc.ocrStatus;

      const attempt = (doc.ocrAttempts ?? 0) + 1;
      const hasLanguage = doc.ocrLanguages || LANGUAGES;
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: OcrJobStatus.PROCESSING,
          ocrAttempts: attempt,
          ocrStartedAt: today(),
          ocrNextAttemptAt: null,
          ocrLanguages: hasLanguage.slice(0, 50),
          ocrLastError: null,
        },
      });

      const startedAt = Date.now();
      let meta: ExtractedDataWithMeta;
      try {
        meta = await this.runPipeline(documentId, doc.mimeType, doc.documentType, doc.gridfsFileId);
      } catch (err) {
        logger.error(`OCR pipeline failed for ${documentId}`, { error: tryString(err) });
        await this.fail(documentId, tryString(err));
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const status: OcrJobStatus = meta.extracted.isUnreadable
        ? OcrJobStatus.UNREADABLE
        : meta.extracted.needsReview
          ? OcrJobStatus.NEEDS_REVIEW
          : meta.extracted.lowConfidenceFields && meta.extracted.lowConfidenceFields.length > 0
            ? OcrJobStatus.NEEDS_REVIEW
            : OcrJobStatus.EXTRACTED;

      const fieldDetails: Record<string, { confidence: number; source: string | 'unknown' }> = {};
      const confidences = meta.extracted.fieldConfidences ?? {};
      const sources = meta.extracted.fieldSources ?? {};
      for (const key of Object.keys(confidences)) {
        fieldDetails[key] = { confidence: confidences[key] ?? 0, source: sources[key] ?? 'unknown' };
      }

      try {
        const data: Prisma.DocumentUpdateInput = {
          isUnreadable: meta.extracted.isUnreadable,
          needsReview: meta.extracted.needsReview ?? false,
          ocrLowConfidenceFields:
            meta.extracted.lowConfidenceFields && meta.extracted.lowConfidenceFields.length > 0
              ? meta.extracted.lowConfidenceFields
              : Prisma.DbNull,
          ocrFieldSources:
            meta.extracted.fieldSources && Object.keys(meta.extracted.fieldSources).length > 0
              ? (meta.extracted.fieldSources as Prisma.InputJsonValue)
              : Prisma.DbNull,
          ocrConfidence: meta.ocrConfidence,
          ocrRawTextEncrypted: encryptionService.encrypt(meta.text),
          extractedAadhaarEncrypted: encryptionService.encrypt(meta.extracted.extractedAadhaar || ''),
          extractedPanEncrypted: encryptionService.encrypt(meta.extracted.extractedPan || ''),
          extractedNameEncrypted: encryptionService.encrypt(meta.extracted.extractedName || ''),
          extractedDobEncrypted: encryptionService.encrypt(meta.extracted.extractedDob || ''),
          extractedFatherNameEncrypted: encryptionService.encrypt(meta.extracted.extractedFatherName || ''),
          extractedLicenseNumberEncrypted: encryptionService.encrypt(meta.extracted.extractedLicenseNumber || ''),
          extractedAddressEncrypted: encryptionService.encrypt(meta.extracted.extractedAddress || ''),
          extractedValidityEncrypted: encryptionService.encrypt(meta.extracted.extractedValidity || ''),
          extractedPinCodeEncrypted: encryptionService.encrypt(meta.extracted.extractedPinCode || ''),
          extractedStateEncrypted: encryptionService.encrypt(meta.extracted.extractedState || ''),
          extractedDistrictEncrypted: encryptionService.encrypt(meta.extracted.extractedDistrict || ''),
          extractedIssueDateEncrypted: encryptionService.encrypt(meta.extracted.extractedIssueDate || ''),
          extractedExpiryDateEncrypted: encryptionService.encrypt(meta.extracted.extractedExpiryDate || ''),
          extractedIssuingAuthorityEncrypted: encryptionService.encrypt(meta.extracted.extractedIssuingAuthority || ''),
          extractedBloodGroupEncrypted: encryptionService.encrypt(meta.extracted.extractedBloodGroup || ''),
          extractedAuthorizationEncrypted: encryptionService.encrypt(meta.extracted.extractedAuthorizationToDrive || ''),
          extractedPermanentAddrEncrypted: encryptionService.encrypt(meta.extracted.extractedPermanentAddress || ''),
          ocrStatus: status,
          ocrCompletedAt: today(),
          ocrNextAttemptAt: null,
          ocrDetectedType: meta.extracted.detectedType || null,
          ocrFieldDetails: asJsonOrNull(Object.keys(fieldDetails).length > 0 ? fieldDetails : null),
          ocrMetrics: asJsonOrNull({ elapsedMs, candidateCount: 1, status }),
        };

        await this.prisma.document.update({ where: { id: documentId }, data });
        await this.notifyIfNeeded(documentId, previousStatus, status);
        logger.info(`OCR complete for ${documentId}: status=${status} conf=${meta.ocrConfidence} in ${elapsedMs}ms`);
      } catch (err) {
        logger.error(`Persist failed for ${documentId}`, { error: err });
        await this.fail(documentId, tryString(err));
      }
  }

  private async fail(documentId: string, error: string): Promise<void> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId },
      select: { ocrAttempts: true, ocrStatus: true, ocrNextAttemptAt: true },
    });
    if (!doc) return;
    const previousStatus = doc.ocrStatus;
    const attempts = (doc.ocrAttempts ?? 1) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: OcrJobStatus.FAILED,
          ocrLastError: error.slice(0, 1000),
          ocrNextAttemptAt: null,
        },
      });
      await this.notifyIfNeeded(documentId, previousStatus, OcrJobStatus.FAILED);
      logger.error(`Document ${documentId} FAILED after ${attempts} attempts`, { error });
    } else {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: OcrJobStatus.PENDING,
          ocrNextAttemptAt: new Date(Date.now() + RETRY_BACKOFF_MS * 2 ** attempts),
          ocrLastError: error.slice(0, 1000),
        },
      });
      setTimeout(() => void this.processNow(documentId), RETRY_BACKOFF_MS * 2 ** attempts);
    }
  }

  // ── Pipeline execution ───────────────────────────────────────────────────

  private async runPipeline(
    documentId: string,
    mimeType: string,
    docType: DocumentType,
    gridfsFileId: string | null,
  ): Promise<ExtractedDataWithMeta> {
    // Fetch the decrypted file from GridFS.
    const fileBuffer = await this.readDocumentFile(documentId, gridfsFileId);

    if (mimeType === 'application/pdf') {
      return this.runPdfPipeline(documentId, fileBuffer, docType);
    }

    return this.runImagePipeline(documentId, fileBuffer, docType);
  }

  private async readDocumentFile(
    documentId: string,
    gridfsFileId: string | null,
  ): Promise<Buffer> {
    if (!gridfsFileId) throw new Error('Document has no GridFS file to read');
    const bucket = getGridFSBucket();
    const fileId = new ObjectId(gridfsFileId);
    const files = await bucket.find({ _id: fileId }).toArray();
    const encrypted = files[0]?.metadata?.encrypted === true;
    // Stream the file and decrypt on the fly (Transform) so we never hold the
    // full ciphertext AND plaintext in memory at once — on a 512 MB budget that
    // doubling matters for large uploads. Only the decrypted Buffer is retained.
    const stream = bucket.openDownloadStream(fileId);
    const readable = encrypted ? stream.pipe(encryptionService.decryptStream()) : stream;
    const chunks: Buffer[] = [];
    for await (const c of readable) {
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks);
  }

  private async runImagePipeline(
    documentId: string,
    fileBuffer: Buffer,
    docType: DocumentType,
  ): Promise<ExtractedDataWithMeta> {
    // Preprocess decodes the raw upload to pixels in place; the raw file bytes
    // are only needed as a QR candidate, so we drop the reference right after
    // the QR pass to keep peak memory low while Tesseract loads.
    const prepareImage = await getPrepareImage();
    const prep = await prepareImage(fileBuffer);

    const qrCandidates = [fileBuffer, prep.deskewedBuffer];
    if (prep.atBoundary) qrCandidates.push(prep.flatBuffer);
    let qrRaw: string | null = null;
    try {
      const decodeQr = await getDecodeQr();
      qrRaw = await decodeQr(qrCandidates);
    } catch (err) {
      logger.warn(`QR decode failed for ${documentId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    qrCandidates.length = 0;
    const qr = qrRaw ? parseQrPayload(qrRaw) : null;
    const qrFields = qr && TRACKED_FIELD_KEYS.some((k) => qr.fields[k]) ? qr.fields : null;
    const qrComplete = qrFields !== null && EXPECTED_FIELD_KEYS[docType].every((k) => qrFields[k]);

    let merged: MergedExtraction;
    let text: string;
    let confidence: number;

    if (qrComplete) {
      text = qr?.raw ?? '';
      confidence = QR_CONFIDENCE;
      merged = mergeQrAndOcr({ qr: qrFields, ocr: null, docType });
      logger.info(`QR authoritative (${qr?.format}) for ${documentId}; skipping OCR`);
    } else {
      await ensureEngine();
      const candidates: Buffer[] = [prep.deskewedBuffer];
      if (prep.atBoundary) candidates.push(prep.flatBuffer);

      const results: OcrCandidateResult[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const r = await recognizeBuffer(candidates[i]!, docType, i);
        results.push(r);
      }
      const winner = selectBestCandidate(results);
      if (prep.atBoundary) {
        logger.info(`Deskew estimate at scan boundary; compared ${results.length} OCR variants for ${documentId}`);
      }
      text = winner.text;
      confidence = winner.confidence;
      merged = mergeQrAndOcr({ qr: qrFields, ocr: winner.extracted, docType });
      if (qrFields) {
        logger.info(`QR partial (${qr?.format}) for ${documentId}; OCR filled the gaps`);
      }
    }

    return { extracted: merged, ocrConfidence: confidence, text };
  }

  /**
   * PDF pipeline:
   *   - pull native text layer (syntactic) for up to MAX_PDF_PAGES pages, then
   *   - rasterize any page with no/too-little text and OCR it (scanned/mixed),
   * but never OCR a scanned-only single page more than once.
   */
  private async runPdfPipeline(
    documentId: string,
    fileBuffer: Buffer,
    docType: DocumentType,
  ): Promise<ExtractedDataWithMeta> {
    logger.info(`Extracting text from PDF for document ${documentId}`);

    // Secure, XML-hygienic PDF parsing. We deliberately disable anything that
    // could execute or interpret embedded content:
    //   - isEvalSupported:false → pdfjs never compiles font functions with eval.
    //   - enableXfa:false       → XFA forms (which can carry scripts) ignored.
    //   - stopAtErrors:true     → malformed streams fail instead of partially
    //                              recovering attacker-controlled data.
    //   - maxImageSize          → embedded image decode is capped.
    //   - disableFontFace / disableAutoFetch / disableStream → no external
    //     resource fetching, no font rendering of embedded bytes.
    // The page cap (MAX_PDF_PAGES) bounds CPU for decompression-bomb PDFs.
    const PDFParse = await getPdfParse();
    const parser = new PDFParse({
      data: fileBuffer,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: true,
      maxImageSize: 12_000_000,
      disableFontFace: true,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });

    const pageResults: OcrPageResult[] = [];
    const textParts: string[] = [];
    const candidateResults: OcrCandidateResult[] = [];

    try {
      const pdfData = await parser.getText({ first: MAX_PDF_PAGES });
      const pages = pdfData.pages ?? [];
      const pageCount = Math.min(pages.length, MAX_PDF_PAGES);

      for (let i = 0; i < pageCount; i++) {
        const page = pages[i]!;
        const pageText = (page.text ?? '').trim();
        pageResults[i] = { page: i + 1, kind: 'syntactic', status: 'ok', textLength: pageText.length };
        if (pageText.length > 0) textParts.push(pageText);
      }
      if (pageCount === 0) {
        pageResults.push({ page: 1, kind: 'empty', status: 'empty', textLength: 0 });
      }
    } catch (err) {
      lgWarn(`PDF text pull failed for ${documentId}`, err);
    }

    // For every page with no appreciable text layer, rasterize and OCR it.
    // Screenshots are rendered at a bounded width (desiredWidth) so a
    // poster-sized or scan at 600dpi cannot allocate unbounded memory.
    for (let i = 0; i < pageResults.length; i++) {
      const pr = pageResults[i]!;
      if (pr.textLength !== undefined && pr.textLength > 12) continue;
      try {
        const screenshot = await parser.getScreenshot({
          partial: [i + 1],
          desiredWidth: RENDER_DIMENSION,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const rendered = screenshot.pages[0]?.data;
        if (!rendered) continue;
        await ensureEngine();
        const r = await recognizeBuffer(Buffer.from(rendered), docType, i);
        candidateResults.push(r);
        if (r.text.trim().length > 0) textParts.push(r.text);
        pageResults[i] = { page: i + 1, kind: 'raster', status: 'ok', confidence: r.confidence, textLength: r.text.length };
      } catch (err) {
        lgWarn(`PDF raster OCR failed for page ${i + 1} of ${documentId}`, err);
        pageResults[i] = { ...pageResults[i]!, status: 'failed' };
      }
    }

    await parser.destroy();

    const text = textParts.join('\n');
    if (text.trim().length === 0) {
      return emptyMeta();
    }

    // Honest confidence from text presence + expected-field coverage. When
    // page rasterization produced real OCR confidence, blend that with the
    // syntactic-grade score; a purely born-digital pull uses the PDF score.
    let extracted: ExtractedData;
    let confidence: number;
    if (candidateResults.length > 0) {
      const winner = selectBestCandidate(candidateResults);
      extracted = buildExtractedResult(text, winner.confidence, docType);
      confidence = Math.min(99, Math.round(winner.confidence * 0.9 + computePdfConfidence(text, extracted, docType) * 0.1));
    } else {
      extracted = buildExtractedResult(text, computePdfConfidence(text, {} as ExtractedData, docType), docType);
      confidence = computePdfConfidence(text, extracted, docType);
    }

    return { extracted, ocrConfidence: confidence, text };
  }
}

const lgWarn = (msg: string, err: unknown) => {
  logger.warn(msg, { error: err instanceof Error ? err.message : String(err) });
};

const tryString = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const ocrService = new OcrService();