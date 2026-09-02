import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@streamwise/core/testing': fileURLToPath(
        new URL('../../packages/core/src/testing/index.ts', import.meta.url),
      ),
      '@streamwise/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
});
