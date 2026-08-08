import { z } from 'zod';
import { createConfig, baseEnvSchema } from '@bses/shared';

const documentEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3012),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid MongoDB connection URI'),
  GRIDFS_BUCKET: z.string().default('consumer_documents'),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
  ALLOWED_MIME_TYPES: z
    .string()
    .default('application/pdf,image/jpeg,image/png')
    .transform((val) => val.split(',').map((s) => s.trim())),
  AES_SECRET_KEY: z.string().length(64, 'AES_SECRET_KEY must be 64 hex characters'),
  AES_IV: z.string().length(32, 'AES_IV must be 32 hex characters'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((val) => val.split(',').map((s) => s.trim())),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
});

export const config = createConfig(documentEnvSchema);
export type DocumentConfig = typeof config;
