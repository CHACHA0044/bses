import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load root .env before tests run
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@bses/shared': path.resolve(__dirname, '../../shared/src'),
    },
  },
});