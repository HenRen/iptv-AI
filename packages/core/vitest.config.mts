import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Most specific first: Vite matches these as prefixes, in order.
      '@streamwise/core/testing': fileURLToPath(new URL('./src/testing/index.ts', import.meta.url)),
      '@streamwise/core': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
});
