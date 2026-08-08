import { z } from 'zod';
import { createConfig, baseEnvSchema } from '@bses/shared';

const notificationEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3013),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string').optional(),
  SMS_PROVIDER: z.string().default('SIMULATED'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  WHATSAPP_PROVIDER: z.string().default('SIMULATED'),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((val) => val.split(',').map((s) => s.trim())),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
});

export const config = createConfig(notificationEnvSchema);
export type NotificationConfig = typeof config;
