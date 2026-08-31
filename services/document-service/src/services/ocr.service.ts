import path from 'path';
import { createWorker, createScheduler } from 'tesseract.js';
import pLimit from 'p-limit';
import { PDFParse } from 'pdf-parse';
import { getPrismaClient } from '../db/db.client';
import { encryptionService } from '@bses/shared';
import { DocumentType, Prisma } from '@prisma/client';
import { createLogger } from '@bses/shared';
import { extractFields, buildExtractedResult, selectBestCandidate, OcrCandidateResult, ExtractedData, EXPECTED_FIELD_KEYS } from './ocr/extractors';
import { prepareImage } from './ocr/preprocess';
import { decodeQrFromImage } from './ocr/qr';
import { parseQrPayload } from './ocr/qrPayload';
import { mergeQrAndOcr, MergedExtraction, TRACKED_FIELD_KEYS } from './ocr/qrMerge';
import { notificationClient } from './notification.client';

const logger = createLogger({ service: 'ocr-service' });

// Concurrency limit to prevent OCR from hogging CPU
const limit = pLimit(2);
let scheduler: Tesseract.Scheduler | null = null;
let initialized = false;

/**
 * A born-digital PDF (utility bill, e-invoice) is one document. Anything with
 * more pages than this is either a bulk upload (not a single supporting
 * document) or a text-extraction bomb designed to burn CPU on `getText()`.
 * Only the first `MAX_PDF_PAGES` are ever read.
 */
const MAX_PDF_PAGES = 25;

const initScheduler = async () => {
  if (initialized) return;
  scheduler = createScheduler();
  const workerCount = 2;
  const langPath = path.join(process.cwd(), 'assets');
  
  for (let i = 0; i < workerCount; i++) {
    const worker = await createWorker('eng', 1, {
      langPath,
      cacheMethod: 'none',
      gzip: true,
      logger: (m) => logger.debug('Tesseract Progress', m),
    });
    scheduler.addWorker(worker);
  }
  initialized = true;
};

export interface ExtractedDataWithMeta extends ExtractedData {
  ocrConfidence?: number | undefined;
  ocrRawText?: string | undefined;
}

/** Builds the extraction result for a single OCR pass (unreadable-aware). */
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
 * at all. `confidence` 99 reflects that the data was read deterministically
 * from the card's own encoding rather than inferred from pixels.
 */
const QR_CONFIDENCE = 99;

export class OcrService {
  private get prisma() {
    return getPrismaClient();
  }

