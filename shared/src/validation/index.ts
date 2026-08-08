import { z } from 'zod';

// Reusable Zod primitives — validated consistently across all services.
// Import these in service validators rather than re-declaring patterns.

export const emailSchema = z
  .string()
  .trim()
  .email('Please enter a valid email address')
  .max(254, 'Email address is too long');

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const aadhaarSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 digits')
  .optional();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const usernameSchema = z
  .string()
  .trim()
  .min(4, 'Username must be at least 4 characters')
  .max(30, 'Username must not exceed 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens, and underscores');

export const caNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10,12}$/, 'CA Number must be 10–12 digits')
  .optional();

export const meterNumberSchema = z
  .string()
  .trim()
  .min(6, 'Meter number must be at least 6 characters')
  .max(20, 'Meter number is too long')
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const uuidSchema = z.string().uuid('Invalid resource ID format');
