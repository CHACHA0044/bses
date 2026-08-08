import { z } from 'zod';
import { VerificationResult } from '@prisma/client';

export const assignApplicationSchema = z.object({
  assigneeId: z.string().min(1, 'Officer is required'),
  comment: z.string().trim().max(500).optional(),
});

export const startVerificationSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const requestDocumentsSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1, 'At least one document must be specified').optional(),
  comment: z.string().trim().max(500).optional(),
});

export const documentVerdictSchema = z.object({
  documentId: z.string().min(1),
  action: z.nativeEnum(VerificationResult, {
    errorMap: () => ({ message: 'Verdict must be APPROVED or REJECTED' }),
  }),
  comment: z.string().trim().max(500).optional(),
});

export const completeVerificationSchema = z.object({
  documentVerdicts: z.array(documentVerdictSchema).optional(),
  comment: z.string().trim().max(500).optional(),
});

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason is required (min 3 characters)').max(1000),
  comment: z.string().trim().max(500).optional(),
});

export const approveApplicationSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const scheduleConnectionSchema = z.object({
  scheduledDate: z.string().trim().optional(),
  comment: z.string().trim().max(500).optional(),
});

export const completeConnectionSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const addRemarkSchema = z.object({
  remark: z.string().trim().min(1, 'Remark is required').max(1000),
});
