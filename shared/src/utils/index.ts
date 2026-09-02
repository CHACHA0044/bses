import { PAGINATION } from '../constants';
import type { PaginationMeta } from '../types';

/**
 * Generates a unique, human-readable application reference number.
 * Format: BSES-YYYYMMDD-XXXXXXXX (uppercase hex suffix for uniqueness)
 */
export const generateApplicationNumber = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `BSES-${date}-${suffix}`;
};

export const buildPaginationMeta = (
  total: number,
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const buildPaginationOffset = (
  page: number,
  limit: number,
): { skip: number; take: number } => ({
  skip: (page - 1) * limit,
  take: limit,
});

/** Redacts all but the last 4 characters of a sensitive field before logging. */
export const maskSensitiveField = (value: string): string =>
  value.length <= 4 ? '****' : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isNonEmptyString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0;

export const toTitleCase = (str: string): string =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Safely extracts the primary client IP address from request headers or socket,
 * parsing multi-hop proxy chains (`x-forwarded-for`) and truncating to max 45 chars
 * to fit PostgreSQL/Prisma `@db.VarChar(45)` column limits.
 */
export const extractClientIp = (req: { headers: Record<string, any>; ip?: string | undefined }): string => {
  const rawForwarded = req.headers['x-forwarded-for'];
  let rawIp = '0.0.0.0';
  if (typeof rawForwarded === 'string' && rawForwarded.trim()) {
    rawIp = rawForwarded.split(',')[0]?.trim() || '0.0.0.0';
  } else if (Array.isArray(rawForwarded) && rawForwarded.length > 0) {
    rawIp = String(rawForwarded[0] ?? '').trim();
  } else if (req.ip) {
    rawIp = req.ip;
  }
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.substring(7);
  }
  return rawIp.substring(0, 45) || '0.0.0.0';
};

export * from './document.util';
export * from './encryption.util';
