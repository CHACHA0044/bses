import { z } from 'zod';
import { ConnectionType } from '@prisma/client';

export const applyConnectionSchema = z.object({
  connectionType: z.nativeEnum(ConnectionType, { errorMap: () => ({ message: 'Invalid connection type' }) }),
  requiredLoad: z.coerce.number().positive('Required load must be a positive number in kW').max(1000, 'Max load exceeded'),
  propertyAddress: z.string().trim().min(10, 'Property address must be at least 10 characters'),
  isDraft: z.boolean().optional().default(false),
});

export const updateConnectionSchema = z.object({
  connectionType: z.nativeEnum(ConnectionType).optional(),
  requiredLoad: z.coerce.number().positive().max(1000).optional(),
  propertyAddress: z.string().trim().min(10).optional(),
  isSubmit: z.boolean().optional().default(false),
});
