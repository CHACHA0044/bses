import { z } from 'zod';
import { createConfig, baseEnvSchema } from '@bses/shared';

const gatewayEnvSchema = baseEnvSchema.extend({
  AUTH_SERVICE_URL: z.string().url('AUTH_SERVICE_URL must be a valid URL'),
  CONSUMER_SERVICE_URL: z.string().url('CONSUMER_SERVICE_URL must be a valid URL'),
  DOCUMENT_SERVICE_URL: z.string().url('DOCUMENT_SERVICE_URL must be a valid URL'),
  NOTIFICATION_SERVICE_URL: z.string().url('NOTIFICATION_SERVICE_URL must be a valid URL'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((val) => val.split(',').map((s) => s.trim())),
});

export const config = createConfig(gatewayEnvSchema);
export type GatewayConfig = typeof config;
