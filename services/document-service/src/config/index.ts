import { z } from 'zod';
import { createConfig, baseEnvSchema } from '@bses/shared';

const documentEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3012),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid MongoDB connection URI'),
  GRIDFS_BUCKET: z.string().default('consumer_documents'),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(2),
  NOTIFICATION_SERVICE_URL: z.string().url('NOTIFICATION_SERVICE_URL must be a valid URL').default('http://localhost:3013'),
  ALLOWED_MIME_TYPES: z
    .string()
    .default('application/pdf,image/jpeg,image/png,image/webp,image/avif')
    .transform((val) => val.split(',').map((s) => s.trim())),
  AES_SECRET_KEY: z.string().length(64, 'AES_SECRET_KEY must be 64 hex characters'),
  AES_IV: z.string().length(32, 'AES_IV must be 32 hex characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((val) => val.split(',').map((s) => s.trim())),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  UPLOAD_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
});

export const config = createConfig(documentEnvSchema);
export type DocumentConfig = typeof config;
