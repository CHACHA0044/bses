import { z } from 'zod';
import { createConfig, baseEnvSchema } from '@bses/shared';

const authEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  AES_SECRET_KEY: z.string().length(64, 'AES_SECRET_KEY must be exactly 64 hex characters (32 bytes)'),
  AES_IV: z.string().length(32, 'AES_IV must be exactly 32 hex characters (16 bytes)'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((val) => val.split(',').map((s) => s.trim())),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
});

export const config = createConfig(authEnvSchema);
export type AuthConfig = typeof config;
