import { z } from 'zod';

export const updateProfileSchema = z.object({
  email: z.string().trim().email('Invalid email format').optional(),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number').optional(),
  aadhaar: z.string().trim().regex(/^\d{12}$/, 'Aadhaar must be 12 digits').optional().nullable(),
});
