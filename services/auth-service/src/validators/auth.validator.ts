import { z } from 'zod';
import { Gender } from '@prisma/client';

export const registerSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(50),
  middleName: z.string().trim().max(50).optional().nullable(),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  gender: z.nativeEnum(Gender, { errorMap: () => ({ message: 'Invalid gender option' }) }),
  email: z.string().trim().email('Invalid email address format').max(254),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Mobile number must be a valid 10-digit Indian number starting with 6-9'),
  username: z
    .string()
    .trim()
    .min(4, 'Username must be at least 4 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[$&+,:;=?@#|'<>.^*()%!-]/, 'Password must contain a special character'),
  confirmPassword: z.string(),
  aadhaar: z
    .string()
    .trim()
    .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 digits')
    .optional()
    .nullable()
    .or(z.literal('')),
  caNumber: z
    .string()
    .trim()
    .regex(/^\d{9,11}$/, 'CA Number must be 9-11 digits')
    .optional()
    .nullable()
    .or(z.literal('')),
  meterNumber: z
    .string()
    .trim()
    .min(5, 'Meter number must be at least 5 characters')
    .max(20)
    .optional()
    .nullable()
    .or(z.literal('')),
  dpdpConsent: z.boolean().refine((val) => val === true, 'Explicit DPDP consent is required'),
  privacyPolicyAccepted: z.boolean().refine((val) => val === true, 'Privacy policy acceptance is required'),
  captchaToken: z.string().min(1, 'CAPTCHA token is required'),
  captchaInput: z.string().trim().min(1, 'CAPTCHA answer is required'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or Email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string(),
});
