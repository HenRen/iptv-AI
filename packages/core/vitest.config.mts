import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@streamwise/core': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
});
