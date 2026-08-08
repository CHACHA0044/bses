import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [path.resolve(__dirname, './test/setup.ts')],
  },
});