  /**
   * Fires the "Document verification pending" notification the moment a
   * document is flagged unreadable or needs manual review. Only documents
   * attached to a connection application trigger a message (the application
   * number is the subject); standalone profile uploads are surfaced in-app
   * instead. Never throws — a notification failure must not fail the OCR job.
   */
  private async notifyIfVerificationNeeded(documentId: string, isUnreadable: boolean, needsReview: boolean): Promise<void> {
    if (!isUnreadable && !needsReview) return;
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

  public async processDocument(
    documentId: string,
    fileBuffer: Buffer,
    mimeType: string,
    docType: DocumentType
  ): Promise<void> {
    await limit(async () => {
      try {
        await initScheduler();

        let text = '';
        let confidence = 0;
        let extracted: ExtractedData;

        if (mimeType === 'application/pdf') {
          logger.info(`Extracting text from PDF for document ${documentId}`);
          // pdf-parse v2 wraps pdfjs-dist. We deliberately disable anything
          // that could execute or interpret embedded content:
          //   - `isEvalSupported: false`  → pdfjs never compiles PDF font
          //     functions with eval/Function().
          //   - `enableXfa: false`        → XFA forms (which can carry scripts)
          //     are not interpreted.
          //   - `stopAtErrors: true`      → malformed/attacker-controlled
          //     streams fail the job instead of being partially recovered.
          //   - `maxImageSize`            → embedded image decode is capped.
          // PDFs are only ever used for text extraction (raw pixel data is
          // never produced from them); nothing executes embedded JS or
          // actions, and the page count is capped so a decompression-bomb
          // PDF can't burn CPU across thousands of pages.
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
          const pdfData = await parser.getText({ first: MAX_PDF_PAGES });
          await parser.destroy();
          text = pdfData.text;
          confidence = 90;
          extracted = buildCandidateResult(text, confidence, docType).extracted;
        } else {
          logger.info(`Processing image ${documentId} (QR-first)`);
          // Preprocess (rotate → grayscale → contrast stretch → Otsu
          // binarize → deskew) before recognition for higher confidence.
          const prep = await prepareImage(fileBuffer);

          // ── QR-first extraction ──────────────────────────────────────────
          // Aadhaar (and many PAN/DL) cards carry a machine-readable QR code.
          // When it decodes it is authoritative for whatever fields it
          // contains; OCR only ever fills the gaps. Decode is attempted on the
          // original auto-rotated photo and the deskewed/binarized preprocess
          // variants (near-level, which suits QR finder patterns best).
          const qrCandidates = [fileBuffer, prep.deskewedBuffer];
          if (prep.atBoundary) qrCandidates.push(prep.flatBuffer);
          let qrRaw: string | null = null;
          try {
            qrRaw = await decodeQrFromImage(qrCandidates);
          } catch (err) {
            logger.warn(`QR decode failed for ${documentId}`, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          const qr = qrRaw ? parseQrPayload(qrRaw) : null;
          const qrFields =
            qr && TRACKED_FIELD_KEYS.some((k) => qr.fields[k]) ? qr.fields : null;
          const qrComplete =
            qrFields !== null && EXPECTED_FIELD_KEYS[docType].every((k) => qrFields[k]);

          let merged: MergedExtraction;
          if (qrComplete) {
            // QR is authoritative and covers every expected field — no OCR
            // cycle is burned on an image we already read deterministically.
            text = qr?.raw ?? '';
            confidence = QR_CONFIDENCE;
            merged = mergeQrAndOcr({ qr: qrFields, ocr: null, docType });
            logger.info(`QR authoritative (${qr?.format}) for ${documentId}; skipping OCR`);
          } else {
            // When the deskew estimate is pinned at the scan boundary it almost
            // certainly failed to find text lines rather than finding a real
            // tilt. In that case compare OCR on the deskewed variant against the
            // straight variant and keep whichever yields the better extraction.
            const candidates: Buffer[] = [prep.deskewedBuffer];
            if (prep.atBoundary) candidates.push(prep.flatBuffer);

            const results: OcrCandidateResult[] = [];
            for (const candidate of candidates) {
              const { data } = await scheduler!.addJob('recognize', candidate);
              results.push(
                buildCandidateResult(data.text ?? '', data.confidence ?? 0, docType),
              );
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

          extracted = merged;
        }

        logger.info(`OCR complete for ${documentId}, Confidence: ${confidence}. Updating DB...`);

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            isUnreadable: extracted.isUnreadable,
            needsReview: extracted.needsReview ?? false,
            ocrLowConfidenceFields:
              extracted.lowConfidenceFields && extracted.lowConfidenceFields.length > 0
                ? extracted.lowConfidenceFields
                : Prisma.DbNull,
            ocrFieldSources:
              extracted.fieldSources && Object.keys(extracted.fieldSources).length > 0
                ? extracted.fieldSources
                : Prisma.DbNull,
            ocrConfidence: confidence,
            ocrRawTextEncrypted: encryptionService.encrypt(text),
            extractedAadhaarEncrypted: encryptionService.encrypt(extracted.extractedAadhaar || ''),
            extractedPanEncrypted: encryptionService.encrypt(extracted.extractedPan || ''),
            extractedNameEncrypted: encryptionService.encrypt(extracted.extractedName || ''),
            extractedDobEncrypted: encryptionService.encrypt(extracted.extractedDob || ''),
            extractedFatherNameEncrypted: encryptionService.encrypt(extracted.extractedFatherName || ''),
            extractedLicenseNumberEncrypted: encryptionService.encrypt(extracted.extractedLicenseNumber || ''),
            extractedAddressEncrypted: encryptionService.encrypt(extracted.extractedAddress || ''),
            extractedValidityEncrypted: encryptionService.encrypt(extracted.extractedValidity || ''),
            extractedPinCodeEncrypted: encryptionService.encrypt(extracted.extractedPinCode || ''),
            extractedStateEncrypted: encryptionService.encrypt(extracted.extractedState || ''),
            extractedDistrictEncrypted: encryptionService.encrypt(extracted.extractedDistrict || ''),
            extractedIssueDateEncrypted: encryptionService.encrypt(extracted.extractedIssueDate || ''),
            extractedExpiryDateEncrypted: encryptionService.encrypt(extracted.extractedExpiryDate || ''),
            extractedIssuingAuthorityEncrypted: encryptionService.encrypt(extracted.extractedIssuingAuthority || ''),
            extractedBloodGroupEncrypted: encryptionService.encrypt(extracted.extractedBloodGroup || ''),
            extractedAuthorizationEncrypted: encryptionService.encrypt(extracted.extractedAuthorizationToDrive || ''),
            extractedPermanentAddrEncrypted: encryptionService.encrypt(extracted.extractedPermanentAddress || ''),
          },
        });

        await this.notifyIfVerificationNeeded(documentId, extracted.isUnreadable, extracted.needsReview ?? false);
      } catch (err) {
        logger.error(`OCR processing failed for document ${documentId}`, { error: err });
        await this.prisma.document.update({
          where: { id: documentId },
          data: { isUnreadable: true },
        });
        await this.notifyIfVerificationNeeded(documentId, true, false);
      }
    });
  }
}

export const ocrService = new OcrService();

