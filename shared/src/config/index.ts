import { z } from 'zod';

/**
 * Creates a type-safe configuration object from a Zod schema applied to
 * process.env. Throws at startup if any required variable is missing or
 * invalid — preventing the service from starting in a misconfigured state.
 */
export const createConfig = <T extends z.ZodTypeAny>(schema: T, env: NodeJS.ProcessEnv = process.env): z.infer<T> => {
  const result = schema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`\nConfiguration validation failed:\n${formatted}\n\nCheck your .env file.\n`);
  }

  return result.data;
};

// Shared base schema — every service extends this
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
});
