import dotenv from 'dotenv';
import path from 'path';
import { defineConfig, env } from 'prisma/config';

// Load the single consolidated backend env at the workspace root
// (services/auth-service/../../.env). Per-service .env files were retired in
// favor of one backend env file for Render; this keeps `prisma migrate deploy`
// working locally without copying variables into every service folder.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
